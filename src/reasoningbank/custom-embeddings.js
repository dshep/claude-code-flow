/**
 * Custom embedding provider with configurable endpoint
 * Supports any OpenAI-compatible API: OpenAI, OpenRouter, Requesty.ai, Together.ai, local models, etc.
 */

const embeddingCache = new Map();
const CACHE_TTL = 3600000; // 1 hour

// Metrics tracking
let metrics = {
  apiCalls: 0,
  cacheHits: 0,
  fallbacks: 0,
  errors: 0
};

/**
 * @typedef {Object} EmbeddingConfig
 * @property {string} [apiKey] - API key (falls back to env vars if not provided)
 * @property {string} [baseUrl] - Base URL for API endpoint (defaults to OpenAI)
 * @property {string} [model] - Model name (defaults to text-embedding-3-small)
 * @property {number} [dimensions] - Embedding dimensions (defaults to 1536)
 * @property {boolean} [strictMode] - Fail instead of fallback to hash embeddings (defaults to true)
 * @property {string} [providerPrefix] - Provider prefix for model name (e.g., "openai/")
 */

/**
 * Compute embedding using custom endpoint
 * @param {string} text - Text to embed
 * @param {EmbeddingConfig} config - Configuration
 * @returns {Promise<Float32Array>} Embedding vector
 * @throws {Error} If strictMode is true and API call fails
 */
export async function computeCustomEmbedding(text, config = {}) {
  const apiKey = config.apiKey || process.env.OPENAI_API_KEY;
  const baseUrl = config.baseUrl || process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1';
  const strictMode = config.strictMode !== undefined
    ? config.strictMode
    : (process.env.EMBEDDING_STRICT_MODE !== 'false'); // Default to true

  // Auto-detect if provider prefix is needed (some routers require provider/model format)
  const providerPrefix = config.providerPrefix || process.env.EMBEDDING_PROVIDER_PREFIX;
  const needsPrefix = baseUrl.includes('requesty.ai') || baseUrl.includes('openrouter.ai') || providerPrefix;
  const baseModel = config.model || 'text-embedding-3-small';
  const model = (needsPrefix && !baseModel.includes('/'))
    ? `${providerPrefix || 'openai/'}${baseModel}`
    : baseModel;

  const dimensions = config.dimensions || 1536;

  // Validate dimensions are reasonable
  if (dimensions && ![384, 768, 1024, 1536, 3072].includes(dimensions)) {
    console.warn(`[WARN] Unusual embedding dimension: ${dimensions}. Common values: 384, 768, 1024, 1536, 3072`);
  }
  
  // Check cache (use hash of text to avoid memory issues with long strings)
  const textHash = simpleHash(text);
  const cacheKey = `${baseUrl}:${model}:${textHash}`;
  const cached = embeddingCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    metrics.cacheHits++;
    return cached.embedding;
  }

  if (!apiKey) {
    const errorMsg = 'No API key set (OPENAI_API_KEY required)';
    if (strictMode) {
      throw new Error(errorMsg);
    }
    console.warn(`[WARN] ${errorMsg}, falling back to hash embeddings`);
    metrics.fallbacks++;
    return hashEmbed(text, dimensions);
  }
  
  try {
    metrics.apiCalls++;

    const response = await fetch(`${baseUrl}/embeddings`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model,
        input: text
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`API error ${response.status}: ${errorText}`);
    }

    const json = await response.json();
    const embedding = new Float32Array(json.data[0].embedding);

    // Validate returned dimensions match expected
    if (embedding.length !== dimensions) {
      console.warn(`[WARN] Dimension mismatch: Expected ${dimensions}, got ${embedding.length}`);
    }

    // Cache result
    embeddingCache.set(cacheKey, {
      embedding,
      timestamp: Date.now()
    });

    // Cleanup old cache entries
    if (embeddingCache.size > 100) {
      const entries = Array.from(embeddingCache.entries());
      entries.sort((a, b) => a[1].timestamp - b[1].timestamp);
      entries.slice(0, 50).forEach(([key]) => embeddingCache.delete(key));
    }

    return embedding;

  } catch (error) {
    metrics.errors++;

    if (strictMode) {
      throw new Error(`Embedding request failed: ${error.message}`);
    }

    console.error('[ERROR] Embedding request failed:', error.message);
    console.warn('[WARN] Falling back to hash embeddings');
    metrics.fallbacks++;
    return hashEmbed(text, dimensions);
  }
}

/**
 * Normalize vector to unit length (magnitude = 1.0)
 * @param {Float32Array} vec - Vector to normalize
 * @returns {Float32Array} Normalized vector
 */
function normalize(vec) {
  let magnitude = 0;
  for (let i = 0; i < vec.length; i++) {
    magnitude += vec[i] * vec[i];
  }
  magnitude = Math.sqrt(magnitude);

  // Handle zero vector safely
  if (magnitude === 0) {
    console.warn('[WARN] Cannot normalize zero vector, returning as-is');
    return vec;
  }

  // Create normalized copy
  const normalized = new Float32Array(vec.length);
  for (let i = 0; i < vec.length; i++) {
    normalized[i] = vec[i] / magnitude;
  }

  return normalized;
}

/**
 * Deterministic hash-based embedding fallback with versioning
 *
 * Version 1 (legacy):
 * - Uses raw sin/cos without normalization
 * - Can produce negative hash values
 * - Scaled by 0.1 and 0.05
 *
 * Version 2 (current, agentic-flow compatible):
 * - Normalizes vectors to unit length
 * - Uses Math.abs() for positive hash
 * - Full scale sin/cos (no scaling factors)
 *
 * Environment Variables:
 * - HASH_ALGORITHM_VERSION: "1" or "2" (default: "2")
 * - USE_LEGACY_HASH: "true" to force version 1
 *
 * @param {string} text - Text to hash embed
 * @param {number} dims - Vector dimensions
 * @returns {Float32Array} Hash embedding
 */
function hashEmbed(text, dims) {
  const version = parseInt(process.env.HASH_ALGORITHM_VERSION || '2');
  const useLegacy = process.env.USE_LEGACY_HASH === 'true' || version === 1;

  if (useLegacy) {
    // Version 1: Legacy algorithm (backward compatibility)
    const hash = simpleHash(text);
    const vec = new Float32Array(dims);

    for (let i = 0; i < dims; i++) {
      vec[i] = Math.sin(hash * (i + 1) * 0.01) * 0.1 + Math.cos(hash * i * 0.02) * 0.05;
    }

    return vec; // Not normalized
  }

  // Version 2: Agentic-flow compatible (default)
  const hash = Math.abs(simpleHash(text)); // Ensure positive hash
  const vec = new Float32Array(dims);

  for (let i = 0; i < dims; i++) {
    // Full scale without reduction factors
    vec[i] = Math.sin(hash * (i + 1) * 0.01) + Math.cos(hash * i * 0.02);
  }

  return normalize(vec); // Normalized to unit length
}

function simpleHash(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash | 0; // Force 32-bit signed integer
  }
  return hash;
}

/**
 * Get embedding statistics and metrics
 * @returns {Object} Metrics object with API calls, cache hits, fallbacks, errors
 */
export function getEmbeddingStats() {
  return {
    apiCalls: metrics.apiCalls,
    cacheHits: metrics.cacheHits,
    fallbacks: metrics.fallbacks,
    errors: metrics.errors,
    cacheSize: embeddingCache.size,
    hitRate: metrics.apiCalls > 0 ? (metrics.cacheHits / (metrics.apiCalls + metrics.cacheHits) * 100).toFixed(2) + '%' : '0%'
  };
}

/**
 * Reset embedding metrics
 */
export function resetEmbeddingMetrics() {
  metrics = {
    apiCalls: 0,
    cacheHits: 0,
    fallbacks: 0,
    errors: 0
  };
}

/**
 * Clear embedding cache
 */
export function clearEmbeddingCache() {
  embeddingCache.clear();
}
