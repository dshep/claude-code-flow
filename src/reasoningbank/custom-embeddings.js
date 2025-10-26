/**
 * Custom embedding provider with configurable endpoint
 * Supports OpenAI-compatible APIs like Requesty.ai
 */

const embeddingCache = new Map();
const CACHE_TTL = 3600000; // 1 hour

/**
 * Compute embedding using custom endpoint
 * @param {string} text - Text to embed
 * @param {Object} config - Configuration
 * @returns {Promise<Float32Array>}
 */
export async function computeCustomEmbedding(text, config = {}) {
  const apiKey = config.apiKey || process.env.OPENAI_API_KEY || process.env.REQUESTY_API_KEY;
  const baseUrl = config.baseUrl || process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1';

  // Detect if using Requesty.ai and adjust model format
  const isRequesty = baseUrl.includes('requesty.ai');
  const baseModel = config.model || 'text-embedding-3-small';
  const model = isRequesty && !baseModel.includes('/') ? `openai/${baseModel}` : baseModel;

  const dimensions = config.dimensions || 1536;
  
  // Check cache
  const cacheKey = `${baseUrl}:${model}:${text}`;
  const cached = embeddingCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.embedding;
  }
  
  if (!apiKey) {
    console.warn('[WARN] No API key set, falling back to hash embeddings');
    return hashEmbed(text, dimensions);
  }
  
  try {
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
    console.error('[ERROR] Embedding request failed:', error.message);
    console.warn('[WARN] Falling back to hash embeddings');
    return hashEmbed(text, dimensions);
  }
}

/**
 * Deterministic hash-based embedding fallback
 */
function hashEmbed(text, dims) {
  const hash = simpleHash(text);
  const vec = new Float32Array(dims);
  
  for (let i = 0; i < dims; i++) {
    vec[i] = Math.sin(hash * (i + 1) * 0.01) * 0.1 + Math.cos(hash * i * 0.02) * 0.05;
  }
  
  return vec;
}

function simpleHash(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return hash;
}

/**
 * Clear embedding cache
 */
export function clearEmbeddingCache() {
  embeddingCache.clear();
}
