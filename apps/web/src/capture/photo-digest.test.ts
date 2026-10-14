import { describe, expect, it } from 'vitest';
import { PhotoUploadPermit } from '../ai/photo-upload-permit';
import { photoDigest } from './photo-digest';
import { codes, jpegWithExif } from './testing';

describe('photoDigest', () => {
  it('is the lower-case hex SHA-256 (known vector for "abc")', async () => {
    expect(await photoDigest(Uint8Array.from(codes('abc')))).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
  });

  it('hashes exactly the bytes of a view, not the whole backing buffer', async () => {
    const big = Uint8Array.from([9, 9, ...codes('abc'), 9]);
    expect(await photoDigest(big.subarray(2, 5))).toBe(
      await photoDigest(Uint8Array.from(codes('abc'))),
    );
  });

  it('differs for different photos', async () => {
    const a = jpegWithExif();
    const b = Uint8Array.from(a);
    b[b.length - 3] = 0x99;
    expect(await photoDigest(a)).not.toBe(await photoDigest(b));
  });
});

describe('the ONE PhotoUploadPermit (src/ai) over the real SHA-256 digest', () => {
  const photo = jpegWithExif();
  const other = Uint8Array.from([...photo, 0]);

  it('is spent once for the exact photo and host', async () => {
    const permit = new PhotoUploadPermit(photoDigest);
    await permit.grant({ host: 'API.Example.com', bytes: photo });
    expect(await permit.consume({ host: 'api.example.com', bytes: photo })).toBe(true);
    expect(await permit.consume({ host: 'api.example.com', bytes: photo })).toBe(false);
  });

  it('a different photo or host is refused and leaves the permit unspent', async () => {
    const permit = new PhotoUploadPermit(photoDigest);
    await permit.grant({ host: 'a.example', bytes: photo });
    expect(await permit.consume({ host: 'a.example', bytes: other })).toBe(false);
    expect(await permit.consume({ host: 'b.example', bytes: photo })).toBe(false);
    expect(await permit.consume({ host: 'a.example', bytes: photo })).toBe(true);
  });

  it('nothing granted, or revoked, is never spendable', async () => {
    const permit = new PhotoUploadPermit(photoDigest);
    expect(await permit.consume({ host: 'a.example', bytes: photo })).toBe(false);
    await permit.grant({ host: 'a.example', bytes: photo });
    permit.revoke();
    expect(await permit.consume({ host: 'a.example', bytes: photo })).toBe(false);
  });

  it('two concurrent spends: exactly one wins', async () => {
    const permit = new PhotoUploadPermit(photoDigest);
    await permit.grant({ host: 'a.example', bytes: photo });
    const results = await Promise.all([
      permit.consume({ host: 'a.example', bytes: photo }),
      permit.consume({ host: 'a.example', bytes: photo }),
    ]);
    expect(results.filter(Boolean)).toHaveLength(1);
  });

  it('a new grant replaces the old one (a retake)', async () => {
    const permit = new PhotoUploadPermit(photoDigest);
    await permit.grant({ host: 'a.example', bytes: photo });
    await permit.grant({ host: 'a.example', bytes: other });
    expect(await permit.consume({ host: 'a.example', bytes: photo })).toBe(false);
    expect(await permit.consume({ host: 'a.example', bytes: other })).toBe(true);
  });

  it('toString never prints anything', () => {
    expect(String(new PhotoUploadPermit(photoDigest))).toBe('PhotoUploadPermit()');
  });
});
