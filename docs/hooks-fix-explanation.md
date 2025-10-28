# Hook Error Fix: Handling Long Arguments

## Problem Analysis

The error `xargs: command line cannot be assembled, too long` occurs because:

1. **xargs has argument length limits** even though ARG_MAX is 1MB
2. **Shell substitution** with `-I {}` reduces the practical limit significantly
3. **Task tool prompts** can be 10,000+ characters (agent instructions, context, etc.)
4. **JSON piping** through shell adds overhead

## Root Cause

In `.claude/settings.json`, the PreToolUse hooks use this pattern:

```bash
cat | jq -r '.tool_input.command' | xargs -0 -I {} npx claude-flow hooks pre-command --command '{}'
```

This fails when:
- Task tool prompts are very long (common with detailed agent instructions)
- Command contains special characters that need escaping
- Multiple nested shell expansions occur

## Solution Approaches

### Option 1: Remove Task Hooks (Simplest)

The Task tool doesn't need preprocessing - just don't hook it:

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash",
        "hooks": [...]
      },
      {
        "matcher": "Write|Edit|MultiEdit",
        "hooks": [...]
      }
      // No Task matcher = no hook runs for Task tool
    ]
  }
}
```

### Option 2: Use Stdin Instead of Arguments (Proper Fix)

Pass data via stdin (unlimited) instead of command-line arguments:

```bash
# Before (fails with long input):
cat | jq -r '.command' | xargs -I {} command --arg '{}'

# After (handles any length):
jq -r '.command' | command --arg-from-stdin
```

### Option 3: Use Temporary Files for Long Inputs

```bash
# Write to temp file, pass filename
TMPFILE=$(mktemp) && cat > "$TMPFILE" && command --input-file "$TMPFILE" && rm "$TMPFILE"
```

### Option 4: Conditional Processing Based on Length

```bash
# Check length, use different strategies
INPUT=$(cat | jq -r '.command')
if [ ${#INPUT} -gt 10000 ]; then
  echo "$INPUT" | command --stdin
else
  command --arg "$INPUT"
fi
```

## Recommended Fix

**For this project**: Use Option 1 + modify hooks to use stdin for all tools

### Modified .claude/settings.json

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash",
        "hooks": [
          {
            "type": "command",
            "command": "jq -r '.tool_input.command // empty' | npx claude-flow@alpha hooks pre-command-stdin --validate-safety true"
          }
        ]
      },
      {
        "matcher": "Write|Edit|MultiEdit",
        "hooks": [
          {
            "type": "command",
            "command": "jq -r '.tool_input.file_path // .tool_input.path // empty' | npx claude-flow@alpha hooks pre-edit-stdin --auto-assign-agents true"
          }
        ]
      }
    ]
  }
}
```

Then add `pre-command-stdin` and `pre-edit-stdin` hook handlers that read from stdin.

## Alternative: Disable Hooks Temporarily

To quickly fix the issue:

```bash
# Temporarily disable PreToolUse hooks
mv .claude/settings.json .claude/settings.json.backup
jq 'del(.hooks.PreToolUse)' .claude/settings.json.backup > .claude/settings.json
```

Or edit directly and remove the PreToolUse section.

## Implementation Notes

1. **xargs limits vary by system** (macOS: ~256KB practical, Linux: ~2MB practical)
2. **Stdin is unlimited** (only constrained by memory)
3. **JSON escaping** adds significant overhead when passing through shell
4. **Task tool** specifically needs special handling due to long prompts

## Testing

```bash
# Test hook with long input
echo '{"tool_input":{"command":"'$(python3 -c 'print("A"*100000)')'"}}' | \
  jq -r '.tool_input.command' | \
  wc -c  # Should show 100000

# This would fail with xargs -I {}
# But works fine piped to stdin
```
