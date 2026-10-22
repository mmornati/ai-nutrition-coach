// A throw-away HTTPS "AI provider" for scripts/smoke_self_host.sh (run in a node container on the
// smoke's internal Docker network). It answers an OpenAI-style chat completion and reports, as
// booleans and the model, what REACHED it: whether the Authorization header was exactly the
// operator's key (EXPECT_KEY), whether any browser header leaked through, and what the body said.
// It also answers /v1/audio/transcriptions (multipart) with a fixed transcript. It never echoes a key or a cookie value. The provider "refuses" (401) any other Authorization,
// with a body that quotes a prefix of it, so the smoke can check the proxy hides that message.
import https from 'node:https';
import { readFileSync } from 'node:fs';

const expected = `Bearer ${process.env.EXPECT_KEY ?? ''}`;
const options = { key: readFileSync('/certs/server.key'), cert: readFileSync('/certs/server.crt') };

https
  .createServer(options, (req, res) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      const send = (status, body) => {
        // The kind of envelope a real provider sends: CORS "*", account and request ids, rate-limit
        // numbers. None of it may reach the browser through the proxy.
        res.writeHead(status, {
          'content-type': 'application/json',
          'set-cookie': 'upstream=1',
          'access-control-allow-origin': '*',
          'openai-organization': 'org-smoke',
          'x-request-id': 'req-smoke',
          'x-ratelimit-remaining-requests': '41',
        });
        res.end(JSON.stringify(body));
      };
      if (req.headers.authorization !== expected) {
        send(401, { error: `bad key starting ${String(req.headers.authorization).slice(0, 12)}` });
        return;
      }
      if (req.url === '/v1/audio/transcriptions') {
        // The voice route: report what REACHED the provider (booleans and the model, no key).
        const raw = Buffer.concat(chunks).toString('latin1');
        const model = /name="model"\r\n\r\n([^\r]*)\r\n/.exec(raw);
        send(200, {
          text: 'two eggs and toast',
          seen: {
            method: req.method,
            path: req.url,
            authOk: true,
            cookie: 'cookie' in req.headers,
            origin: 'origin' in req.headers,
            multipart: /^multipart\/form-data; boundary=/.test(String(req.headers['content-type'])),
            bytes: chunks.reduce((n, c) => n + c.length, 0),
            model: model === null ? null : model[1],
            hasFile: raw.includes('name="file"; filename="'),
            // The audio bytes arrive untouched (the smoke sends 0xff 0x00|0x01 0xfe 0x80).
            binaryIntact: raw.includes('\xff\x00\xfe\x80') || raw.includes('\xff\x01\xfe\x80'),
          },
        });
        return;
      }
      const text = Buffer.concat(chunks).toString('utf8');
      // A test hook: a message that says so makes the provider answer with an error whose text
      // (a balance, an account) must never reach a browser.
      if (text.includes('__PROVIDER_402__')) {
        send(402, { error: { message: 'Insufficient balance: top up your account acct-smoke' } });
        return;
      }
      let body = {};
      try {
        body = JSON.parse(text);
      } catch {
        body = {};
      }
      send(200, {
        choices: [{ message: { content: '[]' } }],
        seen: {
          method: req.method,
          path: req.url,
          authOk: true,
          cookie: 'cookie' in req.headers,
          origin: 'origin' in req.headers,
          referer: 'referer' in req.headers,
          xff: 'x-forwarded-for' in req.headers,
          model: body.model,
          maxTokens: body.max_tokens,
          keys: Object.keys(body).sort(),
        },
      });
    });
  })
  .listen(443);
