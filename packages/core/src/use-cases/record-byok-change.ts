import type { AiRungConfig } from '../value-types/ai-rung-config';
import type { AiRungKind } from '../value-types/ai-rung-kind';
import type { AiRungConfigStorePort, ByokKeyStorePort } from './record-byok-change-ports';

export interface RecordByokChange {
  enterByok(input: {
    readonly apiKey: string;
    readonly previousKind: AiRungKind;
  }): Promise<AiRungConfig>;
  removeByok(): Promise<AiRungConfig>;
}

/** The single path to set or clear the BYOK key; returns the new rung config. */
export function createRecordByokChange(deps: {
  readonly keyStore: ByokKeyStorePort;
  readonly configStore: AiRungConfigStorePort;
}): RecordByokChange {
  return {
    async enterByok({ apiKey, previousKind }) {
      await deps.keyStore.write(apiKey);
      const config: AiRungConfig = { kind: 'byok', previousRung: { previousKind } };
      await deps.configStore.write(config);
      return config;
    },

    async removeByok() {
      const current = await deps.configStore.read();
      const previousKind = current.previousRung?.previousKind ?? 'noOp';
      await deps.keyStore.clear();
      const config: AiRungConfig = { kind: previousKind };
      await deps.configStore.write(config);
      return config;
    },
  };
}
