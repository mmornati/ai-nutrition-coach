// A throw-away HTTPS "AI provider" for scripts/smoke_self_host.sh (run in a node container on the
// smoke's internal Docker network). It answers an OpenAI-style chat completion and reports, as
// booleans and the model, what REACHED it: whether the Authorization header was exactly the
// operator's key (EXPECT_KEY), whether any browser header leaked through, and what the body said.
// It never echoes a key or a cookie value. The provider "refuses" (401) any other Authorization,
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
        res.writeHead(status, { 'content-type': 'application/json', 'set-cookie': 'upstream=1' });
        res.end(JSON.stringify(body));
      };
      if (req.headers.authorization !== expected) {
        send(401, { error: `bad key starting ${String(req.headers.authorization).slice(0, 12)}` });
        return;
      }
      let body = {};
      try {
        body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
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
