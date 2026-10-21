// njs (nginx JavaScript), loaded ONLY when the instance AI proxy is enabled
// (docker-entrypoint.d/40-render-ai-proxy.sh). It builds the request body nginx
// sends upstream, so a visitor cannot choose the model or the spend:
//
//   - `model` is forced to the operator's AI_PROXY_MODEL;
//   - `max_tokens` is capped at AI_PROXY_MAX_TOKENS (and set when the client sent none);
//   - only `messages`, `temperature`, `top_p` and `response_format` are carried over:
//     no `stream`, `n`, `tools`, `logprobs`, ... (nothing that multiplies the cost of one call);
//   - a body that is not a JSON object with a `messages` array becomes `{}`, which the provider
//     refuses with its own 400. Nothing is logged, and nothing here reads or writes the key.
//
// The two values arrive as nginx variables set from the rendered config.

function body(r) {
  var model = r.variables.anc_ai_model;
  var cap = parseInt(r.variables.anc_ai_max_tokens, 10);
  if (!(cap > 0)) cap = 2000;

  var text = r.requestText;
  var req;
  try {
    req = JSON.parse(text);
  } catch (e) {
    return '{}';
  }
  if (req === null || typeof req !== 'object' || !Array.isArray(req.messages)) return '{}';

  var out = { model: model, messages: req.messages };
  var asked = Number(req.max_tokens);
  out.max_tokens = asked > 0 ? Math.min(Math.floor(asked), cap) : cap;
  if (typeof req.temperature === 'number') out.temperature = req.temperature;
  if (typeof req.top_p === 'number') out.top_p = req.top_p;
  if (req.response_format !== null && typeof req.response_format === 'object') {
    out.response_format = req.response_format;
  }
  return JSON.stringify(out);
}

export default { body };
