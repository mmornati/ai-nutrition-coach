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

export default { body, cleanMessages };
