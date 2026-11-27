# One-shot Hugging Face text-to-image test.
# Run this yourself in a normal terminal. The token is typed with hidden input and is not saved.
# ASCII only on purpose: Windows PowerShell 5.1 misreads UTF-8 files without a BOM.

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
[Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12

# FLUX.1-schnell via the fal-ai provider, routed through Hugging Face.
$uri = 'https://router.huggingface.co/fal-ai/fal-ai/flux/schnell'
$outDir = Join-Path (Split-Path $PSScriptRoot -Parent) 'assets\img'
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$tmp = Join-Path $outDir "module-overview-ai-$stamp.tmp"

$prompt = 'Flat vector technology illustration, wide 16:9 banner. A central hexagon hub connected by circuit lines to four panels: a heart with a heartbeat chart, a shopping bag with wellness product bottles, chat bubbles with a document and magnifying glass, a gear with control sliders. Color palette dominated by deep navy blue and electric purple, with white and lavender accents. Clean geometric shapes, flat design, no text, no letters, no watermark.'
$body = @{ prompt = $prompt; image_size = @{ width = 1280; height = 720 } } | ConvertTo-Json -Compress

$secure = Read-Host 'Paste your Hugging Face token (input is hidden)' -AsSecureString
$token = (New-Object System.Net.NetworkCredential('', $secure)).Password.Trim()
if (-not $token) { Write-Host 'No token entered. Nothing was sent.'; exit 1 }

try {
    Write-Host 'Sending one request...'
    $result = Invoke-RestMethod -Method Post -Uri $uri `
        -Headers @{ Authorization = "Bearer $token" } `
        -ContentType 'application/json' -Body ([Text.Encoding]::UTF8.GetBytes($body)) `
        -TimeoutSec 180

    $imageUrl = "$(@($result.images)[0].url)"
    if ($imageUrl -notlike 'https://*') { throw 'The response did not contain an https image URL.' }
    # Printed so a failed download does not require generating (and paying) again.
    Write-Host "Image URL: $imageUrl"

    # No Authorization header here: the token must not go to the image host.
    $r = Invoke-WebRequest -UseBasicParsing -Uri $imageUrl -OutFile $tmp -PassThru -TimeoutSec 180

    $type = "$($r.Headers['Content-Type'])"
    Write-Host "HTTP $($r.StatusCode) $type"
    if ($type -match 'png') { $ext = 'png' }
    elseif ($type -match 'jpe?g') { $ext = 'jpg' }
    elseif ($type -match 'webp') { $ext = 'webp' }
    else { $ext = 'txt' }

    $final = [IO.Path]::ChangeExtension($tmp, $ext)
    Move-Item -LiteralPath $tmp -Destination $final
    if ($ext -eq 'txt') { Write-Host "The response is not an image. Saved for inspection: $final" }
    else { Write-Host "Image saved: $final" }

    if ($ext -eq 'png' -or $ext -eq 'jpg') {
        Add-Type -AssemblyName System.Drawing
        $img = [System.Drawing.Image]::FromFile($final)
        Write-Host "Size: $($img.Width) x $($img.Height)"
        $img.Dispose()
    }
}
catch {
    Write-Host 'Request failed.'
    if ($_.Exception.Response) { Write-Host "HTTP $([int]$_.Exception.Response.StatusCode)" }
    if ($_.ErrorDetails.Message) { Write-Host $_.ErrorDetails.Message }
    else { Write-Host $_.Exception.Message }
    if (Test-Path -LiteralPath $tmp) { Remove-Item -LiteralPath $tmp }
    exit 1
}
finally {
    $token = $null
}
