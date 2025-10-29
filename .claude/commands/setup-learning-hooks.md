# Setup Advanced Learning Hooks

Merge the advanced AgentDB learning hooks into `.claude/settings.local.json` (personal, git-ignored settings).

**Why settings.local.json?**
- Personal learning preferences (not everyone on team may want this)
- Git-ignored (won't commit your learning data)
- Merges with settings.json at runtime (you get both!)

## Tasks

1. **Read** the current `.claude/settings.local.json` (personal settings)
2. **Fetch** the reference gist hooks configuration
3. **Analyze** both configurations and identify:
   - Hooks that are identical (keep as-is)
   - Hooks that are different (potential conflicts)
   - New hooks from gist not in current settings
4. **For each conflict**, use AskUserQuestion to let user choose:
   - Keep current hook
   - Replace with gist version
   - Merge both (add to hooks array)
5. **Create** the merged settings.local.json with:
   - All existing hooks/permissions preserved (unless user chose to replace)
   - New AgentDB learning hooks added
   - User-resolved conflicts applied
6. **Backup** current settings.local.json to `.claude/settings.local.json.backup`
7. **Write** the merged configuration to `.claude/settings.local.json`
8. **Report** what was added/changed/kept

## Hook Categories to Merge

### Environment Variables (NEW)
- `AGENTDB_LEARNING_ENABLED=true`
- `AGENTDB_REASONING_ENABLED=true`
- `AGENTDB_AUTO_TRAIN=true`

### Permissions (NEW)
- `Bash(npx agentdb:*)`

### PreToolUse
- **Write|Edit|MultiEdit**: Add agentdb semantic queries (2 new hooks)
- **Task**: Add completely (new matcher)

### PostToolUse
- **Write|Edit|MultiEdit**: Add agentdb experience storage + verdict hooks (2 new hooks)
- **Task**: Add completely (new matcher)

### Stop
- Add agentdb model training to session-end

## Expected Outcome

After running this command, your **settings.local.json** will have:

**Environment variables** (added):
- AgentDB learning flags enabled

**Permissions** (added):
- AgentDB CLI access

**New learning hooks** (added):
- Semantic search before edits (learn from successes)
- Failure pattern warnings (avoid past mistakes)
- Experience storage after edits
- Test-based verdict assignment with rewards
- Task trajectory tracking
- AgentDB model training on session end

**Settings merge at runtime**:
- `settings.json` (team, tracked) provides base hooks
- `settings.local.json` (personal, git-ignored) adds learning features
- Both merge together for full functionality

**Result**: Claude Code will learn from your coding sessions and provide better suggestions over time!

## Safety

- Backs up current settings.local.json before changes
- Only adds to personal settings (doesn't modify team settings.json)
- Git-ignored, so won't commit learning configurations
- Can be reverted by restoring backup

Execute this command to begin the merge process.

## Reference Hooks Configuration (Embedded)

```json
{
  "env": {
    "AGENTDB_LEARNING_ENABLED": "true",
    "AGENTDB_REASONING_ENABLED": "true",
    "AGENTDB_AUTO_TRAIN": "true"
  },
  "permissions": {
    "allow": [
      "Bash(npx agentdb:*)"
    ]
  },
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash",
        "hooks": [
          {
            "type": "command",
            "command": "cat | jq -r '.tool_input.command // empty' | tr '\\n' '\\0' | xargs -0 -I {} npx claude-flow@alpha hooks pre-command --command '{}' --validate-safety true --prepare-resources true"
          }
        ]
      },
      {
        "matcher": "Write|Edit|MultiEdit",
        "hooks": [
          {
            "type": "command",
            "description": "Semantic Search Memory - Query similar successful past edits",
            "command": "cat | jq -r '.tool_input.file_path // .tool_input.path // empty' | tr '\\n' '\\0' | xargs -0 -I {} bash -c 'FILE=\"{}\"; echo \"🔍 Semantic Search: Querying similar successful edits for $FILE...\"; npx agentdb@latest query --domain \"successful-edits\" --query \"file:$FILE\" --k 5 --min-confidence 0.8 --format json 2>/dev/null || echo \"{}\" | jq -r \".memories[]? | \\\"💡 Past Success: \\(.pattern.summary // \\\"No similar patterns found\\\")\\\" \" 2>/dev/null; npx claude-flow@alpha hooks pre-edit --file \"$FILE\" --auto-assign-agents true --load-context true'"
          },
          {
            "type": "command",
            "description": "Failure Pattern Recognition - Warn about known failure patterns",
            "command": "cat | jq -r '.tool_input.file_path // .tool_input.path // empty' | tr '\\n' '\\0' | xargs -0 -I {} bash -c 'FILE=\"{}\"; echo \"⚠️ Failure Detection: Checking for known failure patterns...\"; npx agentdb@latest query --domain \"failed-edits\" --query \"file:$FILE\" --k 3 --min-confidence 0.7 --format json 2>/dev/null | jq -r \".memories[]? | \\\"🚨 Warning: Similar edit failed - \\(.pattern.reason // \\\"unknown\\\")\\\" \" 2>/dev/null || true'"
          }
        ]
      },
      {
        "matcher": "Task",
        "hooks": [
          {
            "type": "command",
            "description": "Trajectory Prediction - Predict optimal task sequence",
            "command": "cat | jq -r '.tool_input.prompt // .tool_input.task // empty' | tr '\\n' '\\0' | xargs -0 -I {} bash -c 'TASK=\"{}\"; echo \"🎯 Trajectory Prediction: Analyzing optimal workflow for task...\"; npx agentdb@latest query --domain \"task-trajectories\" --query \"task:$TASK\" --k 3 --min-confidence 0.75 --format json 2>/dev/null | jq -r \".memories[]? | \\\"📋 Predicted Steps: \\(.pattern.trajectory // \\\"No trajectory data\\\") (Success Rate: \\(.confidence // 0))\\\" \" 2>/dev/null || echo \"📋 No historical trajectory data - learning from this task...\"; npx claude-flow@alpha hooks pre-task --description \"$TASK\" --auto-spawn-agents true --load-memory true'"
          }
        ]
      }
    ],
    "PostToolUse": [
      {
        "matcher": "Bash",
        "hooks": [
          {
            "type": "command",
            "command": "cat | jq -r '.tool_input.command // empty' | tr '\\n' '\\0' | xargs -0 -I {} npx claude-flow@alpha hooks post-command --command '{}' --track-metrics true --store-results true"
          }
        ]
      },
      {
        "matcher": "Write|Edit|MultiEdit",
        "hooks": [
          {
            "type": "command",
            "description": "Experience Replay Developer - Capture edit as RL experience",
            "command": "cat | jq -r '.tool_input.file_path // .tool_input.path // empty' | tr '\\n' '\\0' | xargs -0 -I {} bash -c 'FILE=\"{}\"; echo \"💾 Experience Replay: Storing edit experience for $FILE...\"; TIMESTAMP=$(date +%s); npx agentdb@latest store-pattern --type \"experience\" --domain \"code-edits\" --pattern \"{\\\"file\\\":\\\"$FILE\\\",\\\"timestamp\\\":$TIMESTAMP,\\\"action\\\":\\\"edit\\\",\\\"state\\\":\\\"pre-test\\\"}\" --confidence 0.5 2>/dev/null || true; npx claude-flow@alpha hooks post-edit --file \"$FILE\" --format true --update-memory true --train-patterns true'"
          },
          {
            "type": "command",
            "description": "Verdict-Based Quality - Async verdict assignment after tests",
            "command": "cat | jq -r '.tool_input.file_path // .tool_input.path // empty' | tr '\\n' '\\0' | xargs -0 -I {} bash -c 'FILE=\"{}\"; (sleep 2; TEST_RESULT=$(npm test --silent 2>&1 | grep -q \"pass\" && echo \"ACCEPT\" || echo \"REJECT\"); REWARD=$([ \"$TEST_RESULT\" = \"ACCEPT\" ] && echo \"1.0\" || echo \"-1.0\"); echo \"⚖️ Verdict: $TEST_RESULT (reward: $REWARD) for $FILE\"; npx agentdb@latest store-pattern --type \"verdict\" --domain \"code-quality\" --pattern \"{\\\"file\\\":\\\"$FILE\\\",\\\"verdict\\\":\\\"$TEST_RESULT\\\",\\\"reward\\\":$REWARD}\" --confidence $([ \"$TEST_RESULT\" = \"ACCEPT\" ] && echo \"0.95\" || echo \"0.3\") 2>/dev/null; if [ \"$TEST_RESULT\" = \"ACCEPT\" ]; then npx agentdb@latest store-pattern --type \"success\" --domain \"successful-edits\" --pattern \"{\\\"file\\\":\\\"$FILE\\\",\\\"summary\\\":\\\"Edit passed tests\\\"}\" --confidence 0.9 2>/dev/null; else npx agentdb@latest store-pattern --type \"failure\" --domain \"failed-edits\" --pattern \"{\\\"file\\\":\\\"$FILE\\\",\\\"reason\\\":\\\"Tests failed\\\"}\" --confidence 0.8 2>/dev/null; fi) &'"
          }
        ]
      },
      {
        "matcher": "Task",
        "hooks": [
          {
            "type": "command",
            "description": "Trajectory Storage - Record task trajectory for learning",
            "command": "cat | jq -r '.tool_input.prompt // .tool_input.task // empty, .result.success // \"unknown\"' | tr '\\n' '\\0' | xargs -0 bash -c 'TASK=\"$1\"; SUCCESS=\"$2\"; echo \"📊 Trajectory Storage: Recording task workflow...\"; CONFIDENCE=$([ \"$SUCCESS\" = \"true\" ] && echo \"0.95\" || echo \"0.5\"); npx agentdb@latest store-pattern --type \"trajectory\" --domain \"task-trajectories\" --pattern \"{\\\"task\\\":\\\"$TASK\\\",\\\"success\\\":$SUCCESS,\\\"trajectory\\\":\\\"search→scaffold→test→refine\\\"}\" --confidence \"$CONFIDENCE\" 2>/dev/null || true; npx claude-flow@alpha hooks post-task --analyze-performance true --store-decisions true --export-learnings true' _"
          }
        ]
      }
    ],
    "Stop": [
      {
        "hooks": [
          {
            "type": "command",
            "description": "Session end - Train models and compress learnings",
            "command": "bash -c 'echo \"🎓 Session End: Training models on accumulated experiences...\"; npx agentdb@latest train --domain \"code-edits\" --epochs 10 --batch-size 32 2>/dev/null || echo \"⚠️ Training skipped (insufficient data)\"; echo \"🧠 Memory Distillation: Compressing session learnings...\"; npx agentdb@latest optimize-memory --compress true --consolidate-patterns true 2>/dev/null || true; npx claude-flow@alpha hooks session-end --generate-summary true --persist-state true --export-metrics true'"
          }
        ]
      }
    ]
  }
}
```

