const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const extDir = path.join(root, "extension");
const dist = path.join(root, "dist");
const keyPath = path.join(root, "keys", "extension.pem");

function varint(n) {
  const out = [];
  let value = n >>> 0;
  while (value > 127) {
    out.push((value & 127) | 128);
    value >>>= 7;
  }
  out.push(value);
  return Buffer.from(out);
}

function field(number, buf) {
  return Buffer.concat([varint((number << 3) | 2), varint(buf.length), buf]);
}

function extensionId(spki) {
  const hash = crypto.createHash("sha256").update(spki).digest();
  let id = "";
  for (let i = 0; i < 16; i++) {
    id += String.fromCharCode(97 + (hash[i] >> 4));
    id += String.fromCharCode(97 + (hash[i] & 15));
  }
  return id;
}

fs.mkdirSync(path.dirname(keyPath), { recursive: true });
fs.mkdirSync(dist, { recursive: true });
if (!fs.existsSync(keyPath)) {
  fs.writeFileSync(keyPath, crypto.generateKeyPairSync("rsa", {
    modulusLength: 2048,
    publicKeyEncoding: { type: "spki", format: "pem" },
    privateKeyEncoding: { type: "pkcs8", format: "pem" }
  }).privateKey);
}

const privateKey = crypto.createPrivateKey(fs.readFileSync(keyPath));
const spki = crypto.createPublicKey(privateKey).export({ type: "spki", format: "der" });
const id = extensionId(spki);
const manifestPath = path.join(extDir, "manifest.json");
const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
manifest.key = spki.toString("base64");
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n");

function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return (~c) >>> 0;
}

function zipStore(files) {
  const locals = [];
  const centrals = [];
  let offset = 0;
  for (const file of files) {
    const name = Buffer.from(file.name, "utf8");
    if (name.includes(0x5c)) throw new Error("zip path must use forward slashes: " + file.name);
    const data = file.data;
    const crc = crc32(data);
    const local = Buffer.alloc(30 + name.length);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0, 6);
    local.writeUInt16LE(0, 8);
    local.writeUInt16LE(0, 10);
    local.writeUInt16LE(0x5c21, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28);
    name.copy(local, 30);
    locals.push(local, data);
    const central = Buffer.alloc(46 + name.length);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0, 8);
    central.writeUInt16LE(0, 10);
    central.writeUInt16LE(0, 12);
    central.writeUInt16LE(0x5c21, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt16LE(0, 30);
    central.writeUInt16LE(0, 32);
    central.writeUInt16LE(0, 34);
    central.writeUInt16LE(0, 36);
    central.writeUInt32LE(0, 38);
    central.writeUInt32LE(offset, 42);
    name.copy(central, 46);
    centrals.push(central);
    offset += local.length + data.length;
  }
  const centralDir = Buffer.concat(centrals);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(files.length, 8);
  eocd.writeUInt16LE(files.length, 10);
  eocd.writeUInt32LE(centralDir.length, 12);
  eocd.writeUInt32LE(offset, 16);
  return Buffer.concat(locals.concat([centralDir, eocd]));
}

const packed = [
  "manifest.json",
  "background.js",
  "popup.html",
  "popup.js",
  "pac.js",
  "i18n.js",
  "_locales/en/messages.json",
  "_locales/ru/messages.json",
  "suffixes.js",
  "icons/icon16.png",
  "icons/icon48.png",
  "icons/icon128.png",
  "icons/off16.png",
  "icons/off48.png",
  "icons/off128.png",
  "icons/vpn16.png",
  "icons/vpn48.png",
  "icons/vpn128.png",
  "icons/idle16.png",
  "icons/idle48.png",
  "icons/idle128.png",
  "icons/red16.png",
  "icons/red48.png",
  "icons/red128.png"
].map(function (name) {
  return { name: name, data: fs.readFileSync(path.join(extDir, name)) };
});
const zip = zipStore(packed);

const signedHeader = field(1, crypto.createHash("sha256").update(spki).digest().subarray(0, 16));
const size = Buffer.alloc(4);
size.writeUInt32LE(signedHeader.length, 0);
const signed = Buffer.concat([Buffer.from("CRX3 SignedData\0", "utf8"), size, signedHeader]);
const signature = crypto.sign("sha256", signed, privateKey);
if (!crypto.verify("sha256", signed, crypto.createPublicKey(privateKey), signature)) {
  throw new Error("crx signature does not verify");
}
const proof = Buffer.concat([field(1, spki), field(2, signature)]);
const header = Buffer.concat([field(2, proof), field(10000, signedHeader)]);
const file = Buffer.concat([
  Buffer.from("Cr24"),
  Buffer.from([3, 0, 0, 0]),
  sizeOf(header.length),
  header,
  zip
]);

function sizeOf(n) {
  const b = Buffer.alloc(4);
  b.writeUInt32LE(n, 0);
  return b;
}

fs.writeFileSync(path.join(dist, "offvpn.crx"), file);
fs.writeFileSync(path.join(dist, "extension-id.txt"), id);
const xml = "<?xml version='1.0' encoding='UTF-8'?>\n" +
  "<gupdate xmlns='http://www.google.com/update2/response' protocol='2.0'>\n" +
  "  <app appid='" + id + "'>\n" +
  "    <updatecheck codebase='http://127.0.0.1:17341/offvpn.crx' version='" + manifest.version + "'/>\n" +
  "  </app>\n" +
  "</gupdate>\n";
fs.writeFileSync(path.join(dist, "update.xml"), xml);
if (file.subarray(0, 4).toString() !== "Cr24") process.exit(1);
console.log("crx " + id + " " + manifest.version);
