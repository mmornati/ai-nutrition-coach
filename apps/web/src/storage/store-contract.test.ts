// The store contract suite against every implementation: the real encrypted store (sqlite3mc,
// through the worker protocol, on an in-memory file system) and the in-memory reference. The same
// suite runs against the real OPFS store in a browser in e2e/storage.spec.ts.
import { describe, it } from 'vitest';
import { createMemorySubject, createRealSubject } from './testing/stacks';
import { storeContractCases, type ContractSubject } from './testing/store-contract';

const subjects: readonly (readonly [string, () => Promise<ContractSubject>])[] = [
  ['real encrypted store (sqlite3mc)', createRealSubject],
  ['in-memory reference', createMemorySubject],
];

for (const [name, create] of subjects) {
  describe(`store contract: ${name}`, () => {
    for (const contractCase of storeContractCases) {
      it(contractCase.name, async () => {
        const subject = await create();
        try {
          await contractCase.run(subject);
        } finally {
          await subject.dispose();
        }
      });
    }
  });
}
