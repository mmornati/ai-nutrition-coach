import { describe, expect, it } from 'vitest';
import { validateByokEndpoint, type ByokEndpointProblem } from './byok-endpoint';

function ok(raw: string) {
  const v = validateByokEndpoint(raw);
  if (v.kind !== 'valid') throw new Error(`expected valid: ${raw}`);
  return v;
}
function bad(raw: string): ByokEndpointProblem {
  const v = validateByokEndpoint(raw);
  if (v.kind !== 'invalid') throw new Error(`expected invalid: ${raw}`);
  return v.problem;
}

describe('validateByokEndpoint', () => {
  it('accepts https and exposes the host for the consent dialog', () => {
    const v = ok('https://openrouter.ai/api/v1');
    expect(v.host).toBe('openrouter.ai');
    expect(v.isLocal).toBe(false);
  });

  it('refuses plain http for any non-loopback host', () => {
    expect(bad('http://example.com/v1')).toBe('notHttps');
    expect(bad('http://192.168.1.20:11434/v1')).toBe('notHttps');
    expect(bad('http://localhost.evil.com/v1')).toBe('notHttps');
  });

  it('allows http ONLY for localhost, 127.0.0.1 and ::1', () => {
    expect(ok('http://localhost:11434/v1').isLocal).toBe(true);
    expect(ok('http://127.0.0.1:8080').isLocal).toBe(true);
    expect(ok('http://[::1]:1234/v1').isLocal).toBe(true);
    expect(ok('http://[::1]:1234/v1').host).toBe('::1');
    expect(ok('http://LOCALHOST/v1').isLocal).toBe(true);
  });

  it('rejects things that are not a web address at all', () => {
    expect(bad('   ')).toBe('empty');
    expect(bad('')).toBe('empty');
    expect(bad('openrouter.ai/api')).toBe('notAUrl');
    expect(bad('javascript:alert(1)')).toBe('notAUrl');
    expect(bad('file:///etc/passwd')).toBe('notAUrl');
    expect(bad('ftp://example.com')).toBe('notAUrl');
    expect(bad('https://')).toBe('notAUrl');
    expect(bad('https:///path')).toBe('notAUrl');
    expect(bad('data:text/html,<b>x</b>')).toBe('notAUrl');
  });

  it('refuses credentials, a query and a fragment', () => {
    expect(bad('https://user:pw@example.com/v1')).toBe('hasCredentials');
    expect(bad('https://user@example.com/v1')).toBe('hasCredentials');
    expect(bad('https://example.com/v1?key=abc')).toBe('hasQueryOrFragment');
    expect(bad('https://example.com/v1?')).toBe('hasQueryOrFragment');
    expect(bad('https://example.com/v1#frag')).toBe('hasQueryOrFragment');
  });

  it('tolerates surrounding whitespace', () => {
    expect(ok('  https://example.com/v1  ').host).toBe('example.com');
  });

  it('lower-cases the host and keeps it free of the port', () => {
    expect(ok('https://API.Example.COM:8443/v1').host).toBe('api.example.com');
  });
});

describe('chatCompletions join', () => {
  it('builds the same URL with or without a trailing slash', () => {
    expect(ok('https://api.example.com/v1').chatCompletions).toBe(
      'https://api.example.com/v1/chat/completions',
    );
    expect(ok('https://api.example.com/v1/').chatCompletions).toBe(
      'https://api.example.com/v1/chat/completions',
    );
  });

  it('handles a bare host, a port and repeated trailing slashes', () => {
    expect(ok('https://api.example.com').chatCompletions).toBe(
      'https://api.example.com/chat/completions',
    );
    const doubled = ok('http://localhost:11434/v1//').chatCompletions;
    expect(doubled).toBe('http://localhost:11434/v1/chat/completions');
    expect(doubled).not.toContain('//chat');
  });
});
