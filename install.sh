#!/usr/bin/env bash
# Install dsh-artex into a DSH profile.
#
#   ./install.sh [profile-dir] [--managed] [--no-mcp] [--token TOKEN] [--base-url URL]
#
# Defaults: profile-dir = $DSH_HOME/profiles/web (or ~/.dsh/profiles/web),
# ARTEX at http://127.0.0.1:8787, token from $ARTEX_MCP_TOKEN.
#
# The script is idempotent: it copies the package into the profile's
# node_modules and appends the Loader entries only when the profile does not
# reference dsh-artex yet.
set -euo pipefail

SRC=$(cd "$(dirname "$0")" && pwd)
PROFILE=${1:-${DSH_HOME:-$HOME/.dsh}/profiles/web}
case "$PROFILE" in
  -*) echo "usage: ./install.sh [profile-dir] [options]" >&2; exit 2 ;;
esac
shift || true

MANAGED=false
WITH_MCP=true
TOKEN=${ARTEX_MCP_TOKEN:-}
BASE_URL=${ARTEX_BASE_URL:-http://127.0.0.1:8787}

while [ $# -gt 0 ]; do
  case "$1" in
    --managed) MANAGED=true ;;
    --no-mcp) WITH_MCP=false ;;
    --token) TOKEN=${2:?--token needs a value}; shift ;;
    --base-url) BASE_URL=${2:?--base-url needs a value}; shift ;;
    -h|--help) sed -n '2,12p' "$0"; exit 0 ;;
    *) echo "unknown option: $1" >&2; exit 2 ;;
  esac
  shift
done

[ -f "$PROFILE/package.json" ] || { echo "not a DSH profile: $PROFILE" >&2; exit 1; }

DEST="$PROFILE/node_modules/dsh-artex"
mkdir -p "$DEST"
cp -r "$SRC/package.json" "$SRC/lib" "$SRC/README.md" "$SRC/LICENSE" "$DEST/"
echo "[dsh-artex] installed into $DEST"

PATCH="$PROFILE/cordis.patch.yml"
if grep -q 'dsh-artex' "$PATCH" 2>/dev/null; then
  echo "[dsh-artex] $PATCH already references dsh-artex; leaving it untouched"
else
  # A patch file holding only comments, `---`, or a bare `[]` cannot carry a
  # plain insert list, so drop that placeholder before appending.
  if [ ! -f "$PATCH" ]; then
    printf '# Your patch layer for this dsh profile.\n' > "$PATCH"
  elif [ "$(grep -cvE '^[[:space:]]*(#.*)?$|^---$|^\[\]$' "$PATCH")" = "0" ]; then
    printf '# Your patch layer for this dsh profile.\n' > "$PATCH"
  fi

  {
    echo "- insert:"
    echo "    - id: artex"
    echo "      name: dsh-artex"
    echo "      config:"
    echo "        baseUrl: $BASE_URL"
    echo "        managed: $MANAGED"
    if [ "$MANAGED" = "true" ]; then
      echo "        binaryPath: /opt/artex/artex"
      echo "        args: ['-addr', ':8787']"
      echo "        cwd: /opt/artex"
    fi
    if [ "$WITH_MCP" = "true" ] && [ -n "$TOKEN" ]; then
      echo "    - id: mcp-artex"
      echo "      name: '@deepseek-ai/dsh-mcp-client'"
      echo "      config:"
      echo "        serverName: artex"
      echo "        transport: streamable-http"
      echo "        url: $BASE_URL/mcp"
      echo "        headers:"
      echo "          Authorization: 'Bearer $TOKEN'"
    fi
  } >> "$PATCH"
  echo "[dsh-artex] appended Loader entries to $PATCH"
  if [ "$WITH_MCP" = "true" ] && [ -z "$TOKEN" ]; then
    echo "[dsh-artex] no MCP token given: set ARTEX_MCP_TOKEN or pass --token to wire the tools"
  fi
fi

echo "[dsh-artex] restart DSH (or let HMR recompose) to load the plugin"
