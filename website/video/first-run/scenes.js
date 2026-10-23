/* AI Nutrition Coach — episode "Your first plate" (docs/getting-started.md).
 * Drawn with ../torchon.js on ../engine/engine.js. Each scene is fn(t, d, cues), a pure
 * function of t; animations hook onto the spoken sentences with at(cues, i).
 * The screens are redrawn natively from apps/web/src/screens (gate, about, log, today) and
 * the English strings in apps/web/src/i18n/en.ts. The plate and the address are demo data. */
"use strict";

const STR = {
  en: {
    title: "Your first plate",
    lead: "From an empty phone to a logged meal, in a few minutes.",
    series: "AI Nutrition Coach · Getting started",
    // install
    iTitle: "Open it, then install it",
    https: "https://plate.example.com",
    http: "http://192.168.1.20:8080",
    secure: "A secure page: the encrypted store works.",
    insecure: "Plain HTTP on your network: not supported, on purpose.",
    iphone: "iPhone or iPad", iphoneSteps: "Safari › Share › Add to Home Screen › Add",
    android: "Android", androidSteps: "Chrome › menu › Install app",
    first: "Install first, then log",
    firstNote: "On iPhone, the installed app keeps its data apart from Safari's.",
    // passphrase (session.* in en.ts)
    createTitle1: "Protect your", createTitle2: "history",
    createExplain: "Choose a passphrase. It encrypts everything AI Nutrition Coach saves in this browser, and you enter it each time you open the app.",
    createWarning: "If you forget it, your data cannot be recovered — not by us, not by anyone. There is no reset link.",
    pLabel: "Passphrase", cLabel: "Confirm passphrase", create: "Create and unlock", restore: "Restore from a backup",
    pTitle: "A passphrase, typed twice",
    rule1: "At least 10 characters", rule2: "A few different characters", rule3: "Both match",
    key: "your passphrase", derives: "makes the key", store: "encrypted store",
    never: "Never written anywhere",
    noRecover: "Cannot be recovered",
    noRecoverNote: "No copy, no reset link. Keep it in a password manager.",
    // about (about.* in en.ts)
    aboutTitle: "About this app",
    adults: "AI Nutrition Coach is designed for adults.",
    ai: "Photo recognition is off by default. If you turn it on, a photo is sent to a service you choose, and only after you say yes.",
    local: "Your plates stay on this device, encrypted. There are no accounts and no analytics.",
    privacyLink: "What this app stores and sends", gotIt: "Got it",
    aTitle: "Shown once",
    aRow1: "Designed for adults", aRow2: "Photo recognition: off by default", aRow3: "Plates stay on this device, encrypted",
    aRow4: "No accounts, no analytics",
    // log
    logSheet: "Log a plate", nextMeal: "Next meal: Lunch",
    snapshot: "Snapshot", snapshotHint: "One photo of the plate is plenty.",
    barcode: "Barcode", barcodeHint: "Packaged food", typeIt: "Type it", typeItHint: "Works offline",
    describe: "Describe", describeHint: "Say it or write it",
    addFood: "Add a food", foodSearch: "Food search", grams: "Grams",
    preview: "≈ 225 kcal · 18 g protein · 0.4 g sugars", log: "Log",
    step1: "Log › Type it", step1n: "One of four ways in",
    step2: "Search, pick, weigh", step2n: "The food list is on the device: works offline",
    step3: "It lands on Today", step3n: "One dyed stripe for each food group",
    // lock
    unlockTitle1: "Unlock your", unlockTitle2: "store", unlock: "Unlock", forgot: "Forgot your passphrase?",
    lTitle: "Locked, until you unlock",
    lRow1: "Lock button", lVal1: "at once",
    lRow2: "Idle", lVal2: "15 minutes by default",
    lRow2n: "5, 15, 30 or 60 in Your data",
    lRow3: "Out of sight", lVal3: "5 minutes",
    lNote: "Every visit starts with your passphrase.",
    // outro
    oLine: "Every step, with screenshots:",
    oPage: "Getting started",
    url: "mmornati.github.io/ai-nutrition-coach/docs/getting-started",
  },
};

const ALL = ["veg", "protein", "starch", "dairy"];
const EMPTY_WEEK = [[], [], [], [], [], [], []];
const OPEN_DAY = [
  { name: "Lunch", open: true, summary: "Nothing logged yet." },
  { name: "Dinner", open: true, summary: "Nothing logged yet." },
];

/* ------------------------------------------------------- screen helpers */
/* The striped card at the top of the gate screens (GateFrame), device units. */
function gateCard(y, k = 1, a = 1) {
  panel(24, y, 342, 105, { r: 8, fill: T.raised, stroke: T.ink, lw: 2, alpha: a });
  gapLine(34, y + 9, 356, { color: T.control, lw: 1.5, dash: [6, 5], alpha: a });
  gapLine(34, y + 96, 356, { color: T.control, lw: 1.5, dash: [6, 5], alpha: a });
  GROUPS.forEach((g, i) => {
    const kk = stripeK(k, i, 4);
    ctx.save(); ctx.globalAlpha *= a; ctx.fillStyle = g.color;
    ctx.fillRect(25, y + 28 + i * 15, 340 * kk, 9); ctx.restore();
  });
}
function field(y, dots, focus, a = 1) {
  panel(24, y, 342, 54, { r: 8, fill: T.raised, stroke: focus ? T.ink : T.control, lw: 2, alpha: a });
  if (dots > 0) tx("•".repeat(dots), 40, y + 35, { size: 20, color: T.ink, alpha: a, spacing: "3px" });
}
/* A full-width pill (342 device units, like the app's fullWidth Button). */
function wide(fn, s, y, o = {}) {
  const size = o.size ?? 16, w = o.w ?? 342, x = o.x ?? 24;
  return fn(s, x, y, Object.assign({}, o, { padX: (w - txW(say(s), size, 700)) / 2 }));
}
/* Create a passphrase (CreatePassphraseScreen). o: {k, p1, p2, focus, press} */
function createScreen(o = {}) {
  gateCard(50, o.k ?? 1);
  display("createTitle1", 24, 222, 44); display("createTitle2", 24, 266, 44);
  body("createExplain", 24, 300, 342, { size: 15.5, lh: 23 });
  body("createWarning", 24, 386, 342, { size: 15.5, lh: 23, color: T.ink });
  tx("pLabel", 24, 470, { size: 14, weight: 600, color: T.soft });
  field(482, o.p1 ?? 0, o.focus === 1);
  tx("cLabel", 24, 564, { size: 14, weight: 600, color: T.soft });
  field(576, o.p2 ?? 0, o.focus === 2);
  wide(inkPill, "create", 650, { size: 16, h: 48, press: o.press });
  wide(outlinePill, "restore", 714, { size: 16, h: 48 });
}
/* The one-time notice (AboutNotice). o: {press} */
function aboutScreen(o = {}) {
  gateCard(50);
  display("aboutTitle", 24, 228, 42);
  let y = 274;
  ["adults", "ai", "local"].forEach(s => { y += body(s, 24, y, 342, { size: 16, lh: 24, color: T.ink }) + 14; });
  tx("privacyLink", 24, y + 22, { size: 16, color: T.ink });
  line([[24, y + 27], [24 + txW("privacyLink", 16), y + 27]], T.ink, 1.5);
  wide(inkPill, "gotIt", y + 52, { size: 17, h: 50, press: o.press });
}
/* The unlock screen (UnlockScreen). o: {dots, press} */
function unlockScreen(o = {}) {
  gateCard(185);
  display("unlockTitle1", 24, 362, 44); display("unlockTitle2", 24, 406, 44);
  tx("pLabel", 24, 438, { size: 14, weight: 600, color: T.soft });
  field(450, o.dots ?? 0, (o.dots ?? 0) > 0);
  wide(inkPill, "unlock", 518, { size: 16, h: 48, press: o.press });
  tx("forgot", 24, 610, { size: 16, color: T.soft });
  line([[24, 615], [24 + txW("forgot", 16), 615]], T.soft, 1.2);
}
/* A bottom sheet over a dimmed Today: white, 2px ink top edge. Returns its top. */
function sheet(top, k) {
  const y = lerp(844, top, weaveEase(k));
  ctx.save(); ctx.fillStyle = `rgba(38,36,33,${0.38 * clamp(k)})`; ctx.fillRect(0, 0, 390, 844); ctx.restore();
  ctx.save(); ctx.fillStyle = T.raised; ctx.fillRect(0, y, 390, 844 - y); ctx.restore();
  line([[0, y], [390, y]], T.ink, 2);
  return y;
}
function closeBtn(x, y) {
  ring(x, y, 22, T.control, 2);
  line([[x - 7, y - 7], [x + 7, y + 7]], T.ink, 2); line([[x + 7, y - 7], [x - 7, y + 7]], T.ink, 2);
}
function logTile(kind, x, y, w, h, ink, hi) {
  panel(x, y, w, h, { r: 8, fill: ink ? T.ink : T.raised, stroke: T.ink, lw: 2 });
  if (hi > 0) panel(x - 5, y - 5, w + 10, h + 10, { r: 11, fill: "rgba(0,0,0,0)", stroke: T.ink, lw: 3, alpha: clamp(hi) });
  tx(kind, x + 16, y + 32, { size: 19, weight: 800, color: ink ? T.cloth : T.ink });
  tx(kind + "Hint", x + 16, y + h - 18, { size: 14, color: ink ? T.cloth : T.soft });
}
const MATCHES = [
  ["Lentils", "protein"], ["Lentil, green, boiled/cooked in water", "protein"],
  ["Lentil, blond, boiled/cooked in water", "protein"], ["Lentil, seasoned, canned, drained", "protein"],
  ["Lentils seeds, sprouted, fresh, raw", "veg"], ["Lentil, dried (average)", "protein"],
];
/* Add a food (Type it). o: {q (0..1 typing), pick (0..1), grams (0..1), press} */
function typeItSheet(y, o = {}) {
  heading("addFood", 22, y + 46, 24);
  closeBtn(346, y + 40);
  tx("foodSearch", 22, y + 92, { size: 14, weight: 600, color: T.soft });
  panel(20, y + 104, 350, 54, { r: 10, fill: T.raised, stroke: T.ink, lw: 3 });
  const q = typed("lentil", o.q ?? 0);
  tx(q, 38, y + 138, { size: 18, color: T.ink });
  if ((o.q ?? 0) > 0 && (o.q ?? 0) < 1) { ctx.save(); ctx.fillStyle = T.ink; ctx.fillRect(40 + txW(q, 18), y + 120, 2, 22); ctx.restore(); }
  line([[22, y + 176], [368, y + 176]], T.ink, 2, seg(o.q ?? 0, 0.6, 1));
  const pick = o.pick ?? 0, gk = seg(o.grams ?? 0, 0.5, 1), out = seg(o.grams ?? 0, 0, 0.5);
  MATCHES.forEach(([name, gkey], i) => {
    const ry = y + 182 + i * 62, a = seg(o.q ?? 0, 0.5 + i * 0.07, 0.8 + i * 0.07) * (i === 0 ? 1 : 1 - out);
    if (a <= 0) return;
    tx(name, 22, ry + 26, { size: 17, color: T.ink, alpha: a });
    const g = GROUPS.find(x => x.key === gkey);
    ctx.save(); ctx.globalAlpha *= a; ctx.fillStyle = g.color; ctx.fillRect(22, ry + 39, 24, 5); ctx.restore();
    tx(groupName(g), 54, ry + 46, { size: 13, weight: 600, color: T.soft, alpha: a });
    ring(361, ry + 30, 6, i === 0 && pick > 0 ? T.ink : T.control, 2, a);
    if (i === 0 && pick > 0) dot(361, ry + 30, 3.5, T.ink, a * pick);
    line([[22, ry + 58], [368, ry + 58]], T.seam, 1, a);
  });
  if (gk > 0) {
    const by = y + 262;
    outlinePill("~½–1 cup · ≈150 g", 22, by, { size: 15, h: 46, alpha: gk, edge: T.control });
    tx("grams", 22, by + 80, { size: 14, weight: 600, color: T.soft, alpha: gk });
    panel(22, by + 92, 160, 52, { r: 8, fill: T.raised, stroke: T.ink, lw: 2, alpha: gk });
    tx("180", 38, by + 125, { size: 18, color: T.ink, alpha: gk });
    tx("preview", 22, by + 176, { size: 14.5, color: T.soft, alpha: gk });
    wide(inkPill, "log", by + 204, { size: 17, h: 50, alpha: gk, press: o.press, x: 22, w: 346 });
  }
}
/* A finger tap: a ring that shrinks onto (x, y) around time `at` (device units). */
function tap(x, y, t, at0) {
  const k = seg(t, at0 - 0.35, at0 + 0.25);
  if (k <= 0 || k >= 1) return;
  const a = Math.sin(Math.PI * k);
  ring(x, y, lerp(30, 14, outCubic(k)), T.ink, 3, a * 0.8);
}

/* ------------------------------------------------------------- 1 intro */
function sIntro(t, d, cues) {
  const a1 = at(cues, 1, 2.4);
  towelBand(0, 120, W, 150, ALL, seg(t, 0.15, 2.4));
  legend(80, 318, { size: 18, k: seg(t, 1.0, 2.4) });
  tx("series", 80, 400, { size: 22, weight: 600, color: T.thread, alpha: seg(t, 0.4, 1.0) });
  display("title", 80, 500, 104, seg(t, 0.6, 1.4));
  tx("lead", 80, 566, { size: 30, color: T.soft, alpha: seg(t, a1, a1 + 0.6) });
}

/* ----------------------------------------------------------- 2 install */
function homeScreen(k, t, at0) {
  // a plain home screen with a few dashed slots and the new icon woven in
  for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) {
    if (r === 1 && c === 1) continue;
    dashedRect(30 + c * 86, 110 + r * 110, 68, 68, 16, T.seam, 2, [5, 4]);
  }
  const ki = seg(t, at0, at0 + 0.5);
  panel(116, 220, 68, 68, { r: 16, fill: T.raised, stroke: T.ink, lw: 2, alpha: ki });
  if (ki > 0) towelBand(126, 236, 48, 36, ALL, seg(t, at0 + 0.3, at0 + 1.4), { gap: 0.7 });
  tx("AI Nutrition…", 150, 310, { size: 12.5, weight: 600, color: T.ink, align: "center", alpha: ki });
  void k;
}
function sInstall(t, d, cues) {
  const a1 = at(cues, 1, 4.9), a2 = at(cues, 2, 10.7), a3 = at(cues, 3, 18.8);
  display("iTitle", 80, 116, 52, seg(t, 0.1, 0.7));
  // the two addresses
  const k0 = seg(t, 0.6, 1.1);
  panel(80, 160, 640, 60, { r: 30, fill: T.raised, stroke: T.ink, lw: 2, alpha: k0 });
  padlock(118, 192, 26, { alpha: k0 });
  tx(typed(S.https, seg(t, 0.8, 2.2)), 146, 199, { size: 22, weight: 600, color: T.ink, alpha: k0 });
  check(690, 190, 22, T.ink, seg(t, 2.4, 2.9));
  tx("secure", 104, 252, { size: 18, color: T.soft, alpha: seg(t, 2.6, 3.1) });
  const k1 = seg(t, a1, a1 + 0.5);
  dashedRect(80, 282, 640, 60, 30, T.control, 2, [7, 5], k1);
  tx("http", 118, 321, { size: 22, weight: 600, color: T.thread, alpha: k1 });
  strike(104, 312, 112 + txW("http", 22, 600) + 18, 312, seg(t, a1 + 1.2, a1 + 1.7), { lw: 4 });
  tx("insecure", 104, 374, { size: 18, color: T.soft, alpha: seg(t, a1 + 1.4, a1 + 1.9) });
  // the install steps
  const ks = [seg(t, a2 + 1.4, a2 + 1.9), seg(t, a2 + 4.8, a2 + 5.3)];
  [["iphone", "iphoneSteps"], ["android", "androidSteps"]].forEach(([h, s], i) => {
    const y = 430 + i * 70, a = ks[i];
    tx(h, 80, y, { size: 17, weight: 700, color: T.thread, alpha: a });
    tx(s, 80, y + 32, { size: 23, weight: 700, color: T.ink, alpha: a, spacing: "-0.3px" });
  });
  const kf = seg(t, a3, a3 + 0.5);
  sewnLabel("first", 80, 584, { size: 16, dot: true, alpha: kf });
  tx("firstNote", 80 + txW("first", 16, 600) + 64, 607, { size: 17, color: T.soft, alpha: kf });
  // the phone: browser → Share → home screen
  const inst = a2 + 3.6, done = seg(t, inst, inst + 0.4);
  phoneFrame(890, 56, 0.66, (w) => {
    if (done < 1) {
      ctx.save(); ctx.globalAlpha *= 1 - done;
      createScreen({ k: seg(t, 1.6, 2.8) });
      // the browser's bottom bar with Share
      ctx.save(); ctx.fillStyle = T.raised; ctx.globalAlpha *= seg(t, 1.0, 1.4); ctx.fillRect(0, 770, w, 74); ctx.restore();
      line([[0, 770], [w, 770]], T.seam, 2, seg(t, 1.0, 1.4));
      panel(20, 780, w - 40, 30, { r: 15, fill: T.cloth, stroke: T.seam, lw: 1.5, alpha: seg(t, 1.0, 1.4) });
      tx("plate.example.com", w / 2, 800, { size: 14, color: T.soft, align: "center", alpha: seg(t, 1.0, 1.4) });
      // share sheet
      const ks2 = seg(t, a2 + 1.6, a2 + 2.1);
      if (ks2 > 0) {
        const y = sheet(560, ks2);
        tx("Add to Home Screen", 30, y + 64, { size: 19, weight: 600, color: T.ink });
        dashedRect(318, y + 40, 36, 36, 6, T.ink, 2, [100, 0]);
        tx("+", 336, y + 67, { size: 26, weight: 600, color: T.ink, align: "center" });
        line([[20, y + 100], [370, y + 100]], T.seam, 1);
        tx("Copy", 30, y + 144, { size: 19, color: T.thread });
        tap(330, y + 58, t, a2 + 3.0);
      }
      ctx.restore();
    }
    if (done > 0) { ctx.save(); ctx.globalAlpha *= done; homeScreen(done, t, inst + 0.2); ctx.restore(); }
  }, { alpha: seg(t, 0.4, 1.0) });
}

/* -------------------------------------------------------- 3 passphrase */
function sPassphrase(t, d, cues) {
  const a1 = at(cues, 1, 3.4), a2 = at(cues, 2, 9.2), a3 = at(cues, 3, 13.2);
  const p1 = Math.round(16 * seg(t, a1 + 0.2, a1 + 2.0)), p2 = Math.round(16 * seg(t, a1 + 2.4, a1 + 4.0));
  const focus = t < a1 + 2.2 ? 1 : 2, press = seg(t, a2 + 0.2, a2 + 0.35) * (1 - seg(t, a2 + 0.45, a2 + 0.6));
  phoneFrame(110, 56, 0.66, () => {
    createScreen({ k: seg(t, 0.2, 1.4), p1, p2, focus: t > a1 ? focus : 0, press });
    tap(195, 674, t, a2 + 0.25);
    // the warning is the part that matters
    const kw = seg(t, a3, a3 + 0.4);
    if (kw > 0) panel(14, 360, 362, 92, { r: 8, fill: "rgba(0,0,0,0)", stroke: T.ink, lw: 3, alpha: kw });
  }, { alpha: seg(t, 0.1, 0.6) });
  const x = 520;
  display("pTitle", x, 128, 48, seg(t, 0.3, 0.9));
  // the strength floor (session.tooShort / tooRepetitive / mismatch)
  [["rule1", a1 + 1.4], ["rule2", a1 + 2.2], ["rule3", a1 + 4.2]].forEach(([s, a0], i) => {
    const y = 196 + i * 50, a = seg(t, a1 + i * 0.3, a1 + i * 0.3 + 0.5);
    ring(x + 14, y - 8, 14, T.control, 2, a);
    check(x + 14, y - 8, 14, T.ink, seg(t, a0, a0 + 0.4));
    tx(s, x + 44, y, { size: 22, color: T.ink, alpha: a });
  });
  // passphrase → key → store
  const kk = seg(t, a2, a2 + 0.5), y = 400;
  sewnLabel("key", x, y - 26, { size: 17, alpha: kk });
  const kx = x + txW("key", 17, 600) + 30;
  arrow(kx + 4, y - 4, kx + 96, y - 4, seg(t, a2 + 0.5, a2 + 1.1), T.ink);
  tx("derives", kx + 50, y - 20, { size: 14, color: T.thread, align: "center", alpha: seg(t, a2 + 0.7, a2 + 1.1) });
  const sx = kx + 116, ka = seg(t, a2 + 1.0, a2 + 1.5);
  padlock(sx + 18, y - 4, 32, { alpha: ka });
  tx("store", sx + 44, y + 3, { size: 20, weight: 700, color: T.ink, alpha: ka });
  tx("never", x, y + 50, { size: 19, color: T.soft, alpha: seg(t, a2 + 2.0, a2 + 2.5) });
  // cannot be recovered
  const kr = seg(t, a3, a3 + 0.5);
  display("noRecover", x, 540, 40, kr);
  tx("noRecoverNote", x, 580, { size: 20, color: T.soft, alpha: seg(t, a3 + 1.0, a3 + 1.5) });
}

/* ------------------------------------------------------------- 4 about */
function sAbout(t, d, cues) {
  const a1 = at(cues, 1, 3.5), a2 = at(cues, 2, 10.8);
  const press = seg(t, a2 + 0.25, a2 + 0.37) * (1 - seg(t, a2 + 0.47, a2 + 0.6));
  const gone = seg(t, a2 + 0.6, a2 + 0.85);
  phoneFrame(110, 56, 0.66, () => {
    if (gone < 1) { ctx.save(); ctx.globalAlpha *= 1 - gone; aboutScreen({ press }); ctx.restore(); }
    if (gone > 0) { ctx.save(); ctx.globalAlpha *= gone; todayScreen({ meals: OPEN_DAY, date: "23 Oct", week: EMPTY_WEEK }); ctx.restore(); }
    tap(195, 537, t, a2 + 0.3);
  }, { alpha: seg(t, 0.1, 0.6) });
  const x = 520;
  display("aTitle", x, 128, 48, seg(t, 0.3, 0.9));
  sewnLabel("aboutTitle", x, 156, { size: 16, alpha: seg(t, 0.6, 1.1) });
  const at4 = [a1 + 0.1, a1 + 1.7, a1 + 4.2, a1 + 5.6];
  ["aRow1", "aRow2", "aRow3", "aRow4"].forEach((s, i) => {
    const y = 268 + i * 72, a = seg(t, at4[i], at4[i] + 0.5);
    line([[x, y + 22], [1200, y + 22]], T.seam, 1, a);
    tx(s, x, y, { size: 26, weight: 700, color: T.ink, alpha: a, spacing: "-0.4px" });
  });
}

/* --------------------------------------------------------------- 5 log */
function sLog(t, d, cues) {
  const a1 = at(cues, 1, 2.7), a2 = at(cues, 2, 8.7);
  const logTap = 0.7, typeTap = a1 - 0.6;
  const kSheet = seg(t, logTap + 0.15, logTap + 0.6) * (1 - seg(t, typeTap + 0.2, typeTap + 0.4));
  const kType = seg(t, typeTap + 0.2, typeTap + 0.7) * (1 - seg(t, a2 + 0.8, a2 + 1.1));
  const done = t >= a2 + 0.8;
  const pickAt = a1 + 3.0;
  phoneFrame(140, 46, 0.7, () => {
    const meals = done
      ? [{ name: "Lunch", time: "12:40", groups: ["protein"], food: "Lentils", summary: "180 g · ~225 kcal", k: seg(t, a2 + 1.0, a2 + 2.4) }, OPEN_DAY[1]]
      : OPEN_DAY;
    todayScreen({ meals, date: "23 Oct", week: done ? [[], [], [], [], [], [], ["protein"]] : EMPTY_WEEK, log: kType <= 0 || done });
    tap(318, 710, t, logTap);
    if (kSheet > 0) {
      const y = sheet(308, kSheet);
      heading("logSheet", 22, y + 48, 26); closeBtn(346, y + 42);
      tx("nextMeal", 22, y + 84, { size: 15, color: T.thread });
      logTile("snapshot", 22, y + 108, 346, 130, true, 0);
      logTile("barcode", 22, y + 250, 167, 92, false, 0);
      logTile("typeIt", 201, y + 250, 167, 92, false, seg(t, typeTap - 0.3, typeTap));
      logTile("describe", 22, y + 354, 167, 92, false, 0);
      tap(284, y + 296, t, typeTap);
    }
    if (kType > 0) {
      const y = sheet(60, kType);
      typeItSheet(y, { q: seg(t, a1 + 0.3, a1 + 1.4), pick: seg(t, pickAt, pickAt + 0.2), grams: seg(t, pickAt + 0.3, pickAt + 1.1),
        press: seg(t, a2 + 0.2, a2 + 0.32) * (1 - seg(t, a2 + 0.42, a2 + 0.55)) });
      tap(361, y + 212, t, pickAt);
      tap(195, y + 491, t, a2 + 0.25);
    }
  }, { alpha: seg(t, 0.1, 0.5) });
  // the three steps
  const x = 560;
  const cur = t < a1 ? 0 : t < a2 + 0.8 ? 1 : 2;
  [["step1", "step1n", 0.2], ["step2", "step2n", a1], ["step3", "step3n", a2 + 0.8]].forEach(([h, n, a0], i) => {
    const y = 150 + i * 150, a = seg(t, a0, a0 + 0.5), on = i === cur;
    if (a <= 0) return;
    ctx.save(); ctx.globalAlpha *= a;
    panel(x, y, 52, 52, { r: 26, fill: on ? T.ink : T.raised, stroke: T.ink, lw: 2 });
    tx(String(i + 1), x + 26, y + 35, { size: 24, weight: 800, color: on ? T.cloth : T.ink, align: "center" });
    tx(h, x + 76, y + 24, { size: 32, weight: 800, color: T.ink, spacing: "-0.6px" });
    tx(n, x + 76, y + 60, { size: 19, color: T.soft });
    ctx.restore();
  });
  // the band that landed, large
  const kb = seg(t, a2 + 1.4, a2 + 3.2);
  if (kb > 0) {
    towelBand(x + 76, 520, 300, 70, ["protein"], kb);
    legend(x + 76, 620, { size: 15, k: seg(t, a2 + 2.2, a2 + 3.4) });
  }
}

/* -------------------------------------------------------------- 6 lock */
function sLock(t, d, cues) {
  const a1 = at(cues, 1, 3.4);
  const lockAt = 1.4, locked = seg(t, lockAt + 0.2, lockAt + 0.6);
  phoneFrame(110, 56, 0.66, () => {
    if (locked < 1) {
      ctx.save(); ctx.globalAlpha *= 1 - locked;
      todayScreen({ meals: [{ name: "Lunch", time: "12:40", groups: ["protein"], food: "Lentils", summary: "180 g · ~225 kcal" }, OPEN_DAY[1]],
        date: "23 Oct", week: [[], [], [], [], [], [], ["protein"]] });
      ctx.restore();
    }
    tap(199, 174, t, lockAt);
    if (locked > 0) { ctx.save(); ctx.globalAlpha *= locked; unlockScreen({ dots: Math.round(14 * seg(t, d - 3.2, d - 1.8)) }); ctx.restore(); }
  }, { alpha: seg(t, 0.1, 0.6) });
  const x = 520;
  display("lTitle", x, 128, 48, seg(t, 0.3, 0.9));
  padlock(1150, 104, 64, { open: 1 - locked, alpha: seg(t, 0.3, 0.9) });
  const rows = [["lRow1", "lVal1", 0.8], ["lRow2", "lVal2", a1 + 0.9], ["lRow3", "lVal3", a1 + 3.2]];
  rows.forEach(([k, v, a0], i) => {
    const y = 236 + i * 90, a = seg(t, a0, a0 + 0.5);
    tx(k, x, y, { size: 24, weight: 700, color: T.ink, alpha: a });
    gapLine(x + 190, y - 8, x + 190 + 120 * seg(t, a0, a0 + 0.8), { color: T.control, lw: 3, dash: [9, 7], alpha: a });
    tx(v, x + 330, y, { size: 24, color: T.ink, alpha: seg(t, a0 + 0.4, a0 + 0.9) });
    if (i === 1) tx("lRow2n", x + 330, y + 32, { size: 17, color: T.thread, alpha: seg(t, a0 + 0.8, a0 + 1.3) });
  });
  display("lNote", x, 560, 34, seg(t, a1 + 5.0, a1 + 5.6));
}

/* ------------------------------------------------------------- 7 outro */
function sOutro(t, d, cues) {
  towelBand(0, 110, W, 120, ALL, seg(t, 0.1, 2.2));
  wordmark(W / 2, 360, 56, seg(t, 0.3, 1.4), { align: "center" });
  tx("oLine", W / 2, 438, { size: 26, color: T.soft, align: "center", alpha: seg(t, 0.6, 1.1) });
  display("oPage", W / 2, 510, 60, seg(t, 1.2, 1.8), { align: "center" });
  const ku = seg(t, 2.0, 2.6), uw = txW("url", 24, 600);
  tx("url", W / 2, 572, { size: 24, weight: 600, color: T.ink, align: "center", alpha: ku });
  line([[W / 2 - uw / 2, 582], [W / 2 + uw / 2, 582]], T.ink, 2, ku);
}

torchonVideo({
  title: { en: "Your first plate" },
  kicker: { en: "AI Nutrition Coach · Getting started" },
  langs: ["en"],
  strings: STR,
  poster: "log",
  scenes: {
    intro: sIntro, install: sInstall, passphrase: sPassphrase, about: sAbout,
    log: sLog, lock: sLock, outro: sOutro,
  },
});
