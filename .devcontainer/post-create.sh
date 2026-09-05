#!/usr/bin/env bash
# Post-creación del devcontainer: instala gh (no viene en la imagen base
# y el feature github-cli rompe el build con podman) y luego instala deps.
set -euo pipefail

if ! command -v gh >/dev/null 2>&1; then
  echo ">>> Instalando GitHub CLI (gh) vía apt..."
  export DEBIAN_FRONTEND=noninteractive
  sudo apt-get update
  sudo apt-get install -y gh
else
  echo ">>> gh ya instalado: $(gh --version | head -n 1)"
fi

echo ">>> Instalando dependencias npm..."
npm ci
