# Hash Embedding Algorithm Migration Guide

## Overview

Claude Flow v2.7.0+ includes an improved hash embedding algorithm (v2) that produces normalized vectors compatible with agentic-flow's AgentDB. If you have existing ReasoningBank data using the legacy hash algorithm (v1), this guide will help you migrate.

## What Changed?

### Hash Algorithm v1 (Legacy)
- Raw sin/cos calculations without normalization
- Can produce negative hash values
- Scaled by factors (0.1 and 0.05)
- Not normalized to unit length

### Hash Algorithm v2 (Current, Default)
- Normalized vectors to unit length (magnitude = 1.0)
- Uses `Math.abs()` for positive hash values
- Full scale sin/cos (no reduction factors)
- Compatible with agentic-flow AgentDB

## Do I Need to Migrate?

You need to migrate if:

1. ✅ You have existing ReasoningBank data (`.swarm/memory.db`)
2. ✅ You want to use AgentDB's QUIC synchronization features
3. ✅ You want better compatibility with agentic-flow ecosystem
4. ✅ You're experiencing embedding-related issues

You DON'T need to migrate if:

1. ❌ Fresh installation (already using v2)
2. ❌ Using real API embeddings (OpenAI/OpenRouter) - not hash embeddings
3. ❌ No existing ReasoningBank data

## Migration Process

### Step 1: Backup Your Database

**CRITICAL: Always backup before migration!**

```bash
# Create backup with timestamp
cp .swarm/memory.db .swarm/memory-backup-$(date +%Y%m%d-%H%M%S).db

# Verify backup exists
ls -lh .swarm/memory-backup-*.db
```

### Step 2: Preview Changes (Dry Run)

Run migration in dry-run mode to see what would be changed:

```bash
npx claude-flow memory rehash --reasoningbank --dry-run
```

Expected output:
```
🧠 Using ReasoningBank mode...
[ReasoningBank] 🔄 Starting rehash migration...
[WARN] ⚠️  IMPORTANT: Ensure you have backed up .swarm/memory.db
[ReasoningBank] 🔍 DRY RUN MODE - No changes will be made
[ReasoningBank] Found 50 total embeddings
[ReasoningBank] ✅ Migration complete!
[ReasoningBank]   Scanned: 50 embeddings
[ReasoningBank]   Updated: 50 embeddings
[ReasoningBank] 🔍 DRY RUN - No changes were made

🔍 DRY RUN Complete
   Scanned: 50 embeddings
   Updated: 50 embeddings

💡 To apply changes, run without --dry-run flag
```

### Step 3: Run Migration

If the dry-run looks good, run the actual migration:

```bash
npx claude-flow memory rehash --reasoningbank
```

**Note:** The command will wait 3 seconds before starting to give you time to cancel (Ctrl+C) if needed.

Expected output:
```
🧠 Using ReasoningBank mode...
⚠️  IMPORTANT: This will regenerate all hash embeddings in the database!
   Recommendation: Run with --dry-run first to preview changes

   Backup location: .swarm/memory.db
   Press Ctrl+C to cancel, or wait 3 seconds to continue...

[ReasoningBank] 🔄 Starting rehash migration...
[WARN] ⚠️  IMPORTANT: Ensure you have backed up .swarm/memory.db
[ReasoningBank] Found 50 total embeddings
[ReasoningBank] ✅ Migration complete!
[ReasoningBank]   Scanned: 50 embeddings
[ReasoningBank]   Updated: 50 embeddings

✅ Rehash Complete
   Scanned: 50 embeddings
   Updated: 50 embeddings
```

### Step 4: Verify Migration

Check that your memories are still accessible:

```bash
# List all memories
npx claude-flow memory list --reasoningbank

# Query specific content
npx claude-flow memory query "your search term" --reasoningbank

# Check status
npx claude-flow memory status --reasoningbank
```

### Step 5: Test Functionality

Run a quick test to ensure everything works:

```bash
# Store new memory
npx claude-flow memory store test-key "test value after migration" --reasoningbank

# Query it back
npx claude-flow memory query "test value" --reasoningbank
```

## Verbose Mode

For detailed progress during migration (useful for large databases):

```bash
npx claude-flow memory rehash --reasoningbank --verbose
```

Output will include progress updates:
```
[ReasoningBank] Progress: 10/50
[ReasoningBank] Progress: 20/50
[ReasoningBank] Progress: 30/50
...
```

## Environment Variables

Control the hash algorithm version with environment variables:

```bash
# Use hash-v2 (default, recommended)
export HASH_ALGORITHM_VERSION=2

# Use hash-v1 (legacy, for compatibility)
export HASH_ALGORITHM_VERSION=1

# Alternative: force legacy mode
export USE_LEGACY_HASH=true
```

## Rollback Procedure

If you need to rollback after migration:

### Option 1: Restore from Backup

```bash
# Stop any running processes using the database
# Then restore from backup
cp .swarm/memory-backup-YYYYMMDD-HHMMSS.db .swarm/memory.db
```

### Option 2: Re-run with Legacy Algorithm

```bash
# Set legacy hash algorithm
export HASH_ALGORITHM_VERSION=1

# Re-run migration
npx claude-flow memory rehash --reasoningbank
```

**Note:** This will regenerate embeddings using the v1 algorithm.

## Troubleshooting

### "ReasoningBank not initialized"

Run initialization first:
```bash
npx claude-flow memory init --reasoningbank
```

### "No embeddings found"

This means you're using real API embeddings (not hash fallbacks). Migration is not needed.

### Migration Hangs or Crashes

1. Check available memory: `free -h` (Linux) or `vm_stat` (macOS)
2. Try with smaller batches using verbose mode
3. Verify database is not corrupted: `sqlite3 .swarm/memory.db "PRAGMA integrity_check;"`

### Errors During Migration

The migration will continue even if individual embeddings fail. Check the error count:

```bash
npx claude-flow memory rehash --reasoningbank --verbose
```

Look for:
```
[ReasoningBank]   Errors: X embeddings
```

If errors occur:
1. Check console for specific error messages
2. Verify database integrity
3. Consider restoring from backup and retrying

## Performance Considerations

Migration time depends on database size:

- **Small** (< 100 entries): ~1-5 seconds
- **Medium** (100-1000 entries): ~5-30 seconds
- **Large** (1000-10000 entries): ~30-300 seconds
- **Very Large** (10000+ entries): 5+ minutes

Use `--verbose` for progress tracking on large databases.

## API Embeddings vs Hash Embeddings

If you have `OPENAI_API_KEY` set, you're using real API embeddings, not hash embeddings:

```bash
# Check if using hash embeddings
npx claude-flow memory demo --reasoningbank
```

If you see:
```
⚠️  Running demo with hash embeddings (no OPENAI_API_KEY)
```

You're using hash embeddings and should migrate.

If you see:
```
Using: Real API embeddings (OPENAI_API_KEY detected)
```

You're using real API embeddings - no migration needed.

## Best Practices

1. ✅ **Always backup** before migration
2. ✅ **Run dry-run first** to preview changes
3. ✅ **Use verbose mode** for large databases
4. ✅ **Verify functionality** after migration
5. ✅ **Keep backups** for at least 7 days
6. ✅ **Test queries** after migration to ensure results are still relevant

## When to Use Hash Embeddings vs API Embeddings

### Hash Embeddings (Free, Offline)
- ✅ No API key required
- ✅ Deterministic and reproducible
- ✅ Works offline
- ✅ Free (no API costs)
- ❌ Less accurate semantic matching
- ❌ Not compatible with other embedding models

**Use when:** Testing, development, offline environments, cost-sensitive applications

### API Embeddings (OpenAI, OpenRouter)
- ✅ Better semantic accuracy
- ✅ Compatible with other systems
- ✅ Trained on massive datasets
- ✅ Supports multiple languages
- ❌ Requires API key
- ❌ API costs per request
- ❌ Requires internet connection

**Use when:** Production, high accuracy needed, budget available

## Switching Between Hash and API Embeddings

### Hash → API Embeddings

Set your API key:
```bash
export OPENAI_API_KEY=sk-...
```

New memories will use API embeddings. Old hash embeddings remain unchanged.

### API → Hash Embeddings

Remove API key:
```bash
unset OPENAI_API_KEY
```

New memories will use hash embeddings (v2 by default).

## Integration with AgentDB

After migration to hash-v2, you can use AgentDB features:

```bash
# Query with AgentDB
npx agentic-flow agentdb query "your search" --database .swarm/memory.db

# QUIC synchronization
npx agentic-flow agentdb sync --source .swarm/memory.db --target quic://peer:4433

# Enable HNSW indexing
npx agentic-flow agentdb optimize --database .swarm/memory.db
```

See [agentdb-advanced skill](../.claude/skills/agentdb-advanced/SKILL.md) for more details.

## Frequently Asked Questions

### Do I lose data during migration?

No. Migration only regenerates embedding vectors. All your keys, values, and metadata are preserved.

### Can I run migration multiple times?

Yes. Migration is idempotent - running it multiple times produces the same result.

### Will queries return different results after migration?

Possibly. Hash-v2 uses normalized vectors, which may affect similarity scores slightly. However, the most relevant results should still match.

### Can I keep using hash-v1?

Yes, set `HASH_ALGORITHM_VERSION=1` or `USE_LEGACY_HASH=true`. However, v2 is recommended for better compatibility.

### Is migration required for fresh installations?

No. Fresh installations automatically use hash-v2.

## Support

If you encounter issues during migration:

1. Check this guide's troubleshooting section
2. Review the [ReasoningBank documentation](../src/reasoningbank/README.md)
3. Open an issue: https://github.com/ruvnet/claude-flow/issues
4. Include migration logs and error messages

## Version History

- **v2.7.0**: Hash algorithm v2 introduced (normalized vectors)
- **v2.7.0**: Migration tool added (`memory rehash` command)
- **v2.7.0**: Dry-run and verbose modes added
- **Pre-v2.7.0**: Hash algorithm v1 (legacy, non-normalized)
