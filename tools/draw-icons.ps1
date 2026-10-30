$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Drawing

$root = Split-Path -Parent $PSScriptRoot
$icons = Join-Path $root "extension\icons"

function New-Round([int]$x, [int]$y, [int]$w, [int]$h, [int]$r) {
    $path = New-Object System.Drawing.Drawing2D.GraphicsPath
    $d = [Math]::Max(2, $r * 2)
    $path.AddArc($x, $y, $d, $d, 180, 90)
    $path.AddArc(($x + $w - $d), $y, $d, $d, 270, 90)
    $path.AddArc(($x + $w - $d), ($y + $h - $d), $d, $d, 0, 90)
    $path.AddArc($x, ($y + $h - $d), $d, $d, 90, 90)
    $path.CloseFigure()
    return $path
}

function Save-Mark([int]$size, [string]$file, [string]$kind) {
    $bmp = New-Object System.Drawing.Bitmap $size, $size
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $g.Clear([System.Drawing.Color]::Transparent)

    $badge = [System.Drawing.Color]::FromArgb(255, 100, 116, 139)
    $mark = [System.Drawing.Color]::White
    $inset = [Math]::Max(1, [int]($size * 0.08))
    if ($kind -eq "direct") {
        $badge = [System.Drawing.Color]::FromArgb(255, 22, 163, 74)
        if ($size -gt 16) {
            $glow = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(90, 34, 197, 94))
            $g.FillEllipse($glow, [int]($size * 0.04), [int]($size * 0.04), [int]($size * 0.92), [int]($size * 0.92))
            $glow.Dispose()
            $inset = [int]($size * 0.16)
        }
    } elseif ($kind -eq "idle") {
        $badge = [System.Drawing.Color]::FromArgb(255, 226, 232, 240)
        $mark = [System.Drawing.Color]::FromArgb(255, 148, 163, 184)
    }

    $side = $size - (2 * $inset)
    $radius = [Math]::Max(2, [int]($side * 0.28))
    $round = New-Round $inset $inset $side $side $radius
    $brush = New-Object System.Drawing.SolidBrush $badge
    $g.FillPath($brush, $round)
    $brush.Dispose()
    $round.Dispose()

    $arrow = New-Object System.Drawing.SolidBrush $mark
    if ($size -le 16) {
        $g.FillRectangle($arrow, 3, 6, 6, 4)
        $head = @(
            (New-Object System.Drawing.PointF 8, 3),
            (New-Object System.Drawing.PointF 13, 8),
            (New-Object System.Drawing.PointF 8, 13)
        )
    } else {
        $s = [single]$size
        $shaft = New-Object System.Drawing.RectangleF ([single]($s * 0.24)), ([single]($s * 0.42)), ([single]($s * 0.34)), ([single]($s * 0.16))
        $g.FillRectangle($arrow, $shaft)
        $head = @(
            (New-Object System.Drawing.PointF ([single]($s * 0.48)), ([single]($s * 0.28))),
            (New-Object System.Drawing.PointF ([single]($s * 0.78)), ([single]($s * 0.50))),
            (New-Object System.Drawing.PointF ([single]($s * 0.48)), ([single]($s * 0.72)))
        )
    }
    $g.FillPolygon($arrow, $head)
    $arrow.Dispose()
    $g.Dispose()
    $bmp.Save($file, [System.Drawing.Imaging.ImageFormat]::Png)
    $bmp.Dispose()
}

foreach ($size in 16, 48, 128) {
    Save-Mark $size (Join-Path $icons "icon$size.png") "direct"
    Save-Mark $size (Join-Path $icons "vpn$size.png") "vpn"
    Save-Mark $size (Join-Path $icons "idle$size.png") "idle"
}
