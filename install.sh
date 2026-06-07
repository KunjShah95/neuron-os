#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────
# Neuron OS — installer for Linux and macOS
# Usage:   curl -fsSL https://raw.githubusercontent.com/KunjShah95/neuron-os/main/install.sh | bash
# Options: NEURON_VERSION=0.2.1  NEURON_INSTALL_DIR=/usr/local/bin  bash install.sh
# ─────────────────────────────────────────────────────────────────
set -euo pipefail

REPO="KunjShah95/neuron-os"
BINARY_NAME="aegis"
VERSION="${NEURON_VERSION:-latest}"
INSTALL_DIR="${NEURON_INSTALL_DIR:-${HOME}/.local/bin}"
TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

# ── Helpers ──────────────────────────────────────────────────────
log()  { printf '\033[1;34m▸\033[0m %s\n' "$*"; }
ok()   { printf '\033[1;32m✓\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m!\033[0m %s\n' "$*" >&2; }
die()  { printf '\033[1;31m✗\033[0m %s\n' "$*" >&2; exit 1; }

# ── Detect OS + arch ────────────────────────────────────────────
uname_s="$(uname -s)"
uname_m="$(uname -m)"

case "$uname_s" in
  Linux*)  os="linux" ;;
  Darwin*) os="darwin" ;;
  *)       die "Unsupported OS: $uname_s. Use install.ps1 on Windows." ;;
esac

case "$uname_m" in
  x86_64|amd64) arch="x64" ;;
  aarch64|arm64) arch="arm64" ;;
  *)             die "Unsupported architecture: $uname_m" ;;
esac

asset="${BINARY_NAME}-${os}-${arch}"
[ "$os" = "windows" ] && asset="${asset}.exe"

# ── Resolve download URL ────────────────────────────────────────
if [ "$VERSION" = "latest" ]; then
  download_url="https://github.com/${REPO}/releases/latest/download/${asset}"
else
  download_url="https://github.com/${REPO}/releases/download/${VERSION}/${asset}"
fi

# ── Install ─────────────────────────────────────────────────────
log "Installing ${BINARY_NAME} ${VERSION} for ${os}/${arch}"
log "Target: ${INSTALL_DIR}/${BINARY_NAME}"

mkdir -p "$INSTALL_DIR"
curl -fL --retry 3 --connect-timeout 15 -o "$TMP_DIR/$asset" "$download_url" \
  || die "Download failed. Check that release $VERSION exists for $os/$arch."
chmod +x "$TMP_DIR/$asset"
mv "$TMP_DIR/$asset" "$INSTALL_DIR/$BINARY_NAME"

ok "Installed ${BINARY_NAME} to ${INSTALL_DIR}/${BINARY_NAME}"

# ── PATH hint ───────────────────────────────────────────────────
case ":$PATH:" in
  *":${INSTALL_DIR}:"*) ;;
  *)
    warn "${INSTALL_DIR} is not in your PATH."
    warn "Add this to your shell profile (~/.bashrc, ~/.zshrc, etc.):"
    warn "    export PATH=\"${INSTALL_DIR}:\$PATH\""
    ;;
esac

# ── Verify ──────────────────────────────────────────────────────
if command -v "$BINARY_NAME" >/dev/null 2>&1; then
  installed_version="$("$BINARY_NAME" --version 2>/dev/null || echo 'unknown')"
  ok "Run: ${BINARY_NAME} --version  →  ${installed_version}"
else
  log "Restart your shell or source your profile, then run: ${BINARY_NAME} --version"
fi

ok "Done. Welcome to Neuron OS."
