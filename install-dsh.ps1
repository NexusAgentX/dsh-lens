[CmdletBinding()]
param(
    [string]$Profile = 'web',
    [switch]$InstallDependencies,
    [switch]$SkipTests,
    [switch]$VerifyOnly
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Invoke-Checked {
    param([string]$Program, [string[]]$Arguments)
    & $Program @Arguments
    if ($LASTEXITCODE -ne 0) {
        throw "$Program failed with exit code $LASTEXITCODE. Installation stopped."
    }
}

if ($VerifyOnly) {
    Write-Host 'PowerShell script parsed successfully. No build or installation performed.'
    return
}

Push-Location $PSScriptRoot
try {
    if ([string]::IsNullOrWhiteSpace($Profile)) {
        throw 'Profile must not be empty.'
    }
    Get-Command npm -ErrorAction Stop | Out-Null
    Get-Command dsh -ErrorAction Stop | Out-Null

    if ($InstallDependencies -or !(Test-Path -LiteralPath (Join-Path $PSScriptRoot 'node_modules'))) {
        if (Test-Path -LiteralPath (Join-Path $PSScriptRoot 'package-lock.json')) {
            Invoke-Checked -Program 'npm' -Arguments @('ci')
        } else {
            Invoke-Checked -Program 'npm' -Arguments @('install')
        }
    }

    if ($SkipTests) {
        Invoke-Checked -Program 'npm' -Arguments @('run', 'build')
    } else {
        # The test command builds both Host and Client before running tests.
        Invoke-Checked -Program 'npm' -Arguments @('test')
    }

    # A fresh archive path avoids local-directory links and reused installation sources.
    $stamp = Get-Date -Format 'yyyyMMdd-HHmmss-fffffff'
    $artifactDirectory = Join-Path $PSScriptRoot ".install/$stamp"
    New-Item -ItemType Directory -Path $artifactDirectory -Force | Out-Null
    Invoke-Checked -Program 'npm' -Arguments @('pack', '--ignore-scripts', '--pack-destination', $artifactDirectory)
    $archives = @(Get-ChildItem -LiteralPath $artifactDirectory -Filter '*.tgz' -File)
    if ($archives.Count -ne 1) {
        throw 'Expected exactly one package archive; installation stopped.'
    }

    $archivePath = $archives[0].FullName
    Write-Host "Installing $archivePath into DSH profile '$Profile'..."
    # Use the DSH launcher to manage the profile and bundle registration.
    Invoke-Checked -Program 'dsh' -Arguments @('plugin', '--profile', $Profile, 'add', $archivePath)

    Write-Host "Build and installation completed for profile '$Profile'."
    Write-Host 'Restart the running DSH instance for this profile, then refresh the browser.'
    Write-Host "Start command: dsh --profile $Profile"
    Write-Host "Package archive retained at: $archivePath"
} finally {
    Pop-Location
}
