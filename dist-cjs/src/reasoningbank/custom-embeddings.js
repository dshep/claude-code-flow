const embeddingCache = new Map();
const CACHE_TTL = 3600000;
let metrics = {
    apiCalls: 0,
    cacheHits: 0,
    fallbacks: 0,
    errors: 0
};
export async function computeCustomEmbedding(text, config = {}) {
    const apiKey = config.apiKey || process.env.OPENAI_API_KEY || process.env.REQUESTY_API_KEY;
    const baseUrl = config.baseUrl || process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1';
    const strictMode = config.strictMode !== undefined ? config.strictMode : process.env.EMBEDDING_STRICT_MODE !== 'false';
    const providerPrefix = config.providerPrefix || process.env.EMBEDDING_PROVIDER_PREFIX;
    const needsPrefix = baseUrl.includes('requesty.ai') || providerPrefix;
    const baseModel = config.model || 'text-embedding-3-small';
    const model = needsPrefix && !baseModel.includes('/') ? `${providerPrefix || 'openai/'}${baseModel}` : baseModel;
    const dimensions = config.dimensions || 1536;
    if (dimensions && ![
        384,
        768,
        1024,
        1536,
        3072
    ].includes(dimensions)) {
        console.warn(`[WARN] Unusual embedding dimension: ${dimensions}. Common values: 384, 768, 1024, 1536, 3072`);
    }
    const textHash = simpleHash(text);
    const cacheKey = `${baseUrl}:${model}:${textHash}`;
    const cached = embeddingCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
        metrics.cacheHits++;
        return cached.embedding;
    }
    if (!apiKey) {
        const errorMsg = 'No API key set (OPENAI_API_KEY or REQUESTY_API_KEY required)';
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
        if (embedding.length !== dimensions) {
            console.warn(`[WARN] Dimension mismatch: Expected ${dimensions}, got ${embedding.length}`);
        }
        embeddingCache.set(cacheKey, {
            embedding,
            timestamp: Date.now()
        });
        if (embeddingCache.size > 100) {
            const entries = Array.from(embeddingCache.entries());
            entries.sort((a, b)=>a[1].timestamp - b[1].timestamp);
            entries.slice(0, 50).forEach(([key])=>embeddingCache.delete(key));
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
function hashEmbed(text, dims) {
    const hash = simpleHash(text);
    const vec = new Float32Array(dims);
    for(let i = 0; i < dims; i++){
        vec[i] = Math.sin(hash * (i + 1) * 0.01) * 0.1 + Math.cos(hash * i * 0.02) * 0.05;
    }
    return vec;
}
function simpleHash(str) {
    let hash = 0;
    for(let i = 0; i < str.length; i++){
        const char = str.charCodeAt(i);
        hash = (hash << 5) - hash + char;
        hash = hash & hash;
    }
    return hash;
}
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
export function resetEmbeddingMetrics() {
    metrics = {
        apiCalls: 0,
        cacheHits: 0,
        fallbacks: 0,
        errors: 0
    };
}
export function clearEmbeddingCache() {
    embeddingCache.clear();
}

//# sourceMappingURL=custom-embeddings.js.map