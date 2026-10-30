$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$ru = $false
try { $ru = [System.Globalization.CultureInfo]::CurrentUICulture.TwoLetterISOLanguageName -eq "ru" } catch {}

function Say($ruText, $enText) {
    if ($ru) { Write-Host $ruText } else { Write-Host $enText }
}

try { [Console]::OutputEncoding = New-Object System.Text.UTF8Encoding $false } catch {}

try {
    $cs = Join-Path $root "extension\host\ProxyHost.cs"
    $exe = Join-Path $root "extension\host\proxy-host.exe"
    $jsonPath = Join-Path $root "extension\host\com.offvpn.proxy.json"
    if (-not (Test-Path -LiteralPath $cs)) { throw "no-source" }

    $csc = Join-Path $env:WINDIR "Microsoft.NET\Framework64\v4.0.30319\csc.exe"
    if (-not (Test-Path -LiteralPath $csc)) {
        $csc = Join-Path $env:WINDIR "Microsoft.NET\Framework\v4.0.30319\csc.exe"
    }
    if (-not (Test-Path -LiteralPath $csc)) { throw "no-csc" }

    $tmp = Join-Path $env:TEMP ("direct-proxy-host-" + [Guid]::NewGuid().ToString("n") + ".exe")
    & $csc /nologo /target:exe "/out:$tmp" "$cs"
    if ($LASTEXITCODE -ne 0 -or -not (Test-Path -LiteralPath $tmp)) { throw "build-failed" }

    try {
        Copy-Item -LiteralPath $tmp -Destination $exe -Force
    } catch {
        if (-not (Test-Path -LiteralPath $exe)) { throw "write-failed" }
    }
    Remove-Item -LiteralPath $tmp -Force -ErrorAction SilentlyContinue

    $path = $exe.Replace("\", "\\").Replace('"', '\"')
    $content = @"
{
  "name": "com.offvpn.proxy",
  "description": "Reads the current Windows proxy port for Direct",
  "path": "$path",
  "type": "stdio",
  "allowed_origins": [
    "chrome-extension://fhelgdelndffpllpbcgoajhnbaamegmg/"
  ]
}

"@
    $utf8 = New-Object System.Text.UTF8Encoding $false
    [System.IO.File]::WriteAllText($jsonPath, $content.Replace("`r`n", "`n"), $utf8)

    $keys = @(
        "HKCU:\Software\Google\Chrome\NativeMessagingHosts\com.offvpn.proxy",
        "HKCU:\Software\Wow6432Node\Google\Chrome\NativeMessagingHosts\com.offvpn.proxy"
    )
    foreach ($key in $keys) {
        New-Item -Path $key -Force | Out-Null
        Set-ItemProperty -Path $key -Name "(default)" -Value $jsonPath
    }

    $chrome = @(
        (Join-Path $env:ProgramFiles "Google\Chrome\Application\chrome.exe"),
        (Join-Path ${env:ProgramFiles(x86)} "Google\Chrome\Application\chrome.exe"),
        (Join-Path $env:LOCALAPPDATA "Google\Chrome\Application\chrome.exe")
    ) | Where-Object { $_ -and (Test-Path -LiteralPath $_) } | Select-Object -First 1

    $folder = Join-Path $root "extension"
    if ($chrome) {
        Start-Process -FilePath $chrome -ArgumentList "chrome://extensions/"
        Say "Готово. В Chrome включи режим разработчика и нажми «Загрузить распакованное»." "Done. In Chrome, turn on Developer mode and click Load unpacked."
        Say "Папка:" "Folder:"
        Write-Host $folder
        Say "Если Direct уже стоит, нажми «Обновить»." "If Direct is already installed, click Reload."
    } else {
        Say "Готово. Открой в Chrome страницу chrome://extensions, включи режим разработчика и загрузи папку:" "Done. Open chrome://extensions in Chrome, turn on Developer mode, and load this folder:"
        Write-Host $folder
    }
} catch {
    $reason = $_.Exception.Message
    if ($reason -eq "no-source") {
        Say "Не найден файл программы. Запускай install.bat из папки Direct." "The helper source was not found. Run install.bat from the Direct folder."
    } elseif ($reason -eq "no-csc") {
        Say "На компьютере нет компилятора Windows, программа не собралась." "The Windows compiler is missing, so the helper was not built."
    } elseif ($reason -eq "build-failed") {
        Say "Программа не собралась." "The helper did not build."
    } elseif ($reason -eq "write-failed") {
        Say "Не удалось записать программу рядом с расширением." "Could not write the helper next to the extension."
    } else {
        Say ("Не вышло: " + $reason) ("Failed: " + $reason)
    }
    exit 1
}
