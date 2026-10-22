// The voice recorder with a fake microphone and a fake MediaRecorder: three calm states (recording,
// denied, unavailable), a 30 second ceiling, the microphone released the moment recording ends, and
// the audio handed back once and never kept.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  MAX_RECORDING_MS,
  RECORDER_MIME_CANDIDATES,
  RECORDING_BITS_PER_SECOND,
  VoiceRecorder,
  pickRecorderMime,
  voiceRecordingSupported,
  type RecorderConstructor,
  type RecorderLike,
  type VoiceEnv,
} from './voice-recorder';

class FakeTrack {
  stopped = false;
  stop(): void {
    this.stopped = true;
  }
}
class FakeStream {
  readonly track = new FakeTrack();
  getTracks(): FakeTrack[] {
    return [this.track];
  }
}

/** A MediaRecorder stand-in: `stop()` flushes the data it was given, then fires `onstop`. */
function fakeRecorderClass(
  options: { supported?: readonly string[]; data?: Uint8Array; throwOnStart?: boolean } = {},
) {
  const made: FakeRecorder[] = [];
  class FakeRecorder implements RecorderLike {
    static isTypeSupported = (type: string): boolean => (options.supported ?? []).includes(type);
    ondataavailable: RecorderLike['ondataavailable'] = null;
    onstop: RecorderLike['onstop'] = null;
    onerror: RecorderLike['onerror'] = null;
    mimeType: string;
    started = false;
    constructor(
      readonly stream: unknown,
      readonly opts: { mimeType?: string; audioBitsPerSecond?: number } = {},
    ) {
      this.mimeType = opts.mimeType ?? '';
      made.push(this);
    }
    start(): void {
      if (options.throwOnStart) throw new Error('nope');
      this.started = true;
    }
    stop(): void {
      const data = options.data ?? new Uint8Array([1, 2, 3, 4]);
      if (data.length > 0) {
        this.ondataavailable?.({ data: new Blob([data as BlobPart], { type: this.mimeType }) });
      }
      this.onstop?.();
    }
  }
  return { Recorder: FakeRecorder as unknown as RecorderConstructor, made };
}

function env(overrides: Partial<VoiceEnv> & { stream?: FakeStream; rejectWith?: string } = {}): {
  env: VoiceEnv;
  stream: FakeStream;
} {
  const stream = overrides.stream ?? new FakeStream();
  return {
    stream,
    env: {
      getUserMedia:
        overrides.getUserMedia ??
        (() =>
          overrides.rejectWith === undefined
            ? Promise.resolve(stream as unknown as MediaStream)
            : Promise.reject(new DOMException('x', overrides.rejectWith))),
      Recorder:
        overrides.Recorder ?? fakeRecorderClass({ supported: ['audio/webm;codecs=opus'] }).Recorder,
    },
  };
}

describe('pickRecorderMime', () => {
  const only = (...types: string[]) => fakeRecorderClass({ supported: types }).Recorder;

  it('prefers Opus in WebM, then MP4 (Safari), then the plainer ones', () => {
    expect(RECORDER_MIME_CANDIDATES[0]).toBe('audio/webm;codecs=opus');
    expect(pickRecorderMime(only('audio/webm;codecs=opus', 'audio/mp4'))).toBe(
      'audio/webm;codecs=opus',
    );
    expect(pickRecorderMime(only('audio/mp4'))).toBe('audio/mp4');
    expect(pickRecorderMime(only('audio/ogg;codecs=opus'))).toBe('audio/ogg;codecs=opus');
  });

  it('is the browser’s own default ("") when nothing listed is supported or it cannot say', () => {
    expect(pickRecorderMime(only())).toBe('');
    class NoProbe {}
    expect(pickRecorderMime(NoProbe as unknown as RecorderConstructor)).toBe('');
  });
});

describe('voiceRecordingSupported', () => {
  it('needs both a microphone API and a recorder', () => {
    expect(voiceRecordingSupported(env().env)).toBe(true);
    expect(voiceRecordingSupported({ Recorder: env().env.Recorder })).toBe(false);
    expect(voiceRecordingSupported({ getUserMedia: env().env.getUserMedia })).toBe(false);
  });
});

describe('VoiceRecorder', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('records at a speech bit rate in the chosen format and hands the audio back on stop, releasing the microphone', async () => {
    const fake = fakeRecorderClass({ supported: ['audio/mp4'] });
    const { env: e, stream } = env({ Recorder: fake.Recorder });
    const recorder = new VoiceRecorder(e);
    expect(await recorder.start()).toEqual({ kind: 'recording' });
    expect(recorder.recording).toBe(true);
    expect(fake.made[0]?.opts).toEqual({
      mimeType: 'audio/mp4',
      audioBitsPerSecond: RECORDING_BITS_PER_SECOND,
    });
    expect(stream.track.stopped).toBe(false);

    const stopped = await recorder.stop();
    if (stopped.kind !== 'audio') throw new Error('no audio');
    expect(stopped.blob.type).toBe('audio/mp4');
    expect(stopped.blob.size).toBe(4);
    expect(stream.track.stopped).toBe(true);
    expect(recorder.recording).toBe(false);
    // The audio was handed over once: a second stop has nothing.
    expect(await recorder.stop()).toEqual({ kind: 'empty' });
  });

  it('stops by itself after 30 seconds and reports the audio through onLimit', async () => {
    const { env: e, stream } = env();
    const recorder = new VoiceRecorder(e);
    const onLimit = vi.fn();
    await recorder.start(onLimit);
    await vi.advanceTimersByTimeAsync(MAX_RECORDING_MS - 1);
    expect(onLimit).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(onLimit).toHaveBeenCalledTimes(1);
    expect(onLimit.mock.calls[0]?.[0]).toMatchObject({ kind: 'audio' });
    expect(stream.track.stopped).toBe(true);
    expect(recorder.recording).toBe(false);
  });

  it('an early stop cancels the 30 second timer (no late callback)', async () => {
    const { env: e } = env();
    const recorder = new VoiceRecorder(e);
    const onLimit = vi.fn();
    await recorder.start(onLimit);
    await recorder.stop();
    await vi.advanceTimersByTimeAsync(MAX_RECORDING_MS * 2);
    expect(onLimit).not.toHaveBeenCalled();
  });

  it('a recording that captured nothing is "empty"', async () => {
    const fake = fakeRecorderClass({ data: new Uint8Array(0) });
    const recorder = new VoiceRecorder(env({ Recorder: fake.Recorder }).env);
    await recorder.start();
    expect(await recorder.stop()).toEqual({ kind: 'empty' });
  });

  it('denied: the person (or the browser policy) said no; nothing is recording', async () => {
    for (const name of ['NotAllowedError', 'SecurityError', 'PermissionDeniedError']) {
      const recorder = new VoiceRecorder(env({ rejectWith: name }).env);
      expect(await recorder.start()).toEqual({ kind: 'denied' });
      expect(recorder.recording).toBe(false);
    }
  });

  it('unavailable: no microphone, one in use, no API, or a recorder that cannot start', async () => {
    for (const name of [
      'NotFoundError',
      'NotReadableError',
      'OverconstrainedError',
      'AbortError',
    ]) {
      expect(await new VoiceRecorder(env({ rejectWith: name }).env).start()).toEqual({
        kind: 'unavailable',
      });
    }
    expect(await new VoiceRecorder({}).start()).toEqual({ kind: 'unavailable' });
    const broken = fakeRecorderClass({ throwOnStart: true });
    const { env: e, stream } = env({ Recorder: broken.Recorder });
    expect(await new VoiceRecorder(e).start()).toEqual({ kind: 'unavailable' });
    // A microphone that could not be used is released at once.
    expect(stream.track.stopped).toBe(true);
  });

  it('asks only for audio, never video', async () => {
    const getUserMedia = vi.fn(() => Promise.resolve(new FakeStream() as unknown as MediaStream));
    await new VoiceRecorder(env({ getUserMedia }).env).start();
    expect(getUserMedia).toHaveBeenCalledWith({ audio: true, video: false });
  });

  it('cancel drops what was captured and releases the microphone', async () => {
    const { env: e, stream } = env();
    const recorder = new VoiceRecorder(e);
    const onLimit = vi.fn();
    await recorder.start(onLimit);
    recorder.cancel();
    expect(stream.track.stopped).toBe(true);
    expect(recorder.recording).toBe(false);
    await vi.advanceTimersByTimeAsync(MAX_RECORDING_MS * 2);
    expect(onLimit).not.toHaveBeenCalled();
  });

  it('starting twice does not open a second microphone', async () => {
    const getUserMedia = vi.fn(() => Promise.resolve(new FakeStream() as unknown as MediaStream));
    const recorder = new VoiceRecorder(env({ getUserMedia }).env);
    await recorder.start();
    expect(await recorder.start()).toEqual({ kind: 'recording' });
    expect(getUserMedia).toHaveBeenCalledTimes(1);
  });
});
