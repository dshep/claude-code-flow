# AgentDB Setup & Configuration Guide for Claude-Flow

## Overview

AgentDB v1.3.9 is an optional high-performance vector database for semantic memory in Claude-Flow. It provides 150x-12,500x faster search, AI/ML capabilities, and advanced memory features while maintaining 100% backward compatibility.

**Status**: Optional peer dependency (install for advanced features)
**Current Version**: 1.3.9
**Package**: `agentdb@1.3.9` on npm
**Storage**: SQLite with better-sqlite3 (native) or WASM (browser)

---

## Installation

### Step 1: Install AgentDB Package

AgentDB is an **optional peer dependency**. Install it to enable vector search features:

```bash
# Recommended: Install specific version
npm install agentdb@1.3.9

# Or install latest version
npm install agentdb@latest

# For Windows (use pnpm if npm has issues with native dependencies)
pnpm install agentdb@1.3.9 --legacy-peer-deps
```

### Step 2: Verify Installation

Check that AgentDB is available:

```bash
# Check if installed
npm list agentdb

# Verify CLI binary is available
npx agentdb --version

# Test initialization
node -e "import('agentdb').then(() => console.log('AgentDB loaded successfully'))"
```

### Step 3: Environment Configuration (Optional)

AgentDB works out-of-the-box but supports custom configuration via environment variables.

Create `.env.local` (copy from `.env.local.example`):

```bash
cp .env.local.example .env.local
```

---

## Configuration

### Minimal Setup (Default)

AgentDB works with zero configuration:

```javascript
// src/memory/backends/agentdb.js
const backend = new AgentDBBackend({
  dbPath: '.agentdb/claude-flow.db'  // Default location
});
await backend.initialize();
```

### Full Configuration

#### Database Location

```bash
# Environment variable
AGENTDB_PATH=/custom/path/to/db.db

# Or in code
new AgentDBBackend({
  dbPath: '/custom/path/to/db.db'
})
```

#### Quantization Options

Reduce memory usage 4-32x:

```bash
# scalar = 4x reduction (default)
AGENTDB_QUANTIZATION=scalar

# binary = 32x reduction (maximum)
AGENTDB_QUANTIZATION=binary

# product = 8-16x reduction
AGENTDB_QUANTIZATION=product

# none = no quantization (full precision)
AGENTDB_QUANTIZATION=none
```

In code:

```javascript
new AgentDBBackend({
  quantization: 'binary'  // 32x memory savings
})
```

#### HNSW Indexing (Enabled by Default)

HNSW provides O(log n) search complexity (150x faster):

```bash
# Disable if you prefer simple flat indexing
AGENTDB_HNSW=false
```

In code:

```javascript
new AgentDBBackend({
  enableHNSW: true,  // Default (recommended)
  // HNSW tuning parameters:
  hnswConfig: {
    M: 16,              // Default: connections per node
    efConstruction: 200, // Default: construction effort
    efSearch: 50        // Default: search effort
  }
})
```

#### Operation Modes

Three modes for different use cases:

```javascript
// 1. Hybrid Mode (Default, Recommended)
new AgentDBMemoryAdapter({
  mode: 'hybrid'  // Use AgentDB, fallback to legacy if unavailable
})

// 2. AgentDB-Only Mode
new AgentDBMemoryAdapter({
  mode: 'agentdb'  // Fail if AgentDB not available
})

// 3. Legacy Mode
new AgentDBMemoryAdapter({
  mode: 'legacy'  // No AgentDB features
})
```

### Embedding Configuration (For ReasoningBank)

ReasoningBank adapter uses semantic search with embeddings:

```bash
# OpenAI (Default - Most Recommended)
OPENAI_API_KEY=sk-proj-your-key
EMBEDDING_MODEL=text-embedding-3-small
EMBEDDING_DIMENSIONS=1536

# Alternative: OpenRouter (Cost-effective)
OPENAI_BASE_URL=https://openrouter.ai/api/v1
OPENAI_API_KEY=sk-or-v1-your-key
EMBEDDING_PROVIDER_PREFIX=openai/

# Alternative: Requesty.ai Router
OPENAI_BASE_URL=https://router.requesty.ai/v1
OPENAI_API_KEY=your-requesty-key

# Alternative: Together.ai
OPENAI_BASE_URL=https://api.together.xyz/v1
OPENAI_API_KEY=your-together-key
EMBEDDING_MODEL=togethercomputer/m2-bert-80M-8k-retrieval
EMBEDDING_DIMENSIONS=768

# Alternative: Local Ollama
OPENAI_BASE_URL=http://localhost:11434/v1
OPENAI_API_KEY=none
EMBEDDING_MODEL=nomic-embed-text
EMBEDDING_DIMENSIONS=768

# Embedding strict mode (default: true)
EMBEDDING_STRICT_MODE=true  # Fail on API errors (recommended)
EMBEDDING_STRICT_MODE=false # Use hash fallback if API fails
```

---

## Initialization Patterns

### Pattern 1: Simple Vector Store (AgentDB Backend)

```javascript
// src/memory/backends/agentdb.js
import { AgentDBBackend } from './agentdb.js';

export class AgentDBBackend {
  constructor(options = {}) {
    this.dbPath = options.dbPath || '.agentdb/claude-flow.db';
    this.quantization = options.quantization || 'scalar';
    this.enableHNSW = options.enableHNSW !== false;
  }

  async initialize() {
    const { default: AgentDB } = await import('agentdb');

    this.db = new AgentDB({
      path: this.dbPath,
      quantization: this.quantization,
      indexType: this.enableHNSW ? 'hnsw' : 'flat'
    });

    await this.db.init();
    console.log(`AgentDB initialized at ${this.dbPath}`);
  }

  async storeVector(key, embedding, metadata = {}) {
    await this.db.add({
      id: key,
      vector: embedding,
      metadata: { ...metadata, storedAt: Date.now() }
    });
  }

  async search(query, options = {}) {
    const results = await this.db.search({
      vector: query,
      k: options.k || 10,
      filter: this._buildFilter(options)
    });

    return results.map(r => ({
      id: r.id,
      similarity: r.score,
      metadata: r.metadata
    }));
  }

  async getStats() {
    const stats = await this.db.stats();
    return {
      vectorCount: stats.count || 0,
      indexType: this.enableHNSW ? 'hnsw' : 'flat',
      quantization: this.quantization,
      dbPath: this.dbPath
    };
  }
}
```

### Pattern 2: Memory Adapter (Backward Compatible)

```javascript
// src/memory/agentdb-adapter.js
import { EnhancedMemory } from './enhanced-memory.js';
import { AgentDBBackend } from './backends/agentdb.js';

export class AgentDBMemoryAdapter extends EnhancedMemory {
  constructor(options = {}) {
    super(options);
    this.mode = options.mode || 'hybrid'; // hybrid|agentdb|legacy
    this.agentdb = null;
    this.agentdbInitialized = false;
  }

  async initialize() {
    // Always initialize legacy memory first
    await super.initialize();

    // Initialize AgentDB if mode allows
    if (this.mode !== 'legacy') {
      try {
        this.agentdb = new AgentDBBackend({
          dbPath: this.options.agentdbPath || '.agentdb/claude-flow.db',
          quantization: this.options.quantization || 'scalar',
          enableHNSW: this.options.enableHNSW !== false
        });

        await this.agentdb.initialize();
        this.agentdbInitialized = true;
        console.log(`AgentDB initialized in ${this.mode} mode`);
      } catch (error) {
        if (this.mode === 'agentdb') {
          throw error; // Fail in agentdb-only mode
        }
        // Hybrid mode: warn and continue
        console.warn(`AgentDB unavailable, using legacy mode: ${error.message}`);
      }
    }
  }

  isAgentDBAvailable() {
    return this.agentdbInitialized && this.agentdb !== null;
  }

  async storeWithEmbedding(key, value, embedding, options = {}) {
    // Always store in legacy for compatibility
    await this.store(key, value, options);

    // If AgentDB available, also store vector
    if (this.isAgentDBAvailable()) {
      try {
        await this.agentdb.storeVector(key, embedding, {
          value,
          namespace: options.namespace,
          timestamp: Date.now()
        });
      } catch (error) {
        console.warn(`Vector storage failed: ${error.message}`);
      }
    }
  }

  async vectorSearch(query, options = {}) {
    if (!this.isAgentDBAvailable()) {
      return this.search(query, {
        namespace: options.namespace,
        limit: options.k || 10
      });
    }

    try {
      return await this.agentdb.search(query, {
        k: options.k || 10,
        namespace: options.namespace,
        filter: options.filter
      });
    } catch (error) {
      console.warn(`Vector search failed, using legacy: ${error.message}`);
      return this.search(query, {
        namespace: options.namespace,
        limit: options.k || 10
      });
    }
  }
}
```

### Pattern 3: ReasoningBank Integration (Semantic Search)

```javascript
// src/reasoningbank/reasoningbank-adapter.js
import * as ReasoningBank from 'agentic-flow/reasoningbank';

async function initializeReasoningBank() {
  await ReasoningBank.initialize();
  console.log('[ReasoningBank] Node.js backend initialized');
}

async function storeMemory(key, value, options = {}) {
  const memory = {
    id: uuidv4(),
    type: 'reasoning_memory',
    pattern_data: {
      title: key,
      content: value,
      domain: options.namespace || 'default'
    },
    confidence: options.confidence || 0.8
  };

  ReasoningBank.db.upsertMemory(memory);

  // Generate and store embedding for semantic search
  const embedding = await computeCustomEmbedding(value, {
    apiKey: process.env.OPENAI_API_KEY,
    model: process.env.EMBEDDING_MODEL || 'text-embedding-3-small'
  });

  ReasoningBank.db.upsertEmbedding({
    id: memory.id,
    model: 'text-embedding-3-small',
    dims: embedding.length,
    vector: embedding
  });

  return memory.id;
}

async function queryMemories(searchQuery, options = {}) {
  // Custom semantic search using embeddings
  const queryEmbed = await computeCustomEmbedding(searchQuery, {
    apiKey: process.env.OPENAI_API_KEY,
    model: process.env.EMBEDDING_MODEL || 'text-embedding-3-small'
  });

  const candidates = ReasoningBank.db.fetchMemoryCandidates({
    domain: options.namespace || 'default'
  });

  // Score with similarity + recency + reliability
  const scored = candidates.map(item => ({
    ...item,
    score: cosineSimilarity(queryEmbed, item.embedding)
  }));

  return scored.sort((a, b) => b.score - a.score).slice(0, options.limit || 10);
}
```

### Pattern 4: Unified Memory Manager (Hybrid)

```javascript
// src/cli/commands/memory.ts
import { UnifiedMemoryManager } from './memory.js';

export class UnifiedMemoryManager {
  private backend: MemoryBackend = 'sqlite';
  private sqliteManager: any = null;
  private jsonManager: SimpleMemoryManager | null = null;

  async getBackend(): Promise<MemoryBackend> {
    if (this.backend === 'sqlite' && !this.sqliteManager) {
      try {
        const { initializeReasoningBank, storeMemory, queryMemories } =
          await import('../../reasoningbank/reasoningbank-adapter.js');

        await initializeReasoningBank();
        this.sqliteManager = { storeMemory, queryMemories };
        console.log('Using SQLite backend (.swarm/memory.db)');
        return 'sqlite';
      } catch (error) {
        console.warn('SQLite unavailable, falling back to JSON');
        this.backend = 'json';
      }
    }

    if (this.backend === 'json' && !this.jsonManager) {
      this.jsonManager = new SimpleMemoryManager();
    }

    return this.backend;
  }

  async store(key: string, value: string, namespace: string = 'default') {
    const backend = await this.getBackend();

    if (backend === 'sqlite' && this.sqliteManager) {
      return await this.sqliteManager.storeMemory(key, value, { namespace });
    } else if (this.jsonManager) {
      return await this.jsonManager.store(key, value, namespace);
    }
  }

  async query(search: string, namespace?: string, limit: number = 10) {
    const backend = await this.getBackend();

    if (backend === 'sqlite' && this.sqliteManager) {
      return await this.sqliteManager.queryMemories(search, { namespace, limit });
    } else if (this.jsonManager) {
      return await this.jsonManager.query(search, namespace);
    }
  }
}
```

---

## Usage Examples

### Basic Vector Storage

```javascript
import { AgentDBBackend } from './src/memory/backends/agentdb.js';

const backend = new AgentDBBackend({
  dbPath: '.agentdb/my-vectors.db',
  quantization: 'scalar'
});

await backend.initialize();

// Store a vector with metadata
const embedding = [0.1, 0.2, 0.3, ...]; // 384+ dimensions
await backend.storeVector('memory-1', embedding, {
  text: 'User preference for Node.js',
  namespace: 'user-prefs',
  confidence: 0.95
});

// Search for similar vectors
const results = await backend.search(queryEmbedding, {
  k: 5,
  namespace: 'user-prefs'
});

console.log(results);
// [
//   { id: 'memory-1', similarity: 0.98, metadata: {...} },
//   { id: 'memory-3', similarity: 0.92, metadata: {...} }
// ]
```

### Memory Adapter with Fallback

```javascript
import { AgentDBMemoryAdapter } from './src/memory/agentdb-adapter.js';

// Hybrid mode: try AgentDB, fall back to JSON
const memory = new AgentDBMemoryAdapter({
  mode: 'hybrid'
});

await memory.initialize();

// Check if AgentDB is available
if (memory.isAgentDBAvailable()) {
  console.log('AgentDB vector search enabled');
}

// Store with vector
await memory.storeWithEmbedding('task-1', 'Implement feature X', embedding, {
  namespace: 'tasks'
});

// Search (uses AgentDB if available, falls back to pattern search)
const results = await memory.vectorSearch(queryEmbedding, {
  k: 10,
  namespace: 'tasks'
});
```

### ReasoningBank Semantic Search

```javascript
import { initializeReasoningBank, storeMemory, queryMemories }
  from './src/reasoningbank/reasoningbank-adapter.js';

// Initialize with SQLite backend
await initializeReasoningBank();

// Store memory with automatic embedding
const id = await storeMemory(
  'best-practice-1',
  'Always write tests before implementation for TDD',
  {
    namespace: 'development-practices',
    confidence: 0.95
  }
);

// Semantic search (understands meaning, not just keywords)
const results = await queryMemories(
  'how to write code better',
  {
    namespace: 'development-practices',
    limit: 5
  }
);

// Results are ranked by semantic similarity
console.log(results[0].value);
// 'Always write tests before implementation for TDD'
```

### CLI Commands

```bash
# Initialize memory system
npx claude-flow memory stats

# Store memory
npx claude-flow memory store "key" "value" -n "namespace"

# Query memory (semantic search if SQLite available)
npx claude-flow memory query "search term" -n "namespace" -l 10

# List all memories
npx claude-flow memory list -n "namespace"

# Get AgentDB info
npx claude-flow memory agentdb-info

# Vector search (requires AgentDB)
npx claude-flow memory vector-search "query" -k 10

# Store with vector embedding
npx claude-flow memory store-vector "key" "value"
```

---

## Database Files & Locations

### Default Storage Locations

```
Claude-Flow Root/
├── .agentdb/
│   └── claude-flow.db          # AgentDB vectors & HNSW index
├── .swarm/
│   └── memory.db               # ReasoningBank patterns & embeddings
├── ./memory/
│   └── memory-store.json       # Fallback JSON store
└── node_modules/
    └── agentdb/
        ├── dist/
        │   ├── agentdb.min.js  # Browser bundle (60KB)
        │   └── mcp/
        │       └── agentdb-mcp-server.js
        └── bin/
            └── agentdb.js      # CLI binary
```

### Custom Locations

```javascript
// AgentDB path
const backend = new AgentDBBackend({
  dbPath: '/var/lib/myapp/vectors.db'
});

// ReasoningBank path
process.env.CLAUDE_FLOW_DB_PATH = '/var/lib/myapp/memory.db';

// JSON fallback
const manager = new SimpleMemoryManager();
manager.filePath = '/var/lib/myapp/memory.json';
```

---

## Performance Characteristics

### Search Performance (Benchmarked)

| Operation | Current | With AgentDB | Improvement |
|-----------|---------|--------------|-------------|
| Search (100 vectors) | 15ms | 100µs | 150x |
| Search (1M vectors) | 100s | 8ms | 12,500x |
| Batch insert (100) | 1s | 2ms | 500x |
| Memory usage | Baseline | 4-32x less | Up to 32x |

### Quantization Impact

| Method | Memory Savings | Search Speed | Quality Loss |
|--------|---------------|--------------|-------------|
| None | Baseline | Fastest | None |
| Product | 8-16x | -5% | <1% |
| Scalar | 4x | -2% | <0.5% |
| Binary | 32x | -10% | 1-2% |

### Index Types

| Index | Complexity | Speed | Memory | Use Case |
|-------|-----------|-------|--------|----------|
| HNSW | O(log n) | 150x faster | +20% | Recommended (default) |
| Flat | O(n) | Baseline | Baseline | Small datasets |

---

## Troubleshooting

### Issue: AgentDB Not Found

```
Error: Cannot find module 'agentdb'
```

**Solution**:
```bash
# Install AgentDB
npm install agentdb@1.3.9

# Verify installation
npm list agentdb
```

### Issue: Vector Dimension Mismatch

```
WARNING: Embedding dimension mismatch!
Database has: 1536 dimensions
Configured: 768 dimensions
```

**Solution**:
```bash
# Option 1: Match dimensions to database
export EMBEDDING_DIMENSIONS=1536

# Option 2: Delete database and start fresh
rm .swarm/memory.db

# Option 3: Run migration (if available)
npx claude-flow memory migrate
```

### Issue: Out of Memory

```
FATAL ERROR: CALL_AND_RETRY_LAST Allocation failed - JavaScript heap out of memory
```

**Solution**:
```javascript
// Enable maximum quantization
new AgentDBBackend({
  quantization: 'binary'  // 32x memory savings
});

// Or increase Node.js heap
node --max-old-space-size=8192 app.js
```

### Issue: Slow Searches

```
// Enable HNSW indexing (default already)
new AgentDBBackend({
  enableHNSW: true  // O(log n) search complexity
});

// Tune HNSW parameters
new AgentDBBackend({
  hnswConfig: {
    M: 32,              // Higher = better search, more memory
    efConstruction: 400, // Higher = better index, slower build
    efSearch: 100       // Higher = better search, slower query
  }
});
```

### Issue: Embedding API Failures

```
Error: Failed to generate embedding: 401 Unauthorized
```

**Solution**:
```bash
# Check API key
echo $OPENAI_API_KEY

# Use fallback mode
export EMBEDDING_STRICT_MODE=false

# Use alternative provider
export OPENAI_BASE_URL=https://router.requesty.ai/v1
export OPENAI_API_KEY=your-key
```

---

## Features Comparison

| Feature | JSON | SQLite | AgentDB |
|---------|------|--------|---------|
| **Key-Value Storage** | ✅ | ✅ | ✅ |
| **Namespaces** | ✅ | ✅ | ✅ |
| **TTL Expiration** | ✅ | ✅ | ✅ |
| **Pattern Search** | ✅ | ✅ | ✅ |
| **Vector Search** | ❌ | ❌ | ✅ |
| **HNSW Indexing** | ❌ | ❌ | ✅ |
| **Quantization** | ❌ | ❌ | ✅ |
| **Semantic Search** | ❌ | ✅ | ✅ |
| **RL Algorithms** | ❌ | ❌ | ✅ |
| **Reflexion Memory** | ❌ | ❌ | ✅ |
| **Skill Library** | ❌ | ❌ | ✅ |

---

## Best Practices

### 1. Always Use Hybrid Mode

```javascript
// Recommended: fallback on failure
new AgentDBMemoryAdapter({ mode: 'hybrid' })

// Not recommended: fail if AgentDB unavailable
new AgentDBMemoryAdapter({ mode: 'agentdb' })
```

### 2. Enable Quantization for Large Datasets

```javascript
// For >100K vectors, enable quantization
new AgentDBBackend({
  quantization: 'scalar'  // 4x memory savings
  // or
  quantization: 'binary'  // 32x savings (with 1-2% quality loss)
})
```

### 3. Tune HNSW for Your Data Size

```javascript
// For small datasets (< 10K vectors)
hnswConfig: { M: 8, efConstruction: 100, efSearch: 20 }

// For medium datasets (10K - 100K)
hnswConfig: { M: 16, efConstruction: 200, efSearch: 50 } // Default

// For large datasets (> 100K)
hnswConfig: { M: 32, efConstruction: 400, efSearch: 100 }
```

### 4. Monitor Database Size

```javascript
const stats = await backend.getStats();
console.log(`Vectors stored: ${stats.vectorCount}`);
console.log(`Index type: ${stats.indexType}`);
console.log(`Quantization: ${stats.quantization}`);
```

### 5. Regular Backups

```bash
# Backup AgentDB vectors
cp .agentdb/claude-flow.db .agentdb/claude-flow.db.backup

# Backup ReasoningBank
cp .swarm/memory.db .swarm/memory.db.backup
```

---

## References

- **AgentDB Documentation**: https://agentdb.ruv.io
- **GitHub Package**: https://github.com/ruvnet/agentic-flow/tree/main/packages/agentdb
- **npm Package**: https://www.npmjs.com/package/agentdb
- **Browser Bundle**: https://unpkg.com/agentdb@1.3.9/dist/agentdb.min.js (60KB)

---

## Quick Summary

| Aspect | Details |
|--------|---------|
| **Package Name** | `agentdb` |
| **Latest Version** | 1.3.9 |
| **Installation** | `npm install agentdb@1.3.9` |
| **Default Path** | `.agentdb/claude-flow.db` |
| **Backward Compat** | 100% (optional peer dependency) |
| **Performance** | 150x-12,500x faster than baseline |
| **Default Mode** | Hybrid (AgentDB + fallback) |
| **Storage Backend** | better-sqlite3 (native), sql.js (browser) |
| **Embedding Service** | OpenAI (configurable) |
| **CLI Command** | `npx claude-flow memory agentdb-info` |
