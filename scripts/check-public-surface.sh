#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

public_dirs=(
  "packages/core/src"
  "packages/connector-sdk/src"
  "clients"
  "manifests"
)

existing_dirs=()
for dir in "${public_dirs[@]}"; do
  if [[ -d "${ROOT_DIR}/${dir}" ]]; then
    existing_dirs+=("${ROOT_DIR}/${dir}")
  fi
done

if [[ ${#existing_dirs[@]} -eq 0 ]]; then
  echo "No public surface directories found."
  exit 1
fi

forbidden_pattern='storage schema|graph model|graph structure|embedding layout|embedding implementation|chunking implementation|ranking pipeline|ranking algorithm|private memory engine|internal memory engine|governance implementation'

if command -v rg >/dev/null 2>&1; then
  scan() { rg -n -i "${forbidden_pattern}" "${existing_dirs[@]}"; }
else
  scan() { grep -rniE "${forbidden_pattern}" "${existing_dirs[@]}"; }
fi

if scan; then
  echo
  echo "Public connector surface exposes private Membase memory internals."
  exit 1
fi

echo "Public connector surface check passed."
