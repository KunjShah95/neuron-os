# ─────────────────────────────────────────────────────────────────
# Neuron OS — installer for Windows (PowerShell 5.1+)
# Usage:   irm https://raw.githubusercontent.com/KunjShah95/neuron-os/main/install.ps1 | iex
# Options: $env:NEURON_VERSION = "0.2.1";  $env:NEURON_INSTALL_DIR = "C:\tools"
# ─────────────────────────────────────────────────────────────────
$ErrorActionPreference = "Stop"

$Repo        = "KunjShah95/neuron-os"
$BinaryName  = "aegis"
$Version     = if ($env:NEURON_VERSION) { $env:NEURON_VERSION } else { "latest" }
$InstallDir  = if ($env:NEURON_INSTALL_DIR) { $env:NEURON_INSTALL_DIR } else { Join-Path $env:LOCALAPPDATA "neuron-os\bin" }
$TmpDir      = Join-Path $env:TEMP ("neuron-install-" + [Guid]::NewGuid().ToString("N").Substring(0, 8))

# ── Helpers ──────────────────────────────────────────────────────
function Log($msg)  { Write-Host "▸ $msg" -ForegroundColor Blue }
function Ok($msg)   { Write-Host "✓ $msg" -ForegroundColor Green }
function Warn($msg) { Write-Warning $msg }
function Die($msg)  { Write-Host "✗ $msg" -ForegroundColor Red; exit 1 }

# ── Detect architecture ─────────────────────────────────────────
$arch = switch ($env:PROCESSOR_ARCHITECTURE) {
  "AMD64" { "x64" }
  "ARM64" { "arm64" }
  default { Die "Unsupported architecture: $($env:PROCESSOR_ARCHITECTURE)" }
}
$os = "windows"
$asset = "${BinaryName}-${os}-${arch}.exe"

# ── Resolve download URL ─────────────────────────────────────────
if ($Version -eq "latest") {
  $url = "https://github.com/$Repo/releases/latest/download/$asset"
} else {
  $url = "https://github.com/$Repo/releases/download/$Version/$asset"
}

# ── Install ──────────────────────────────────────────────────────
Log "Installing $BinaryName $Version for $os/$arch"
Log "Target: $InstallDir\$BinaryName.exe"

New-Item -ItemType Directory -Force -Path $InstallDir | Out-Null
New-Item -ItemType Directory -Force -Path $TmpDir | Out-Null

$zipPath = Join-Path $TmpDir $asset
try {
  Log "Downloading from $url"
  Invoke-WebRequest -Uri $url -OutFile $zipPath -UseBasicParsing -TimeoutSec 60
} catch {
  Die "Download failed. Check that release $Version exists for $os/$arch. ($($_.Exception.Message))"
}

Move-Item -Force $zipPath (Join-Path $InstallDir "$BinaryName.exe")
Ok "Installed $BinaryName to $InstallDir\$BinaryName.exe"

# ── Add to user PATH (persistent for current user) ───────────────
$currentPath = [Environment]::GetEnvironmentVariable("Path", "User")
if ($currentPath -notlike "*$InstallDir*") {
  Log "Adding $InstallDir to user PATH"
  [Environment]::SetEnvironmentVariable("Path", "$currentPath;$InstallDir", "User")
  $env:Path = "$env:Path;$InstallDir"
  Warn "Restart your terminal for PATH changes to take effect."
}

# ── Verify ──────────────────────────────────────────────────────
$exe = Get-Command $BinaryName -ErrorAction SilentlyContinue
if ($exe) {
  $ver = & $BinaryName --version 2>$null
  if (-not $ver) { $ver = "unknown" }
  Ok "Run: $BinaryName --version  →  $ver"
} else {
  Log "Restart your terminal, then run: $BinaryName --version"
}

# ── Cleanup ─────────────────────────────────────────────────────
Remove-Item -Recurse -Force $TmpDir -ErrorAction SilentlyContinue

Ok "Done. Welcome to Neuron OS."
