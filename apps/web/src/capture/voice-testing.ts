// Test support for the voice recorder: a fake microphone and a fake MediaRecorder. Test-only:
// nothing in the app imports this, so it is never in a bundle.
import type { RecorderConstructor, RecorderLike, VoiceEnv } from './voice-recorder';

export class FakeTrack {
  stopped = false;
  stop(): void {
    this.stopped = true;
  }
}

export class FakeStream {
  readonly track = new FakeTrack();
  getTracks(): FakeTrack[] {
    return [this.track];
  }
}

export interface FakeVoice {
  readonly env: VoiceEnv;
  /** How many times the microphone was asked for. */
  readonly asked: () => number;
  /** The microphone streams handed out, in order. */
  readonly streams: FakeStream[];
}

/**
 * A microphone that is granted (or refused with `deny`: the DOMException name) and a recorder that
 * "captures" `bytes` and hands them back on stop.
 */
export function fakeVoiceEnv(
  options: { deny?: string; bytes?: number; mime?: string; noRecorder?: boolean } = {},
): FakeVoice {
  const streams: FakeStream[] = [];
  let asked = 0;
  const mime = options.mime ?? 'audio/webm;codecs=opus';
  class Recorder implements RecorderLike {
    static isTypeSupported = (type: string): boolean => type === mime;
    ondataavailable: RecorderLike['ondataavailable'] = null;
    onstop: RecorderLike['onstop'] = null;
    onerror: RecorderLike['onerror'] = null;
    readonly mimeType: string;
    constructor(_stream: unknown, opts: { mimeType?: string } = {}) {
      this.mimeType = opts.mimeType ?? mime;
    }
    start(): void {}
    stop(): void {
      const size = options.bytes ?? 2048;
      if (size > 0) {
        this.ondataavailable?.({
          data: new Blob([new Uint8Array(size)], { type: this.mimeType }),
        });
      }
      this.onstop?.();
    }
  }
  return {
    streams,
    asked: () => asked,
    env: {
      getUserMedia: () => {
        asked += 1;
        if (options.deny !== undefined) return Promise.reject(new DOMException('x', options.deny));
        const stream = new FakeStream();
        streams.push(stream);
        return Promise.resolve(stream as unknown as MediaStream);
      },
      ...(options.noRecorder ? {} : { Recorder: Recorder as unknown as RecorderConstructor }),
    },
  };
}
