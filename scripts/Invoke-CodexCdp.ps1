param(
    [Parameter(Mandatory = $true)]
    [string]$Expression,

    [int]$Port = 9229,

    [int]$TimeoutSeconds = 8
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$rawTargets = Invoke-RestMethod "http://127.0.0.1:$Port/json"
$targets = @()
foreach ($target in $rawTargets) {
    $targets += $target
}

$codexTarget = $targets |
    Where-Object { $_.title -eq 'Codex' -and $_.url -like 'app://*' } |
    Select-Object -First 1

if (-not $codexTarget) {
    throw "Could not find the Codex renderer target on port $Port."
}

$client = [System.Net.WebSockets.ClientWebSocket]::new()
$cts = [Threading.CancellationTokenSource]::new([TimeSpan]::FromSeconds($TimeoutSeconds))

try {
    $client.ConnectAsync([Uri]$codexTarget.webSocketDebuggerUrl, $cts.Token).Wait()

    $message = @{
        id = 1
        method = 'Runtime.evaluate'
        params = @{
            expression = $Expression
            returnByValue = $true
            awaitPromise = $true
        }
    } | ConvertTo-Json -Depth 16 -Compress

    $bytes = [Text.Encoding]::UTF8.GetBytes($message)
    $client.SendAsync(
        [ArraySegment[byte]]::new($bytes),
        [System.Net.WebSockets.WebSocketMessageType]::Text,
        $true,
        $cts.Token
    ).Wait()

    $buffer = New-Object byte[] 65536
    $stream = [System.IO.MemoryStream]::new()

    do {
        $result = $client.ReceiveAsync([ArraySegment[byte]]::new($buffer), $cts.Token).Result
        $stream.Write($buffer, 0, $result.Count)
    } while (-not $result.EndOfMessage)

    $json = [Text.Encoding]::UTF8.GetString($stream.ToArray())
    $response = $json | ConvertFrom-Json

    if ($response.PSObject.Properties.Name -contains 'error') {
        throw ($response.error | ConvertTo-Json -Depth 8)
    }

    if ($response.result.PSObject.Properties.Name -contains 'exceptionDetails') {
        throw ($response.result.exceptionDetails | ConvertTo-Json -Depth 16)
    }

    $runtimeResult = $response.result.result
    if ($runtimeResult.PSObject.Properties.Name -contains 'value') {
        $runtimeResult.value | ConvertTo-Json -Depth 32
    } else {
        $runtimeResult | ConvertTo-Json -Depth 32
    }
}
finally {
    if ($client.State -eq [System.Net.WebSockets.WebSocketState]::Open) {
        $client.CloseAsync(
            [System.Net.WebSockets.WebSocketCloseStatus]::NormalClosure,
            'done',
            [Threading.CancellationToken]::None
        ).Wait(1000) | Out-Null
    }
    $client.Dispose()
    $cts.Dispose()
}
