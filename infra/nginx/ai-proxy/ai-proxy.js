// njs (nginx JavaScript), loaded ONLY when the instance AI proxy is enabled
// (docker-entrypoint.d/40-render-ai-proxy.sh). It builds the request body nginx
// sends upstream, so a visitor cannot choose the model or the spend:
//
//   - `model` is forced to the operator's AI_PROXY_MODEL;
//   - the output cap (`max_tokens`, or `max_completion_tokens` for reasoning models, per
//     AI_PROXY_TOKEN_PARAM) is clamped to 1..AI_PROXY_MAX_TOKENS and set when the client sent none;
//   - the INPUT is bounded to the shapes the app sends: at most 8 messages; roles system, user,
//     assistant; content a string or parts of type `text` / `image_url`; at most 24 KB of text in
//     total; at most ONE image per request, and only a data:image/(jpeg|png|webp);base64 URI (no
//     remote URL is ever fetched by the provider on a visitor's behalf). Unknown keys are dropped;
//   - a prompt-cache marker (`cache_control`, exactly `{type: "ephemeral"}`: no longer TTL, which
//     costs twice the write) is kept on at most ONE text part, and only when the operator set
//     AI_PROXY_CACHE_MARKERS=1; otherwise it is dropped like any unknown key;
//   - only `messages`, `temperature`, `top_p` and `response_format` are carried over: no `stream`,
//     `n`, `tools`, `logprobs`, ...;
//   - `response_format`, when present, is exactly `{type: "json_object"}` or `{type: "text"}`. A
//     `json_schema` (an arbitrary client-sized object that would sit outside the 24 KB text
//     budget) is refused, and so is any other shape or extra key; the app never sends one;
//   - anything outside that becomes `{}`, which the provider refuses with a 400 (a js_set handler
//     cannot change the status). Nothing is logged, and nothing here reads or writes the key.
//
// The values arrive as nginx variables set from the rendered config.
//
// `chatGate` (POST /ai/v1/chat/completions) and `txGate` (voice) are the location's js_content: they
// validate the request, count it against the optional DAILY budgets (`charge`, below) and only then
// let it through to the proxying location.

var MAX_MESSAGES = 8;
var MAX_TEXT_BYTES = 24 * 1024;
var ROLES = { system: 1, user: 1, assistant: 1 };
var DATA_IMAGE = /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+\/]+={0,2}$/;

function utf8Length(s) {
  var n = 0;
  for (var i = 0; i < s.length; i++) {
    var c = s.charCodeAt(i);
    if (c < 0x80) n += 1;
    else if (c < 0x800) n += 2;
    else if (c >= 0xd800 && c <= 0xdbff) {
      n += 4;
      i += 1;
    } else n += 3;
  }
  return n;
}

// `response_format` is checked, not copied: only the two argument-free kinds pass, with no extra key.
function validResponseFormat(f) {
  if (f === null || typeof f !== 'object' || Array.isArray(f)) return false;
  if (Object.keys(f).length !== 1) return false;
  return f.type === 'json_object' || f.type === 'text';
}

function isEphemeralMarker(c) {
  return c !== null && typeof c === 'object' && !Array.isArray(c) && c.type === 'ephemeral' && Object.keys(c).length === 1;
}

// Returns the cleaned messages, or null when anything is outside the budget. `keepCacheMarker`:
// keep the first well-formed `cache_control` on a text part (and drop any other).
function cleanMessages(messages, keepCacheMarker) {
  if (!Array.isArray(messages) || messages.length < 1 || messages.length > MAX_MESSAGES) return null;
  var text = 0;
  var images = 0;
  var markerKept = !keepCacheMarker;
  var out = [];
  for (var i = 0; i < messages.length; i++) {
    var m = messages[i];
    if (m === null || typeof m !== 'object' || !ROLES[m.role] || ROLES[m.role] !== 1) return null;
    if (typeof m.content === 'string') {
      text += utf8Length(m.content);
      out.push({ role: m.role, content: m.content });
      continue;
    }
    if (!Array.isArray(m.content) || m.content.length < 1 || m.content.length > 4) return null;
    var parts = [];
    for (var j = 0; j < m.content.length; j++) {
      var p = m.content[j];
      if (p === null || typeof p !== 'object') return null;
      if (p.type === 'text' && typeof p.text === 'string') {
        text += utf8Length(p.text);
        var part = { type: 'text', text: p.text };
        if (!markerKept && isEphemeralMarker(p.cache_control)) {
          part.cache_control = { type: 'ephemeral' };
          markerKept = true;
        }
        parts.push(part);
      } else if (p.type === 'image_url' && p.image_url !== null && typeof p.image_url === 'object') {
        var url = p.image_url.url;
        images += 1;
        if (images > 1 || typeof url !== 'string' || !DATA_IMAGE.test(url)) return null;
        parts.push({ type: 'image_url', image_url: { url: url } });
      } else {
        return null;
      }
    }
    out.push({ role: m.role, content: parts });
  }
  return text > MAX_TEXT_BYTES ? null : out;
}

function body(r) {
  var model = r.variables.anc_ai_model;
  var cap = parseInt(r.variables.anc_ai_max_tokens, 10);
  if (!(cap > 0)) cap = 2000;
  var param = r.variables.anc_ai_token_param === 'max_completion_tokens' ? 'max_completion_tokens' : 'max_tokens';

  var text = r.requestText;
  var req;
  try {
    req = JSON.parse(text);
  } catch (e) {
    return '{}';
  }
  if (req === null || typeof req !== 'object') return '{}';
  var messages = cleanMessages(req.messages, r.variables.anc_ai_cache_markers === '1');
  if (messages === null) return '{}';

  var out = { model: model, messages: messages };
  var asked = Number(req.max_tokens !== undefined ? req.max_tokens : req.max_completion_tokens);
  out[param] = asked > 0 ? Math.max(1, Math.min(Math.floor(asked), cap)) : cap;
  if (typeof req.temperature === 'number') out.temperature = req.temperature;
  if (typeof req.top_p === 'number') out.top_p = req.top_p;
  if (req.response_format !== undefined && req.response_format !== null) {
    if (!validResponseFormat(req.response_format)) return '{}';
    out.response_format = { type: req.response_format.type };
  }
  return JSON.stringify(out);
}

// ── POST /ai/v1/audio/transcriptions (only when AI_PROXY_TRANSCRIPTION=1) ─────────────────────────
//
// The body is a multipart/form-data upload (one short voice recording). njs does NOT rewrite it:
// the audio is binary and a rewrite through a string could corrupt it. Instead `txGate` is a
// strict VALIDATOR run as the location's js_content: it parses the multipart structure and lets
// the request through (an internal redirect to the proxying location, original body untouched)
// only when it is exactly what the app sends:
//
//   - one `file` part (an audio/* or video/* blob, with a plain filename);
//   - one `model` part equal to the operator's AI_PROXY_TRANSCRIPTION_MODEL (the app reads it
//     from /ai/config.json): a visitor cannot pick another model, a request that tries is a 400;
//   - optionally `language` (a short code) and `response_format` (`json`);
//   - the boundary string occurs nowhere but at the delimiters (no padded / LF-only / hidden delimiter);
//   - nothing else (no `prompt`, no `temperature`, no timestamp options, no repeated part).
//
// Anything else is a 400 and never reaches the provider. Size and rate are bounded by nginx.

var TX_FILE_HEADER = /^[Cc][Oo][Nn][Tt][Ee][Nn][Tt]-[Dd][Ii][Ss][Pp][Oo][Ss][Ii][Tt][Ii][Oo][Nn]: form-data; name="file"; filename="[A-Za-z0-9._ -]{1,100}"$/;
// Header NAME matched case-insensitively (by spelling it out); field NAMES are case-sensitive.
var TX_FIELD_HEADER = /^[Cc][Oo][Nn][Tt][Ee][Nn][Tt]-[Dd][Ii][Ss][Pp][Oo][Ss][Ii][Tt][Ii][Oo][Nn]: form-data; name="(model|language|response_format)"$/;
var TX_TYPE_HEADER = /^content-type: (audio|video)\/[A-Za-z0-9.+-]{1,30}(; ?[A-Za-z0-9=.+, -]{1,60})?$/i;
var TX_BOUNDARY = /^multipart\/form-data; ?boundary=([A-Za-z0-9'()+_,.\/:=?-]{1,70})$/i;
var TX_LANGUAGE = /^[a-z]{2,3}(-[A-Za-z]{2,4})?$/;

// `buf` is the request body as a Buffer. It is searched and sliced as BYTES (njs has no latin1
// decoding, and a string round trip could corrupt the audio); only the small header blocks and
// the short text fields are decoded, as UTF-8, and anything that is not plain ASCII fails the
// strict patterns above.
function checkTranscription(buf, contentType, model) {
  var b = TX_BOUNDARY.exec(contentType || '');
  if (b === null || buf === undefined || buf === null) return false;
  var delim = '--' + b[1];
  var first = delim + '\r\n';
  if (buf.length < first.length + 1 || buf.subarray(0, first.length).toString('utf8') !== first) return false;
  var sep = Buffer.from('\r\n' + delim + '\r\n');
  var closer = Buffer.from('\r\n' + delim + '--');
  var blank = Buffer.from('\r\n\r\n');
  var seen = {};
  var parts = 0;
  var pos = first.length;
  for (;;) {
    // The next boundary, scanning forward like the provider's parser does: a part separator, or
    // the closing delimiter (which must then be the very end of the body).
    var nextSep = buf.indexOf(sep, pos);
    var nextEnd = buf.indexOf(closer, pos);
    if (nextSep < 0 && nextEnd < 0) return false;
    var last = nextSep < 0 || (nextEnd >= 0 && nextEnd < nextSep);
    var next = last ? nextEnd : nextSep;
    if (last) {
      var trailer = buf.subarray(next + closer.length).toString('utf8');
      if (trailer !== '' && trailer !== '\r\n') return false;
    }
    var part = buf.subarray(pos, next);
    var cut = part.indexOf(blank);
    if (cut < 0) return false;
    var lines = part.subarray(0, cut).toString('utf8').split('\r\n');
    var data = part.subarray(cut + 4);
    var name;
    if (TX_FILE_HEADER.test(lines[0])) {
      name = 'file';
      if (lines.length > 2 || (lines.length === 2 && !TX_TYPE_HEADER.test(lines[1]))) return false;
      if (data.length === 0) return false;
    } else {
      var m = TX_FIELD_HEADER.exec(lines[0]);
      if (m === null || lines.length !== 1) return false;
      name = m[1].toLowerCase();
      var text = data.toString('utf8');
      if (name === 'model' && text !== model) return false;
      if (name === 'language' && !TX_LANGUAGE.test(text)) return false;
      if (name === 'response_format' && text !== 'json') return false;
    }
    if (seen[name]) return false;
    seen[name] = 1;
    parts += 1;
    if (last) break;
    pos = next + sep.length;
  }
  if (!(seen.file && seen.model)) return false;
  // Parser-differential guard: the boundary string must occur ONLY at the delimiters walked above
  // (one opening, one per separator, one closing = parts + 1). Transport padding (`--B \r\n`),
  // bare LF / CR delimiters or any `--B` hidden inside a part would be read as a real boundary by a
  // lenient provider parser, so such a body is refused.
  var needle = Buffer.from(delim);
  var count = 0;
  var at = buf.indexOf(needle, 0);
  while (at >= 0) {
    count += 1;
    at = buf.indexOf(needle, at + needle.length);
  }
  return count === parts + 1;
}

function txGate(r) {
  var ok = false;
  try {
    ok = checkTranscription(r.requestBuffer, r.headersIn['Content-Type'], r.variables.anc_ai_tx_model);
  } catch (e) {
    ok = false;
  }
  if (!ok) {
    r.internalRedirect('@ai_nutrition_coach_ai_badrequest');
    return;
  }
  r.internalRedirect(where(r, '@ai_nutrition_coach_tx_proxy'));
}

// ── Daily budgets (opt-in: AI_PROXY_DAILY_PER_USER, AI_PROXY_DAILY_TOTAL; 0 or unset = off) ───────
//
// A request is counted ONCE, at the point where it is known to be valid and is about to go to the
// provider. So these do not count: a request nginx refused before njs (wrong method, type, origin,
// size, the per-minute rate limits), one njs found invalid (a local 400), one that was over a
// budget. These do: every request that was forwarded, whatever the provider then answered (it may
// have been billed). A refused request that was already counted for the person is given back when
// the instance-wide total turns out to be spent.
//
// State: the njs shared dictionary `anc_ai_budget` (a number per key, declared in the rendered
// http config with `evict`, so it can never fill up and refuse everyone; entries expire after 26 h).
//   key   YYYY-MM-DD|<16 hex of sha-256 of "u:<user>" or "a:<address>">    one caller, one UTC day
//   key   YYYY-MM-DD|*                                                      the instance, one UTC day
// The caller is the person behind the sign-in ($anc_ai_user, set only for a trusted proxy) or, with
// none, the client address. The name is hashed: it is stored and logged nowhere in clear.

var DAY_MS = 86400000;
var ENTRY_TTL_MS = 26 * 3600 * 1000;

function dayKey(now) {
  return new Date(now).toISOString().slice(0, 10);
}

// The client address as a bucket: IPv4 as it is, IPv6 reduced to its /64 (the first four groups,
// written in full, lower case, without leading zeros), because one subscriber holds a whole /64
// and could otherwise mint callers at will. An IPv4-mapped address (::ffff:a.b.c.d) is the IPv4.
// Anything it cannot read is returned unchanged.
function clientBucket(addr) {
  addr = String(addr || '');
  if (addr.indexOf(':') < 0) return addr;
  var zone = addr.indexOf('%');
  if (zone >= 0) addr = addr.slice(0, zone);
  var mapped = /^(?:0{0,4}:){0,5}:?ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(addr);
  if (mapped) return mapped[1];
  // A trailing dotted quad stands for the last two groups, which never matter to a /64.
  addr = addr.replace(/(\d+\.\d+\.\d+\.\d+)$/, '0:0');
  var halves = addr.split('::');
  if (halves.length > 2) return addr;
  var head = halves[0] === '' ? [] : halves[0].split(':');
  var tail = halves.length === 2 && halves[1] !== '' ? halves[1].split(':') : [];
  var groups = head;
  if (halves.length === 2) {
    groups = head.slice();
    for (var i = 0; i < 8 - head.length - tail.length; i++) groups.push('0');
    groups = groups.concat(tail);
  }
  if (groups.length !== 8) return addr;
  var out = [];
  for (var k = 0; k < 4; k++) {
    if (!/^[0-9a-fA-F]{1,4}$/.test(groups[k])) return addr;
    out.push(groups[k].toLowerCase().replace(/^0+(?=.)/, ''));
  }
  return out.join(':') + '::/64';
}

// js_set handler: $anc_ai_client, the key of the per-address rate and connection limits.
function client(r) {
  return clientBucket(r.variables.remote_addr);
}

// Short, non-reversible id of one caller (64 bits of sha-256: enough to tell a household apart).
function callerId(vars) {
  var who = vars.anc_ai_user ? 'u:' + vars.anc_ai_user : 'a:' + clientBucket(vars.remote_addr);
  return require('crypto').createHash('sha256').update(who).digest('hex').slice(0, 16);
}

// Counts one request. Returns 0 when it may go on, else the seconds until the budget that stopped
// it resets (the next UTC midnight). `dict` is ngx.shared.anc_ai_budget (a stub in the tests).
function charge(vars, dict, now) {
  var perUser = parseInt(vars.anc_ai_daily_user, 10) || 0;
  var total = parseInt(vars.anc_ai_daily_total, 10) || 0;
  if (perUser <= 0 && total <= 0) return 0;
  var day = dayKey(now);
  var resetIn = Math.max(1, Math.ceil((DAY_MS - (now % DAY_MS)) / 1000));
  var userKey = day + '|' + callerId(vars);
  if (perUser > 0 && dict.incr(userKey, 1, 0, ENTRY_TTL_MS) > perUser) return resetIn;
  if (total > 0 && dict.incr(day + '|*', 1, 0, ENTRY_TTL_MS) > total) {
    if (perUser > 0) dict.incr(userKey, -1, 0, ENTRY_TTL_MS);
    return resetIn;
  }
  return 0;
}

// The location a validated request goes to: the proxy, or the calm daily 429 (with Retry-After).
// If the counters cannot be used the request is refused, not let through: a budget the operator
// asked for must not silently stop applying.
function where(r, proxy) {
  var wait;
  try {
    var perUser = parseInt(r.variables.anc_ai_daily_user, 10) || 0;
    var total = parseInt(r.variables.anc_ai_daily_total, 10) || 0;
    wait = perUser > 0 || total > 0 ? charge(r.variables, ngx.shared.anc_ai_budget, Date.now()) : 0;
  } catch (e) {
    return '@ai_nutrition_coach_ai_refused';
  }
  if (wait > 0) {
    r.variables.anc_ai_retry = String(wait);
    return '@ai_nutrition_coach_ai_daily';
  }
  return proxy;
}

function chatGate(r) {
  var valid = false;
  try {
    valid = body(r) !== '{}';
  } catch (e) {
    valid = false;
  }
  r.internalRedirect(valid ? where(r, '@ai_nutrition_coach_chat_proxy') : '@ai_nutrition_coach_ai_badrequest');
}

export default { body, cleanMessages, txGate, checkTranscription, chatGate, charge, callerId, client, clientBucket };
