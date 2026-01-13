#!/usr/bin/env bash
set -euo pipefail

ATLAS_ROOT="/home/anombyte/Atlas/atlas-visibility-fix"
BIN_DIR="$HOME/.local/bin"
ZSHRC="$HOME/.zshrc"
PYTHON_BIN="/usr/bin/python3"
ATLAS_PY="$HOME/.claude/skills/atlas.py"

mkdir -p "$BIN_DIR"

ln -sf "$ATLAS_ROOT/atlas-track-v2" "$BIN_DIR/atlas-track"

create_wrapper() {
  local name="$1"
  local action="$2"
  local wrapper_path="$BIN_DIR/${name}-wrapper"

  cat <<EOF_WRAPPER > "$wrapper_path"
#!/usr/bin/env bash
set -euo pipefail
exec "$PYTHON_BIN" "$ATLAS_PY" "$action" "\$@"
EOF_WRAPPER

  chmod +x "$wrapper_path"
  ln -sf "$wrapper_path" "$BIN_DIR/$name"
}

create_wrapper "atlas-log" "log"
create_wrapper "atlas-status" "status"
create_wrapper "atlas-cleanup" "cleanup"

read -r -p "Add Atlas aliases to ~/.zshrc? [y/N] " add_aliases
if [[ "${add_aliases,,}" == "y" || "${add_aliases,,}" == "yes" ]]; then
  alias_block_start="# Atlas Visibility aliases"
  alias_block_end="# End Atlas Visibility aliases"

  if [[ -f "$ZSHRC" ]] && grep -q "$alias_block_start" "$ZSHRC"; then
    echo "Aliases already present in $ZSHRC; skipping."
  else
    cat <<EOF_ALIASES >> "$ZSHRC"

$alias_block_start
alias atlas-track="$ATLAS_ROOT/atlas-track-v2"
alias atlas-log="$PYTHON_BIN $ATLAS_PY log"
alias atlas-status="$PYTHON_BIN $ATLAS_PY status"
alias atlas-cleanup="$PYTHON_BIN $ATLAS_PY cleanup"
$alias_block_end
EOF_ALIASES
    echo "Aliases added to $ZSHRC."
  fi
fi

"$ATLAS_ROOT/atlas-track-v2" "init" -- true
"$PYTHON_BIN" "$ATLAS_PY" status
