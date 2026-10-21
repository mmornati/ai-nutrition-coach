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
//   - only `messages`, `temperature`, `top_p` and `response_format` are carried over: no `stream`,
//     `n`, `tools`, `logprobs`, ...;
//   - anything outside that becomes `{}`, which the provider refuses with a 400 (a js_set handler
//     cannot change the status). Nothing is logged, and nothing here reads or writes the key.
//
// The values arrive as nginx variables set from the rendered config.

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

// Returns the cleaned messages, or null when anything is outside the budget.
function cleanMessages(messages) {
  if (!Array.isArray(messages) || messages.length < 1 || messages.length > MAX_MESSAGES) return null;
  var text = 0;
  var images = 0;
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
        parts.push({ type: 'text', text: p.text });
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
  var messages = cleanMessages(req.messages);
  if (messages === null) return '{}';

  var out = { model: model, messages: messages };
  var asked = Number(req.max_tokens !== undefined ? req.max_tokens : req.max_completion_tokens);
  out[param] = asked > 0 ? Math.max(1, Math.min(Math.floor(asked), cap)) : cap;
  if (typeof req.temperature === 'number') out.temperature = req.temperature;
  if (typeof req.top_p === 'number') out.top_p = req.top_p;
  if (req.response_format !== null && typeof req.response_format === 'object') {
    out.response_format = req.response_format;
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
//   - nothing else (no `prompt`, no `temperature`, no timestamp options, no repeated part).
//
// Anything else is a 400 and never reaches the provider. Size and rate are bounded by nginx.

var TX_FILE_HEADER = /^content-disposition: form-data; name="file"; filename="[A-Za-z0-9._ -]{1,100}"$/i;
var TX_FIELD_HEADER = /^content-disposition: form-data; name="(model|language|response_format)"$/i;
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
    if (last) break;
    pos = next + sep.length;
  }
  return !!(seen.file && seen.model);
}

function txGate(r) {
  var ok = false;
  try {
    ok = checkTranscription(r.requestBuffer, r.headersIn['Content-Type'], r.variables.anc_ai_tx_model);
  } catch (e) {
    ok = false;
  }
  r.internalRedirect(ok ? '@ai_nutrition_coach_tx_proxy' : '@ai_nutrition_coach_ai_badrequest');
}

export default { body, cleanMessages, txGate, checkTranscription };
