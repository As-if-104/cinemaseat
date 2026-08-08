# Scenario A: 100 concurrent holds on ONE seat. Exactly one must succeed.

$showtimeId = "33333333-3333-3333-3333-333333333333"

# -join "" first collapses the multi-line array into ONE string,
# THEN Trim() removes leading/trailing whitespace cleanly.
$rawOutput = docker compose exec -T db psql -U cinemaseat -d cinemaseat -t -c `
  "SELECT seat_id FROM show_seats WHERE showtime_id = '$showtimeId' AND status = 'AVAILABLE' LIMIT 1;"
$seatId = ($rawOutput -join "").Trim()

Write-Host "Testing seat: [$seatId]"

$scriptBlock = {
    param($showtimeId, $seatId, $i)
    $uri = "http://localhost:3000/showtimes/$showtimeId/seats/$seatId/hold"
    try {
        Invoke-RestMethod -Method Post -Uri $uri -ContentType "application/json" -Body "{`"userRef`":`"user-$i`"}" | Out-Null
        return $true
    } catch {
        return $false
    }
}

$pool = [runspacefactory]::CreateRunspacePool(1, 100)
$pool.Open()
$runspaces = @()

1..100 | ForEach-Object {
    $ps = [powershell]::Create()
    $ps.RunspacePool = $pool
    $ps.AddScript($scriptBlock).AddArgument($showtimeId).AddArgument($seatId).AddArgument($_) | Out-Null
    $runspaces += [PSCustomObject]@{ Pipe = $ps; Handle = $ps.BeginInvoke() }
}

$results = $runspaces | ForEach-Object {
    $_.Pipe.EndInvoke($_.Handle)
    $_.Pipe.Dispose()
}

$pool.Close()
$pool.Dispose()

$successes = ($results | Where-Object { $_ -eq $true }).Count
$rejections = ($results | Where-Object { $_ -eq $false }).Count

Write-Host "`n--- Scenario A Results ---"
Write-Host "Requests sent : 100"
Write-Host "Successes     : $successes"
Write-Host "Rejections    : $rejections"
Write-Host "Oversell      : $(if ($successes -gt 1) { 'FAIL - oversold!' } else { 'PASS - zero oversell' })"

Write-Host "`n--- Seat map check (should show exactly one non-available seat) ---"
Invoke-RestMethod -Uri "http://localhost:3000/showtimes/$showtimeId/seats" |
  Where-Object { $_.status -ne 'AVAILABLE' }