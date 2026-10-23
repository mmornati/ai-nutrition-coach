/* AI Nutrition Coach — the trailer. Drawn with ./torchon.js on ./engine/engine.js.
 * Each scene is fn(t, d, cues), a pure function of t; animations hook onto the spoken
 * sentences with at(cues, i). All plates and numbers on screen are demo data. */
"use strict";

const STR = {
  en: {
    tagline: "Know what's on your plate, and keep it yours.",
    pTitle: "The usual food tracker",
    streak: "23-day streak", streakHint: "Don't break it.",
    over: "+340 kcal", overHint: "over budget",
    cloud: "Synced to their server", cloudHint: "Meals, photos, weight.",
    cTitle: "Log a plate", cNext: "Next meal: Dinner",
    snapshot: "Snapshot", snapshotHint: "One photo of the plate is plenty.",
    barcode: "Barcode", barcodeHint: "Packaged food",
    typeIt: "Type it", typeItHint: "Works offline",
    describe: "Describe", describeHint: "Say it or write it",
    paste: "Paste a recipe", pasteHint: "Nothing is fetched from the web",
    lunch: "Lunch", lunchMeta: "12:40 · demo plate", without: "Without dairy",
    onPlate: "On the plate", nutrition: "Nutrition", tilde: "~ marks an estimate",
    coachQ: "A simple start. What usually keeps you going until lunch?",
    coachWho: "The coach", costsNothing: "Dismissing it costs nothing.",
    wTitle: "This week", wDates: "16 – 22 October", noStreaks: "No streaks, no countdowns, no guilt.",
    stored: "Encrypted on this device", passphrase: "Passphrase", unlock: "Unlock",
    account: "Account", none: "none", telemetry: "Telemetry", off: "off",
    leaves: "What leaves the phone",
    offNote: "Only when you scan a barcode: product facts, no account.",
    photoQ: "Send this photo to api.example.com?", notNow: "Not now", sendPhoto: "Send this photo",
    aiNote: "Only when you say so. The AI is optional.",
    shTitle: "Open source, yours to run", mit: "MIT licence", install: "Install",
    url: "mmornati.github.io/ai-nutrition-coach", yours: "Yours to run.",
  },
};

const ALL = ["veg", "protein", "starch", "dairy"];
const ALARM = "#E0483A";  // the other trackers' alarm red: scene "problem" only, never a Torchon dye

/* ------------------------------------------------------------- 1 intro */
function sIntro(t, d, cues) {
  const a1 = at(cues, 1, 2.8);
  towelBand(0, 140, W, 150, ALL, seg(t, 0.15, 2.6));
  legend(80, 336, { size: 18, k: seg(t, 1.2, 2.6) });
  wordmark(80, 476, 84, seg(t, 0.7, 2.2));
  tx("tagline", 80, 540, { size: 32, color: T.soft, alpha: seg(t, a1, a1 + 0.6) });
}

/* ----------------------------------------------------------- 2 problem */
function card(x, y, w, h, k, struck) {
  const a = clamp(k) * (1 - 0.5 * clamp(struck));
  panel(x, y + (1 - outCubic(clamp(k))) * 16, w, h, { r: 8, fill: T.raised, stroke: T.control, lw: 2, alpha: a });
  return a;
}
function flame(cx, cy, s, a) {
  ctx.save(); ctx.globalAlpha *= a; ctx.beginPath();
  ctx.moveTo(cx, cy - s);
  ctx.bezierCurveTo(cx + s * 0.25, cy - s * 0.55, cx + s * 0.75, cy - s * 0.25, cx + s * 0.6, cy + s * 0.3);
  ctx.bezierCurveTo(cx + s * 0.5, cy + s * 0.75, cx - s * 0.5, cy + s * 0.75, cx - s * 0.6, cy + s * 0.3);
  ctx.bezierCurveTo(cx - s * 0.7, cy - s * 0.1, cx - s * 0.3, cy - s * 0.2, cx - s * 0.2, cy - s * 0.55);
  ctx.bezierCurveTo(cx - s * 0.05, cy - s * 0.35, cx + s * 0.05, cy - s * 0.6, cx, cy - s);
  ctx.fillStyle = T.ink; ctx.fill(); ctx.restore();
}
function cloudIcon(cx, cy, s, k, a) {
  ctx.save(); ctx.globalAlpha *= a; ctx.lineWidth = 4; ctx.strokeStyle = T.ink; ctx.beginPath();
  ctx.arc(cx - s * 0.45, cy + s * 0.1, s * 0.32, Math.PI * 0.5, Math.PI * 1.5);
  ctx.arc(cx - s * 0.05, cy - s * 0.2, s * 0.45, Math.PI * 1.05, Math.PI * 1.85);
  ctx.arc(cx + s * 0.5, cy + s * 0.1, s * 0.32, Math.PI * 1.5, Math.PI * 0.5);
  ctx.closePath(); ctx.stroke(); ctx.restore();
  const lift = ((Math.max(0, k) * 1.4) % 1);
  arrow(cx, cy + s * 0.9, cx, cy + s * 0.9 - lerp(s * 0.4, s * 1.0, lift), 1, T.ink, a);
}
function sProblem(t, d, cues) {
  const a0 = at(cues, 0, 0.5), a1 = at(cues, 1, 2.8), a2 = at(cues, 2, 5.9);
  display("pTitle", 80, 130, 56, seg(t, 0.1, 0.8));
  const y = 200, w = 340, h = 300, xs = [80, 470, 860];
  const st = [seg(t, a1 + 2.0, a1 + 2.5), seg(t, a1 + 2.4, a1 + 2.9), seg(t, a2 + 1.9, a2 + 2.4)];
  // 1 — the streak
  let a = card(xs[0], y, w, h, seg(t, a0, a0 + 0.5), st[0]);
  if (a > 0) {
    flame(xs[0] + w / 2, y + 100, 52, a);
    tx("streak", xs[0] + w / 2, y + 210, { size: 38, weight: 900, align: "center", alpha: a, spacing: "-1px" });
    tx("streakHint", xs[0] + w / 2, y + 250, { size: 20, color: T.soft, align: "center", alpha: a });
  }
  // 2 — the red number
  a = card(xs[1], y, w, h, seg(t, a1, a1 + 0.5), st[1]);
  if (a > 0) {
    const c0 = xs[1] + 40, cw = w - 80;
    line([[c0, y + 76], [c0 + cw * 0.72, y + 76]], T.seam, 10, a);
    line([[c0, y + 76], [c0 + cw * lerp(0.4, 1, outCubic(seg(t, a1 + 0.3, a1 + 1.4))), y + 76]], ALARM, 10, a);
    tx("over", xs[1] + w / 2, y + 190, { size: 64, weight: 900, color: ALARM, align: "center", alpha: a, spacing: "-2px" });
    tx("overHint", xs[1] + w / 2, y + 236, { size: 24, weight: 700, color: ALARM, align: "center", alpha: a });
  }
  // 3 — someone else's server
  a = card(xs[2], y, w, h, seg(t, a2, a2 + 0.5), st[2]);
  if (a > 0) {
    cloudIcon(xs[2] + w / 2, y + 96, 70, t - a2, a);
    tx("cloud", xs[2] + w / 2, y + 220, { size: 26, weight: 800, align: "center", alpha: a });
    tx("cloudHint", xs[2] + w / 2, y + 256, { size: 20, color: T.soft, align: "center", alpha: a });
  }
  xs.forEach((x, i) => strike(x - 14, y + h + 14, x + w + 14, y - 14, st[i], { lw: 6 }));
}

/* ----------------------------------------------------------- 3 capture */
function tileIcon(kind, x, y, color) {
  ctx.save(); ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = 2.5; ctx.lineJoin = "round";
  if (kind === "snapshot") {
    rr(x - 18, y - 10, 36, 26, 4); ctx.stroke(); ctx.beginPath(); ctx.arc(x, y + 3, 7, 0, 7); ctx.stroke();
    ctx.fillRect(x - 7, y - 15, 14, 5);
  } else if (kind === "barcode") {
    [0, 4, 7, 12, 15, 20, 24, 27, 31].forEach((dx, i) => ctx.fillRect(x - 17 + dx, y - 13, i % 3 ? 2 : 3, 26));
  } else if (kind === "typeIt") {
    [[-16, 16], [-16, 8], [-16, 12]].forEach(([a, b], i) => line([[x + a, y - 9 + i * 9], [x + b, y - 9 + i * 9]], color, 2.5));
  } else if (kind === "describe") {
    rr(x - 17, y - 14, 34, 22, 3); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x - 9, y + 8); ctx.lineTo(x - 11, y + 15); ctx.lineTo(x - 2, y + 8); ctx.stroke();
    line([[x - 9, y - 6], [x + 9, y - 6]], color, 2); line([[x - 9, y], [x + 4, y]], color, 2);
  } else if (kind === "paste") {
    rr(x - 13, y - 14, 26, 30, 3); ctx.stroke(); ctx.fillRect(x - 6, y - 18, 12, 6);
    line([[x - 7, y - 3], [x + 7, y - 3]], color, 2); line([[x - 7, y + 4], [x + 5, y + 4]], color, 2);
  }
  ctx.restore();
}
function tile(kind, x, y, w, h, k, hi, ink) {
  if (k <= 0) return;
  const a = clamp(k), lift = -6 * clamp(hi);
  ctx.save(); ctx.translate(0, (1 - outCubic(a)) * 14 + lift);
  panel(x, y, w, h, { r: 8, fill: ink ? T.ink : T.raised, stroke: T.ink, lw: 2, alpha: a });
  if (hi > 0) panel(x - 7, y - 7, w + 14, h + 14, { r: 12, fill: "rgba(0,0,0,0)", stroke: T.ink, lw: 3, alpha: a * clamp(hi) });
  const c = ink ? T.cloth : T.ink;
  tx(kind, x + 24, y + 46, { size: 28, weight: 800, color: c, alpha: a, spacing: "-0.5px" });
  tx(kind + "Hint", x + 24, y + h - 26, { size: 19, color: ink ? T.cloth : T.soft, alpha: a });
  ctx.globalAlpha *= a; tileIcon(kind, x + w - 44, y + 38, c);
  ctx.restore();
}
function sCapture(t, d, cues) {
  const a1 = at(cues, 1, 3.0);
  display("cTitle", 80, 120, 56, seg(t, 0.1, 0.7));
  tx("cNext", 80, 160, { size: 20, color: T.thread, alpha: seg(t, 0.3, 0.9) });
  // spoken order: snap, scan a barcode, type it, just say it
  const hiAt = [a1 + 0.05, a1 + 0.85, a1 + 1.85, a1 + 2.5];
  const hi = i => seg(t, hiAt[i], hiAt[i] + 0.25) * (i < 3 ? 1 - seg(t, hiAt[i + 1], hiAt[i + 1] + 0.25) : 1);
  const app = i => seg(t, 0.4 + i * 0.16, 0.9 + i * 0.16);
  tile("snapshot", 80, 190, 700, 140, app(0), hi(0), true);
  tile("barcode", 80, 350, 340, 116, app(1), hi(1));
  tile("typeIt", 440, 350, 340, 116, app(2), hi(2));
  tile("describe", 80, 486, 340, 116, app(3), hi(3));
  tile("paste", 440, 486, 340, 116, app(4), 0);
  // the phone: dinner is read, then woven
  const doneAt = hiAt[3] + 0.9, reading = t >= hiAt[0] + 0.3 && t < doneAt;
  const dinner = t < doneAt
    ? { name: "Dinner", open: true, summary: reading ? "Reading the plate…" : "Nothing logged yet.",
        breath: reading ? 0.725 + 0.275 * Math.cos((t - hiAt[0]) * Math.PI * 2 / 1.2) : 1 }
    : { name: "Dinner", time: "19:30", groups: ["veg", "protein", "starch"], food: "Salmon, rice, spinach",
        summary: "Without dairy · ~560 kcal", k: seg(t, doneAt, doneAt + 1.4) };
  phoneFrame(890, 56, 0.68, () => todayScreen({ meals: [DEMO_MEALS[0], DEMO_MEALS[1], dinner],
    week: [["starch"], ["veg", "protein"], [], ["veg", "starch", "dairy"], ["veg", "protein", "starch"], ["protein", "starch"], ALL] }),
    { alpha: seg(t, 0.2, 0.8) });
}

/* ------------------------------------------------------------- 4 plate */
const PLATE = [
  { food: "Lentils", qty: "~150 g", group: "protein" },
  { food: "Tomato", qty: "~120 g", group: "veg" },
  { food: "Bread", qty: "~40 g", group: "starch" },
  { food: "Olive oil", qty: "~5 g", group: null },
];
const NUTRIENTS = [
  { label: "Energy", value: 350, unit: "kcal", ref: 2000 },
  { label: "Protein", value: 18, unit: "g", ref: 50 },
  { label: "Carbohydrate", value: 55, unit: "g", ref: 260 },
  { label: "Fat", value: 7, unit: "g", ref: 70 },
  { label: "Salt", value: 0.6, unit: "g", ref: 6 },
];
function sPlate(t, d, cues) {
  const a1 = at(cues, 1, 8.8), e0 = atEnd(cues, 0, 8.4);
  display("lunch", 80, 128, 64, seg(t, 0.1, 0.7));
  tx("lunchMeta", 80, 164, { size: 20, color: T.thread, alpha: seg(t, 0.3, 0.9) });
  legend(80, 210, { size: 17, k: seg(t, 0.6, 1.8) });
  towelBand(80, 232, 470, 116, ["veg", "protein", "starch"], seg(t, 0.8, 3.2));
  tx("without", 80, 380, { size: 19, color: T.soft, alpha: seg(t, 2.6, 3.2) });
  // what is on the plate, in grams
  const kl = seg(t, 3.0, 3.6);
  tx("onPlate", 80, 430, { size: 18, weight: 700, color: T.thread, alpha: kl });
  line([[80, 444], [550, 444]], T.ink, 2, kl);
  PLATE.forEach((p, i) => {
    const y = 478 + i * 40, a = seg(t, 3.2 + i * 0.18, 3.7 + i * 0.18);
    tx(p.food, 80, y, { size: 20, color: T.ink, alpha: a });
    tx(p.qty, 550, y, { size: 20, weight: 700, color: T.ink, align: "right", alpha: a });
    const g = GROUPS.find(g => g.key === p.group);
    if (g) { ctx.save(); ctx.globalAlpha *= a; ctx.fillStyle = g.color; ctx.fillRect(250, y - 11, 24, 6); ctx.restore();
      tx(groupName(g), 282, y, { size: 16, weight: 600, color: T.soft, alpha: a }); }
    else { gapLine(250, y - 8, 274, { color: T.control, lw: 3, dash: [4, 3], alpha: a }); tx("Other", 282, y, { size: 16, weight: 600, color: T.soft, alpha: a }); }
    if (i < PLATE.length - 1) line([[80, y + 14], [550, y + 14]], T.seam, 1, a);
  });
  // nutrients against reference intakes
  const x = 660, w = 540, kn = seg(t, 4.4, 5.0);
  tx("nutrition", x, 128, { size: 18, weight: 700, color: T.thread, alpha: kn });
  line([[x, 142], [x + w, 142]], T.ink, 2, kn);
  NUTRIENTS.forEach((n, i) => nutrientBar(x, 158 + i * 86, w, n, seg(t, 4.6 + i * 0.35, 5.2 + i * 0.35), { size: 19, rowH: 86 }));
  // estimates are marked as estimates
  const ke = seg(t, a1, a1 + 0.5);
  if (ke > 0) {
    NUTRIENTS.forEach((n, i) => {
      const val = `~${n.value} ${n.unit}`, vw = txW(val, 19 * 1.05, 700);
      panel(x + w - vw - 12, 158 + i * 86 - 3, vw + 40, 28, { r: 14, fill: "rgba(0,0,0,0)", stroke: T.ink, lw: 2, alpha: ke });
    });
    sewnLabel("tilde", x + w, 62, { size: 16, align: "right", alpha: ke });
  }
  void e0;
}

/* ------------------------------------------------------------- 5 coach */
function sCoach(t, d, cues) {
  const a1 = at(cues, 1, 4.7);
  const press = seg(t, a1 + 0.2, a1 + 0.4) * (1 - seg(t, a1 + 0.55, a1 + 0.75));
  const gone = seg(t, a1 + 0.7, a1 + 1.3), rise = seg(t, 0.6, 1.0);
  phoneFrame(110, 46, 0.72, () => todayScreen({
    coach: { q: "coachQ", alpha: 1 - gone, rise, pressLater: press, space: 1 - outCubic(gone), after: 0 } }));
  tx("coachWho", 500, 176, { size: 20, weight: 700, color: T.thread, alpha: seg(t, 0.4, 0.9) * (1 - gone) });
  ctx.save(); ctx.translate(0, -24 * outCubic(gone));
  coachLabel("coachQ", 500, 200, 660, { size: 30, alpha: seg(t, 0.4, 1.0) * (1 - gone), rise, pressLater: press });
  ctx.restore();
  display("costsNothing", 500, 340, 46, seg(t, a1 + 1.0, a1 + 1.6));
}

/* -------------------------------------------------------------- 6 week */
const WEEK = [
  { label: "Fri", groups: ["veg", "starch", "dairy"] },
  { label: "Sat", groups: ["protein", "starch"] },
  { label: "Sun", groups: ["veg", "protein", "starch", "dairy"] },
  { label: "Mon", groups: ["starch", "dairy"] },
  { label: "Tue", groups: ["veg", "protein", "starch"] },
  { label: "Wed", groups: [] },
  { label: "Thu", groups: ["veg", "protein", "dairy"], today: true },
];
function sWeek(t, d, cues) {
  const a1 = at(cues, 1, 3.0);
  display("wTitle", 80, 120, 64, seg(t, 0.1, 0.7));
  tx("wDates", 80, 158, { size: 20, color: T.thread, alpha: seg(t, 0.3, 0.9) });
  weekTowels(80, 196, 1120, 360, WEEK, seg(t, 0.5, 3.4), { size: 18, nameW: 150, towelW: 74 });
  tx("noStreaks", 80, 614, { size: 30, weight: 700, color: T.ink, alpha: seg(t, a1 + 0.2, a1 + 0.8), spacing: "-0.5px" });
}

/* ------------------------------------------------------------- 7 trust */
function sTrust(t, d, cues) {
  const a1 = at(cues, 1, 5.0), a2 = at(cues, 2, 7.4);
  // left: the store, closed by the passphrase
  const kl = seg(t, 0.3, 0.9);
  padlock(140, 150, 92, { alpha: kl, open: 1 - seg(t, 2.6, 3.0) });
  sewnLabel("stored", 220, 128, { size: 18, dot: true, alpha: seg(t, 2.8, 3.3) });
  tx("passphrase", 80, 258, { size: 17, weight: 600, color: T.soft, alpha: kl });
  panel(80, 270, 470, 56, { r: 8, fill: T.raised, stroke: t > 1.0 && t < 2.6 ? T.ink : T.control, lw: 2, alpha: kl });
  tx("•".repeat(Math.round(14 * seg(t, 1.0, 2.2))), 98, 306, { size: 24, color: T.ink, alpha: kl, spacing: "2px" });
  inkPill("unlock", 80, 346, { size: 18, h: 48, alpha: kl, press: seg(t, 2.3, 2.45) * (1 - seg(t, 2.55, 2.7)) });
  // no account, zero telemetry
  [["account", "none"], ["telemetry", "off"]].forEach(([k, v], i) => {
    const y = 470 + i * 64, a = seg(t, a1 + i * 0.6, a1 + i * 0.6 + 0.5);
    tx(k, 80, y, { size: 24, weight: 700, color: T.ink, alpha: a });
    gapLine(240, y - 8, 240 + 200 * seg(t, a1 + i * 0.6, a1 + i * 0.6 + 0.8), { color: T.control, lw: 3, dash: [9, 7], alpha: a });
    tx(v, 460, y, { size: 24, color: T.thread, alpha: seg(t, a1 + i * 0.6 + 0.6, a1 + i * 0.6 + 1.0) });
  });
  // right: the only requests that ever leave
  const x = 640, kr = seg(t, a1 + 0.2, a1 + 0.8);
  heading("leaves", x, 140, 30, kr);
  line([[x, 158], [1200, 158]], T.ink, 2, kr);
  requestLine(x, 182, "GET", "world.openfoodfacts.org/api/v2/product/3017620422003?fields=product_name,nutriments,…",
    seg(t, a1 + 0.6, a1 + 1.8), { size: 15, alpha: kr, maxW: 560, note: "offNote" });
  // the photo leaves only on yes
  const kq = seg(t, a2 + 0.3, a2 + 0.8), send = a2 + 2.6;
  const qa = kq * (1 - 0.55 * seg(t, send + 0.4, send + 0.8));
  if (qa > 0) {
    panel(x, 300, 560, 140, { r: 8, fill: T.raised, stroke: T.ink, lw: 2, alpha: qa });
    tx("photoQ", x + 22, 342, { size: 21, weight: 800, color: T.ink, alpha: qa });
    const nw = outlinePill("notNow", x + 22, 368, { size: 17, h: 48, alpha: qa });
    inkPill("sendPhoto", x + 22 + nw + 12, 368, { size: 17, h: 48, alpha: qa, press: seg(t, send, send + 0.12) * (1 - seg(t, send + 0.2, send + 0.35)) });
  }
  requestLine(x, 470, "POST", "api.example.com/v1/chat/completions  ·  the photo, shrunk, no location",
    seg(t, send + 0.5, send + 1.7), { size: 17, alpha: kq, maxW: 560, gated: seg(t, send + 0.3, send + 0.6), note: "aiNote" });
}

/* ---------------------------------------------------------- 8 selfhost */
function installPhone(x, y, s, t, at0) {
  const done = seg(t, at0 + 0.35, at0 + 0.6);
  phoneFrame(x, y, s, (w) => {
    if (done < 1) {
      ctx.save(); ctx.globalAlpha *= 1 - done;
      panel(20, 64, w - 40, 52, { r: 26, fill: T.raised, stroke: T.controlRaised, lw: 2 });
      tx("plate.example.com", w / 2, 98, { size: 22, color: T.soft, align: "center" });
      display("Today", 24, 210, 50);
      inkPill("install", w / 2, 420, { size: 30, h: 76, align: "center", press: seg(t, at0, at0 + 0.12) });
      ctx.restore();
    }
    if (done > 0) {
      towelIcon(w / 2, 360, 150, seg(t, at0 + 0.5, at0 + 1.6), { alpha: done });
      tx("AI Nutrition Coach", w / 2, 490, { size: 28, weight: 700, align: "center", alpha: done });
    }
  }, { alpha: seg(t, at0 - 1.6, at0 - 1.1) });
}
function sSelfhost(t, d, cues) {
  display("shTitle", 80, 120, 56, seg(t, 0.1, 0.7));
  terminalCard(80, 170, 660, 236, t, [
    { p: "$ ", s: "export AI_NUTRITION_COACH_DOMAIN=plate.example.com", a: 0.5, b: 1.4 },
    { p: "$ ", s: "bin/ai-nutrition-coach up --tls", a: 1.6, b: 2.4 },
    { s: "ai-nutrition-coach: building ai-nutrition-coach:dev ...", a: 2.7, c: T.control },
    { s: "ai-nutrition-coach: starting compose stack ...", a: 3.2, c: T.control },
    { s: "ai-nutrition-coach is up at https://plate.example.com/", a: 3.7, w: 700 },
  ], { title: "your server", size: 18, alpha: seg(t, 0.2, 0.6) });
  sewnLabel("Open source", 80, 438, { size: 17, alpha: seg(t, 1.0, 1.5) });
  sewnLabel("mit", 80 + txW("Open source", 17, 600) + 52, 438, { size: 17, alpha: seg(t, 1.2, 1.7) });
  [[790, 196, 0.3, 4.9], [930, 170, 0.34, 5.4], [1080, 196, 0.3, 5.9]].forEach(([x, y, s, a0], i) => {
    const k = seg(t, a0 - 1.4, a0 - 0.6);
    if (k > 0) packets(740, 315, x + 4, y + 120, t, { n: 2, period: 1.1, color: T.ink, r: 3, alpha: k * (1 - seg(t, a0 + 0.4, a0 + 0.8)) });
    installPhone(x, y, s, t, a0);
    void i;
  });
}

/* ------------------------------------------------------------- 9 outro */
function sOutro(t, d, cues) {
  const a1 = at(cues, 1, 2.4);
  towelBand(0, 110, W, 120, ALL, seg(t, 0.1, 2.2));
  wordmark(W / 2, 390, 80, seg(t, 0.3, 1.6), { align: "center" });
  tx("yours", W / 2, 466, { size: 40, weight: 800, align: "center", alpha: seg(t, a1, a1 + 0.5), spacing: "-0.8px" });
  const ku = seg(t, a1 + 0.5, a1 + 1.1), uw = txW("url", 26, 600);
  tx("url", W / 2, 548, { size: 26, weight: 600, color: T.ink, align: "center", alpha: ku });
  line([[W / 2 - uw / 2, 558], [W / 2 + uw / 2, 558]], T.ink, 2, ku);
}

torchonVideo({
  title: { en: "AI Nutrition Coach, the short film" },
  kicker: { en: "Know what's on your plate, and keep it yours" },
  langs: ["en"],
  strings: STR,
  poster: "intro",
  scenes: {
    intro: sIntro, problem: sProblem, capture: sCapture, plate: sPlate, coach: sCoach,
    week: sWeek, trust: sTrust, selfhost: sSelfhost, outro: sOutro,
  },
});
