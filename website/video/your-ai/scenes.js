/* AI Nutrition Coach — episode "Your AI, your call" (docs: guide/your-ai).
 * Drawn with ../torchon.js on ../engine/engine.js. Each scene is fn(t, d, cues), a pure
 * function of t; animations hook onto the spoken sentences with at(cues, i).
 * Facts: docs/ai-tiers.md, docs/guide/your-ai.md, apps/web/src/i18n/en.ts (on-screen copy).
 * Hosts, keys and plates on screen are demo data. */
"use strict";

const STR = {
  en: {
    crumb: "Settings  →  Your AI",
    title: "Your AI, your call.",
    tagline: "Works fully without AI. Adding one is your choice.",
    // choices
    back: "‹  Settings", yourAi: "Your AI",
    noAi: "No AI", noAiHelp: "Photos stay on this device. You pick a match or type it.",
    server: "Provided by this server", serverHelp: "No key needed. Photos go to this server, which sends them on.",
    ownKey: "My own key", ownKeyHelp: "Photos go to the service you set below, using your key.",
    freeHosted: "Free hosted model", onDevice: "Model on this device", notYet: "Not available yet",
    deflt: "Default", onlyWhen: "Only when the server offers it",
    without: "Without any AI",
    w1: "Type it, with grams", w2: "Scan a barcode", w3: "Describe, matched on the device", w4: "The coach's questions and the week",
    browser: "Your browser", srv: "This server", srvKey: "adds its own key", provider: "The provider it names",
    srvReq: "POST /ai/v1/chat/completions  ·  no key",
    neverKey: "The key never reaches your browser.",
    // own key
    endpoint: "Endpoint", model: "Model", apiKey: "API key", modelPh: "the model name your service offers",
    save: "Save", test: "Test connection", saved: "key saved  •  ends with  ••••7c2e",
    compat: "Any OpenAI-compatible service", compatList: "OpenRouter, OpenAI, or a model on your own machine",
    store: "In your encrypted store", storeHint: "Read only after you unlock.",
    bound: "Bound to its host", boundHost: "openrouter.ai",
    refused: "The saved key was entered for openrouter.ai, so it is not sent anywhere else. Paste the key for this endpoint to save it.",
    notSentThere: "old key: not sent",
    // consent
    nothing1: "Nothing leaves", nothing2: "by itself.",
    cTitle: "Send this photo to api.example.com?",
    cSent: "What is sent: the photo, shrunk, with its location and camera details removed, a fixed instruction, and the model name you chose.",
    cSeen: "Also visible to api.example.com: your internet address and your browser type, as with any website.",
    cNot: "Not sent: your name, your history, or your other plates.",
    cEvery: "You are asked before every photo.",
    notNow: "Not now", sendPhoto: "Send this photo",
    nothingSent: "Nothing sent. The closest matches are right there.",
    askEvery: "Ask before every photo upload", onceHost: "Or agree once per host:", revoke: "Revoke",
    // request
    shrunk: "At most 1024 × 1024", gps: "Location  45.76° N, 4.83° E", camera: "Camera make and model", taken: "Date and time taken",
    stripped: "Removed by the app before it leaves",
    body: "The whole request body", pinned: "Pinned by tests: no field can be added.",
    notSentL: "Not sent", nName: "Your name", nHistory: "Your history", nPlates: "Your other plates",
    // powers
    pTitle: "Three places, each with its own yes",
    t1: "Recognise a photo", t1h: "Asks before every photo, by default",
    t2: "Describe a meal", t2h: "Off until you say yes",
    t3: "Coach notes and answers", t3h: "Off until you say yes",
    ownYes: "its own yes",
    busy: "The AI is busy. Try again in a moment.", matches: "Closest matches", typeIt: "Type it",
    // outro
    planned: "Model on this device  ·  planned",
    guide: "The guide: Docs  →  Your AI",
    url: "mmornati.github.io/ai-nutrition-coach/docs/guide/your-ai",
  },
};

const ALL = ["veg", "protein", "starch", "dairy"];

/* ------------------------------------------------------------ helpers */
/* A key glyph centred on (x, y), size s. */
function keyIcon(x, y, s, o = {}) {
  const a = o.alpha ?? 1, c = o.color ?? T.ink;
  if (a <= 0) return;
  ctx.save(); ctx.globalAlpha *= a; ctx.strokeStyle = c; ctx.lineWidth = Math.max(2, s * 0.1); ctx.lineCap = "round";
  ctx.beginPath(); ctx.arc(x - s * 0.3, y, s * 0.22, 0, Math.PI * 2); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(x - s * 0.08, y); ctx.lineTo(x + s * 0.5, y);
  ctx.moveTo(x + s * 0.34, y); ctx.lineTo(x + s * 0.34, y + s * 0.18);
  ctx.moveTo(x + s * 0.5, y); ctx.lineTo(x + s * 0.5, y + s * 0.22); ctx.stroke();
  ctx.restore();
}
/* A radio choice card like the Your AI screen. y is the top. */
function radioCard(x, y, w, h, name, help, o = {}) {
  const a = o.alpha ?? 1;
  if (a <= 0) return;
  const sel = clamp(o.sel ?? 0), dim = o.dim ? 0.55 : 1;
  if (o.dashed) dashedRect(x, y, w, h, 8, T.control, 2, [6, 5], a);
  else panel(x, y, w, h, { r: 8, fill: T.raised, stroke: sel > 0.5 ? T.ink : T.control, lw: sel > 0.5 ? 2.5 : 2, alpha: a });
  ring(x + 34, y + h / 2, 13, o.dashed ? T.control : T.ink, 2.5, a * dim);
  if (sel > 0) dot(x + 34, y + h / 2, 7 * sel, T.ink, a);
  tx(name, x + 64, y + h / 2 - (help ? 4 : -7), { size: o.size ?? 24, weight: 800, color: T.ink, alpha: a * dim, spacing: "-0.4px" });
  if (help) tx(help, x + 64, y + h / 2 + 24, { size: 17, color: T.soft, alpha: a * dim });
}
/* A labelled text field. y is the top of the label line. */
function field(x, y, w, label, value, o = {}) {
  const a = o.alpha ?? 1;
  if (a <= 0) return;
  tx(label, x, y + 16, { size: 17, weight: 700, color: T.ink, alpha: a });
  panel(x, y + 28, w, 54, { r: 8, fill: T.raised, stroke: o.focus ? T.ink : T.control, lw: 2, alpha: a });
  if (value) tx(value, x + 18, y + 63, { size: 20, color: o.ph ? T.thread : T.ink, alpha: a * (o.valueAlpha ?? 1), spacing: o.spacing });
}
function checkRow(s, x, y, k) {
  if (k <= 0) return;
  check(x + 10, y - 7, 18, T.ink, k);
  tx(s, x + 36, y, { size: 21, color: T.ink, alpha: clamp(k * 2) });
}

/* ------------------------------------------------------------- 1 intro */
function sIntro(t, d, cues) {
  const a1 = at(cues, 1, 2.6);
  towelBand(0, 140, W, 150, ALL, seg(t, 0.15, 2.4));
  sewnLabel("crumb", 80, 332, { size: 17, alpha: seg(t, 0.6, 1.1) });
  display("title", 80, 476, 92, seg(t, 0.8, 1.6));
  tx("tagline", 80, 544, { size: 30, color: T.soft, alpha: seg(t, a1, a1 + 0.6) });
}

/* ----------------------------------------------------------- 2 choices */
function sChoices(t, d, cues) {
  const a1 = at(cues, 1, 4.3), a2 = at(cues, 2, 10.2);
  tx("back", 80, 92, { size: 20, weight: 600, color: T.soft, alpha: seg(t, 0.1, 0.5) });
  display("yourAi", 80, 158, 64, seg(t, 0.15, 0.8));
  const x = 80, w = 600, h = 84, gap = 12;
  const ins = weaveEase(seg(t, a2 + 0.2, a2 + 1.0));            // "this server" slides in when offered
  const app = i => seg(t, 0.5 + i * 0.18, 1.0 + i * 0.18);
  const hiNo = seg(t, a1, a1 + 0.3) * (1 - seg(t, a2, a2 + 0.3));
  radioCard(x, 196, w, h, "noAi", "noAiHelp", { sel: 1, alpha: app(0) });
  if (hiNo > 0) {
    panel(x - 7, 189, w + 14, h + 14, { r: 12, fill: "rgba(0,0,0,0)", stroke: T.ink, lw: 3, alpha: hiNo });
    sewnLabel("deflt", x + w - 18, 214, { size: 14, align: "right", alpha: hiNo });
  }
  if (ins > 0) {
    radioCard(x, 196 + h + gap, w, h, "server", "serverHelp", { alpha: ins });
    const hs = seg(t, a2 + 1.0, a2 + 1.5);
    if (hs > 0) panel(x - 7, 196 + h + gap - 7, w + 14, h + 14, { r: 12, fill: "rgba(0,0,0,0)", stroke: T.ink, lw: 3, alpha: hs });
  }
  const shift = (h + gap) * ins;
  radioCard(x, 196 + h + gap + shift, w, h, "ownKey", "ownKeyHelp", { alpha: app(1) });
  const uy = 196 + 2 * (h + gap) + shift + 8, uw = (w - 12) / 2;
  [["freeHosted", 0], ["onDevice", 1]].forEach(([k, i]) => {
    const a = app(2 + i) * 0.9;
    if (a <= 0) return;
    dashedRect(x + i * (uw + 12), uy, uw, 62, 8, T.control, 2, [6, 5], a);
    tx(k, x + i * (uw + 12) + 18, uy + 27, { size: 18, weight: 800, color: T.thread, alpha: a });
    tx("notYet", x + i * (uw + 12) + 18, uy + 50, { size: 15, color: T.thread, alpha: a });
  });

  // right, sentence 2: the app is complete without AI
  const R = 760, kw = seg(t, a1 + 0.3, a1 + 0.8) * (1 - seg(t, a2, a2 + 0.4));
  if (kw > 0) {
    heading("without", R, 230, 30, 1, { alpha: kw });
    line([[R, 248], [1200, 248]], T.ink, 2, kw);
    ["w1", "w2", "w3", "w4"].forEach((s, i) => {
      const k = seg(t, a1 + 0.9 + i * 0.5, a1 + 1.4 + i * 0.5) * (1 - seg(t, a2, a2 + 0.4));
      checkRow(s, R, 302 + i * 58, k);
    });
  }
  // right, sentence 3: this server adds its own key
  const ks = seg(t, a2 + 0.5, a2 + 1.0);
  if (ks > 0) {
    const cx = 980;
    sewnLabel("browser", cx, 196, { size: 18, align: "center", alpha: ks });
    tx("srvReq", cx, 262, { size: 16, weight: 600, color: T.thread, align: "center", alpha: seg(t, a2 + 1.2, a2 + 1.7) });
    const k1 = seg(t, a2 + 1.2, a2 + 2.0);
    arrow(cx, 274, cx, 314, k1, T.ink);
    const kp = seg(t, a2 + 2.0, a2 + 2.6);
    panel(R, 322, 440, 92, { r: 8, fill: T.raised, stroke: T.ink, lw: 2, alpha: kp });
    tx("srv", R + 28, 360, { size: 26, weight: 800, color: T.ink, alpha: kp });
    tx("srvKey", R + 28, 394, { size: 19, color: T.soft, alpha: kp });
    keyIcon(R + 380, 368, 56, { alpha: seg(t, a2 + 3.4, a2 + 3.9) });
    const k2 = seg(t, a2 + 3.8, a2 + 4.4);
    arrow(cx, 420, cx, 452, k2, T.ink);
    if (k1 >= 1) packets(cx, 278, cx, 312, t, { n: 2, period: 1.2, color: T.ink, r: 3, alpha: ks });
    if (k2 >= 1) packets(cx, 424, cx, 450, t, { n: 2, period: 1.2, color: T.ink, r: 3, alpha: ks });
    sewnLabel("provider", cx, 458, { size: 18, align: "center", alpha: seg(t, a2 + 4.2, a2 + 4.7) });
    tx("neverKey", cx, 548, { size: 24, weight: 800, color: T.ink, align: "center", alpha: seg(t, a2 + 5.6, a2 + 6.2), spacing: "-0.4px" });
  }
}

/* ------------------------------------------------------------ 3 ownkey */
function sOwnKey(t, d, cues) {
  const a1 = at(cues, 1, 4.7), a2 = at(cues, 2, 9.0);
  display("ownKey", 80, 128, 56, seg(t, 0.1, 0.7));
  const x = 80, w = 600, kf = seg(t, 0.4, 0.9);
  // the endpoint changes host during sentence 3
  const swap = a2 + 2.4, sw = seg(t, swap, swap + 0.3);
  const ep1 = "https://openrouter.ai/api/v1", ep2 = "https://api.example.com/v1";
  const epVal = t < swap ? typed(ep1, seg(t, 0.8, 2.2)) : typed(ep2, seg(t, swap + 0.3, swap + 1.4));
  field(x, 160, w, "endpoint", epVal, { alpha: kf, focus: (t > 0.8 && t < 2.3) || (t > swap && t < swap + 1.5) });
  if (sw > 0 && sw < 1) panel(x + 2, 190, w - 4, 50, { r: 6, fill: T.raised, stroke: false, alpha: sw });
  field(x, 254, w, "model", say("modelPh"), { alpha: kf, ph: true });
  const dots = Math.round(22 * seg(t, 2.4, 3.3)), cleared = t >= 3.9;
  field(x, 348, w, "apiKey", cleared ? "" : "•".repeat(dots), { alpha: kf, focus: t > 2.4 && t < 3.9, spacing: "2px" });
  const ref = seg(t, swap + 1.6, swap + 2.1);
  const ks = seg(t, 3.9, 4.3) * (1 - 0.6 * ref);
  tx("saved", x, 466, { size: 18, color: T.ink, alpha: ks });
  if (ref > 0) strike(x, 460, x + txW("saved", 18), 460, ref, { lw: 2.5 });
  const kb = kf * (1 - ref);
  const sw2 = inkPill("save", x, 488, { size: 17, h: 48, alpha: kb, press: seg(t, 3.6, 3.72) * (1 - seg(t, 3.8, 3.92)) });
  outlinePill("test", x + sw2 + 12, 488, { size: 17, h: 48, alpha: kb });
  if (ref > 0) body("refused", x, 506, w, { size: 18, color: T.ink, alpha: ref });

  // right column: three facts stacked
  const R = 760;
  const k1 = seg(t, 1.0, 1.6);
  sewnLabel("compat", R, 168, { size: 18, alpha: k1 });
  tx("compatList", R, 238, { size: 18, color: T.soft, alpha: seg(t, 1.6, 2.2) });
  const k2 = seg(t, a1, a1 + 0.5);
  padlock(R + 46, 316, 70, { alpha: k2, open: 1 - seg(t, a1 + 1.2, a1 + 1.6) });
  tx("store", R + 110, 306, { size: 24, weight: 800, color: T.ink, alpha: k2 });
  tx("storeHint", R + 110, 340, { size: 18, color: T.soft, alpha: seg(t, a1 + 0.6, a1 + 1.1) });
  const k3 = seg(t, a2, a2 + 0.5);
  if (k3 > 0) {
    tx("bound", R, 418, { size: 24, weight: 800, color: T.ink, alpha: k3 });
    keyIcon(R + 30, 462, 52, { alpha: k3 });
    line([[R + 62, 462], [R + 62 + 90 * seg(t, a2 + 0.4, a2 + 1.0), 462]], T.ink, 2, k3, [4, 3]);
    sewnLabel("boundHost", R + 160, 444, { size: 17, alpha: seg(t, a2 + 0.8, a2 + 1.2) });
    const kr = seg(t, swap + 1.8, swap + 2.3);
    if (kr > 0) {
      requestLine(R, 506, "POST", "api.example.com/v1/…", 1, { size: 16, alpha: kr, maxW: 300, note: "notSentThere" });
      keyIcon(R + 380, 524, 44, { alpha: kr * 0.6 });
      cross(R + 380, 524, 34, T.ink, seg(t, swap + 2.3, swap + 2.7));
    }
  }
}

/* ----------------------------------------------------------- 4 consent */
function sConsent(t, d, cues) {
  const a1 = at(cues, 1, 3.3), a2 = at(cues, 2, 7.9);
  display("nothing1", 80, 150, 56, seg(t, 0.1, 0.7));
  display("nothing2", 80, 210, 56, seg(t, 0.25, 0.85));
  requestLine(80, 250, "POST", "api.example.com/v1/chat/completions", 1, { size: 16, alpha: seg(t, 0.9, 1.4), maxW: 480, gated: 0 });
  // the card
  const X = 640, Y = 116, Wc = 560, kc = seg(t, a1, a1 + 0.5), notNowAt = a2 + 0.2;
  const ca = kc * (1 - 0.6 * seg(t, notNowAt + 0.3, notNowAt + 0.8));
  if (ca > 0) {
    ctx.save(); ctx.translate(0, (1 - outCubic(kc)) * 14);
    panel(X, Y, Wc, 386, { r: 8, fill: T.raised, stroke: T.ink, lw: 2, alpha: ca });
    tx("cTitle", X + 26, Y + 50, { size: 25, weight: 800, color: T.ink, alpha: ca, spacing: "-0.3px" });
    const hk = seg(t, a1 + 2.0, a1 + 2.6), hx = X + 26 + txW("Send this photo to ", 25, 800) - 2;
    if (hk > 0) line([[hx, Y + 60], [hx + (txW("api.example.com", 25, 800)) * outCubic(hk), Y + 60]], T.ink, 3, ca);
    let y = Y + 92;
    y += body("cSent", X + 26, y, Wc - 52, { size: 17, color: T.ink, alpha: ca, lh: 25 }) + 12;
    y += body("cSeen", X + 26, y, Wc - 52, { size: 17, color: T.ink, alpha: ca, lh: 25 }) + 12;
    y += body("cNot", X + 26, y, Wc - 52, { size: 17, color: T.ink, alpha: ca, lh: 25 }) + 12;
    body("cEvery", X + 26, y, Wc - 52, { size: 16, color: T.thread, alpha: ca, lh: 24 });
    const nw = outlinePill("notNow", X + 26, Y + 314, { size: 17, h: 48, alpha: ca, press: seg(t, notNowAt, notNowAt + 0.12) * (1 - seg(t, notNowAt + 0.2, notNowAt + 0.32)) });
    outlinePill("sendPhoto", X + 26 + nw + 12, Y + 314, { size: 17, h: 48, alpha: ca });
    ctx.restore();
  }
  // not now: nothing sent
  tx("nothingSent", 80, 352, { size: 21, weight: 700, color: T.ink, alpha: seg(t, notNowAt + 0.5, notNowAt + 1.0) });
  // or agree once per host
  const ko = seg(t, a2 + 2.4, a2 + 2.9), flip = weaveEase(seg(t, a2 + 3.2, a2 + 3.7));
  if (ko > 0) {
    const sy = 420;
    panel(80, sy - 26, 64, 36, { r: 18, fill: flip > 0.5 ? T.raised : T.ink, stroke: T.ink, lw: 2, alpha: ko });
    dot(80 + lerp(46, 18, flip), sy - 8, 12, flip > 0.5 ? T.ink : T.cloth, ko);
    tx("askEvery", 160, sy, { size: 20, color: T.ink, alpha: ko });
    const kh = seg(t, a2 + 3.7, a2 + 4.2);
    tx("onceHost", 80, 478, { size: 18, color: T.soft, alpha: kh });
    sewnLabel("api.example.com", 80, 494, { size: 16, alpha: kh });
    outlinePill("revoke", 80 + txW("api.example.com", 16, 600) + 40, 492, { size: 15, h: 42, alpha: kh });
  }
}

/* ----------------------------------------------------------- 5 request */
function drawPhoto(x, y, s, a) {
  panel(x, y, s, s, { r: 8, fill: "#EDEAE3", stroke: T.ink, lw: 2, alpha: a });
  ctx.save(); ctx.globalAlpha *= a;
  const cx = x + s / 2, cy = y + s / 2, r = s * 0.38;
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, 7); ctx.fillStyle = T.raised; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = T.control; ctx.stroke();
  ctx.beginPath(); ctx.arc(cx, cy, r * 0.78, 0, 7); ctx.strokeStyle = T.seam; ctx.stroke();
  ctx.fillStyle = T.protein; rr(cx - r * 0.55, cy - r * 0.45, r * 0.62, r * 0.36, r * 0.1); ctx.fill();
  ctx.fillStyle = T.starch; ctx.beginPath(); ctx.ellipse(cx + r * 0.25, cy + r * 0.1, r * 0.32, r * 0.24, 0.3, 0, 7); ctx.fill();
  ctx.fillStyle = T.veg; ctx.beginPath(); ctx.ellipse(cx - r * 0.2, cy + r * 0.4, r * 0.34, r * 0.18, -0.2, 0, 7); ctx.fill();
  ctx.restore();
}
function sRequest(t, d, cues) {
  const a1 = at(cues, 1, 5.9), a2 = at(cues, 2, 11.8);
  const kp = seg(t, 0.2, 0.7), ksh = weaveEase(seg(t, 1.2, 2.4));
  const s = lerp(380, 260, ksh);
  drawPhoto(80 + (380 - s) / 2, 130 + (380 - s) / 2, s, kp);
  tx("shrunk", 270, 490, { size: 20, weight: 700, color: T.ink, align: "center", alpha: seg(t, 2.0, 2.5) });
  // metadata, struck and gone before the body appears
  const R = 640, gone = 1 - seg(t, a1 - 0.6, a1);
  ["gps", "camera", "taken"].forEach((k, i) => {
    const y = 150 + i * 72, a = seg(t, 0.6 + i * 0.2, 1.0 + i * 0.2) * gone;
    if (a <= 0) return;
    const w = sewnLabel(k, R, y, { size: 18, alpha: a * (1 - 0.5 * seg(t, 2.6 + i * 0.3, 3.0 + i * 0.3)) });
    strike(R - 8, y + 22, R + w + 8, y + 22, seg(t, 2.6 + i * 0.3, 3.0 + i * 0.3), { lw: 4, alpha: a });
  });
  tx("stripped", R, 404, { size: 22, weight: 700, color: T.ink, alpha: seg(t, 3.6, 4.1) * gone });
  // the fixed shape
  const kb = seg(t, a1, a1 + 0.4);
  if (kb > 0) {
    const b0 = a1 + 0.4;
    terminalCard(R, 120, 560, 330, t, [
      { s: "{", a: b0 },
      { s: "  \"model\": the model you chose,", a: b0 + 0.3, b: b0 + 1.0 },
      { s: "  \"messages\": [ one user message:", a: b0 + 1.1, b: b0 + 1.6 },
      { s: "      the fixed instruction,", a: b0 + 1.9, b: b0 + 2.4 },
      { s: "      the photo ],", a: b0 + 3.0, b: b0 + 3.4 },
      { s: "  \"max_tokens\": 1600, \"temperature\": 0.2", a: b0 + 3.7, b: b0 + 4.3, c: T.control },
      { s: "}", a: b0 + 4.4 },
    ], { title: "body", size: 18, lh: 30, alpha: kb });
    tx("pinned", R, 478, { size: 17, color: T.thread, alpha: seg(t, b0 + 4.4, b0 + 4.9) });
  }
  // not sent
  const kn = seg(t, a2, a2 + 0.4);
  if (kn > 0) {
    tx("notSentL", 80, 566, { size: 22, weight: 800, color: T.ink, alpha: kn });
    let px = 200;
    ["nName", "nHistory", "nPlates"].forEach((k, i) => {
      const a = seg(t, a2 + i * 0.7, a2 + i * 0.7 + 0.4);
      const w = outlinePill(k, px, 538, { size: 17, h: 44, alpha: a, dashed: true });
      strike(px + 10, 560, px + w - 10, 560, seg(t, a2 + i * 0.7 + 0.3, a2 + i * 0.7 + 0.7), { lw: 3, alpha: a });
      px += w + 16;
    });
  }
}

/* ------------------------------------------------------------ 6 powers */
function sPowers(t, d, cues) {
  const a1 = at(cues, 1, 4.4), a2 = at(cues, 2, 10.0);
  display("pTitle", 80, 120, 50, seg(t, 0.1, 0.7));
  const tiles = [["t1", "t1h", a1 + 0.1], ["t2", "t2h", a1 + 1.7], ["t3", "t3h", a1 + 3.2]];
  tiles.forEach(([k, h, at0], i) => {
    const x = 80 + i * 380, y = 170, w = 360, hh = 180;
    const kt = seg(t, 0.6 + i * 0.2, 1.1 + i * 0.2), hi = seg(t, at0, at0 + 0.3) * (i < 2 ? 1 - seg(t, tiles[i + 1][2], tiles[i + 1][2] + 0.3) : 1 - seg(t, a2, a2 + 0.3));
    if (kt <= 0) return;
    ctx.save(); ctx.translate(0, (1 - outCubic(kt)) * 14 - 6 * hi);
    panel(x, y, w, hh, { r: 8, fill: T.raised, stroke: T.ink, lw: 2, alpha: kt });
    if (hi > 0) panel(x - 7, y - 7, w + 14, hh + 14, { r: 12, fill: "rgba(0,0,0,0)", stroke: T.ink, lw: 3, alpha: hi });
    tx(k, x + 24, y + 50, { size: 24, weight: 800, color: T.ink, alpha: kt, spacing: "-0.5px" });
    tx(h, x + 24, y + 86, { size: 18, color: T.soft, alpha: kt });
    sewnLabel("ownYes", x + 24, y + 116, { size: 15, dot: true, alpha: kt });
    ctx.restore();
  });
  // busy, said plainly; the meal still lands
  const kb = seg(t, a2, a2 + 0.5);
  if (kb > 0) {
    panel(80, 410, 680, 150, { r: 8, fill: T.raised, stroke: T.ink, lw: 2, alpha: kb });
    tx("busy", 104, 458, { size: 24, weight: 800, color: T.ink, alpha: kb, spacing: "-0.3px" });
    const mw = outlinePill("matches", 104, 486, { size: 17, h: 46, alpha: seg(t, a2 + 1.4, a2 + 1.9) });
    outlinePill("typeIt", 104 + mw + 12, 486, { size: 17, h: 46, alpha: seg(t, a2 + 1.6, a2 + 2.1) });
    const kd = seg(t, a2 + 3.0, a2 + 4.4);
    if (kd > 0) dayTowel(820, 404, 380, [{ name: "Dinner", time: "19:30", groups: ["veg", "protein", "starch"],
      food: "Salmon, rice, spinach", summary: "Without dairy · ~560 kcal", k: kd }], 1, { field: 104, bandH: 150, size: 22, gapX: 16, rules: false });
  }
}

/* ------------------------------------------------------------- 7 outro */
function sOutro(t, d, cues) {
  const a1 = at(cues, 1, 3.4);
  towelBand(0, 100, W, 120, ALL, seg(t, 0.1, 2.0));
  outlinePill("planned", W / 2, 262, { size: 18, h: 48, align: "center", dashed: true, alpha: seg(t, 0.6, 1.1) });
  display("title", W / 2, 420, 76, seg(t, a1, a1 + 0.7), { align: "center" });
  tx("guide", W / 2, 488, { size: 24, color: T.soft, align: "center", alpha: seg(t, a1 + 1.6, a1 + 2.1) });
  const ku = seg(t, a1 + 2.0, a1 + 2.6), uw = txW("url", 24, 600);
  tx("url", W / 2, 546, { size: 24, weight: 600, color: T.ink, align: "center", alpha: ku });
  line([[W / 2 - uw / 2, 556], [W / 2 + uw / 2, 556]], T.ink, 2, ku);
}

torchonVideo({
  title: { en: "Your AI, your call" },
  kicker: { en: "AI Nutrition Coach · No AI, this server's AI, or your own key" },
  langs: ["en"],
  strings: STR,
  poster: "choices",
  scenes: {
    intro: sIntro, choices: sChoices, ownkey: sOwnKey, consent: sConsent,
    request: sRequest, powers: sPowers, outro: sOutro,
  },
});
