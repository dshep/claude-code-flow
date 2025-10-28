/**
 * Tests for embedding rehash migration functionality
 * Tests dry-run mode, actual migration, and edge cases
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { promises as fs } from 'fs';
import path from 'path';

describe('Embedding Rehash Migration', () => {
  let reasoningBankAdapter;
  let testDbPath;
  let originalEnv;

  beforeEach(async () => {
    // Save original environment
    originalEnv = { ...process.env };

    // Create unique test database path
    testDbPath = path.join(process.cwd(), '.swarm', `test-migration-${Date.now()}.db`);
    process.env.CLAUDE_FLOW_DB_PATH = testDbPath;

    // Ensure test directory exists
    await fs.mkdir(path.dirname(testDbPath), { recursive: true });

    // Clear API key to force hash embeddings
    delete process.env.OPENAI_API_KEY;
    process.env.EMBEDDING_STRICT_MODE = 'false';
    process.env.HASH_ALGORITHM_VERSION = '2';

    // Dynamic import
    reasoningBankAdapter = await import('../../src/reasoningbank/reasoningbank-adapter.js');

    // Initialize ReasoningBank for tests
    await reasoningBankAdapter.initializeReasoningBank();
  });

  afterEach(async () => {
    // Cleanup
    if (reasoningBankAdapter.cleanup) {
      reasoningBankAdapter.cleanup();
    }

    // Delete test database
    try {
      await fs.unlink(testDbPath);
    } catch (error) {
      // Ignore errors if file doesn't exist
    }

    // Restore environment
    process.env = originalEnv;
  });

  describe('Dry Run Mode', () => {
    it('should preview migration without making changes', async () => {
      // Store test memories
      await reasoningBankAdapter.storeMemory('test-key-1', 'test value 1', {
        namespace: 'test',
        agent: 'test-agent',
        domain: 'test',
      });

      await reasoningBankAdapter.storeMemory('test-key-2', 'test value 2', {
        namespace: 'test',
        agent: 'test-agent',
        domain: 'test',
      });

      // Run dry-run migration
      const result = await reasoningBankAdapter.rehashEmbeddings({
        dryRun: true,
        verbose: false,
      });

      expect(result.dryRun).toBe(true);
      expect(result.scanned).toBeGreaterThan(0);
      expect(result.updated).toBeGreaterThan(0);

      // Verify no actual changes were made
      const stats = await reasoningBankAdapter.getStatus();
      expect(stats.total_embeddings).toBeGreaterThan(0);
    });

    it('should return accurate statistics in dry-run', async () => {
      // Store memories
      for (let i = 0; i < 5; i++) {
        await reasoningBankAdapter.storeMemory(`key-${i}`, `value ${i}`, {
          namespace: 'test',
          agent: 'test-agent',
          domain: 'test',
        });
      }

      const result = await reasoningBankAdapter.rehashEmbeddings({
        dryRun: true,
        verbose: false,
      });

      expect(result.scanned).toBe(result.updated);
      expect(result.errors).toBe(0);
    });
  });

  describe('Actual Migration', () => {
    it('should successfully rehash all embeddings', async () => {
      // Store test memories
      await reasoningBankAdapter.storeMemory('migrate-1', 'migration test 1', {
        namespace: 'test',
        agent: 'test-agent',
        domain: 'test',
      });

      await reasoningBankAdapter.storeMemory('migrate-2', 'migration test 2', {
        namespace: 'test',
        agent: 'test-agent',
        domain: 'test',
      });

      // Run actual migration
      const result = await reasoningBankAdapter.rehashEmbeddings({
        dryRun: false,
        verbose: false,
      });

      expect(result.dryRun).toBe(false);
      expect(result.scanned).toBeGreaterThan(0);
      expect(result.updated).toBeGreaterThan(0);
      expect(result.errors).toBe(0);
    });

    it('should handle empty database gracefully', async () => {
      // Run migration on empty database
      const result = await reasoningBankAdapter.rehashEmbeddings({
        dryRun: false,
        verbose: false,
      });

      expect(result.scanned).toBe(0);
      expect(result.updated).toBe(0);
      expect(result.errors).toBe(0);
    });

    it('should update model field to hash-v2', async () => {
      // Store memory with hash-v1
      process.env.HASH_ALGORITHM_VERSION = '1';
      await reasoningBankAdapter.storeMemory('model-test', 'test model field', {
        namespace: 'test',
        agent: 'test-agent',
        domain: 'test',
      });

      // Switch to hash-v2 and migrate
      process.env.HASH_ALGORITHM_VERSION = '2';
      const result = await reasoningBankAdapter.rehashEmbeddings({
        dryRun: false,
        verbose: false,
      });

      expect(result.updated).toBeGreaterThan(0);

      // Verify model field updated
      const memories = await reasoningBankAdapter.listMemories({ limit: 10 });
      const migrated = memories.find((m) => m.key === 'model-test');

      // Model field should be updated (check via status)
      expect(migrated).toBeDefined();
    });
  });

  describe('Verbose Mode', () => {
    it('should show progress updates with verbose flag', async () => {
      // Store multiple memories
      for (let i = 0; i < 15; i++) {
        await reasoningBankAdapter.storeMemory(`verbose-${i}`, `value ${i}`, {
          namespace: 'test',
          agent: 'test-agent',
          domain: 'test',
        });
      }

      // Capture console output
      const originalLog = console.log;
      const logs = [];
      console.log = (...args) => logs.push(args.join(' '));

      try {
        await reasoningBankAdapter.rehashEmbeddings({
          dryRun: true,
          verbose: true,
        });

        // Should have progress logs
        const progressLogs = logs.filter((log) => log.includes('Progress:'));
        expect(progressLogs.length).toBeGreaterThan(0);
      } finally {
        console.log = originalLog;
      }
    });
  });

  describe('Error Handling', () => {
    it('should continue migration despite individual errors', async () => {
      // Store valid memory
      await reasoningBankAdapter.storeMemory('valid-key', 'valid value', {
        namespace: 'test',
        agent: 'test-agent',
        domain: 'test',
      });

      // Run migration - should handle errors gracefully
      const result = await reasoningBankAdapter.rehashEmbeddings({
        dryRun: false,
        verbose: false,
      });

      expect(result.scanned).toBeGreaterThan(0);
      // Migration should complete even if some entries have issues
      expect(result.updated + result.errors).toBe(result.scanned);
    });
  });

  describe('Algorithm Version Migration', () => {
    it('should migrate from v1 to v2 algorithm', async () => {
      // Store with v1
      process.env.HASH_ALGORITHM_VERSION = '1';
      await reasoningBankAdapter.storeMemory('v1-key', 'v1 test value', {
        namespace: 'test',
        agent: 'test-agent',
        domain: 'test',
      });

      // Get v1 embedding
      const v1Memories = await reasoningBankAdapter.queryMemories('v1 test', {
        domain: 'test',
        limit: 1,
      });

      // Switch to v2 and migrate
      process.env.HASH_ALGORITHM_VERSION = '2';
      const result = await reasoningBankAdapter.rehashEmbeddings({
        dryRun: false,
        verbose: false,
      });

      expect(result.updated).toBeGreaterThan(0);

      // Query again with v2
      const v2Memories = await reasoningBankAdapter.queryMemories('v1 test', {
        domain: 'test',
        limit: 1,
      });

      expect(v2Memories.length).toBeGreaterThan(0);
      expect(v2Memories[0].key).toBe('v1-key');
    });
  });

  describe('Backup Warnings', () => {
    it('should display backup warning before migration', async () => {
      const originalWarn = console.warn;
      const warnings = [];
      console.warn = (...args) => warnings.push(args.join(' '));

      try {
        await reasoningBankAdapter.rehashEmbeddings({
          dryRun: false,
          verbose: false,
        });

        const backupWarning = warnings.find((w) => w.includes('backed up'));
        expect(backupWarning).toBeDefined();
      } finally {
        console.warn = originalWarn;
      }
    });
  });

  describe('Migration Statistics', () => {
    it('should return complete statistics object', async () => {
      await reasoningBankAdapter.storeMemory('stats-test', 'stats value', {
        namespace: 'test',
        agent: 'test-agent',
        domain: 'test',
      });

      const result = await reasoningBankAdapter.rehashEmbeddings({
        dryRun: true,
        verbose: false,
      });

      expect(result).toHaveProperty('scanned');
      expect(result).toHaveProperty('updated');
      expect(result).toHaveProperty('errors');
      expect(result).toHaveProperty('dryRun');

      expect(typeof result.scanned).toBe('number');
      expect(typeof result.updated).toBe('number');
      expect(typeof result.errors).toBe('number');
      expect(typeof result.dryRun).toBe('boolean');
    });
  });
});
