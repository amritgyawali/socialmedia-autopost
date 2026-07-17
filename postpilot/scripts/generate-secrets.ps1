[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'

function New-RandomBytes([int] $Length) {
    $bytes = New-Object byte[] $Length
    $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
    try {
        $rng.GetBytes($bytes)
    }
    finally {
        $rng.Dispose()
    }
    return $bytes
}

function New-HexSecret([int] $Length) {
    return ([System.BitConverter]::ToString((New-RandomBytes $Length))).Replace('-', '').ToLowerInvariant()
}

function New-Base64Secret([int] $Length) {
    return [System.Convert]::ToBase64String((New-RandomBytes $Length))
}

Write-Output '# Generate once, then place each value only in the documented secret store.'
Write-Output ("DB_PASS={0}" -f (New-HexSecret 32))
Write-Output ("COCKPIT_JWT_SECRET={0}" -f (New-Base64Secret 48))
Write-Output ("NEXTAUTH_SECRET={0}" -f (New-Base64Secret 32))
Write-Output ("VAULT_KEY={0}" -f (New-Base64Secret 32))
Write-Output ("RESTIC_PASSWORD={0}" -f (New-Base64Secret 48))

