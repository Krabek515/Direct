using System;
using System.IO;
using System.Net;
using System.Net.Sockets;
using System.Text;
using System.Threading;
using Microsoft.Win32;

static class ProxyHost
{
    static int Main(string[] args)
    {
        if (args.Length > 0 && args[0] == "--bridge")
        {
            Bridge();
            return 0;
        }
        Reply();
        return 0;
    }

    static void Reply()
    {
        Stream stdin = Console.OpenStandardInput();
        Stream stdout = Console.OpenStandardOutput();
        byte[] lenBuf = new byte[4];
        if (!ReadFull(stdin, lenBuf)) return;
        int len = BitConverter.ToInt32(lenBuf, 0);
        if (len < 0 || len > 1048576) return;
        byte[] body = new byte[len];
        if (!ReadFull(stdin, body)) return;
        bool on;
        string server = ReadServer(out on);
        string text = Encoding.UTF8.GetString(body);
        string open = "";
        if (Field(text, "get") == "probe") open = Probe(Field(text, "hosts"));
        string json = "{\"on\":" + (on ? "true" : "false") + ",\"server\":\"" + JsonEscape(server) + "\",\"open\":\"" + JsonEscape(open) + "\"}";
        byte[] bytes = Encoding.UTF8.GetBytes(json);
        stdout.Write(BitConverter.GetBytes(bytes.Length), 0, 4);
        stdout.Write(bytes, 0, bytes.Length);
        stdout.Flush();
    }

    static void Bridge()
    {
        TcpListener listener = new TcpListener(IPAddress.Loopback, 10801);
        listener.Start();
        ThreadPool.QueueUserWorkItem(delegate
        {
            while (true)
            {
                Thread.Sleep(2000);
                bool on;
                if (PortOf(ReadServer(out on)) == 10801)
                {
                    try { listener.Stop(); } catch { }
                    return;
                }
            }
        });
        while (true)
        {
            try
            {
                TcpClient client = listener.AcceptTcpClient();
                ThreadPool.QueueUserWorkItem(Pump, client);
            }
            catch
            {
                return;
            }
        }
    }

    static void Pump(object state)
    {
        TcpClient client = (TcpClient)state;
        TcpClient remote = null;
        try
        {
            bool unused;
            int port = PortOf(ReadServer(out unused));
            if (port <= 0 || port == 10801)
            {
                client.Close();
                return;
            }
            remote = new TcpClient();
            remote.Connect(IPAddress.Loopback, port);
            NetworkStream left = client.GetStream();
            NetworkStream right = remote.GetStream();
            ThreadPool.QueueUserWorkItem(delegate { Copy(left, right); });
            Copy(right, left);
        }
        catch
        {
            try { client.Close(); } catch { }
            try { if (remote != null) remote.Close(); } catch { }
        }
    }

    static void Copy(Stream from, Stream to)
    {
        try
        {
            byte[] buf = new byte[16384];
            int n;
            while ((n = from.Read(buf, 0, buf.Length)) > 0) to.Write(buf, 0, n);
        }
        catch { }
        try { from.Close(); } catch { }
        try { to.Close(); } catch { }
    }

    static string ReadServer(out bool on)
    {
        on = false;
        try
        {
            using (RegistryKey key = Registry.CurrentUser.OpenSubKey(@"Software\Microsoft\Windows\CurrentVersion\Internet Settings"))
            {
                if (key == null) return "";
                object enabled = key.GetValue("ProxyEnable");
                on = enabled is int && (int)enabled == 1;
                if (!on) return "";
                return (key.GetValue("ProxyServer") as string) ?? "";
            }
        }
        catch
        {
            on = false;
            return "";
        }
    }

    static int PortOf(string server)
    {
        if (string.IsNullOrEmpty(server)) return 0;
        string chunk = server;
        int https = server.IndexOf("https=", StringComparison.OrdinalIgnoreCase);
        if (https >= 0)
        {
            chunk = server.Substring(https + 6);
            int semi = chunk.IndexOf(';');
            if (semi >= 0) chunk = chunk.Substring(0, semi);
        }
        else
        {
            int semi = chunk.IndexOf(';');
            if (semi >= 0) chunk = chunk.Substring(0, semi);
        }
        int colon = chunk.LastIndexOf(':');
        int port;
        if (colon >= 0 && int.TryParse(chunk.Substring(colon + 1).Trim(), out port) && port > 0 && port < 65536) return port;
        return 0;
    }

    sealed class ProbeGate
    {
        public int Left;
        public string Found = "";
        public readonly object Sync = new object();
        public readonly ManualResetEvent Done = new ManualResetEvent(false);
    }

    static string Field(string json, string name)
    {
        string key = "\"" + name + "\":\"";
        int at = json.IndexOf(key, StringComparison.Ordinal);
        if (at < 0) return "";
        int start = at + key.Length;
        int end = json.IndexOf('"', start);
        if (end < 0) return "";
        return json.Substring(start, end - start);
    }

    static string Probe(string csv)
    {
        if (string.IsNullOrEmpty(csv)) return "";
        string[] parts = csv.Split(',');
        string[] chosen = new string[40];
        int count = 0;
        int i;
        for (i = 0; i < parts.Length && count < 40; i++)
        {
            string host = parts[i].Trim();
            if (host.Length == 0 || host.Length > 253 || host.IndexOf(' ') >= 0) continue;
            chosen[count] = host;
            count++;
        }
        if (count == 0) return "";
        ProbeGate gate = new ProbeGate();
        gate.Left = count;
        for (i = 0; i < count; i++)
        {
            ThreadPool.QueueUserWorkItem(delegate (object state)
            {
                string name = (string)state;
                bool open = PortOpen(name);
                lock (gate.Sync)
                {
                    if (open)
                    {
                        if (gate.Found.Length > 0) gate.Found += ",";
                        gate.Found += name;
                    }
                    gate.Left--;
                    if (gate.Left == 0) gate.Done.Set();
                }
            }, chosen[i]);
        }
        gate.Done.WaitOne(2500);
        return gate.Found;
    }

    static bool PortOpen(string host)
    {
        TcpClient client = new TcpClient();
        try
        {
            IAsyncResult wait = client.BeginConnect(host, 443, null, null);
            if (!wait.AsyncWaitHandle.WaitOne(1200)) return false;
            client.EndConnect(wait);
            return true;
        }
        catch
        {
            return false;
        }
        finally
        {
            try { client.Close(); } catch { }
        }
    }

    static string JsonEscape(string value)
    {
        if (string.IsNullOrEmpty(value)) return "";
        return value.Replace("\\", "\\\\").Replace("\"", "");
    }

    static bool ReadFull(Stream stream, byte[] buf)
    {
        int got = 0;
        while (got < buf.Length)
        {
            int n = stream.Read(buf, got, buf.Length - got);
            if (n <= 0) return false;
            got += n;
        }
        return true;
    }
}
