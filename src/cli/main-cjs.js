#!/usr/bin/env node
/**
 * Claude-Flow CLI - CommonJS entry point for pkg compatibility
 */

// Load the ESM module using dynamic import
async function main() {
  try {
    const { default: runCli } = await import('./index.js');
    await runCli();
  } catch (error) {
    console.error('Failed to start Claude-Flow:', error.message);
    process.exit(1);
  }
}

main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});