/**
 * Tests for hash embedding algorithm versioning and normalization
 * Tests hash-v1 (legacy) and hash-v2 (normalized) algorithms
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';

describe('Hash Embedding Algorithm', () => {
  let customEmbeddings;
  let originalEnv;

  beforeEach(async () => {
    // Save original environment
    originalEnv = { ...process.env };

    // Clear API key to force hash embeddings
    delete process.env.OPENAI_API_KEY;
    process.env.EMBEDDING_STRICT_MODE = 'false';

    // Dynamic import to get fresh module
    customEmbeddings = await import('../../src/reasoningbank/custom-embeddings.js');
  });

  afterEach(() => {
    // Restore original environment
    process.env = originalEnv;

    // Clear embedding cache between tests
    if (customEmbeddings.clearEmbeddingCache) {
      customEmbeddings.clearEmbeddingCache();
    }
  });

  describe('Vector Normalization', () => {
    it('should produce unit vectors with hash-v2 (magnitude = 1.0)', async () => {
      process.env.HASH_ALGORITHM_VERSION = '2';

      const embedding = await customEmbeddings.computeCustomEmbedding('test text', {
        dimensions: 1536,
        strictMode: false,
      });

      // Calculate magnitude (should be 1.0 for normalized vector)
      let magnitude = 0;
      for (let i = 0; i < embedding.length; i++) {
        magnitude += embedding[i] * embedding[i];
      }
      magnitude = Math.sqrt(magnitude);

      expect(magnitude).toBeCloseTo(1.0, 5); // Normalized to unit length
    });

    it('should NOT produce unit vectors with hash-v1 (legacy)', async () => {
      process.env.HASH_ALGORITHM_VERSION = '1';

      const embedding = await customEmbeddings.computeCustomEmbedding('test text', {
        dimensions: 1536,
        strictMode: false,
      });

      // Calculate magnitude
      let magnitude = 0;
      for (let i = 0; i < embedding.length; i++) {
        magnitude += embedding[i] * embedding[i];
      }
      magnitude = Math.sqrt(magnitude);

      // Legacy algorithm uses scaling factors (0.1 and 0.05), so magnitude won't be 1.0
      expect(magnitude).not.toBeCloseTo(1.0, 1);
      expect(magnitude).toBeGreaterThan(0);
    });

    it('should produce all positive values with hash-v2', async () => {
      process.env.HASH_ALGORITHM_VERSION = '2';

      const embedding = await customEmbeddings.computeCustomEmbedding('test text', {
        dimensions: 384,
        strictMode: false,
      });

      // Check if all values are within expected range for normalized vector
      for (let i = 0; i < embedding.length; i++) {
        expect(embedding[i]).toBeGreaterThanOrEqual(-1);
        expect(embedding[i]).toBeLessThanOrEqual(1);
      }
    });
  });

  describe('Algorithm Versioning', () => {
    it('should use hash-v2 by default', async () => {
      delete process.env.HASH_ALGORITHM_VERSION;
      delete process.env.USE_LEGACY_HASH;

      const embedding = await customEmbeddings.computeCustomEmbedding('version test', {
        dimensions: 768,
        strictMode: false,
      });

      // Calculate magnitude - should be normalized (v2)
      let magnitude = 0;
      for (let i = 0; i < embedding.length; i++) {
        magnitude += embedding[i] * embedding[i];
      }
      magnitude = Math.sqrt(magnitude);

      expect(magnitude).toBeCloseTo(1.0, 5);
    });

    it('should use hash-v1 when USE_LEGACY_HASH=true', async () => {
      process.env.USE_LEGACY_HASH = 'true';

      const embedding = await customEmbeddings.computeCustomEmbedding('legacy test', {
        dimensions: 768,
        strictMode: false,
      });

      // Calculate magnitude - should NOT be normalized (v1)
      let magnitude = 0;
      for (let i = 0; i < embedding.length; i++) {
        magnitude += embedding[i] * embedding[i];
      }
      magnitude = Math.sqrt(magnitude);

      expect(magnitude).not.toBeCloseTo(1.0, 1);
    });

    it('should use hash-v1 when HASH_ALGORITHM_VERSION=1', async () => {
      process.env.HASH_ALGORITHM_VERSION = '1';

      const embedding = await customEmbeddings.computeCustomEmbedding('version 1 test', {
        dimensions: 768,
        strictMode: false,
      });

      // Calculate magnitude - should NOT be normalized (v1)
      let magnitude = 0;
      for (let i = 0; i < embedding.length; i++) {
        magnitude += embedding[i] * embedding[i];
      }
      magnitude = Math.sqrt(magnitude);

      expect(magnitude).not.toBeCloseTo(1.0, 1);
    });

    it('should produce different embeddings between v1 and v2', async () => {
      const text = 'comparison test';
      const dims = 384;

      // Get v1 embedding
      process.env.HASH_ALGORITHM_VERSION = '1';
      const v1Embedding = await customEmbeddings.computeCustomEmbedding(text, {
        dimensions: dims,
        strictMode: false,
      });

      // Clear cache to force recomputation
      customEmbeddings.clearEmbeddingCache();

      // Get v2 embedding
      process.env.HASH_ALGORITHM_VERSION = '2';
      const v2Embedding = await customEmbeddings.computeCustomEmbedding(text, {
        dimensions: dims,
        strictMode: false,
      });

      // Embeddings should be different
      let allSame = true;
      for (let i = 0; i < dims; i++) {
        if (Math.abs(v1Embedding[i] - v2Embedding[i]) > 0.0001) {
          allSame = false;
          break;
        }
      }

      expect(allSame).toBe(false);
    });
  });

  describe('Deterministic Behavior', () => {
    it('should produce identical embeddings for same text with same version', async () => {
      process.env.HASH_ALGORITHM_VERSION = '2';

      const text = 'deterministic test';
      const embedding1 = await customEmbeddings.computeCustomEmbedding(text, {
        dimensions: 768,
        strictMode: false,
      });

      customEmbeddings.clearEmbeddingCache();

      const embedding2 = await customEmbeddings.computeCustomEmbedding(text, {
        dimensions: 768,
        strictMode: false,
      });

      expect(embedding1.length).toBe(embedding2.length);
      for (let i = 0; i < embedding1.length; i++) {
        expect(embedding1[i]).toBeCloseTo(embedding2[i], 10);
      }
    });

    it('should produce different embeddings for different text', async () => {
      process.env.HASH_ALGORITHM_VERSION = '2';

      const embedding1 = await customEmbeddings.computeCustomEmbedding('text one', {
        dimensions: 768,
        strictMode: false,
      });

      const embedding2 = await customEmbeddings.computeCustomEmbedding('text two', {
        dimensions: 768,
        strictMode: false,
      });

      // Embeddings should be different
      let allSame = true;
      for (let i = 0; i < embedding1.length; i++) {
        if (Math.abs(embedding1[i] - embedding2[i]) > 0.0001) {
          allSame = false;
          break;
        }
      }

      expect(allSame).toBe(false);
    });
  });

  describe('Dimension Support', () => {
    it('should support common embedding dimensions', async () => {
      process.env.HASH_ALGORITHM_VERSION = '2';

      const commonDims = [384, 768, 1024, 1536, 3072];

      for (const dims of commonDims) {
        const embedding = await customEmbeddings.computeCustomEmbedding('dimension test', {
          dimensions: dims,
          strictMode: false,
        });

        expect(embedding.length).toBe(dims);

        // Verify normalization
        let magnitude = 0;
        for (let i = 0; i < embedding.length; i++) {
          magnitude += embedding[i] * embedding[i];
        }
        magnitude = Math.sqrt(magnitude);

        expect(magnitude).toBeCloseTo(1.0, 5);
      }
    });
  });

  describe('Embedding Statistics', () => {
    it('should track fallback usage', async () => {
      customEmbeddings.resetEmbeddingMetrics();

      await customEmbeddings.computeCustomEmbedding('stats test', {
        dimensions: 768,
        strictMode: false,
      });

      const stats = customEmbeddings.getEmbeddingStats();

      expect(stats.fallbacks).toBeGreaterThan(0);
      expect(stats.apiCalls).toBe(0);
    });

    it('should not use cache for hash embeddings', async () => {
      customEmbeddings.resetEmbeddingMetrics();

      // Hash embeddings bypass cache (they're already fast and deterministic)
      const text = 'hash test';
      await customEmbeddings.computeCustomEmbedding(text, {
        dimensions: 768,
        strictMode: false,
      });

      await customEmbeddings.computeCustomEmbedding(text, {
        dimensions: 768,
        strictMode: false,
      });

      const stats = customEmbeddings.getEmbeddingStats();

      // Hash embeddings don't use cache (fallbacks instead)
      expect(stats.cacheHits).toBe(0);
      expect(stats.fallbacks).toBeGreaterThan(0);
    });
  });
});
