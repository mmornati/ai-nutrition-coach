import '@testing-library/jest-dom/vitest';
import * as matchers from 'vitest-axe/matchers';
import { afterEach, expect } from 'vitest';
import { cleanup } from '@testing-library/react';

expect.extend(matchers);
afterEach(cleanup);

// jsdom has no canvas; axe's icon-ligature probe calls getContext. Return null quietly.
HTMLCanvasElement.prototype.getContext = (() =>
  null) as typeof HTMLCanvasElement.prototype.getContext;
