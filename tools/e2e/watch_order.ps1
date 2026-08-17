# 監看 C 單到終局狀態(completed / needs_human_review / failed)
param([string]$SessionId)
$UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36'
$deadline = (Get-Date).AddMinutes(75)
while ((Get-Date) -lt $deadline) {
  try {
    $r = Invoke-WebRequest -Uri "https://jianyuan.life/api/reports?session_id=$SessionId" -Headers @{ 'User-Agent' = $UA } -UseBasicParsing -TimeoutSec 30
    $rep = ($r.Content | ConvertFrom-Json).reports | Select-Object -First 1
    $ts = Get-Date -Format 'HH:mm:ss'
    if ($rep) {
      Write-Output "$ts status=$($rep.status) progress=$($rep.generation_progress.progress) token=$($rep.access_token)"
      if ($rep.status -eq 'completed') { Write-Output "TERMINAL_COMPLETED $($rep.access_token)"; exit 0 }
      if ($rep.status -eq 'needs_human_review') { Write-Output "TERMINAL_HELD err=$($rep.error_message)"; exit 3 }
      if ($rep.status -eq 'failed') { Write-Output "TERMINAL_FAILED err=$($rep.error_message)"; exit 4 }
    } else {
      Write-Output "$ts no report row yet"
    }
  } catch {
    Write-Output "poll error: $($_.Exception.Message)"
  }
  Start-Sleep -Seconds 150
}
Write-Output 'TERMINAL_TIMEOUT'
exit 5
