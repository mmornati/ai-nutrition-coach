import type { AiRungConfig } from '../value-types/ai-rung-config';

/** Where the BYOK key lives (secure storage in the web app). The core never logs it. */
export interface ByokKeyStorePort {
  read(): Promise<string | null>;
  write(key: string): Promise<void>;
  clear(): Promise<void>;
  hasKey(): Promise<boolean>;
}

export interface AiRungConfigStorePort {
  read(): Promise<AiRungConfig>;
  write(config: AiRungConfig): Promise<void>;
}
