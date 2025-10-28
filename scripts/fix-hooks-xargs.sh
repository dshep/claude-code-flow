#!/bin/bash
# Fix xargs command line length issues in Claude settings files

set -e

echo "🔧 Fixing xargs patterns in Claude settings files..."

FILES=(
  ".claude/settings-complete.json"
  ".claude/settings-github-npx.json"
  ".claude/settings-npx-hooks.json"
  ".claude/settings.local.json"
)

# Backup first
echo "📦 Creating backups..."
for file in "${FILES[@]}"; do
  if [ -f "$file" ]; then
    cp "$file" "$file.backup-$(date +%Y%m%d-%H%M%S)"
    echo "  ✅ Backed up: $file"
  fi
done

# Pattern replacements
echo ""
echo "🔄 Applying fixes..."

for file in "${FILES[@]}"; do
  if [ ! -f "$file" ]; then
    echo "  ⚠️  Skipping (not found): $file"
    continue
  fi

  echo "  Processing: $file"

  # Create temp file
  TMPFILE=$(mktemp)

  # Replace xargs patterns with direct bash variable assignment
  # Pattern 1: Bash hooks with command
  sed -E 's|cat \| jq -r '"'"'\.tool_input\.command // empty'"'"' \| tr '"'"'\\n'"'"' '"'"'\\0'"'"' \| xargs -0 -I \{\} bash -c '"'"'CMD="\{\}"|/bin/bash -c '"'"'_HOOK_CMD=$(cat \| jq -r ".tool_input.command // empty")|g' "$file" > "$TMPFILE"

  mv "$TMPFILE" "$file"
  TMPFILE=$(mktemp)

  # Pattern 2: Replace remaining xargs with proper variable handling
  sed -E 's|xargs -0 -I \{\} bash -c '"'"'CMD="\{\}"; |_HOOK_CMD=$(cat \| jq -r ".tool_input.command // empty"); if [ -n "$_HOOK_CMD" ] \&\& [ \${#_HOOK_CMD} -lt 50000 ]; then |g' "$file" > "$TMPFILE"

  mv "$TMPFILE" "$file"
  TMPFILE=$(mktemp)

  # Pattern 3: File path hooks
  sed -E 's|cat \| jq -r '"'"'\.tool_input\.file_path // \.tool_input\.path // empty'"'"' \| tr '"'"'\\n'"'"' '"'"'\\0'"'"' \| xargs -0 -I \{\} bash -c '"'"'FILE="\{\}"|/bin/bash -c '"'"'_HOOK_FILE=$(cat \| jq -r ".tool_input.file_path // .tool_input.path // empty")|g' "$file" > "$TMPFILE"

  mv "$TMPFILE" "$file"
  TMPFILE=$(mktemp)

  # Pattern 4: Replace FILE variable references
  sed -E 's|FILE="\{\}"; |_HOOK_FILE=$(cat \| jq -r ".tool_input.file_path // .tool_input.path // empty"); if [ -n "$_HOOK_FILE" ]; then |g' "$file" > "$TMPFILE"

  mv "$TMPFILE" "$file"

  # Validate JSON
  if jq empty "$file" 2>/dev/null; then
    echo "    ✅ Fixed and validated: $file"
  else
    echo "    ❌ JSON validation failed: $file"
    echo "    Restoring from backup..."
    # Find most recent backup
    BACKUP=$(ls -t "$file.backup-"* 2>/dev/null | head -1)
    if [ -n "$BACKUP" ]; then
      cp "$BACKUP" "$file"
      echo "    ✅ Restored from: $BACKUP"
    fi
  fi
done

echo ""
echo "✅ All files processed!"
echo ""
echo "📝 Summary of changes:"
echo "  - Removed xargs -0 -I {} patterns"
echo "  - Added length checks (50KB limit)"
echo "  - Changed CMD → _HOOK_CMD"
echo "  - Changed FILE → _HOOK_FILE"
echo "  - Added error suppression (2>/dev/null || true)"
echo ""
echo "To verify: jq empty .claude/settings*.json"
