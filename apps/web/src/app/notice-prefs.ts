/**
 * Small per-person answers to quiet lines and the first-run welcome, kept in the ENCRYPTED key/value
 * table: whether the welcome was finished or set aside (synced, so a second device of the same
 * person does not replay it), the step this device was on (device only), whether the "add a few
 * details" line on Today was closed, and when the pace line was hidden. Read once when the session
 * is built, then synchronously readable (`snapshot`, a new object on every change) and observable.
 * An unreadable store reads as "nothing answered"; a write that fails changes nothing and throws.
 */
import { isStoredInstant } from '@anc/core';
import { KV_KEYS, type KeyValueStore } from '../storage/key-value-store';

export type WelcomeAnswer = 'done' | 'skipped';

export interface NoticeState {
  /** How the welcome ended; `null` when it has not (a stored answer is read at the unlock). */
  readonly welcome: WelcomeAnswer | null;
  /** The step (1 to 4) this device was on, or `null`. */
  readonly welcomeStep: number | null;
  readonly guideHintDismissed: boolean;
  /** When the pace line was hidden (epoch ms), or `null`. */
  readonly paceDismissedAt: number | null;
}

const EMPTY: NoticeState = {
  welcome: null,
  welcomeStep: null,
  guideHintDismissed: false,
  paceDismissedAt: null,
};

export class NoticePrefs {
  private state: NoticeState = EMPTY;
  private readonly listeners = new Set<() => void>();

  constructor(private readonly kv: KeyValueStore) {}

  /** Read the stored answers (call once when the session is built). Never throws. */
  async load(): Promise<void> {
    try {
      this.apply(await this.read());
    } catch {
      this.apply(EMPTY);
    }
  }

  /** Read again after a pulled copy; a failed read keeps what is shown. */
  async refresh(): Promise<void> {
    try {
      this.apply(await this.read());
    } catch {
      // Keep the current answers.
    }
  }

  private async read(): Promise<NoticeState> {
    const [welcome, step, hint, pace] = await Promise.all([
      this.kv.read(KV_KEYS.uiWelcome),
      this.kv.read(KV_KEYS.uiWelcomeStep),
      this.kv.read(KV_KEYS.uiGuideHintDismissed),
      this.kv.read(KV_KEYS.uiPaceNoticeDismissedAtUtc),
    ]);
    const stepNumber = step === null ? null : Number(step);
    return {
      welcome: welcome === 'done' || welcome === 'skipped' ? welcome : null,
      welcomeStep:
        stepNumber !== null && Number.isInteger(stepNumber) && stepNumber >= 1 && stepNumber <= 4
          ? stepNumber
          : null,
      guideHintDismissed: hint === 'on',
      paceDismissedAt: pace !== null && isStoredInstant(pace) ? Date.parse(pace) : null,
    };
  }

  snapshot = (): NoticeState => this.state;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  /** The welcome ended: remembered (and synced), and the resume step is dropped. */
  async finishWelcome(answer: WelcomeAnswer): Promise<void> {
    await this.kv.write(KV_KEYS.uiWelcome, answer);
    try {
      await this.kv.delete(KV_KEYS.uiWelcomeStep);
    } catch {
      // The answer is what counts; a stale step is ignored once it exists.
    }
    this.apply({ ...this.state, welcome: answer, welcomeStep: null });
  }

  /** Remember the step this device is on, so a reload or a lock resumes there. */
  async setWelcomeStep(step: number): Promise<void> {
    await this.kv.write(KV_KEYS.uiWelcomeStep, String(step));
    this.apply({ ...this.state, welcomeStep: step });
  }

  async dismissGuideHint(): Promise<void> {
    await this.kv.write(KV_KEYS.uiGuideHintDismissed, 'on');
    this.apply({ ...this.state, guideHintDismissed: true });
  }

  async dismissPaceNotice(at: number): Promise<void> {
    await this.kv.write(KV_KEYS.uiPaceNoticeDismissedAtUtc, new Date(at).toISOString());
    this.apply({ ...this.state, paceDismissedAt: at });
  }

  private apply(next: NoticeState): void {
    const s = this.state;
    if (
      s.welcome === next.welcome &&
      s.welcomeStep === next.welcomeStep &&
      s.guideHintDismissed === next.guideHintDismissed &&
      s.paceDismissedAt === next.paceDismissedAt
    ) {
      return;
    }
    this.state = next;
    for (const listener of [...this.listeners]) listener();
  }

  toString(): string {
    return 'NoticePrefs()';
  }
}
