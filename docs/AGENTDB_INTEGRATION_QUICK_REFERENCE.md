# AgentDB Integration - Quick Reference Guide

**Research Date**: 2025-11-02
**Report**: `docs/AGENTDB_INTEGRATION_RESEARCH_REPORT.md` (comprehensive)

---

## Quick Navigation

### By Integration Type

#### Hook Integration
- **No dedicated hooks directory** found (.claude/hooks doesn't exist)
- **Hooks via CLI commands**: Memory operations trigger coordination hooks
- **Pattern**: Post-task hooks update shared memory after operations
- **Key File**: `src/cli/commands/memory.ts` (Lines 1-60)

#### MCP Tool Integration
- **Memory Store Tool**: `memory_store` - Store data in swarm memory
- **Memory Retrieve Tool**: `memory_retrieve` - Query with semantic search support
- **Backend**: Uses `UnifiedMemoryManager` for automatic SQLite/JSON selection
- **Key File**: `src/mcp/swarm-tools.ts` (Lines 91-158)

#### CLI Commands
- **7 memory management commands** with AgentDB support
- **New vector search**: `memory vector-search` with semantic queries
- **Backend agnostic**: Works with SQLite or JSON automatically
- **Key File**: `src/cli/commands/memory.ts` (9 commands total)

#### Swarm Coordination
- **Namespace-based organization**: swarm:agents, swarm:tasks, swarm:coordination, etc.
- **Memory factory pattern**: `createMemory()` creates appropriate memory type
- **Agent communication**: Agents share findings via namespace memory
- **Key File**: `src/memory/index.js` (Lines 43-56)

---

## Core Integration Files

### 1. Memory Command (CLI Interface)
**File**: `/Users/davidshepherd/projects/claude-flow/src/cli/commands/memory.ts`
**Lines**: 577 total

| Command | Purpose | Lines | Features |
|---------|---------|-------|----------|
| `memory store` | Store key-value data | 291-311 | Namespace, backend detection |
| `memory query` | Search entries | 313-351 | Semantic search, confidence scores |
| `memory list` | Browse memories | 353-392 | Grouped by namespace |
| `memory export` | Export to file | 394-413 | JSON format with size |
| `memory import` | Import from file | 415-432 | Preserves namespaces |
| `memory stats` | Show backend info | 434-467 | Backend type, performance metrics |
| `memory vector-search` | Semantic search | 485-504 | Distance metrics, thresholds |
| `memory store-vector` | Store with embedding | 506-522 | Metadata support |
| `memory agentdb-info` | Integration status | 524-577 | Setup guide, capabilities |

### 2. ReasoningBank Adapter (SQLite Backend)
**File**: `/Users/davidshepherd/projects/claude-flow/src/reasoningbank/reasoningbank-adapter.js`
**Lines**: 523 total

**Key Functions**:
- `initializeReasoningBank()` - Initialize SQLite + ReasoningBank
- `storeMemory()` - Store with embeddings
- `queryMemories()` - Semantic search with custom embeddings
- `listMemories()` - List all memories
- `getStatus()` - Database statistics
- `customRetrieveMemories()` - MMR selection for diversity

**Features**:
- LRU query cache (100 entries, 60s TTL)
- Custom embedding provider support
- Automatic fallback to database queries
- Usage tracking and confidence scoring

### 3. Custom Embeddings (Multi-Provider)
**File**: `/Users/davidshepherd/projects/claude-flow/src/reasoningbank/custom-embeddings.js`
**Lines**: 189 total

**Supported Providers**:
- OpenAI (default)
- OpenRouter
- Requesty.ai
- Together.ai
- Custom endpoints

**Features**:
- 1-hour TTL embedding cache
- Deterministic hash fallback
- Provider prefix auto-detection
- Dimension validation

### 4. AgentDB Memory Adapter (Hybrid Mode)
**File**: `/Users/davidshepherd/projects/claude-flow/src/memory/agentdb-adapter.js`
**Lines**: 387 total

**Three Modes**:
- **hybrid** (default): AgentDB + JSON fallback
- **agentdb**: AgentDB only, fail on error
- **legacy**: JSON only, no AgentDB

**New Methods**:
- `storeWithEmbedding()` - Store with vector
- `vectorSearch()` - Vector similarity search
- `semanticRetrieve()` - Semantic retrieval with scores
- `isAgentDBAvailable()` - Check status

### 5. AgentDB Backend (Direct Integration)
**File**: `/Users/davidshepherd/projects/claude-flow/src/memory/backends/agentdb.js`
**Lines**: 318 total

**Features**:
- HNSW indexing (O(log n) search)
- Quantization support (scalar, binary, product)
- Vector storage with metadata
- Search filtering by namespace/metadata
- Batch operations

### 6. Memory Factory (Unified Interface)
**File**: `/Users/davidshepherd/projects/claude-flow/src/memory/index.js`
**Lines**: 68 total

**Key Exports**:
```javascript
export function createMemory(options = {})
// Returns: AgentDBMemoryAdapter | SwarmMemory | SharedMemory
```

**Namespace Constants**:
```javascript
SWARM_NAMESPACES = {
  AGENTS, TASKS, COMMUNICATIONS, CONSENSUS, PATTERNS, METRICS, COORDINATION
}
```

---

## Integration Patterns

### Pattern 1: Three-Tier Architecture
```
Tier 1: SQLite + ReasoningBank
  └─ 150x faster, semantic search, embeddings

Tier 2: JSON fallback
  └─ Always available, backward compatible

Tier 3: Runtime LRU cache
  └─ 60s TTL, recent query results
```

### Pattern 2: Graceful Fallback
```javascript
try {
  // Try SQLite with AgentDB
  return await sqliteBackend.query();
} catch {
  // Fall back to JSON
  return await jsonBackend.query();
}
```

### Pattern 3: Namespace Organization
```
swarm:agents         → Agent registry & status
swarm:tasks          → Task queue & assignments
swarm:communications → Inter-agent messages
swarm:consensus      → Voting & agreements
swarm:patterns       → Learned patterns & skills
swarm:metrics        → Performance & usage data
swarm:coordination   → Shared decisions
```

### Pattern 4: Embedding Pipeline
```
Text → Cache check → API call (OpenAI/etc) → Store result → Return embedding
         (1h TTL)     (multi-provider)      (LRU 100)
```

---

## MCP Tool Integration

### Memory Store Tool
**Tool Name**: `memory_store`
**Purpose**: Store data in shared swarm memory

```
Input:
{
  key: string,              // Required: data key
  value: object,            // Required: data value
  namespace?: string,       // Optional: swarm:* namespace
  metadata?: object,        // Optional: additional metadata
  confidence?: number       // Optional: 0-1 confidence score
}
```

### Memory Retrieve Tool
**Tool Name**: `memory_retrieve`
**Purpose**: Retrieve from shared swarm memory

```
Input:
{
  key: string,              // Required: key to retrieve
  namespace?: string,       // Optional: filter by namespace
  searchType?: string       // Optional: 'exact' | 'semantic' | 'fuzzy'
}
```

**Search Types**:
- `exact` - Direct key matching (fast)
- `semantic` - Vector embedding search (150x faster)
- `fuzzy` - Substring matching (fallback)

---

## CLI Usage Examples

### Store Memory
```bash
npx claude-flow memory store research:findings \
  '{"findings": ["A", "B"]}' \
  -n swarm:patterns
```

### Semantic Vector Search
```bash
npx claude-flow memory vector-search "quantum computing" \
  -k 10 \
  -t 0.7 \
  -m cosine \
  -n swarm:patterns
```

### Check Backend Status
```bash
npx claude-flow memory stats
# Output: Backend (SQLite/JSON), total entries, performance metrics
```

### Export Memory
```bash
npx claude-flow memory export ./memory-backup.json
# Size: XX KB, Entries: XXX, Namespaces: XX
```

---

## Performance Characteristics

| Operation | Speed | Improvement |
|-----------|-------|-------------|
| Vector search | 96x faster | 9.6ms → <0.1ms |
| Batch operations | 125x faster | - |
| Large queries (1M vectors) | 164x faster | - |
| Memory usage (binary quant) | 32x reduction | 768-dim → 96 bytes |
| Memory usage (scalar quant) | 4x reduction | 768-dim → 768 bytes |
| HNSW search | <100µs | O(log n) |
| Pattern retrieval (cached) | <1ms | - |
| Embedding cache hit | <1ms | 1h TTL |

---

## Skills Available

### 6 AgentDB-Related Skills

1. **agentdb-vector-search** - Semantic search implementation
2. **agentdb-optimization** - Performance tuning & quantization
3. **agentdb-memory-patterns** - Session & persistent memory
4. **agentdb-learning** - 9 RL algorithms integration
5. **agentdb-advanced** - Distributed systems & QUIC sync
6. **reasoningbank-agentdb** - Adaptive learning with trajectory tracking

**Use with Claude Code**:
```
/agentdb-vector-search
/agentdb-optimization
/agentdb-memory-patterns
```

---

## Environment Configuration

### Optional Environment Variables

```bash
# Embedding provider
OPENAI_API_KEY=sk-...
OPENAI_BASE_URL=https://api.openai.com/v1

# Embedding model
EMBEDDING_MODEL=text-embedding-3-small
EMBEDDING_DIMENSIONS=1536
EMBEDDING_STRICT_MODE=true

# AgentDB
AGENTDB_PATH=.agentdb/claude-flow.db
AGENTDB_QUANTIZATION=scalar

# ReasoningBank
CLAUDE_FLOW_DB_PATH=.swarm/memory.db
```

---

## Code Integration Points

### In Your Application

```typescript
// 1. Create memory instance
import { createMemory } from 'claude-flow/src/memory/index.js';
const memory = createMemory({ type: 'agentdb', mode: 'hybrid' });

// 2. Initialize
await memory.initialize();

// 3. Store data
await memory.store('key', value, { namespace: 'swarm:coordination' });

// 4. Query data (semantic if embedding available)
const results = await memory.query('search', 'swarm:coordination');

// 5. Or use vector search directly
await memory.storeWithEmbedding('key', 'text', { embedding: [...] });
const similar = await memory.vectorSearch(queryVector, { k: 10 });
```

---

## Testing

### Run Tests
```bash
# All tests
npm test

# Integration tests only
npm run test:integration

# AgentDB-specific tests
bash ./tests/run-agentdb-tests.sh

# Performance benchmarks
npm run test:benchmark
```

### Test Files
- `tests/integration/agentdb/compatibility.test.js` - Backward compatibility
- `tests/performance/agentdb/benchmarks.test.js` - Performance validation
- `tests/performance/agentdb/load-test.cjs` - Load testing
- `tests/performance/agentdb/memory-profile.cjs` - Memory profiling

---

## Troubleshooting

### Issue: SQLite backend unavailable
**Solution**: Falls back to JSON automatically
```
Check: npx claude-flow memory stats
Shows: Backend (SQLite/JSON), 150x faster or note about JSON
```

### Issue: Slow embedding generation
**Solution**: Check embedding cache
- Cache size: 100 entries
- TTL: 1 hour
- Hit rate shown in metrics

### Issue: High memory usage
**Solution**: Enable quantization
```bash
AGENTDB_QUANTIZATION=binary  # 32x reduction
```

### Issue: Poor vector search results
**Solution**: Adjust threshold
```bash
npx claude-flow memory vector-search "query" -t 0.8  # Higher threshold
```

---

## Architecture Diagram

```
┌─────────────────────────────────────────────────────┐
│           CLI Commands (memory.ts)                  │
│  store | query | list | export | vector-search    │
└────────────────┬────────────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────────────┐
│      UnifiedMemoryManager (Backend Selection)      │
│  Try SQLite → Fall back to JSON                    │
└────────────────┬────────────────────────────────────┘
        ┌────────┴────────┐
        ▼                 ▼
┌──────────────────┐  ┌──────────────────┐
│  SQLite Backend  │  │   JSON Backend   │
│  ReasoningBank   │  │ SimpleMemory     │
│  + Embeddings    │  │ (Always Available)│
│  + Vector Search │  └──────────────────┘
└──────────────────┘
```

---

## Comprehensive Report

For detailed integration analysis, see:
**📄 `/Users/davidshepherd/projects/claude-flow/docs/AGENTDB_INTEGRATION_RESEARCH_REPORT.md`**

Contains:
- 12 sections covering all integration aspects
- 40+ files analyzed
- Code examples for each pattern
- Performance benchmarks
- Migration paths
- Troubleshooting guide
- Future recommendations
