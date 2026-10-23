/* AI Nutrition Coach — episode "The day and the week". Drawn with ../torchon.js on
 * ../engine/engine.js. Each scene is fn(t, d, cues), a pure function of t; animations hook
 * onto the spoken sentences with at(cues, i). Every plate and number on screen is demo data.
 * Grounded in docs/guide/day-and-week.md and apps/web/src/i18n/en.ts (day, nutrition, week). */
"use strict";

const STR = {
  en: {
    kicker: "AI Nutrition Coach · guide",
    title: "The day and the week",
    lead: "One day at a time, and seven at once.",
    today: "Today", todayDate: "Thursday, 22 October", demo: "Demo plates",
    dyesTitle: "Four dyes, four groups",
    bareTitle: "Bare cotton",
    bareBody: "The group is not on this plate. A dashed line, never a warning colour.",
    openTitle: "An open band",
    openBody: "A meal still to come: Nothing logged yet.",
    lunch: "Lunch", lunchMeta: "12:40", onPlate: "On the plate", nutrition: "Nutrition",
    euRef: "EU reference intake", guide: "Your daily guide", profileNote: "Only with the optional profile",
    estTitle: "~ marks an estimate",
    estBody: "A value worked out from a guessed weight is never shown as exact.",
    subTitle: "Sugars and saturates, indented",
    subBody: "Each sits under the nutrient it belongs to.",
    gapTitle: "Gaps are said, never zero",
    gapBody: "Unknown is left empty.",
    coverage: "Based on 3 foods with a weight and nutrition data; 1 without.",
    settingsNutrition: "Settings  ›  Nutrition",
    switchTitle: "Show nutrition numbers",
    switchHelp: "If numbers about food feel stressful, you can hide nutrient values and bars. Weights and your meals stay.",
    stays: "Meals and weights stay",
    wTitle: "This week", wDates: "16 – 22 October",
    noteLead: "All four food groups showed up this week.",
    noteQuiet: "Veg & fruit was quiet on Sunday and Wednesday.",
    avgTitle: "Daily average", dayByDay: "Day by day",
    noScores: "No scores, no streaks, nothing in the red.",
    guideLabel: "Guide", guidePage: "Your day and your week",
    url: "mmornati.github.io/ai-nutrition-coach/docs/guide/day-and-week",
  },
};

const ALL = ["veg", "protein", "starch", "dairy"];

/* Ink outline closing in on an area, k 0→1 (no glow, no colour). */
function inkFrame(x, y, w, h, k, o = {}) {
  if (k <= 0) return;
  const p = (1 - outCubic(clamp(k))) * 14;
  panel(x - p, y - p, w + 2 * p, h + 2 * p, { r: o.r ?? 6, fill: "rgba(0,0,0,0)", stroke: T.ink, lw: 2.5, alpha: clamp(k) * (o.alpha ?? 1) });
}
/* A demo-data mark, bottom right. */
function demoMark(k) { tx("demo", 1200, 650, { size: 15, color: T.thread, align: "right", alpha: k }); }

/* ------------------------------------------------------------- 1 intro */
function sIntro(t, d, cues) {
  const a1 = at(cues, 1, 2.5);
  towelBand(0, 120, W, 150, ALL, seg(t, 0.15, 2.6));
  tx("kicker", 80, 360, { size: 22, weight: 600, color: T.thread, alpha: seg(t, 0.4, 1.0) });
  display("title", 80, 450, 84, seg(t, 0.7, 1.5));
  tx("lead", 80, 516, { size: 32, color: T.soft, alpha: seg(t, a1, a1 + 0.6) });
  legend(80, 600, { size: 18, k: seg(t, 1.2, 2.6) });
}

/* ------------------------------------------------------------- 2 board */
const MEALS = [
  { name: "Breakfast", time: "08:10", groups: ["starch", "dairy"], food: "Oats, milk", summary: "Without veg & fruit and protein · ~310 kcal" },
  { name: "Lunch", time: "12:40", groups: ["veg", "protein", "starch"], food: "Lentils, tomato, bread", summary: "Without dairy · ~340 kcal" },
  { name: "Dinner", open: true, summary: "Nothing logged yet." },
];
function sBoard(t, d, cues) {
  const a1 = at(cues, 1, 3.6), a2 = at(cues, 2, 9.3), a3 = at(cues, 3, 14.0);
  display("today", 80, 112, 60, seg(t, 0.1, 0.7));
  tx("todayDate", 80, 146, { size: 20, color: T.thread, alpha: seg(t, 0.3, 0.9) });
  const x = 80, y = 172, bh = 140, field = 220, size = 28;
  dayTowel(x, y, 600, MEALS, seg(t, 0.4, 3.0), { field, bandH: bh, size });
  const sy = j => y + j * bh + size * 0.55, sh = bh * 0.44;
  // left highlights, one per sentence
  const out = (b) => 1 - seg(t, b, b + 0.4);
  inkFrame(x - 8, sy(1) - 8, field + 16, sh + 16, seg(t, a1 + 0.2, a1 + 0.8) * out(a2));
  // breakfast: veg and protein rows are bare (rows 0 and 1 of the band)
  const rowH = sh / (4 + 3 * 0.6), step = rowH * 1.6;
  inkFrame(x - 8, sy(0) - 8, field + 16, step + rowH + 16, seg(t, a2 + 0.2, a2 + 0.8) * out(a3));
  inkFrame(x - 8, sy(2) - 8, field + 16, sh + 16, seg(t, a3 + 0.2, a3 + 0.8));
  // right column
  const rx = 760;
  heading("dyesTitle", rx, 200, 28, seg(t, a1, a1 + 0.5));
  GROUPS.forEach((g, i) => {
    const k = seg(t, a1 + 0.9 + i * 0.75, a1 + 1.3 + i * 0.75), yy = 240 + i * 36;
    ctx.save(); ctx.globalAlpha *= k; ctx.fillStyle = g.color; ctx.fillRect(rx, yy - 14, 56, 14); ctx.restore();
    tx(groupName(g), rx + 72, yy, { size: 22, weight: 600, color: T.ink, alpha: k });
  });
  const kb = seg(t, a2, a2 + 0.5);
  gapLine(rx, 410, rx + 56, { color: T.seam, lw: 12, dash: [8, 6], alpha: kb });
  heading("bareTitle", rx + 72, 418, 24, kb);
  body("bareBody", rx, 452, 430, { size: 19, alpha: kb });
  const ko = seg(t, a3, a3 + 0.5);
  openBand(rx, 532, 56, 26, { alpha: ko });
  heading("openTitle", rx + 72, 554, 24, ko);
  body("openBody", rx, 588, 430, { size: 19, alpha: ko });
  demoMark(seg(t, 1, 1.5));
}

/* ------------------------------------------------------------- 3 plate */
const FOODS = [
  { food: "Lentils", qty: "180 g", group: "protein" },
  { food: "Tomato", qty: "80 g", group: "veg" },
  { food: "Bread", qty: "≈40 g", group: "starch" },
];
// demo lunch; daily guide = a demo profile worth 2200 kcal, other nutrients scaled from it
const MAIN = [
  { label: "Energy", value: 340, unit: "kcal", ref: 2000, guide: 2200 },
  { label: "Protein", value: 23, unit: "g", ref: 50, guide: 55 },
  { label: "Carbohydrate", value: 51, unit: "g", ref: 260, guide: 286 },
  { label: "Fat", value: 2.3, unit: "g", ref: 70, guide: 77 },
];
function foodList(x, y, w, t0, t) {
  const kl = seg(t, t0, t0 + 0.5);
  tx("onPlate", x, y, { size: 18, weight: 700, color: T.thread, alpha: kl });
  line([[x, y + 14], [x + w, y + 14]], T.ink, 2, kl);
  FOODS.forEach((p, i) => {
    const yy = y + 56 + i * 64, a = seg(t, t0 + 0.3 + i * 0.25, t0 + 0.8 + i * 0.25);
    tx(p.food, x, yy, { size: 24, color: T.ink, alpha: a });
    tx(p.qty, x + w, yy, { size: 24, weight: 700, color: T.ink, align: "right", alpha: a });
    const g = GROUPS.find(g => g.key === p.group);
    ctx.save(); ctx.globalAlpha *= a; ctx.fillStyle = g.color; ctx.fillRect(x, yy + 14, 26, 7); ctx.restore();
    tx(groupName(g), x + 36, yy + 22, { size: 16, weight: 600, color: T.soft, alpha: a });
    if (i < FOODS.length - 1) line([[x, yy + 38], [x + w, yy + 38]], T.seam, 1, a);
  });
}
function refToggle(x, y, kg, a) {
  // two pills; the active one is ink-filled
  const w1 = (kg < 0.5 ? inkPill : outlinePill)("euRef", x, y, { size: 16, h: 42, alpha: a });
  (kg < 0.5 ? outlinePill : inkPill)("guide", x + w1 + 10, y, { size: 16, h: 42, alpha: a });
}
function sPlate(t, d, cues) {
  const a1 = at(cues, 1, 2.7), a2 = at(cues, 2, 5.7), e2 = atEnd(cues, 2, 14.3);
  // the lunch band, tapped, opens into its page
  const press = seg(t, 1.3, 1.45) * (1 - seg(t, 1.6, 1.75)), open = seg(t, 1.9, 2.5);
  if (open < 1) {
    ctx.save(); ctx.globalAlpha *= seg(t, 0, 0.4) * (1 - open);
    const sc = 1 - 0.02 * press; ctx.translate(380, 300); ctx.scale(sc, sc); ctx.translate(-380, -300);
    dayTowel(80, 230, 600, [MEALS[1]], 1, { field: 220, bandH: 140, size: 28 });
    inkFrame(72, 237, 616, 104, seg(t, 0.8, 1.2));
    ctx.restore();
  }
  display("lunch", 80, 124, 64, seg(t, 2.0, 2.6));
  tx("lunchMeta", 80, 160, { size: 20, color: T.thread, alpha: seg(t, 2.2, 2.8) });
  towelBand(80, 186, 480, 72, MEALS[1].groups, seg(t, 2.2, 3.6));
  foodList(80, 310, 480, a1, t);
  // nutrients against the reference, then against the daily guide
  const x = 660, w = 540, kn = seg(t, a2, a2 + 0.5);
  tx("nutrition", x, 124, { size: 18, weight: 700, color: T.thread, alpha: kn });
  line([[x, 138], [x + w, 138]], T.ink, 2, kn);
  const sw = a2 + 0.52 * (e2 - a2), kg = seg(t, sw, sw + 0.5);
  refToggle(x, 156, kg, kn);
  MAIN.forEach((n, i) => {
    const y = 226 + i * 92, k = seg(t, a2 + 0.4 + i * 0.3, a2 + 0.9 + i * 0.3);
    const pe = Math.round(100 * n.value / n.ref), pg = Math.round(100 * n.value / n.guide);
    const ue = n.unit === "kcal" ? `${n.ref} kcal` : `${n.ref} g`, ug = n.unit === "kcal" ? `${n.guide} kcal` : `${n.guide} g`;
    const fmtP = (p) => p < 1 ? "less than 1" : `${p}`;
    if (kg < 1) nutrientBar(x, y, w, Object.assign({}, n, {
      note: `about ${fmtP(pe)}% of the EU reference intake (${ue})` }), k * (1 - kg), { size: 19, rowH: 92 });
    if (kg > 0) nutrientBar(x, y, w, Object.assign({}, n, { ref: n.guide,
      note: `about ${fmtP(pg)}% of your daily guide (${ug})` }), k * kg, { size: 19, rowH: 92 });
  });
  sewnLabel("profileNote", x, 600, { size: 15, alpha: seg(t, sw + 0.4, sw + 0.9) });
}

/* ------------------------------------------------------------ 4 honest */
const ROWS = [
  { label: "Energy", value: 340, unit: "kcal", ref: 2000 },
  { label: "Protein", value: 23, unit: "g", ref: 50 },
  { label: "Carbohydrate", value: 51, unit: "g", ref: 260 },
  { label: "of which sugars", value: 4.4, unit: "g", ref: 90, sub: true },
  { label: "Fat", value: 2.3, unit: "g", ref: 70 },
  { label: "of which saturates", value: 0.5, unit: "g", ref: 20, sub: true },
  { label: "Fibre", value: 18, unit: "g", ref: 25 },
  { label: "Salt", value: 0.5, unit: "g", ref: 6 },
];
function sHonest(t, d, cues) {
  const a1 = at(cues, 1, 2.7), a2 = at(cues, 2, 7.2);
  const x = 660, w = 540, rh = 62, top = 96, size = 16;
  tx("nutrition", x, 72, { size: 18, weight: 700, color: T.thread, alpha: seg(t, 0, 0.4) });
  line([[x, 84], [x + w, 84]], T.ink, 2, seg(t, 0, 0.4));
  ROWS.forEach((n, i) => {
    const y = top + i * rh, k = seg(t, 0.1 + i * 0.08, 0.5 + i * 0.08);
    const pct = Math.round(100 * n.value / n.ref);
    nutrientBar(x, y, w, Object.assign({}, n, { label: n.sub ? "" : n.label,
      note: `about ${pct < 1 ? "less than 1" : pct}% of the EU reference intake (${n.ref} ${n.unit})` }), k, { size, rowH: rh });
    if (n.sub) tx(n.label, x + 26, y + size, { size, color: T.ink, alpha: k });
  });
  // 1 — the tilde, ringed on every value
  const ke = seg(t, 0.6, 1.1) * (1 - seg(t, a1, a1 + 0.4));
  if (ke > 0) ROWS.forEach((n, i) => {
    // an ink underline under the tilde alone, clear of the digits and of the reference tick
    const val = `~${n.value} ${n.unit}`, vw = txW(val, size * 1.05, 700), tw = txW("~", size * 1.05, 700);
    const ux = x + w - vw, uy = top + i * rh + size + 5;
    line([[ux - 1, uy], [ux - 1 + (tw + 2) * outCubic(ke), uy]], T.ink, 3, ke);
  });
  // 2 — the two indented rows, bracketed on the left
  const ks = seg(t, a1 + 0.3, a1 + 0.8) * (1 - seg(t, a2, a2 + 0.4));
  [3, 5].forEach(i => {
    const y = top + i * rh;
    line([[x + 10, y - 2], [x + 10, y + 10], [x + 20, y + 10]], T.ink, 2.5, ks);
    inkFrame(x - 10, y - 8, w + 20, rh - 2, ks, { r: 6 });
  });
  // 3 — what the total is based on
  const kc = seg(t, a2 + 0.3, a2 + 1.6);
  if (kc > 0) {
    tx(typed(say("coverage"), kc), x, 624, { size: 17, color: T.ink, alpha: 1 });
    inkFrame(x - 12, 602, w + 24, 34, seg(t, a2 + 1.6, a2 + 2.1));
  }
  // left: the three rules, one per sentence
  display("lunch", 80, 124, 64, seg(t, 0, 0.4));
  [["estTitle", "estBody", 0.4], ["subTitle", "subBody", a1], ["gapTitle", "gapBody", a2]].forEach(([h, b, s], i) => {
    const y = 220 + i * 140, k = seg(t, s, s + 0.5), cur = i === 2 ? 1 : 1 - 0.45 * seg(t, [a1, a2][i], [a1, a2][i] + 0.4);
    heading(h, 80, y, 30, k, { alpha: k * cur });
    body(b, 80, y + 34, 500, { size: 20, alpha: k * cur });
  });
}

/* -------------------------------------------------------------- 5 hide */
function toggleSwitch(x, y, on, a) {
  const w = 72, h = 40;
  panel(x, y, w, h, { r: h / 2, fill: on > 0.5 ? T.ink : T.raised, stroke: on > 0.5 ? T.ink : T.control, lw: 2, alpha: a });
  const kx = lerp(x + h / 2, x + w - h / 2, weaveEase(on));
  dot(kx, y + h / 2, h / 2 - 6, on > 0.5 ? T.cloth : T.control, a);
}
function sHide(t, d, cues) {
  const a0 = at(cues, 0, 0.5), a1 = at(cues, 1, 5.8), e0 = atEnd(cues, 0, 5.5);
  // left: Settings › Nutrition
  tx("settingsNutrition", 80, 110, { size: 20, weight: 600, color: T.thread, alpha: seg(t, 0.1, 0.6) });
  display("Nutrition", 80, 172, 56, seg(t, 0.2, 0.8));
  const kc = seg(t, a0 + 0.4, a0 + 0.9);
  panel(80, 210, 500, 164, { r: 8, fill: T.raised, stroke: T.ink, lw: 2, alpha: kc });
  tx("switchTitle", 104, 256, { size: 24, weight: 800, color: T.ink, alpha: kc });
  const flip = e0 - 0.9, on = 1 - seg(t, flip, flip + 0.35);
  toggleSwitch(484, 228, on, kc);
  body("switchHelp", 104, 296, 452, { size: 18, alpha: kc });
  // the press on the switch
  const press = seg(t, flip - 0.2, flip) * (1 - seg(t, flip + 0.1, flip + 0.3));
  if (press > 0) ring(520, 248, 30, T.ink, 2, press);
  // right: the plate, with its numbers going away
  const x = 680, w = 520, kr = seg(t, 0.4, 1.0);
  display("lunch", x, 124, 48, kr);
  foodList(x, 170, w, 0.5, t);
  const gone = seg(t, a1 + 0.2, a1 + 1.0);
  const kn = kr * (1 - gone);
  if (kn > 0) {
    ctx.save(); ctx.translate(0, 10 * outCubic(gone));
    tx("nutrition", x, 420, { size: 18, weight: 700, color: T.thread, alpha: kn });
    line([[x, 434], [x + w, 434]], T.ink, 2, kn);
    MAIN.slice(0, 2).forEach((n, i) => nutrientBar(x, 450 + i * 82, w, n, kn, { size: 18, rowH: 82 }));
    ctx.restore();
  }
  // the meal and its weights stay: frame them
  const ks = seg(t, a1 + 1.4, a1 + 1.9);
  inkFrame(x - 12, 152, w + 24, 236, ks);
  sewnLabel("stays", x, 420, { size: 17, dot: true, alpha: ks });
}

/* -------------------------------------------------------------- 6 week */
const WEEK = [
  { label: "Fri", name: "Fri", groups: ALL, plates: "3 plates" },
  { label: "Sat", name: "Sat", groups: [], plates: "No plates" },
  { label: "Sun", name: "Sun", groups: ["protein", "starch", "dairy"], plates: "3 plates" },
  { label: "Mon", name: "Mon", groups: ALL, plates: "3 plates" },
  { label: "Tue", name: "Tue", groups: ALL, plates: "4 plates" },
  { label: "Wed", name: "Wed", groups: ["protein", "starch", "dairy"], plates: "3 plates" },
  { label: "Thu", name: "Today", groups: ALL, plates: "3 plates", today: true },
];
const AVG = [
  { label: "Energy", value: 1640, unit: "kcal", ref: 2000, note: "about 82% of the EU reference intake (2000 kcal)" },
  { label: "Fibre", value: 19, unit: "g", ref: 25, note: "about 76% of the EU reference intake (25 g)" },
];
function sWeek(t, d, cues) {
  const a1 = at(cues, 1, 4.8), a2 = at(cues, 2, 8.8);
  display("wTitle", 80, 112, 60, seg(t, 0.1, 0.7));
  tx("wDates", 80, 146, { size: 20, color: T.thread, alpha: seg(t, 0.3, 0.9) });
  // the towels shrink to the left when the averages and the day list arrive
  const sl = inOut(seg(t, a2, a2 + 0.8));
  const ww = lerp(1120, 720, sl);
  weekTowels(80, 180, ww, lerp(340, 330, sl), WEEK, seg(t, 0.6, 3.6), { size: 18, nameW: 140, towelW: lerp(80, 60, sl) });
  const k1 = seg(t, a1, a1 + 0.5), k2 = seg(t, a1 + 1.4, a1 + 1.9);
  tx("noteLead", 80, 572, { size: 24, weight: 700, color: T.ink, alpha: k1 });
  tx("noteQuiet", 80, 606, { size: 22, color: T.soft, alpha: k2 });
  // the quiet days: frame the bare veg rows of Sunday and Wednesday
  const col = (ww - 140) / 7, top = 180 + 18 * 1.8, th = lerp(340, 330, sl) - 18 * 1.8;
  const kq = seg(t, a1 + 1.6, a1 + 2.1) * (1 - seg(t, a2 - 0.2, a2 + 0.2));
  [2, 5].forEach(i => { const cx = 80 + 140 + col * i + col / 2;
    inkFrame(cx - 34, top + th * 0.16 - 10, 68, 38, kq); });
  // right: daily averages, then day by day
  const x = 880, w = 320, kr = seg(t, a2 + 0.5, a2 + 1.0);
  if (kr > 0) {
    tx("avgTitle", x, 168, { size: 20, weight: 800, color: T.ink, alpha: kr });
    AVG.forEach((n, i) => nutrientBar(x, 184 + i * 68, w, n, seg(t, a2 + 0.7 + i * 0.3, a2 + 1.2 + i * 0.3), { size: 16, rowH: 68 }));
    const kd = seg(t, a2 + 1.4, a2 + 1.9);
    tx("dayByDay", x, 352, { size: 18, weight: 700, color: T.thread, alpha: kd });
    line([[x, 364], [x + w, 364]], T.ink, 2, kd);
    WEEK.forEach((dd, i) => {
      const y = 392 + i * 34, a = seg(t, a2 + 1.6 + i * 0.12, a2 + 2.0 + i * 0.12);
      tx(dd.name, x, y, { size: 18, weight: 800, color: T.ink, alpha: a });
      const on = groupSet(dd.groups);
      GROUPS.forEach((g, gi) => {
        const sx = x + 76 + gi * 30;
        if (on.has(g.key)) { ctx.save(); ctx.globalAlpha *= a; ctx.fillStyle = g.color; ctx.fillRect(sx, y - 11, 24, 7); ctx.restore(); }
        else dashedRect(sx, y - 11, 24, 7, 0, T.control, 1, [3, 2], a);
      });
      tx(dd.plates, x + w, y, { size: 15, color: T.soft, align: "right", alpha: a });
    });
  }
}

/* ------------------------------------------------------------- 7 outro */
function sOutro(t, d, cues) {
  const a1 = at(cues, 1, 3.4);
  towelBand(0, 90, W, 110, ALL, seg(t, 0.1, 2.0));
  display("noScores", W / 2, 320, 52, seg(t, 0.4, 1.0), { align: "center" });
  const kg = seg(t, a1, a1 + 0.5);
  const lw = sewnLabel("guideLabel", 0, -100, { size: 18, alpha: 0 }), pw = txW("guidePage", 36, 800);
  const total = lw + 20 + pw, gx = W / 2 - total / 2;
  sewnLabel("guideLabel", gx, 398, { size: 18, alpha: kg });
  heading("guidePage", gx + lw + 20, 436, 36, kg);
  const ku = seg(t, a1 + 0.5, a1 + 1.1), uw = txW("url", 22, 600);
  tx("url", W / 2, 510, { size: 22, weight: 600, color: T.ink, align: "center", alpha: ku });
  line([[W / 2 - uw / 2, 520], [W / 2 + uw / 2, 520]], T.ink, 2, ku);
  wordmark(W / 2, 616, 34, seg(t, 0.8, 2.0), { align: "center" });
}

torchonVideo({
  title: { en: "The day and the week" },
  kicker: { en: "AI Nutrition Coach · guide" },
  langs: ["en"],
  strings: STR,
  poster: "week",
  scenes: { intro: sIntro, board: sBoard, plate: sPlate, honest: sHonest, hide: sHide, week: sWeek, outro: sOutro },
});
