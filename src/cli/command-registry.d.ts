export interface CommandOptions {
  description: string;
  usage?: string;
  flags?: Record<string, any>;
}

export function registerCommand(name: string, handler: Function, options?: CommandOptions): void;
export function executeCommand(name: string, args: string[]): Promise<any>;
export function hasCommand(name: string): boolean;
export function showCommandHelp(name: string): void;
export function showAllCommands(): void;
export function listCommands(): string[];