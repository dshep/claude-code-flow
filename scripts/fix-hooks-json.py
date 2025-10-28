#!/usr/bin/env python3
"""
Fix xargs command line length issues in Claude settings JSON files.
Replaces xargs -0 -I {} patterns with direct bash variable assignment.
"""

import json
import re
import sys
from pathlib import Path
from datetime import datetime

def fix_xargs_pattern(command_str):
    """Replace xargs patterns with direct variable assignment."""

    if "xargs -0 -I {}" not in command_str:
        return command_str

    # Extract the jq part
    jq_match = re.search(r"(cat \| jq -r '[^']+(?:\\[^']+)*')", command_str)
    if not jq_match:
        return command_str

    jq_part = jq_match.group(1)

    # Determine variable name based on what's being extracted
    if ".tool_input.command" in jq_part:
        var_name = "_HOOK_CMD"
    elif ".tool_input.file_path" in jq_part or ".tool_input.path" in jq_part:
        var_name = "_HOOK_FILE"
    elif ".tool_input.prompt" in jq_part or ".tool_input.task" in jq_part:
        var_name = "_HOOK_TASK"
    else:
        var_name = "_HOOK_VAR"

    # Extract the command after xargs
    # Pattern 1: xargs ... bash -c 'CMD="{}"; ...rest...'
    # Pattern 2: xargs ... npx command --arg '{}' ...rest...

    xargs_part = re.search(r"xargs -0 -I \{\} (.+)$", command_str)
    if not xargs_part:
        return command_str

    after_xargs = xargs_part.group(1)

    # Check if it's a bash -c pattern with complex script
    if after_xargs.startswith("bash -c '") or after_xargs.startswith("/bin/bash -c '"):
        # Complex bash script pattern
        bash_cmd_match = re.search(r"(?:bash|/bin/bash) -c '(.+)'$", after_xargs)
        if not bash_cmd_match:
            return command_str

        bash_cmd = bash_cmd_match.group(1)

        # Replace variable assignments and references
        bash_cmd = re.sub(r'(CMD|FILE|TASK)="\{\}"', '', bash_cmd, count=1)
        bash_cmd = re.sub(r'\$CMD\b', f'${var_name}', bash_cmd)
        bash_cmd = re.sub(r'\$FILE\b', f'${var_name}', bash_cmd)
        bash_cmd = re.sub(r'\$TASK\b', f'${var_name}', bash_cmd)
        bash_cmd = re.sub(r'"\$CMD"', f'"${var_name}"', bash_cmd)
        bash_cmd = re.sub(r'"\$FILE"', f'"${var_name}"', bash_cmd)
        bash_cmd = re.sub(r'"\$TASK"', f'"${var_name}"', bash_cmd)

        # Build new command
        new_command = (
            f"/bin/bash -c '{var_name}=$({jq_part}); "
            f"if [ -n \"${var_name}\" ] && [ ${{#{var_name}}} -lt 50000 ]; then "
            f"{bash_cmd}; "
            f"fi'"
        )
    else:
        # Simple pattern: xargs ... npx command --arg '{}'
        # Just replace {} with $VAR
        replaced_cmd = after_xargs.replace("'{}'", f'"${var_name}"')

        # Build new command
        new_command = (
            f"/bin/bash -c '{var_name}=$({jq_part}); "
            f"if [ -n \"${var_name}\" ] && [ ${{#{var_name}}} -lt 50000 ]; then "
            f"{replaced_cmd} 2>/dev/null || true; "
            f"fi'"
        )

    return new_command

def fix_hooks_in_json(json_data):
    """Recursively find and fix hook commands in JSON structure."""
    if isinstance(json_data, dict):
        if "command" in json_data and isinstance(json_data["command"], str):
            original = json_data["command"]
            fixed = fix_xargs_pattern(original)
            if fixed != original:
                json_data["command"] = fixed
                return True  # Changed

        changed = False
        for value in json_data.values():
            if fix_hooks_in_json(value):
                changed = True
        return changed

    elif isinstance(json_data, list):
        changed = False
        for item in json_data:
            if fix_hooks_in_json(item):
                changed = True
        return changed

    return False

def main():
    files = [
        ".claude/settings-complete.json",
        ".claude/settings-github-npx.json",
        ".claude/settings-npx-hooks.json",
        ".claude/settings.local.json",
    ]

    print("🔧 Fixing xargs patterns in Claude settings files...\n")

    for filepath in files:
        path = Path(filepath)
        if not path.exists():
            print(f"  ⚠️  Skipping (not found): {filepath}")
            continue

        print(f"  📄 Processing: {filepath}")

        # Backup
        backup_path = path.with_suffix(f'.json.backup-{datetime.now().strftime("%Y%m%d-%H%M%S")}')
        backup_path.write_text(path.read_text())
        print(f"    💾 Backed up to: {backup_path.name}")

        try:
            # Load JSON
            data = json.loads(path.read_text())

            # Fix hooks
            changed = fix_hooks_in_json(data)

            if changed:
                # Write back with nice formatting
                path.write_text(json.dumps(data, indent=2) + "\n")
                print(f"    ✅ Fixed and saved")
            else:
                print(f"    ℹ️  No changes needed")

        except json.JSONDecodeError as e:
            print(f"    ❌ JSON error: {e}")
            print(f"    Restoring from backup...")
            path.write_text(backup_path.read_text())
        except Exception as e:
            print(f"    ❌ Error: {e}")
            print(f"    Restoring from backup...")
            path.write_text(backup_path.read_text())

    print("\n✅ All files processed!")
    print("\n📝 Changes applied:")
    print("  - Removed: xargs -0 -I {} patterns")
    print("  - Added: Length checks (50KB limit)")
    print("  - Changed: CMD/FILE/TASK → _HOOK_CMD/_HOOK_FILE/_HOOK_TASK")
    print("  - Added: Error suppression (2>/dev/null || true)")
    print("\nTo verify: jq empty .claude/settings*.json")

if __name__ == "__main__":
    main()
