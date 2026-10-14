import '@testing-library/jest-dom/vitest';
import * as matchers from 'vitest-axe/matchers';
import { afterEach, expect } from 'vitest';
import { cleanup } from '@testing-library/react';

expect.extend(matchers);
afterEach(cleanup);

// jsdom has no canvas; axe's icon-ligature probe calls getContext. Return null quietly.
HTMLCanvasElement.prototype.getContext = (() =>
  null) as typeof HTMLCanvasElement.prototype.getContext;

/*
 * jsdom has an HTMLDialogElement with `open`, but no showModal/show/close. This is a minimal
 * stand-in for the behaviour the app relies on: open state, initial focus (an [autofocus]-like
 * element or the first focusable), focus return on close, an async `close` event, and Esc firing
 * a cancelable `cancel` event that closes the dialog unless prevented. It does not model inertness.
 */
(() => {
  const FOCUSABLE =
    'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
  const modals: HTMLDialogElement[] = [];
  const opener = new WeakMap<HTMLDialogElement, Element | null>();
  const proto = HTMLDialogElement.prototype;

  proto.showModal = function showModal(this: HTMLDialogElement) {
    if (this.open) throw new DOMException('Already open', 'InvalidStateError');
    this.setAttribute('open', '');
    modals.push(this);
    opener.set(this, document.activeElement);
    const target =
      this.querySelector<HTMLElement>('[autofocus]') ?? this.querySelector<HTMLElement>(FOCUSABLE);
    target?.focus();
  };

  proto.show = function show(this: HTMLDialogElement) {
    this.setAttribute('open', '');
  };

  proto.close = function close(this: HTMLDialogElement, returnValue?: string) {
    if (!this.open) return;
    this.removeAttribute('open');
    if (returnValue !== undefined) this.returnValue = returnValue;
    const index = modals.indexOf(this);
    if (index >= 0) modals.splice(index, 1);
    const previous = opener.get(this);
    if (previous instanceof HTMLElement && previous.isConnected) previous.focus();
    queueMicrotask(() => this.dispatchEvent(new Event('close')));
  };

  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    const top = modals[modals.length - 1];
    if (!top) return;
    const cancel = new Event('cancel', { cancelable: true });
    top.dispatchEvent(cancel);
    if (!cancel.defaultPrevented) top.close();
  });
})();
