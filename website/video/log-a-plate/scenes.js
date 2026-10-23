/* AI Nutrition Coach — episode "Log a plate". Drawn with ../torchon.js on ../engine/engine.js.
 * Each scene is fn(t, d, cues), a pure function of t; animations hook onto the spoken
 * sentences with at(cues, i). Plates, recipes and numbers on screen are demo data; strings
 * come from apps/web/src/i18n/en.ts and docs/guide/log-a-plate.md. Two real screenshots
 * (../shots/log-a-plate-*.webp) are preloaded before the first frame. */
"use strict";

const STR = {
  en: {
    title: "Log a plate",
    lead: "Press Log: one sheet, every way in.",
    checked: "Nothing is saved until you have checked it.",
    snapshot: "Snapshot", barcode: "Barcode", typeIt: "Type it", describe: "Describe", paste: "Paste a recipe",
    needsAi: "Needs an AI you have set up",
    location: "Location", camera: "Camera details", shrunk: "Shrunk before it leaves",
    askEvery: "Asked before every photo",
    demoPhoto: "demo plate",
    onDevice: "Read on this device",
    offNote: "Only the barcode is sent. Open Food Facts: free, open, no account.",
    notFound: "Not found",
    notFoundBody: "This barcode isn't in the catalog yet. Type it manually?",
    typeManually: "Type it manually",
    offAdd: "Add this product to Open Food Facts",
    worksOffline: "Works offline",
    search: "lentil",
    portion: "Portion", grams: "Grams", gramsVal: "180",
    preview: "≈ 225 kcal · 18 g protein · 0.4 g sugars",
    p_small: "Small portion", p_one: "1 portion", p_large: "Large portion", p_100: "100 g",
    describeText: "Two eggs, toast with butter, a coffee with milk",
    dictate: "or dictate it",
    noAiMatch: "No AI: matched on this device",
    pasted: "Pasted text",
    servings: "Servings", notMatched: "Not matched yet", estimate: "≈ marks an estimate",
    recent: "Recent", often: "Often", logBtn: "Log", change: "Change",
    oftenTimes: "9 times in 30 days",
    saved: "Saved meals and recipes",
    again: "Log this again", copyDay: "Copy this day to today",
    tue: "Tue", today: "Today",
    neverFails: "The log never fails",
    offline: "Offline", noAi: "No AI", unknown: "Unknown barcode",
    closest: "Closest matches, a quantity to adjust",
    guide: "The guide: Log a plate",
    url: "mmornati.github.io/ai-nutrition-coach/docs/guide/log-a-plate",
  },
};

const ALL = ["veg", "protein", "starch", "dairy"];
const GC = Object.fromEntries(GROUPS.map(g => [g.key, g.color]));

/* ---------------------------------------------------------- screenshots */
const IMG = {};
function loadImg(key, src) {
  return new Promise(res => { const i = new Image(); i.onload = i.onerror = () => res(); i.src = src; IMG[key] = i; });
}
function shot(key) {
  return (w, h) => { const i = IMG[key]; if (i && i.complete && i.naturalWidth) ctx.drawImage(i, 0, 0, w, h); };
}

/* a group swatch + its name, like the app's match rows */
function groupTag(key, x, y, a = 1, size = 15) {
  const g = GROUPS.find(g => g.key === key);
  ctx.save(); ctx.globalAlpha *= a; ctx.fillStyle = g.color; ctx.fillRect(x, y - size * 0.5, size * 1.5, size * 0.4); ctx.restore();
  tx(groupName(g), x + size * 1.9, y, { size, weight: 600, color: T.soft, alpha: a });
}
/* a small tick box */
function tick(x, y, s, k, a = 1) {
  panel(x, y, s, s, { r: 4, fill: k > 0 ? T.ink : T.raised, stroke: T.ink, lw: 2, alpha: a });
  if (k > 0) { ctx.save(); ctx.globalAlpha *= a; check(x + s / 2, y + s / 2, s * 0.62, T.cloth, k); ctx.restore(); }
}

/* ------------------------------------------------------------- 1 intro */
const WAYS = ["snapshot", "barcode", "typeIt", "describe", "paste"];
function sIntro(t, d, cues) {
  const a1 = at(cues, 1, 2.3), a2 = at(cues, 2, 5.6);
  towelBand(0, 110, W, 140, ALL, seg(t, 0.15, 2.4));
  display("title", 80, 390, 104, seg(t, 0.5, 1.3));
  tx("lead", 80, 446, { size: 26, color: T.soft, alpha: seg(t, a1, a1 + 0.5) });
  let x = 80;
  WAYS.forEach((k, i) => {
    const kk = seg(t, a1 + 0.5 + i * 0.32, a1 + 0.9 + i * 0.32);
    const w = i === 0 ? inkPill(k, x, 476, { size: 19, h: 50, alpha: kk }) : outlinePill(k, x, 476, { size: 19, h: 50, alpha: kk });
    x += w + 14;
  });
  tx("checked", 80, 584, { size: 30, weight: 700, color: T.ink, alpha: seg(t, a2, a2 + 0.5), spacing: "-0.5px" });
}

/* ---------------------------------------------------------- 2 snapshot */
function platePhoto(cx, cy, s, a) {
  if (a <= 0) return;
  ctx.save(); ctx.globalAlpha *= a;
  rr(cx - s / 2, cy - s * 0.38, s, s * 0.76, 8); ctx.fillStyle = "#D9D3C7"; ctx.fill();
  ctx.lineWidth = 2; ctx.strokeStyle = T.ink; ctx.stroke();
  ctx.beginPath(); ctx.ellipse(cx, cy, s * 0.34, s * 0.3, 0, 0, 7); ctx.fillStyle = T.raised; ctx.fill(); ctx.stroke();
  const blob = (dx, dy, r, c) => { ctx.beginPath(); ctx.ellipse(cx + dx * s, cy + dy * s, r * s, r * s * 0.8, 0.4, 0, 7); ctx.fillStyle = c; ctx.fill(); };
  blob(-0.1, -0.07, 0.11, GC.veg); blob(0.11, -0.04, 0.1, GC.starch); blob(0.0, 0.11, 0.1, GC.protein);
  ctx.restore();
}
function sSnapshot(t, d, cues) {
  const a1 = at(cues, 1, 4.7), a2 = at(cues, 2, 9.8);
  display("snapshot", 80, 120, 60, seg(t, 0.1, 0.7));
  sewnLabel("needsAi", 80, 146, { size: 16, dot: true, alpha: seg(t, 1.6, 2.1) });
  // the photo, shrunk
  const ks = inOut(seg(t, a1 + 0.3, a1 + 1.3));
  const s = lerp(330, 230, ks), cx = 280, cy = 380;
  platePhoto(cx, cy, s, seg(t, 0.4, 0.9));
  tx("demoPhoto", cx, cy + s * 0.38 + 24, { size: 14, color: T.thread, align: "center", alpha: seg(t, 0.4, 0.9) * (1 - ks) });
  tx("shrunk", cx, cy + 0.38 * 230 + 28, { size: 18, weight: 600, color: T.ink, align: "center", alpha: ks });
  // its details, removed
  ["location", "camera"].forEach((k, i) => {
    const y = 300 + i * 74, a = seg(t, 1.0 + i * 0.3, 1.5 + i * 0.3);
    const gone = seg(t, a1 + 1.8 + i * 0.5, a1 + 2.3 + i * 0.5);
    const lx = 500;
    line([[cx + s * 0.5, y + 18], [lx, y + 18]], T.control, 1.5, a * (1 - gone), [4, 4]);
    const w = sewnLabel(k, lx, y, { size: 17, alpha: a * (1 - 0.4 * gone) });
    strike(lx - 8, y + 20, lx + w + 8, y + 20, gone, { lw: 4 });
  });
  // asked before every photo: the real consent card
  const kp = seg(t, a2 - 0.4, a2 + 0.3);
  phoneFrame(880, 52, 0.64, shot("consent"), { alpha: kp });
  tx("askEvery", 500, 540, { size: 26, weight: 800, color: T.ink, alpha: seg(t, a2 + 0.4, a2 + 0.9), spacing: "-0.4px" });
  if (kp > 0) arrow(500 + txW("askEvery", 26, 800) + 16, 532, 856, 532, seg(t, a2 + 0.6, a2 + 1.2), T.ink);
}

/* ----------------------------------------------------------- 3 barcode */
function barcodeArt(x, y, w, h, a) {
  ctx.save(); ctx.globalAlpha *= a; ctx.fillStyle = T.ink;
  const R = rng(37); let bx = x;
  while (bx < x + w - 4) { const bw = 2 + Math.floor(R() * 3); ctx.fillRect(bx, y, bw, h); bx += bw + 2 + Math.floor(R() * 4); }
  ctx.restore();
}
function sBarcode(t, d, cues) {
  const a1 = at(cues, 1, 5.6), a2 = at(cues, 2, 9.4);
  display("barcode", 80, 120, 60, seg(t, 0.1, 0.7));
  // read on the device
  const kb = seg(t, 0.4, 0.9);
  panel(80, 150, 330, 150, { r: 8, fill: T.raised, stroke: T.ink, lw: 2, alpha: kb });
  barcodeArt(110, 170, 270, 84, kb);
  tx("3 760123 456784", 245, 280, { size: 16, weight: 600, color: T.ink, align: "center", alpha: kb, spacing: "2px" });
  const scan = seg(t, 0.9, 2.6);
  if (scan > 0 && scan < 1) line([[96, 170 + 84 * (0.5 - 0.5 * Math.cos(scan * Math.PI * 4))], [394, 170 + 84 * (0.5 - 0.5 * Math.cos(scan * Math.PI * 4))]], T.protein, 3, kb);
  sewnLabel("onDevice", 430, 205, { size: 17, dot: true, alpha: seg(t, 1.6, 2.1) });
  // only the number leaves
  requestLine(80, 330, "GET", "world.openfoodfacts.org/api/v2/product/3760123456784?fields=product_name,nutriments,…",
    seg(t, 2.6, 4.0), { size: 16, maxW: 720, alpha: seg(t, 2.4, 2.8), note: "offNote" });
  // the real one-time notice
  phoneFrame(900, 52, 0.64, shot("notice"), { alpha: seg(t, a1 - 0.2, a1 + 0.5) });
  // an unknown product
  const kn = seg(t, a2, a2 + 0.5), y = 430;
  if (kn > 0) {
    panel(80, y + (1 - outCubic(kn)) * 12, 720, 150, { r: 8, fill: T.raised, stroke: T.ink, lw: 2, alpha: kn });
    heading("notFound", 104, y + 42, 24, kn);
    tx("notFoundBody", 104, y + 74, { size: 18, color: T.soft, alpha: kn });
    const k2 = seg(t, a2 + 1.0, a2 + 1.4);
    const pw = inkPill("typeManually", 104, y + 92, { size: 16, h: 42, alpha: k2, press: seg(t, a2 + 2.0, a2 + 2.1) * (1 - seg(t, a2 + 2.2, a2 + 2.35)) });
    const k3 = seg(t, a2 + 2.4, a2 + 2.8), lx = 104 + pw + 24, lw = txW("offAdd", 16, 600);
    tx("offAdd", lx, y + 119, { size: 16, weight: 600, color: T.ink, alpha: k3 });
    line([[lx, y + 124], [lx + lw, y + 124]], T.ink, 1.5, k3);
  }
}

/* ------------------------------------------------------------ 4 typeit */
const MATCHES = [
  { name: "Lentil, pink or red, boiled/cooked in water", g: "protein" },
  { name: "Lentil, seasoned, canned, drained", g: "protein" },
  { name: "Lentils seeds, sprouted, fresh, raw", g: "veg" },
  { name: "Lentil, dried (average)", g: "protein" },
];
function sTypeit(t, d, cues) {
  const a1 = at(cues, 1, 4.6), a2 = at(cues, 2, 6.9);
  display("typeIt", 80, 120, 60, seg(t, 0.1, 0.7));
  sewnLabel("worksOffline", 80 + txW("typeIt", 60, 900) + 28, 84, { size: 16, alpha: seg(t, 1.6, 2.1) });
  // search field, typed
  const kf = seg(t, 0.4, 0.9), kt = seg(t, a1 - 0.6, a1 + 0.6);
  panel(80, 156, 600, 60, { r: 8, fill: T.raised, stroke: kt > 0 && kt < 1 ? T.ink : T.control, lw: 2, alpha: kf });
  const q = typed(say("search"), kt);
  tx(q, 102, 195, { size: 24, color: T.ink, alpha: kf });
  if (kt > 0 && kt < 1) { ctx.save(); ctx.fillStyle = T.ink; ctx.fillRect(104 + txW(q, 24), 172, 2, 28); ctx.restore(); }
  // ranked matches
  const sel = seg(t, a2 + 0.2, a2 + 0.5);
  MATCHES.forEach((m, i) => {
    const y = 236 + i * 74, a = seg(t, a1 + 0.4 + i * 0.18, a1 + 0.8 + i * 0.18);
    if (a <= 0) return;
    if (i === 0) panel(70, y - 6, 620, 70, { r: 8, fill: "rgba(0,0,0,0)", stroke: T.ink, lw: 2.5, alpha: sel });
    tx(String(i + 1), 86, y + 26, { size: 15, weight: 700, color: T.thread, alpha: a });
    tx(m.name, 116, y + 26, { size: 20, color: T.ink, alpha: a });
    groupTag(m.g, 116, y + 52, a, 14);
    ring(668 - 6, y + 28, 7, T.ink, 2, a);
    if (i === 0) dot(662, y + 28, 4 * sel, T.ink, a);
    if (i < MATCHES.length - 1) line([[80, y + 66], [680, y + 66]], T.seam, 1, a);
  });
  // portion or grams
  const x = 760, kp = seg(t, a2 + 0.1, a2 + 0.5);
  tx("portion", x, 186, { size: 17, weight: 700, color: T.thread, alpha: kp });
  [["p_small", 0, 0], ["p_one", 1, 0], ["p_large", 0, 1], ["p_100", 1, 1]].forEach(([k, cx, cy], i) => {
    const a = seg(t, a2 + 0.2 + i * 0.12, a2 + 0.5 + i * 0.12);
    const px = x + cx * 190, py = 204 + cy * 62;
    if (k === "p_one" && t > a2 + 1.0) inkPill(k, px, py, { size: 17, h: 48, alpha: a });
    else outlinePill(k, px, py, { size: 17, h: 48, alpha: a });
  });
  const kg = seg(t, a2 + 1.2, a2 + 1.6);
  tx("grams", x, 370, { size: 17, weight: 700, color: T.thread, alpha: kg });
  panel(x, 384, 200, 60, { r: 8, fill: T.raised, stroke: T.ink, lw: 2, alpha: kg });
  tx(typed(say("gramsVal"), seg(t, a2 + 1.5, a2 + 1.9)), x + 20, 423, { size: 24, color: T.ink, alpha: kg });
  tx("g", x + 168, 423, { size: 20, color: T.thread, alpha: kg });
  tx("preview", x, 480, { size: 19, color: T.soft, alpha: seg(t, a2 + 2.0, a2 + 2.4) });
}

/* ------------------------------------------------------------- 5 words */
const DESCRIBED = [["Egg", "protein"], ["Toast", "starch"], ["Butter", "dairy"], ["Coffee", null], ["Milk", "dairy"]];
const PASTED = ["200 g red lentils", "2 tbsp olive oil", "1 pinch of sumac", "Serves 4"];
function sWords(t, d, cues) {
  const a1 = at(cues, 1, 3.4), a2 = at(cues, 2, 6.4);
  // left: describe
  const x = 80, w = 520;
  heading("describe", x, 116, 40, seg(t, 0.1, 0.6));
  const kf = seg(t, 0.3, 0.8);
  panel(x, 140, w, 92, { r: 8, fill: T.raised, stroke: T.ink, lw: 2, alpha: kf });
  const s = typed(say("describeText"), seg(t, 0.6, 2.4));
  para(s, x + 18, 174, w - 70, { font: SG, size: 20, lh: 28, color: T.ink, alpha: kf });
  // keyboard microphone
  ctx.save(); ctx.globalAlpha *= kf; ctx.strokeStyle = T.ink; ctx.lineWidth = 2.2;
  rr(x + w - 38, 160, 14, 22, 7); ctx.stroke();
  ctx.beginPath(); ctx.arc(x + w - 31, 176, 12, 0.15 * Math.PI, 0.85 * Math.PI); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(x + w - 31, 188); ctx.lineTo(x + w - 31, 196); ctx.stroke(); ctx.restore();
  tx("dictate", x + w, 254, { size: 15, color: T.thread, align: "right", alpha: seg(t, 1.6, 2.1) });
  sewnLabel("noAiMatch", x, 270, { size: 16, dot: true, alpha: seg(t, a1, a1 + 0.4) });
  DESCRIBED.forEach(([f, g], i) => {
    const y = 330 + i * 46, a = seg(t, a1 + 0.5 + i * 0.2, a1 + 0.9 + i * 0.2);
    if (a <= 0) return;
    tick(x, y, 24, seg(t, a1 + 0.7 + i * 0.2, a1 + 1.1 + i * 0.2), a);
    tx(f, x + 40, y + 19, { size: 20, color: T.ink, alpha: a });
    if (g) groupTag(g, x + 200, y + 17, a, 14);
    else tx("Other", x + 200 + 14 * 1.9, y + 17, { size: 14, weight: 600, color: T.soft, alpha: a });
    if (i < DESCRIBED.length - 1) line([[x, y + 34], [x + w, y + 34]], T.seam, 1, a);
  });
  // right: paste a recipe
  const rx = 680, rw = 520, kr = seg(t, a2 - 0.2, a2 + 0.4);
  if (kr <= 0) return;
  heading("paste", rx, 116, 40, kr);
  panel(rx, 140, rw, 150, { r: 8, fill: T.raised, stroke: T.control, lw: 2, alpha: kr });
  tx("pasted", rx + 18, 166, { size: 13, weight: 700, color: T.thread, alpha: kr });
  PASTED.forEach((l, i) => tx(l, rx + 18, 194 + i * 26, { size: 18, color: T.soft, alpha: kr * seg(t, a2 + 0.2 + i * 0.12, a2 + 0.4 + i * 0.12) }));
  const km = seg(t, a2 + 1.2, a2 + 1.7);
  tx("servings", rx, 330, { size: 17, weight: 700, color: T.thread, alpha: km });
  sewnLabel("4", rx + 100, 308, { size: 17, alpha: km });
  [["Lentils, red", "200 g", "protein"], ["Olive oil", "≈ 27 g", null]].forEach(([f, q, g], i) => {
    const y = 376 + i * 46, a = seg(t, a2 + 1.5 + i * 0.25, a2 + 1.9 + i * 0.25);
    tx(f, rx, y, { size: 20, color: T.ink, alpha: a });
    if (g) groupTag(g, rx + 180, y - 2, a, 14); else tx("Other", rx + 180 + 14 * 1.9, y - 2, { size: 14, weight: 600, color: T.soft, alpha: a });
    tx(q, rx + rw, y, { size: 20, weight: 700, color: T.ink, align: "right", alpha: a });
    line([[rx, y + 16], [rx + rw, y + 16]], T.seam, 1, a);
  });
  const kn = seg(t, a2 + 2.3, a2 + 2.8);
  tx("notMatched", rx, 488, { size: 17, weight: 700, color: T.thread, alpha: kn });
  dashedRect(rx, 500, rw, 46, 6, T.control, 1.5, [5, 4], kn);
  tx("1 pinch of sumac", rx + 16, 530, { size: 18, color: T.soft, alpha: kn });
  tx("estimate", rx + rw, 488, { size: 15, color: T.thread, align: "right", alpha: kn });
}

/* --------------------------------------------------------- 6 shortcuts */
function sShortcuts(t, d, cues) {
  const a0 = at(cues, 0, 0.5), a1 = at(cues, 1, 4.0);
  // column 1: recent and often
  const x1 = 80, w1 = 340, k1 = seg(t, a0, a0 + 0.5);
  heading("recent", x1, 120, 30, k1);
  line([[x1, 136], [x1 + w1, 136]], T.ink, 2, k1);
  const rows = [["Oats, milk", "1 portion"], ["Lentil salad", "250 g"], ["Apple", "1 portion"]];
  const tap = a0 + 1.6, press = seg(t, tap, tap + 0.1) * (1 - seg(t, tap + 0.2, tap + 0.35));
  rows.forEach(([f, q], i) => {
    const y = 152 + i * 72, a = seg(t, a0 + 0.3 + i * 0.15, a0 + 0.7 + i * 0.15);
    tx(f, x1, y + 26, { size: 20, color: T.ink, alpha: a });
    tx(q, x1, y + 50, { size: 15, color: T.thread, alpha: a });
    outlinePill("change", x1 + w1, y + 14, { size: 14, h: 38, align: "right", alpha: a });
    inkPill("logBtn", x1 + w1 - txW("change", 14, 700) - 44, y + 14, { size: 14, h: 38, align: "right", alpha: a, press: i === 0 ? press : 0 });
    line([[x1, y + 66], [x1 + w1, y + 66]], T.seam, 1, a);
  });
  // the tapped food lands
  const kd = seg(t, tap + 0.3, tap + 1.4);
  if (kd > 0) { towelBand(x1, 390, 90, 50, ["starch", "dairy"], kd); heading("Breakfast", x1 + 106, 424, 22, seg(kd, 0.3, 0.8)); }
  const ko = seg(t, a0 + 1.0, a0 + 1.5);
  heading("often", x1, 498, 22, ko);
  tx("Apple", x1, 530, { size: 19, color: T.ink, alpha: ko });
  tx("oftenTimes", x1 + w1, 530, { size: 15, color: T.thread, align: "right", alpha: ko });
  // column 2: saved meals and recipes
  const x2 = 480, w2 = 340, k2 = seg(t, a1, a1 + 0.5);
  heading("saved", x2, 120, 26, k2);
  line([[x2, 136], [x2 + w2, 136]], T.ink, 2, k2);
  [["Weekday breakfast", "3 foods", ["starch", "dairy", "veg"]], ["Lentil soup", "4 servings", ["protein", "veg"]]].forEach(([n, m, g], i) => {
    const y = 156 + i * 96, a = seg(t, a1 + 0.3 + i * 0.3, a1 + 0.8 + i * 0.3);
    if (a <= 0) return;
    sewnLabel("", x2, y, { size: 15, h: 80, padX: w2 / 2, alpha: a });
    towelBand(x2 + 16, y + 16, 60, 48, g, a);
    tx(n, x2 + 92, y + 36, { size: 20, weight: 700, color: T.ink, alpha: a });
    tx(m, x2 + 92, y + 62, { size: 15, color: T.thread, alpha: a });
  });
  // column 3: log it again, copy a day
  const x3 = 880, w3 = 320, b1 = a1 + 1.4, b2 = a1 + 2.6;
  inkPill("again", x3, 104, { size: 17, h: 48, alpha: seg(t, b1, b1 + 0.4) });
  const kc = seg(t, b2, b2 + 0.4);
  outlinePill("copyDay", x3, 170, { size: 17, h: 48, alpha: kc });
  // an earlier day, copied onto today
  const day = ["veg", "protein", "starch"], ty = 260;
  if (kc > 0) {
    [["tue", 0], ["today", 1]].forEach(([lab, j]) => {
      const cx = x3 + 60 + j * 180, a = j === 0 ? kc : seg(t, b2 + 0.2, b2 + 0.6);
      tx(lab, cx, ty, { size: 17, weight: j ? 800 : 600, color: T.ink, align: "center", alpha: a });
      panel(cx - 40, ty + 16, 80, 210, { r: 4, fill: T.raised, stroke: j ? T.ink : T.controlRaised, lw: j ? 2.5 : 1.5, alpha: a });
      if (j === 0) towelBand(cx - 34, ty + 40, 68, 160, day, 1, { alpha: a });
      else towelBand(cx - 34, ty + 40, 68, 160, day, seg(t, b2 + 0.9, b2 + 2.4), { alpha: a });
    });
    arrow(x3 + 112, ty + 120, x3 + 186, ty + 120, seg(t, b2 + 0.5, b2 + 1.0), T.ink);
  }
  void w3;
}

/* ------------------------------------------------------------- 7 lands */
function sLands(t, d, cues) {
  const a1 = at(cues, 1, 2.2), a2 = at(cues, 2, 9.0);
  display("neverFails", 80, 120, 60, seg(t, 0.2, 0.8));
  // three conditions, one landing
  const conds = ["offline", "noAi", "unknown"], hit = [a1 + 0.1, a1 + 0.9, a1 + 1.9];
  conds.forEach((k, i) => {
    const y = 170 + i * 84, a = seg(t, hit[i], hit[i] + 0.4);
    const w = sewnLabel(k, 80, y, { size: 20, alpha: a });
    arrow(80 + w + 16, y + 24, 560, 300, seg(t, hit[i] + 0.3, hit[i] + 0.9), T.ink);
  });
  const kl = seg(t, a1 + 3.0, a1 + 5.0);
  if (kl > 0 || t > a1 + 2.6) {
    dayTowel(590, 236, 610, [{ name: "Lunch", time: "12:40", groups: ["veg", "protein", "starch"], food: "Lentils, tomato, bread",
      summary: "closest", k: kl }], 1, { size: 28, field: 130, bandH: 150, alpha: seg(t, a1 + 2.6, a1 + 3.0) });
  }
  // the guide
  const kg = seg(t, a2, a2 + 0.5), ku = seg(t, a2 + 0.5, a2 + 1.0);
  towelBand(80, 470, 1120, 26, ALL, seg(t, a2 - 0.2, a2 + 1.2), { gap: 0.4 });
  tx("guide", 80, 548, { size: 32, weight: 800, color: T.ink, alpha: kg, spacing: "-0.6px" });
  const uw = txW("url", 22, 600);
  tx("url", 80, 590, { size: 22, weight: 600, color: T.ink, alpha: ku });
  line([[80, 598], [80 + uw, 598]], T.ink, 1.5, ku);
}

/* -------------------------------------------------------------- start */
const imagesReady = Promise.all([
  loadImg("consent", "../shots/log-a-plate-photo-consent.webp"),
  loadImg("notice", "../shots/log-a-plate-barcode-notice.webp"),
]);
torchonVideo({
  title: { en: "Log a plate" },
  kicker: { en: "AI Nutrition Coach, in video" },
  langs: ["en"],
  strings: STR,
  poster: "words",
  scenes: { intro: sIntro, snapshot: sSnapshot, barcode: sBarcode, typeit: sTypeit, words: sWords, shortcuts: sShortcuts, lands: sLands },
});
/* Exports and stills wait for the two screenshots as well as the fonts. (The poster scene,
 * "words", draws no screenshot, so the first frame never depends on them.) */
window.videoReady = Promise.all([window.videoReady, imagesReady]).then(([ok]) => ok);
