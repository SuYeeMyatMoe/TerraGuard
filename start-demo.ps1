param([switch]$Dev)

$ErrorActionPreference = 'Stop'
$demoRoot = $PSScriptRoot
$demoFrontend = Join-Path $demoRoot 'frontend'
$demoBackend = Join-Path $demoRoot 'backend'
$demoLogs = Join-Path $env:LOCALAPPDATA 'Temp\terraguard-demo'
New-Item -ItemType Directory -Path $demoLogs -Force | Out-Null

function Test-DemoPort([int]$Port) {
    return @(Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue).Count -gt 0
}

function Wait-DemoEndpoint([string]$Url) {
    $timer = [Diagnostics.Stopwatch]::StartNew()
    while ($timer.Elapsed.TotalSeconds -lt 75) {
        try {
            $response = Invoke-WebRequest -Uri $Url -TimeoutSec 3 -UseBasicParsing
            if ($response.StatusCode -eq 200) { return }
        } catch { }
        Start-Sleep -Milliseconds 500
    }
    throw "The demo did not become ready at $Url. Check the logs in $demoLogs."
}

$demoPython = Join-Path $demoBackend '.venv\Scripts\python.exe'
if (-not (Test-Path -LiteralPath $demoPython)) { throw 'Set up backend/.venv using the README first.' }
$demoNode = (Get-Command node -ErrorAction Stop).Source
if (-not $Dev -and -not (Test-Path -LiteralPath (Join-Path $demoFrontend '.next\BUILD_ID'))) {
    throw 'Build the frontend first: cd frontend; npm run build. Then run this launcher again.'
}

if (-not (Test-DemoPort 8010)) {
    Start-Process -FilePath $demoPython -ArgumentList '-m','uvicorn','app.main:app','--host','127.0.0.1','--port','8010' -WorkingDirectory $demoBackend -WindowStyle Hidden -RedirectStandardOutput (Join-Path $demoLogs 'backend.out.log') -RedirectStandardError (Join-Path $demoLogs 'backend.err.log') | Out-Null
}
Write-Host 'Waiting for the data API...'
Wait-DemoEndpoint 'http://127.0.0.1:8010/api/health'

if (-not (Test-DemoPort 3000)) {
    $demoMode = if ($Dev) { 'dev' } else { 'start' }
    $demoHeap = if ($Dev) { '--max-old-space-size=768' } else { '--max-old-space-size=512' }
    Start-Process -FilePath $demoNode -ArgumentList $demoHeap,'node_modules/next/dist/bin/next',$demoMode,'--port','3000' -WorkingDirectory $demoFrontend -WindowStyle Hidden -RedirectStandardOutput (Join-Path $demoLogs 'frontend.out.log') -RedirectStandardError (Join-Path $demoLogs 'frontend.err.log') | Out-Null
}
Wait-DemoEndpoint 'http://localhost:3000/api/health'
Write-Host 'TerraGuard is ready: http://localhost:3000/simulation'
Write-Host "Logs: $demoLogs"
