/* ==========================================================================
 * torchon.js — the shared "Torchon" drawing kit of the AI Nutrition Coach videos.
 *
 * Load it after engine/engine.js and before an episode's timing.js / scenes.js:
 *
 *   <link rel="stylesheet" href="../engine/player.css">
 *   <link rel="stylesheet" href="../torchon.css">
 *   <script src="../engine/engine.js"></script>
 *   <script src="../torchon.js"></script>
 *   <script src="timing.js"></script>
 *   <script src="scenes.js"></script>
 *
 * then end scenes.js with   torchonVideo({ title, kicker, langs, strings, poster, scenes })
 * (theme, cotton background and fonts are filled in for you).
 *
 * The visual world is DESIGN.md: white cotton with a faint two-way weave, warm ink,
 * four dyes that each mean one food group and are always named, absence drawn as a
 * dashed seam, Schibsted Grotesk only (900 tight names, 400 sentences, sentence case),
 * pills with a 2px ink edge, sewn labels with an inset dashed stitch, flat (no shadow
 * except the floating Log pill). Signature motion: stripes woven in from the left,
 * one after another.
 *
 * Every helper is a pure function of its arguments (pass progress k or time t):
 * no state between frames, no randomness.
 * Positions are in the engine's 1280×720 logical units unless said otherwise;
 * `y` is the TOP edge for boxes (labels, pills, bars) and the baseline for text.
 * ======================================================================== */
"use strict";

/* ------------------------------ palette ---------------------------------- */
const T = {
  cloth: "#FBFBF8", raised: "#FFFFFF", ink: "#262421", soft: "#4A453F", thread: "#6B655E",
  seam: "#E4E1DA", control: "#8A847B", controlRaised: "#857F76",
  veg: "#1F7A4D", protein: "#B5262E", starch: "#C08420", dairy: "#2D5DA8",
};
/* The four food groups, in their fixed order. Names are overridable per language
 * through strings g_veg, g_protein, g_starch, g_dairy. */
const GROUPS = [
  { key: "veg", name: "Veg & fruit", color: T.veg },
  { key: "protein", name: "Protein", color: T.protein },
  { key: "starch", name: "Starch", color: T.starch },
  { key: "dairy", name: "Dairy", color: T.dairy },
];
const groupName = g => (window.S && S["g_" + g.key]) || g.name;
const SG = '"Schibsted Grotesk", system-ui, sans-serif';

/* Engine colours mapped onto the Torchon palette (progress line, default helpers). */
const TORCHON_THEME = {
  bg: T.cloth, bg2: T.cloth, panel: T.raised, panel2: T.raised, line: T.seam,
  ink: T.ink, soft: T.soft, faint: T.thread, accent: T.ink, accent2: T.soft,
  good: T.ink, warn: T.soft, bad: T.ink, deep: T.raised, term: T.ink, termInk: T.cloth,
};
const TORCHON_FONTS = [400, 500, 600, 700, 800, 900].map(w => `${w} 20px "Schibsted Grotesk"`);

/* ------------------------------ motion ----------------------------------- */
/* The weave easing, cubic-bezier(0.16, 1, 0.3, 1). */
function weaveEase(k) {
  k = clamp(k);
  if (k === 0 || k === 1) return k;
  const x1 = 0.16, y1 = 1, x2 = 0.3, y2 = 1;
  const bx = s => 3 * x1 * s * (1 - s) ** 2 + 3 * x2 * s * s * (1 - s) + s ** 3;
  let lo = 0, hi = 1, s = k;
  for (let i = 0; i < 24; i++) { s = (lo + hi) / 2; if (bx(s) < k) lo = s; else hi = s; }
  return 3 * y1 * s * (1 - s) ** 2 + 3 * y2 * s * s * (1 - s) + s ** 3;
}
/* Progress of the i-th stripe woven in from `start` (seconds): one after another. */
function woven(t, start, i = 0, dur = 0.6, stagger = 0.14) {
  return weaveEase(seg(t, start + i * stagger, start + i * stagger + dur));
}
/* Progress of stripe i of n when a whole group of stripes shares one 0..1 `k`. */
function stripeK(k, i, n, overlap = 0.55) {
  if (n <= 1) return weaveEase(k);
  const span = 1 / (1 + (n - 1) * (1 - overlap));
  const a = i * span * (1 - overlap);
  return weaveEase(seg(k, a, a + span));
}

/* ---------------------------- background --------------------------------- */
let _weave = null;
function weaveTile() {
  if (_weave) return _weave;
  const c = document.createElement("canvas"); c.width = 6; c.height = 6;
  const g = c.getContext("2d");
  g.fillStyle = "rgba(38,36,33,0.035)"; g.fillRect(0, 0, 6, 1); g.fillRect(0, 3, 6, 1);
  g.fillStyle = "rgba(38,36,33,0.025)"; g.fillRect(0, 0, 1, 6); g.fillRect(3, 0, 1, 6);
  return (_weave = c);
}
/* White cotton with a faint 1px two-way weave, over the rectangle (default: the frame). */
function cotton(x = 0, y = 0, w = W, h = H, fill = T.cloth) {
  ctx.save();
  ctx.fillStyle = fill; ctx.fillRect(x, y, w, h);
  ctx.fillStyle = ctx.createPattern(weaveTile(), "repeat"); ctx.fillRect(x, y, w, h);
  ctx.restore();
}

/* ------------------------------- text ------------------------------------ */
/* An on-screen string: S[key] when the key exists in STR, the text itself otherwise. */
const say = s => (window.S && typeof S[s] === "string" ? S[s] : s);
/* Text in Schibsted Grotesk; `s` may be an STR key. */
function tx(s, x, y, o = {}) { text(say(s), x, y, Object.assign({ font: SG }, o)); }
function txW(s, size, weight = 400) { return measure(say(s), size, weight, SG); }
/* Wrapped sentence in Schibsted Grotesk; returns its height. */
function body(s, x, y, maxW, o = {}) {
  return para(say(s), x, y, maxW, Object.assign({ font: SG, size: 20, color: T.soft }, o));
}
/* A heavy, tight name (DESIGN Display): rises 14px and fades in as k goes 0→1. */
function display(s, x, y, size = 64, k = 1, o = {}) {
  if (k <= 0) return;
  tx(s, x, y + (1 - outCubic(k)) * 14, Object.assign({ size, weight: 900, color: T.ink, alpha: clamp(k),
    spacing: `${(-0.035 * size).toFixed(2)}px` }, o));
}
/* Headline (800) — meal names, sheet titles. */
function heading(s, x, y, size = 30, k = 1, o = {}) {
  if (k <= 0) return;
  tx(s, x, y + (1 - outCubic(k)) * 10, Object.assign({ size, weight: 800, color: T.ink, alpha: clamp(k),
    spacing: `${(-0.02 * size).toFixed(2)}px` }, o));
}

/* ----------------------------- primitives -------------------------------- */
function dashedRect(x, y, w, h, r, color, lw = 1.5, dash = [5, 4], alpha = 1) {
  ctx.save(); ctx.globalAlpha *= alpha; rr(x, y, w, h, r);
  ctx.setLineDash(dash); ctx.strokeStyle = color; ctx.lineWidth = lw; ctx.stroke(); ctx.restore();
}
/* Absence: a dashed seam line (bare cotton). */
function gapLine(x1, y, x2, o = {}) {
  line([[x1, y], [x2, y]], o.color ?? T.seam, o.lw ?? 3, o.alpha ?? 1, o.dash ?? [8, 6]);
}
/* An ink stroke drawn on from (x1, y1) to (x2, y2) as k goes 0→1: "crossed out". */
function strike(x1, y1, x2, y2, k, o = {}) {
  if (k <= 0) return;
  const e = outCubic(clamp(k));
  ctx.save(); ctx.lineCap = "round";
  line([[x1, y1], [lerp(x1, x2, e), lerp(y1, y2, e)]], o.color ?? T.ink, o.lw ?? 5, o.alpha ?? 1);
  ctx.restore();
}

/* ------------------------------ stripes ---------------------------------- */
/* Normalise a groups argument: ["veg", "starch"] or {veg: 1, …} → Set of keys. */
function groupSet(g) {
  if (!g) return new Set();
  if (g instanceof Set) return g;
  if (Array.isArray(g)) return new Set(g);
  return new Set(Object.keys(g).filter(k => g[k]));
}
/* One woven band: four stripe rows in group order inside (x, y, w, h). Groups on the
 * plate are dyed stripes woven in from the left one after another as k goes 0→1;
 * absent groups are bare cotton (a dashed seam row).
 * o: {gap: row gap as a share of a row (0.6), bare: alpha of bare rows, rowH} */
function towelBand(x, y, w, h, groups, k = 1, o = {}) {
  const on = groupSet(groups), gapR = o.gap ?? 0.6;
  const rowH = o.rowH ?? h / (4 + 3 * gapR), step = o.rowH ? (h - rowH) / 3 : rowH * (1 + gapR);
  const present = GROUPS.filter(g => on.has(g.key));
  const bareA = (o.bare ?? 1) * seg(k, 0, 0.25) * (o.alpha ?? 1);
  GROUPS.forEach((g, i) => {
    const ry = y + i * step;
    if (!on.has(g.key)) {
      ctx.save(); ctx.globalAlpha *= bareA; ctx.beginPath(); ctx.setLineDash([Math.max(4, rowH * 0.6), Math.max(3, rowH * 0.4)]);
      ctx.moveTo(x, ry + rowH / 2); ctx.lineTo(x + w, ry + rowH / 2);
      ctx.strokeStyle = T.seam; ctx.lineWidth = rowH; ctx.stroke(); ctx.restore();
      return;
    }
    const kk = stripeK(k, present.indexOf(g), present.length);
    if (kk <= 0) return;
    ctx.save(); ctx.globalAlpha *= o.alpha ?? 1; ctx.fillStyle = g.color;
    ctx.fillRect(x, ry, w * kk, rowH); ctx.restore();
  });
}
/* An open meal: an empty band with a dashed control outline, rounded at its right end. */
function openBand(x, y, w, h, o = {}) {
  dashedRect(x, y, w, h, [0, 8, 8, 0], T.control, 2, [6, 5], o.alpha ?? 1);
}
/* The four dyes with their names. Returns the width. o: {size, gap, k (stagger in)} */
function legend(x, y, o = {}) {
  const size = o.size ?? 16, sw = size * 1.35, gap = o.gap ?? size * 1.2;
  let cx = x;
  GROUPS.forEach((g, i) => {
    const a = (o.alpha ?? 1) * (o.k === undefined ? 1 : seg(o.k, i * 0.15, i * 0.15 + 0.4));
    ctx.save(); ctx.globalAlpha *= a; ctx.fillStyle = g.color; ctx.fillRect(cx, y - size * 0.62, sw, size * 0.42); ctx.restore();
    tx(groupName(g), cx + sw + size * 0.4, y, { size, weight: 600, color: o.color ?? T.soft, alpha: a });
    cx += sw + size * 0.4 + txW(groupName(g), size, 600) + gap;
  });
  return cx - gap - x;
}

/* --------------------------- labels and pills ---------------------------- */
/* Sewn label: white, 2px ink edge, 4px corners, a dashed stitch 3px inside, optional
 * status dot. y is the top. Returns its width. o: {size (label type, 15), h, dot, alpha, fill, color} */
function sewnLabel(s, x, y, o = {}) {
  const size = o.size ?? 15, h = o.h ?? Math.round(size * 2.4), pad = o.padX ?? size * 0.85;
  const dotW = o.dot ? size * 0.9 : 0, label = say(s);
  const w = txW(label, size, o.weight ?? 600) + pad * 2 + dotW;
  const ax = o.align === "center" ? x - w / 2 : o.align === "right" ? x - w : x;
  const a = o.alpha ?? 1, ink = o.color ?? T.ink;
  if (a <= 0) return w;
  panel(ax, y, w, h, { r: 4, fill: o.fill ?? T.raised, stroke: ink, lw: 2, alpha: a });
  ctx.save(); ctx.globalAlpha *= a * 0.35; rr(ax + 3.5, y + 3.5, w - 7, h - 7, 2);
  ctx.setLineDash([4, 3]); ctx.strokeStyle = ink; ctx.lineWidth = 1.5; ctx.stroke(); ctx.restore();
  if (o.dot) dot(ax + pad + size * 0.3, y + h / 2, size * 0.3, ink, a);
  tx(label, ax + pad + dotW, y + h / 2 + size * 0.36, { size, weight: o.weight ?? 600, color: ink, alpha: a });
  return w;
}
function _pill(s, x, y, o, filled) {
  const size = o.size ?? 18, h = o.h ?? Math.round(size * 2.6), pad = o.padX ?? size * 1.1, label = say(s);
  const w = Math.max(h, txW(label, size, 700) + pad * 2);
  const ax = o.align === "center" ? x - w / 2 : o.align === "right" ? x - w : x;
  const a = o.alpha ?? 1;
  if (a <= 0) return w;
  const sc = 1 - 0.02 * clamp(o.press ?? 0);
  ctx.save(); ctx.translate(ax + w / 2, y + h / 2); ctx.scale(sc, sc); ctx.translate(-(ax + w / 2), -(y + h / 2));
  if (o.shadow) {
    ctx.save(); ctx.globalAlpha *= a; ctx.shadowColor = "rgba(38,36,33,0.7)"; ctx.shadowBlur = 22; ctx.shadowOffsetY = 10;
    rr(ax, y, w, h, h / 2); ctx.fillStyle = filled ? T.ink : T.raised; ctx.fill(); ctx.restore();
  }
  if (o.dashed) dashedRect(ax + 1, y + 1, w - 2, h - 2, h / 2, T.control, 2, [6, 4], a * 0.6);
  else panel(ax + 1, y + 1, w - 2, h - 2, { r: h / 2, fill: filled ? T.ink : (o.fill ?? "rgba(0,0,0,0)"), stroke: o.edge ?? T.ink, lw: 2, alpha: a });
  tx(label, ax + w / 2, y + h / 2 + size * 0.36, { size, weight: 700, color: filled ? T.cloth : T.ink, align: "center", alpha: a * (o.dashed ? 0.6 : 1) });
  ctx.restore();
  return w;
}
/* Primary pill: ink fill, cotton label. y is the top; returns the width.
 * o: {size, h, align, alpha, press (0..1 → scale 0.98), shadow (floating Log pill only)} */
function inkPill(s, x, y, o = {}) { return _pill(s, x, y, o, true); }
/* Secondary pill: transparent, 2px ink edge (o.edge to change), o.dashed = disabled/busy. */
function outlinePill(s, x, y, o = {}) { return _pill(s, x, y, o, false); }

/* Coach label: white, 2px ink edge, 8px corners, stitch, one question, Sure / Ask later.
 * y is the top; returns its height. o: {size, alpha, rise (0..1), sure, later, mark, pressLater} */
function coachLabel(q, x, y, w, o = {}) {
  const size = o.size ?? 20, pad = size * 0.9, a = o.alpha ?? 1;
  const lines = wrap(say(q), w - pad * 2, size, 400, SG), lh = size * 1.45;
  const ph = Math.round(size * 2.4), mark = o.mark ? size * 1.4 : 0;
  const h = pad + lines.length * lh + mark + size * 0.6 + ph + pad;
  if (a <= 0) return h;
  const dy = (1 - outCubic(clamp(o.rise ?? 1))) * 8;
  ctx.save(); ctx.translate(0, dy);
  panel(x, y, w, h, { r: 8, fill: T.raised, stroke: T.ink, lw: 2, alpha: a });
  ctx.save(); ctx.globalAlpha *= a * 0.35; rr(x + 4, y + 4, w - 8, h - 8, 5);
  ctx.setLineDash([4, 3]); ctx.strokeStyle = T.ink; ctx.lineWidth = 1.5; ctx.stroke(); ctx.restore();
  lines.forEach((l, i) => tx(l, x + pad, y + pad + size + i * lh - size * 0.2, { size, color: T.ink, alpha: a }));
  if (o.mark) tx(o.mark, x + pad, y + pad + lines.length * lh + size * 0.7, { size: size * 0.75, color: T.thread, alpha: a });
  const py = y + pad + lines.length * lh + mark + size * 0.4;
  const sw = inkPill(o.sure ?? "Sure", x + pad, py, { size: size * 0.9, h: ph, alpha: a });
  outlinePill(o.later ?? "Ask later", x + pad + sw + size * 0.5, py, { size: size * 0.9, h: ph, alpha: a, press: o.pressLater });
  ctx.restore();
  return h;
}

/* ----------------------------- the day ----------------------------------- */
/* One day as woven meal bands, like the Today screen. y is the top; returns the height.
 * meals: [{name, time, groups, food, summary, open, k, breath}] — strings may be STR keys;
 *   m.k overrides that band's weave progress, m.breath (0.45..1) dims an open band ("reading").
 * k: 0→1 weaves the bands in one after another.
 * o: {field (stripe width, 104), bandH (132), size (meal name, 24), textW, rules, alpha} */
function dayTowel(x, y, w, meals, k = 1, o = {}) {
  const field = o.field ?? 104, bh = o.bandH ?? 132, size = o.size ?? 24, gapX = o.gapX ?? size * 0.7;
  const tx0 = x + field + gapX, tw = o.textW ?? (w - field - gapX), a = o.alpha ?? 1;
  meals.forEach((m, j) => {
    const by = y + j * bh, kj = m.k ?? seg(k, j / meals.length * 0.55, j / meals.length * 0.55 + 0.45);
    if (o.rules !== false) line([[x, by + bh], [x + w, by + bh]], T.seam, 1, a);
    const sh = bh * 0.44, sy = by + size * 0.55;
    if (m.open) openBand(x, sy, field, sh, { alpha: a * (m.breath ?? 1) });
    else towelBand(x, sy, field, sh, m.groups, kj, { alpha: a });
    const ta = a * seg(kj, 0.15, 0.6);
    heading(m.name, tx0, by + size * 1.25, size, ta > 0 ? 1 : 0, { alpha: ta });
    if (m.time) tx(m.time, tx0 + tw, by + size * 1.2, { size: size * 0.62, color: T.thread, align: "right", alpha: ta });
    let ly = by + size * 2.3;
    if (m.food) { tx(m.food, tx0, ly, { size: size * 0.7, color: T.ink, alpha: ta }); ly += size * 0.95; }
    if (m.summary) body(m.summary, tx0, ly, tw, { size: size * 0.6, alpha: ta });
  });
  return meals.length * bh;
}

/* ----------------------------- the week ---------------------------------- */
/* Seven towels side by side under weekday names, group names down the left.
 * days: [{label, groups, today, empty}]; k: 0→1 weaves the towels left to right.
 * o: {names (true), nameW (130), size (16), alpha} — y is the top of the day names row. */
function weekTowels(x, y, w, h, days, k = 1, o = {}) {
  const size = o.size ?? 16, nameW = o.names === false ? 0 : (o.nameW ?? 130), a = o.alpha ?? 1;
  const col = (w - nameW) / days.length, tw = Math.min(col * 0.62, o.towelW ?? 64);
  const top = y + size * 1.8, th = h - size * 1.8, rowH = Math.min(18, th / 9);
  const rowY = i => top + th * (0.16 + i * 0.22);
  if (nameW) GROUPS.forEach((g, i) => tx(groupName(g), x, rowY(i) + rowH * 0.5 + size * 0.36, { size, weight: 600, color: T.soft, alpha: a * seg(k, 0, 0.2) }));
  days.forEach((d, i) => {
    const cx = x + nameW + col * i + col / 2, tx0 = cx - tw / 2, kd = seg(k, i / days.length * 0.6, i / days.length * 0.6 + 0.4);
    tx(d.label, cx, y + size, { size, weight: d.today ? 800 : 600, color: T.ink, align: "center", alpha: a });
    if (d.today) line([[cx - txW(d.label, size, 800) / 2, y + size + 4], [cx + txW(d.label, size, 800) / 2, y + size + 4]], T.ink, 2, a);
    const on = groupSet(d.groups);
    if (!on.size) dashedRect(tx0, top, tw, th, 3, T.control, 1.5, [5, 4], a);
    else panel(tx0, top, tw, th, { r: 3, fill: T.raised, stroke: T.controlRaised, lw: 1.5, alpha: a });
    if (d.today) panel(tx0 - 5, top - 5, tw + 10, th + 10, { r: 7, fill: "rgba(0,0,0,0)", stroke: T.ink, lw: 2.5, alpha: a });
    const present = GROUPS.filter(g => on.has(g.key));
    GROUPS.forEach((g, gi) => {
      const ry = rowY(gi);
      if (!on.has(g.key)) {
        if (on.size) { ctx.save(); ctx.globalAlpha *= a * seg(kd, 0, 0.3); ctx.beginPath(); ctx.setLineDash([6, 4]);
          ctx.moveTo(tx0 + 3, ry + rowH / 2); ctx.lineTo(tx0 + tw - 3, ry + rowH / 2);
          ctx.strokeStyle = T.seam; ctx.lineWidth = rowH * 0.7; ctx.lineCap = "butt"; ctx.stroke(); ctx.restore(); }
        return;
      }
      const kk = stripeK(kd, present.indexOf(g), present.length);
      ctx.save(); ctx.globalAlpha *= a; ctx.fillStyle = g.color; ctx.fillRect(tx0 + 1, ry, (tw - 2) * kk, rowH); ctx.restore();
    });
  });
}

/* -------------------------- nutrient bars -------------------------------- */
/* One nutrient row (DESIGN Nutrient Bars). y is the top; returns the height.
 * n: {label, value, unit, ref, note, est (true → "~")}. The track is the reference
 * (bare cotton, dashed seam), the fill is soft ink, clamped at the end; an ink tick marks
 * the reference. The bar never animates: k only fades the row in. */
function nutrientBar(x, y, w, n, k = 1, o = {}) {
  const size = o.size ?? 20, a = clamp(k) * (o.alpha ?? 1);
  if (a <= 0) return o.rowH ?? size * 4.3;
  const val = `${n.est === false ? "" : "~"}${n.value} ${n.unit}`;
  tx(n.label, x, y + size, { size, color: T.ink, alpha: a });
  tx(val, x + w, y + size, { size: size * 1.05, weight: 700, color: T.ink, align: "right", alpha: a, spacing: "-0.2px" });
  const by = y + size * 1.75, f = clamp(n.value / n.ref);
  line([[x, by], [x + w, by]], T.seam, 4, a, [6, 5]);
  if (f > 0) line([[x + 2, by], [x + Math.max(2, w * f - 2), by]], T.soft, 5, a);
  line([[x + w, by - 8], [x + w, by + 8]], T.ink, 1.5, a);
  const pct = Math.round(100 * n.value / n.ref);
  const note = n.note ?? `about ${pct < 1 ? "less than 1" : pct}% of the EU reference intake (${n.ref} ${n.unit})`;
  tx(note, x, by + size * 1.25, { size: size * 0.78, color: T.soft, alpha: a });
  return o.rowH ?? size * 4.3;
}

/* ----------------------------- terminal ---------------------------------- */
/* An ink card for commands. lines = [{p: "$ ", s, a, b, c}] as in the engine's terminal():
 * a line appears at a (local time) and is typed until b. y is the top. o: {title, size, lh, alpha} */
function terminalCard(x, y, w, h, t, lines, o = {}) {
  const a = o.alpha ?? 1, size = o.size ?? 19, lh = o.lh ?? size * 1.65;
  panel(x, y, w, h, { r: 8, fill: T.ink, stroke: T.ink, lw: 2, alpha: a });
  if (o.title) tx(o.title, x + 24, y + 34, { size: 15, weight: 600, color: T.control, alpha: a });
  const top = y + (o.title ? 76 : 44), maxRows = Math.floor((y + h - top + lh * 0.5) / lh);
  const vis = lines.filter(l => t >= (l.a ?? 0));
  vis.slice(Math.max(0, vis.length - maxRows)).forEach((l, row) => {
    const ty = top + row * lh, kk = l.b === undefined ? 1 : seg(t, l.a ?? 0, l.b);
    const px = x + 24 + (l.p ? txW(l.p, size, 500) : 0);
    if (l.p) tx(l.p, x + 24, ty, { size, weight: 500, color: T.control, alpha: a });
    const s = typed(say(l.s), kk);
    tx(s, px, ty, { size, weight: l.w ?? 500, color: l.c ?? T.cloth, alpha: a });
    if (kk > 0 && kk < 1) { ctx.save(); ctx.globalAlpha *= a; ctx.fillStyle = T.cloth; ctx.fillRect(px + txW(s, size, 500) + 3, ty - size * 0.8, size * 0.5, size); ctx.restore(); }
  });
}

/* ----------------------------- requests ---------------------------------- */
/* A real outgoing request printed as text: method tag + URL typed with k.
 * y is the top; returns the height. o: {size, note, gated (k of the gate opening: until 1 the
 * URL is a dashed seam), alpha, maxW} */
function requestLine(x, y, method, url, k = 1, o = {}) {
  const size = o.size ?? 17, a = o.alpha ?? 1, h = Math.round(size * 2.1);
  if (a <= 0) return h;
  const mw = sewnLabel(method, x, y, { size: size * 0.82, h, alpha: a, weight: 700 });
  const ux = x + mw + size * 0.7, maxW = (o.maxW ?? 760) - mw - size * 0.7, open = o.gated === undefined ? 1 : clamp(o.gated);
  let s = say(url);
  while (s.length > 4 && txW(s, size, 500) > maxW) s = s.slice(0, -2);
  if (s !== say(url)) s = s.slice(0, -1) + "…";
  if (open < 1) gapLine(ux, y + h / 2, ux + maxW * 0.92, { color: T.control, lw: 2, dash: [7, 6], alpha: a * (1 - open) });
  if (open > 0) tx(typed(s, k), ux, y + h / 2 + size * 0.36, { size, weight: 500, color: T.ink, alpha: a * open });
  if (o.note) tx(o.note, ux, y + h + size * 1.15, { size: size * 0.9, color: T.thread, alpha: a });
  return h + (o.note ? size * 1.5 : 0);
}

/* ------------------------------ icons ------------------------------------ */
/* Padlock centred on (x, y), size s. o: {open (0..1 lifts the shackle), color, lw, alpha} */
function padlock(x, y, s, o = {}) {
  const a = o.alpha ?? 1, c = o.color ?? T.ink, lw = o.lw ?? Math.max(2, s * 0.09), lift = clamp(o.open ?? 0) * s * 0.28;
  if (a <= 0) return;
  ctx.save(); ctx.globalAlpha *= a; ctx.lineWidth = lw; ctx.strokeStyle = c; ctx.lineCap = "round";
  ctx.beginPath(); ctx.moveTo(x - s * 0.28, y - s * 0.05 - lift * 0.2);
  ctx.lineTo(x - s * 0.28, y - s * 0.28 - lift); ctx.arc(x, y - s * 0.28 - lift, s * 0.28, Math.PI, 0);
  ctx.lineTo(x + s * 0.28, y - s * 0.05 - lift * (o.open ? 0.6 : 0)); ctx.stroke();
  rr(x - s * 0.42, y - s * 0.06, s * 0.84, s * 0.62, s * 0.08); ctx.fillStyle = o.fill ?? T.raised; ctx.fill(); ctx.stroke();
  ctx.beginPath(); ctx.arc(x, y + s * 0.2, s * 0.07, 0, Math.PI * 2); ctx.fillStyle = c; ctx.fill();
  ctx.restore();
}
/* The app icon (a small towel, as public/favicon.svg) centred on (x, y), height s; k weaves it. */
function towelIcon(x, y, s, k = 1, o = {}) {
  const w = s * 0.73, a = o.alpha ?? 1;
  panel(x - w / 2, y - s / 2, w, s, { r: s * 0.07, fill: T.raised, stroke: T.ink, lw: Math.max(1.5, s * 0.05), alpha: a });
  towelBand(x - w / 2 + s * 0.025, y - s * 0.26, w - s * 0.05, s * 0.6, ["veg", "protein", "starch", "dairy"], k, { gap: 0.7, alpha: a });
}
/* "AI Nutrition Coach" set heavy, with the towel icon in front. y is the baseline. */
function wordmark(x, y, size = 72, k = 1, o = {}) {
  const name = o.name ?? "AI Nutrition Coach", iw = size * 0.95, gap = size * 0.35;
  const total = iw * 0.73 + gap + txW(name, size, 900) + (-0.035 * size) * name.length;
  const ax = o.align === "center" ? x - total / 2 : x;
  if (o.icon !== false) towelIcon(ax + iw * 0.365, y - size * 0.36, iw, k, { alpha: clamp(k * 3) });
  display(name, ax + iw * 0.73 + gap, y, size, seg(k, 0.1, 0.6));
  return total;
}

/* ------------------------------ the phone -------------------------------- */
/* A phone drawn at (x, y) — top-left — at `scale` of a 390×844 screen. drawContent(w, h)
 * runs in device units (0..390 × 0..844), clipped to the screen, on white cotton.
 * o: {alpha, edge} */
function phoneFrame(x, y, scale, drawContent, o = {}) {
  const Wd = 390, Hd = 844, a = o.alpha ?? 1;
  if (a <= 0) return;
  ctx.save(); ctx.globalAlpha *= a;
  ctx.translate(x, y); ctx.scale(scale, scale);
  rr(-12, -12, Wd + 24, Hd + 24, 58); ctx.fillStyle = o.edge ?? T.ink; ctx.fill();
  ctx.save(); rr(0, 0, Wd, Hd, 46); ctx.clip();
  if (scale >= 0.5) cotton(0, 0, Wd, Hd); else { ctx.fillStyle = T.cloth; ctx.fillRect(0, 0, Wd, Hd); }  // no weave moiré when small
  if (drawContent) drawContent(Wd, Hd);
  ctx.restore();
  rr(Wd / 2 - 52, 12, 104, 30, 15); ctx.fillStyle = o.edge ?? T.ink; ctx.fill();
  ctx.restore();
}
/* The app's Today screen, drawn natively in device units (call it inside phoneFrame).
 * o: {k (weave of the bands), meals, date, coach: {q, alpha, rise, pressLater, after (band index)},
 *     week (7 group lists for the dock towels), log (show the floating Log pill, true)} */
const DEMO_MEALS = [
  { name: "Breakfast", time: "08:10", groups: ["starch", "dairy"], food: "Oats, milk", summary: "Without veg & fruit and protein · ~310 kcal" },
  { name: "Lunch", time: "12:40", groups: ["veg", "protein", "starch"], food: "Lentils, tomato, bread", summary: "Without dairy · ~350 kcal" },
  { name: "Dinner", open: true, summary: "Nothing logged yet." },
];
function todayScreen(o = {}) {
  const k = o.k ?? 1, meals = o.meals ?? DEMO_MEALS;
  display(o.title ?? "Today", 20, 104, 50);
  tx(o.date ?? "22 Oct", 20, 134, { size: 17, color: T.thread });
  const cw = sewnLabel("On this device", 20, 156, { size: 14, h: 36, dot: true });
  outlinePill("Lock", 20 + cw + 10, 150, { size: 16, h: 48 });
  legend(20, 232, { size: 13, gap: 14 });
  let y = 254;
  meals.forEach((m, j) => {
    const kj = seg(k, j * 0.28, j * 0.28 + 0.5);
    dayTowel(0, y, 370, [m], kj, { field: 104, bandH: 132, size: 22, gapX: 16 });
    y += 132;
    if (o.coach && (o.coach.after ?? 0) === j) {
      const c = o.coach, ca = c.alpha ?? 1;
      if (ca > 0) {
        const h = coachLabel(c.q ?? "A simple start. What usually keeps you going until lunch?", 120, y + 10, 250,
          { size: 15.5, alpha: ca, rise: c.rise, pressLater: c.pressLater });
        y += (h + 20) * clamp(c.space ?? ca);
      }
    }
  });
  // dock: seven folded towels under a 2px ink edge
  ctx.save(); ctx.fillStyle = T.raised; ctx.fillRect(0, 760, 390, 84); ctx.restore();
  line([[0, 760], [390, 760]], T.ink, 2);
  const days = ["Fri", "Sat", "Sun", "Mon", "Tue", "Wed", "Today"], wk = o.week ?? [[], [], [], [], [], [], ["veg", "protein", "starch", "dairy"]];
  days.forEach((d, i) => {
    const cx = 28 + i * 55.5, on = groupSet(wk[i]);
    if (on.size) {
      panel(cx - 13, 772, 26, 32, { r: 3, fill: T.raised, stroke: i === 6 ? T.ink : T.controlRaised, lw: i === 6 ? 2 : 1.5 });
      GROUPS.forEach((g, gi) => { if (on.has(g.key)) { ctx.fillStyle = g.color; ctx.fillRect(cx - 10, 778 + gi * 6, 20, 3); } });
    } else dashedRect(cx - 13, 772, 26, 32, 3, T.control, 1.5, [4, 3]);
    tx(d, cx, 824, { size: 12, weight: i === 6 ? 800 : 400, color: T.ink, align: "center" });
  });
  if (o.log !== false) inkPill("+  Log", 370, 682, { size: 18, h: 56, align: "right", shadow: true });
}

/* -------------------------------- video ---------------------------------- */
/* VIDEO.create with the Torchon theme, cotton background and fonts filled in. */
function torchonVideo(def) {
  return VIDEO.create(Object.assign({
    theme: TORCHON_THEME,
    background: () => cotton(),
  }, def, { fonts: TORCHON_FONTS.concat(def.fonts || []) }));
}

Object.assign(window, {
  T, GROUPS, SG, TORCHON_THEME, TORCHON_FONTS, DEMO_MEALS,
  groupName, weaveEase, woven, stripeK, cotton, say, tx, txW, body, display, heading,
  dashedRect, gapLine, strike, groupSet, towelBand, openBand, legend,
  sewnLabel, inkPill, outlinePill, coachLabel, dayTowel, weekTowels, nutrientBar,
  terminalCard, requestLine, padlock, towelIcon, wordmark, phoneFrame, todayScreen, torchonVideo,
});
