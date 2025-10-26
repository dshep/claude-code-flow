# ReasoningBank Embedding Configuration

Custom embedding provider with support for OpenAI-compatible APIs like Requesty.ai.

## Environment Variables

| Variable | Description | Default | Example |
|----------|-------------|---------|---------|
| **Endpoint Configuration** | | | |
| `OPENAI_BASE_URL` | Custom OpenAI-compatible endpoint | `https://api.openai.com/v1` | `https://router.requesty.ai/v1` |
| `REQUESTY_BASE_URL` | Requesty.ai endpoint (alternative) | - | `https://router.requesty.ai/v1` |
| **Authentication** | | | |
| `OPENAI_API_KEY` | OpenAI or compatible API key | - | `sk-proj-...` |
| `REQUESTY_API_KEY` | Requesty.ai API key (alternative) | - | `sk-uXnF...` |
| **Model Configuration** | | | |
| `EMBEDDING_MODEL` | Embedding model name | `text-embedding-3-small` | `text-embedding-3-large` |
| `EMBEDDING_DIMENSIONS` | Embedding vector dimensions | `1536` | `3072`, `768` |
| `EMBEDDING_PROVIDER_PREFIX` | Provider prefix for model name | Auto-detected | `openai/`, `custom/` |
| **Behavior** | | | |
| `EMBEDDING_STRICT_MODE` | Fail instead of fallback to hash | `true` (fails by default) | `false` (to enable fallback) |

## Supported Dimensions

Common embedding dimensions by model:
- `384` - Small models (BERT, etc.)
- `768` - Base transformer models
- `1024` - Legacy OpenAI models
- `1536` - OpenAI text-embedding-3-small (default)
- `3072` - OpenAI text-embedding-3-large

## API Providers

### OpenAI (Default)
```bash
export OPENAI_API_KEY=sk-proj-...
# Uses https://api.openai.com/v1/embeddings
```

### Requesty.ai Router
```bash
export OPENAI_BASE_URL=https://router.requesty.ai/v1
export OPENAI_API_KEY=sk-uXnF...
export EMBEDDING_MODEL=text-embedding-3-small
```

**Note**: Requesty.ai requires model format as `provider/model` (e.g., `openai/text-embedding-3-small`). This is auto-detected and formatted.

### Other OpenAI-Compatible APIs
```bash
export OPENAI_BASE_URL=https://your-api.com/v1
export OPENAI_API_KEY=your-key
export EMBEDDING_PROVIDER_PREFIX=yourprovider/  # If needed
```

## Configuration File

Alternatively, configure via `.swarm/reasoningbank.yaml`:

```yaml
reasoningbank:
  embeddings:
    provider: openai  # Use OpenAI-compatible API
    model: text-embedding-3-small
    dimensions: 1536
    cache_ttl_seconds: 3600
```

## Usage

### Store with Semantic Search
```bash
# Export environment variables first
export OPENAI_BASE_URL=https://router.requesty.ai/v1
export OPENAI_API_KEY=sk-uXnF...

# Store memories (embeddings generated automatically)
npx claude-flow memory store "ai/concepts" "Machine learning with neural networks"
npx claude-flow memory store "recipes/dessert" "Chocolate cake with vanilla frosting"

# Semantic search finds similar content
npx claude-flow memory query "deep learning" --namespace default
# Returns: ai/concepts (high score)

npx claude-flow memory query "baking" --namespace default  
# Returns: recipes/dessert (high score)
```

### Check Embedding Stats
```javascript
import { getEmbeddingStats } from './custom-embeddings.js';

const stats = getEmbeddingStats();
console.log(stats);
// {
//   apiCalls: 10,
//   cacheHits: 5,
//   fallbacks: 0,
//   errors: 0,
//   cacheSize: 15,
//   hitRate: '33.33%'
// }
```

## Dimension Mismatch Warning

If you change `EMBEDDING_DIMENSIONS` after storing embeddings, you'll see:

```
[WARN] ⚠️  Embedding dimension mismatch!
[WARN]   Database has: 1024 dimensions
[WARN]   Configured:   1536 dimensions
[WARN] This will cause search failures. Options:
[WARN]   1. Set EMBEDDING_DIMENSIONS=1024 to match database
[WARN]   2. Delete .swarm/memory.db to start fresh
[WARN]   3. Run migration to re-embed all entries
```

## Strict Mode (Default Behavior)

**Default**: Strict mode is **enabled by default** - API failures throw errors instead of falling back to hash embeddings.

```bash
# Default behavior (strict mode ON):
npx claude-flow memory store "test" "value"
# Error: Embedding request failed: API error 402: Insufficient balance

# Disable strict mode to allow fallback to hash embeddings:
export EMBEDDING_STRICT_MODE=false

npx claude-flow memory store "test" "value"
# [WARN] Falling back to hash embeddings
# ✅ Stored successfully (using hash-based embeddings)
```

**Rationale**: Failing fast ensures you know when semantic search isn't working properly, rather than silently using inferior hash-based embeddings.

## Features

- ✅ **Configurable endpoints** - Use any OpenAI-compatible API
- ✅ **Auto-detection** - Requesty.ai model format handled automatically
- ✅ **LRU caching** - 1-hour TTL, max 100 entries
- ✅ **Graceful fallback** - Hash-based embeddings if API fails
- ✅ **Metrics tracking** - API calls, cache hits, errors
- ✅ **Dimension validation** - Warns about mismatches
- ✅ **Strict mode** - Optional fail-fast behavior

## Troubleshooting

### API Error 402: Insufficient Balance
Top up your Requesty.ai account at https://app.requesty.ai/settings

### Dimension Mismatch Errors
Delete `.swarm/memory.db` or set `EMBEDDING_DIMENSIONS` to match existing database.

### Falling Back to Hash Embeddings
Check that API key is set and endpoint is reachable:
```bash
curl -H "Authorization: Bearer $OPENAI_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"model":"openai/text-embedding-3-small","input":"test"}' \
  $OPENAI_BASE_URL/embeddings
```
