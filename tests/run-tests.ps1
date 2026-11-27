# Runs tests/scenarios.html against ../index.html in headless Microsoft Edge.
# Each run uses a throwaway browser profile, so your own demo data is not touched.
# ASCII only on purpose: Windows PowerShell 5.1 misreads UTF-8 files without a BOM.
#
#   -Width  viewport widths to test (default: 1440 and 390)
#   -Only   run one scenario by its number, e.g. -Only 13
# Exit code: 0 = all passed, 1 = something failed.
param([int[]]$Width = @(1440, 390), [string]$Only = '')

$ErrorActionPreference = 'Stop'
try { [Console]::OutputEncoding = [Text.Encoding]::UTF8 } catch {}

$edge = @("${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe", "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe") |
    Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $edge) { Write-Host 'Microsoft Edge not found.'; exit 1 }

$app = [uri]::EscapeDataString(([System.Uri](Join-Path (Split-Path $PSScriptRoot -Parent) 'index.html')).AbsoluteUri)
$page = ([System.Uri](Join-Path $PSScriptRoot 'scenarios.html')).AbsoluteUri
$work = Join-Path $env:TEMP "health-proto-tests-$([guid]::NewGuid().ToString('N').Substring(0, 8))"
New-Item -ItemType Directory $work | Out-Null
$failed = $false

try {
    foreach ($w in $Width) {
        $out = Join-Path $work "out-$w.txt"
        # Do not use -Wait: it has hung for hours after the results were already written.
        $proc = Start-Process $edge -PassThru -RedirectStandardOutput $out -RedirectStandardError (Join-Path $work "err-$w.txt") -ArgumentList @(
            '--headless', '--disable-gpu', '--allow-file-access-from-files', "--user-data-dir=`"$work\profile-$w`"",
            '--virtual-time-budget=900000', '--window-size=1500,1000', '--dump-dom', "`"${page}?runner=1&w=$w&only=$Only&app=$app`"")
        $deadline = (Get-Date).AddMinutes(10)
        $exitedAt = $null
        do {
            Start-Sleep -Seconds 2
            $text = ''
            try {
                $stream = [IO.File]::Open($out, 'Open', 'Read', 'ReadWrite')
                try { $text = (New-Object IO.StreamReader($stream, [Text.Encoding]::UTF8)).ReadToEnd() } finally { $stream.Dispose() }
            } catch {}
            $m = [regex]::Match($text, 'RESULT(\{.*\})END', 'Singleline')
            if ($proc.HasExited -and -not $exitedAt) { $exitedAt = Get-Date }
            # The launcher can exit slightly before the output is complete, so allow a grace period.
            $gaveUp = (Get-Date) -gt $deadline -or ($exitedAt -and (Get-Date) -gt $exitedAt.AddSeconds(30))
        } until ($m.Success -or $gaveUp)
        # Only stops the browser instance started above.
        if (-not $proc.WaitForExit(5000)) { try { $proc.Kill() } catch {} }
        if (-not $m.Success) { Write-Host "Width ${w}: no result (the test page did not finish)."; $failed = $true; continue }
        $r = [Net.WebUtility]::HtmlDecode($m.Groups[1].Value) | ConvertFrom-Json

        $checks = @($r.checks)
        $bad = @($checks | Where-Object { -not $_.pass })
        Write-Host "== Width ${w}: $($checks.Count - $bad.Count) passed, $($bad.Count) failed, $($checks.Count) total"
        $checks | Group-Object s | ForEach-Object { Write-Host "  $($_.Name): $(@($_.Group | Where-Object pass).Count)/$($_.Count)" }
        $bad | ForEach-Object { Write-Host "  FAIL [$($_.s)] $($_.name) :: $($_.detail)" }
        $errors = @($r.errors)
        $contrast = @($r.contrast.PSObject.Properties)
        $overflow = @($r.overflow.PSObject.Properties)
        $errors | ForEach-Object { Write-Host "  JS ERROR: $_" }
        $contrast | ForEach-Object { Write-Host "  LOW CONTRAST $($_.Value.ratio) at $($_.Value.at): $($_.Name)" }
        $overflow | ForEach-Object { Write-Host "  OVERFLOW $($_.Value)px at $($_.Name)" }
        Write-Host "  JS errors: $($errors.Count), low contrast: $($contrast.Count), overflow: $($overflow.Count)"
        if (-not $checks.Count -or $bad.Count -or $errors.Count -or $contrast.Count -or $overflow.Count) { $failed = $true }
    }
}
finally {
    Remove-Item -LiteralPath $work -Recurse -Force -ErrorAction SilentlyContinue
}

if ($failed) { exit 1 } else { exit 0 }
