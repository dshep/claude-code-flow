export class ClaudeCodeWebServer {
  constructor(port?: number);
  start(): Promise<void>;
  stop(): Promise<void>;
}

export function startWebServer(options?: any): Promise<void>;
export default function webServerCommand(): any;