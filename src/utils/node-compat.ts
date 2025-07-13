/**
 * Node.js compatibility layer for Deno APIs
 */

import * as fs from 'fs';
import * as fsPromises from 'fs/promises';
import * as path from 'path';
import * as process from 'process';
import * as os from 'os';
import { execSync, spawn } from 'child_process';
import { promisify } from 'util';

// File system operations
export const mkdir = fsPromises.mkdir;
export const remove = fsPromises.rm;
export const readFile = fsPromises.readFile;
export const writeFile = fsPromises.writeFile;
export const readTextFile = (path: string) => fsPromises.readFile(path, 'utf8');
export const writeTextFile = (path: string, content: string) => fsPromises.writeFile(path, content, 'utf8');
export const copyFile = fsPromises.copyFile;
export const chmod = fsPromises.chmod;
export const stat = fsPromises.stat;
export const readDir = async (path: string) => {
  const entries = await fsPromises.readdir(path, { withFileTypes: true });
  return entries.map(entry => ({
    name: entry.name,
    isFile: entry.isFile(),
    isDirectory: entry.isDirectory(),
    isSymlink: entry.isSymbolicLink()
  }));
};

// Process operations
export const pid = process.pid;
export const args = process.argv.slice(2);
export const env = {
  get: (key: string) => process.env[key],
  set: (key: string, value: string) => { process.env[key] = value; },
  toObject: () => ({ ...process.env })
};

// Memory operations
export const memoryUsage = () => ({
  rss: process.memoryUsage().rss,
  heapTotal: process.memoryUsage().heapTotal,
  heapUsed: process.memoryUsage().heapUsed,
  external: process.memoryUsage().external
});

// Signal handling
export const addSignalListener = (signal: NodeJS.Signals, handler: () => void) => {
  process.on(signal, handler);
};

// Kill process
export const kill = (pid: number, signal?: NodeJS.Signals) => {
  try {
    process.kill(pid, signal);
  } catch (error) {
    throw error;
  }
};

// Command execution
export class Command {
  private command: string;
  private options: any;

  constructor(command: string, options?: any) {
    this.command = command;
    this.options = options || {};
  }

  async output(): Promise<{ code: number; stdout: Uint8Array; stderr: Uint8Array }> {
    return new Promise((resolve, reject) => {
      const child = spawn(this.command, this.options.args || [], {
        env: this.options.env,
        cwd: this.options.cwd,
        stdio: this.options.stdin ? ['pipe', 'pipe', 'pipe'] : ['inherit', 'pipe', 'pipe']
      });

      const stdout: Buffer[] = [];
      const stderr: Buffer[] = [];

      if (child.stdout) {
        child.stdout.on('data', (data) => stdout.push(data));
      }
      if (child.stderr) {
        child.stderr.on('data', (data) => stderr.push(data));
      }

      if (this.options.stdin && child.stdin) {
        child.stdin.write(this.options.stdin);
        child.stdin.end();
      }

      child.on('close', (code) => {
        resolve({
          code: code || 0,
          stdout: new Uint8Array(Buffer.concat(stdout)),
          stderr: new Uint8Array(Buffer.concat(stderr))
        });
      });

      child.on('error', reject);
    });
  }

  outputSync(): { code: number; stdout: Uint8Array; stderr: Uint8Array } {
    try {
      const result = execSync(
        `${this.command} ${(this.options.args || []).join(' ')}`,
        {
          env: this.options.env,
          cwd: this.options.cwd,
          input: this.options.stdin,
          stdio: 'pipe'
        }
      );
      return {
        code: 0,
        stdout: new Uint8Array(result),
        stderr: new Uint8Array()
      };
    } catch (error: any) {
      return {
        code: error.status || 1,
        stdout: new Uint8Array(error.stdout || Buffer.from('')),
        stderr: new Uint8Array(error.stderr || Buffer.from(''))
      };
    }
  }
}

// Stdin operations
export const stdin = {
  read: (buffer: Uint8Array): Promise<number | null> => {
    return new Promise((resolve) => {
      process.stdin.once('data', (data) => {
        const bytes = Math.min(data.length, buffer.length);
        for (let i = 0; i < bytes; i++) {
          buffer[i] = data[i];
        }
        resolve(bytes);
      });
      process.stdin.once('end', () => resolve(null));
    });
  }
};

// Stdout operations
export const stdout = {
  write: (data: Uint8Array): Promise<number> => {
    return new Promise((resolve) => {
      process.stdout.write(data, () => {
        resolve(data.length);
      });
    });
  }
};

// Error types
export const errors = {
  AlreadyExists: class AlreadyExists extends Error {
    constructor(message?: string) {
      super(message);
      this.name = 'AlreadyExists';
    }
  },
  NotFound: class NotFound extends Error {
    constructor(message?: string) {
      super(message);
      this.name = 'NotFound';
    }
  }
};

// Helper to check process execution
export const execPath = () => process.execPath;

export default {
  mkdir,
  remove,
  readFile,
  writeFile,
  readTextFile,
  writeTextFile,
  copyFile,
  chmod,
  stat,
  readDir,
  pid,
  args,
  env,
  memoryUsage,
  addSignalListener,
  kill,
  Command,
  stdin,
  stdout,
  errors,
  execPath
};