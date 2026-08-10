param(
  [Parameter(Mandatory = $true)][string]$WslHost,
  [Parameter(Mandatory = $true)][int]$WslPort,
  [Parameter(Mandatory = $true)][int]$TargetPort
)

$wsl = [System.Net.Sockets.TcpClient]::new()
$browser = [System.Net.Sockets.TcpClient]::new()
try {
  $wsl.Connect($WslHost, $WslPort)
  $browser.Connect([System.Net.IPAddress]::Loopback, $TargetPort)
  $wslStream = $wsl.GetStream()
  $browserStream = $browser.GetStream()
  $toBrowser = $wslStream.CopyToAsync($browserStream)
  $toWsl = $browserStream.CopyToAsync($wslStream)
  [System.Threading.Tasks.Task]::WhenAny($toBrowser, $toWsl).GetAwaiter().GetResult() | Out-Null
} finally {
  $wsl.Dispose()
  $browser.Dispose()
}
