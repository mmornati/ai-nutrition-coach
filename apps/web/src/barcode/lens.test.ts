import { describe, expect, it } from 'vitest';
import { lensRank, pickBackCamera, type DeviceInfo } from './lens';

const cam = (deviceId: string, label: string): DeviceInfo => ({
  kind: 'videoinput',
  deviceId,
  label,
});

describe('lensRank', () => {
  it.each([
    ['Back Triple Camera', 3],
    ['Back Dual Wide Camera', 2],
    ['Back Dual Camera', 1],
    ['Caméra arrière triple', 3],
    ['Caméra arrière double grand-angle', 2],
    ['Caméra arrière double', 1],
    ['Back Camera', 0],
    ['Back Ultra Wide Camera', 0],
    ['Back Telephoto Camera', 0],
    ['Front Camera', 0],
    ['Caméra avant', 0],
    ['camera2 0, facing back', 0],
    ['', 0],
  ])('%s -> %i', (label, rank) => {
    expect(lensRank(label)).toBe(rank);
  });
});

describe('pickBackCamera', () => {
  const all = [
    cam('wide', 'Back Camera'),
    cam('ultra', 'Back Ultra Wide Camera'),
    cam('tele', 'Back Telephoto Camera'),
    cam('dualwide', 'Back Dual Wide Camera'),
    cam('triple', 'Back Triple Camera'),
    cam('front', 'Front Camera'),
  ];

  it('prefers triple over dual wide, and never a single lens', () => {
    expect(pickBackCamera(all, 'wide')).toBe('triple');
    expect(
      pickBackCamera(
        all.filter((d) => d.deviceId !== 'triple'),
        'wide',
      ),
    ).toBe('dualwide');
  });

  it('keeps the current stream when it is already the best, or there is no virtual device', () => {
    expect(pickBackCamera(all, 'triple')).toBeUndefined();
    expect(
      pickBackCamera([cam('a', 'Back Camera'), cam('b', 'Front Camera')], 'a'),
    ).toBeUndefined();
    expect(pickBackCamera([], undefined)).toBeUndefined();
  });

  it('ignores audio devices and devices without an id (labels hidden before permission)', () => {
    expect(
      pickBackCamera([
        { kind: 'audioinput', deviceId: 'm', label: 'Triple mic' },
        cam('', 'Back Triple Camera'),
      ]),
    ).toBeUndefined();
  });
});
