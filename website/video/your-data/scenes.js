/* AI Nutrition Coach — "Your data, on your device". Drawn with ../torchon.js on ../engine/engine.js.
 * Each scene is fn(t, d, cues), a pure function of t; animations hook onto the spoken
 * sentences with at(cues, i). Facts: docs/your-data.md, docs/telemetry-posture.md,
 * docs/guide/your-data.md and the app's own strings (apps/web/src/i18n/en.ts).
 * Plates and dates on screen are demo data. */
"use strict";

const STR = {
  en: {
    title: "Your data, on your device",
    onDevice: "On this device",
    noServer: "An encrypted store in your browser. None of it on a server.",
    // store
    sqlite: "SQLite database",
    cipher: "ChaCha20-Poly1305",
    pages: "encrypted at rest, tampering detected",
    passphrase: "Passphrase",
    kdf: "PBKDF2-HMAC-SHA256, 600,000 iterations",
    key: "Key",
    inMemory: "in memory, only while unlocked",
    disk: "Disk",
    neverDisk: "the key is never written here",
    wrong: "That passphrase does not open this store.",
    forgot: "Forgotten? No copy, no reset link, no escrow.",
    // lock
    lockTitle: "Lock",
    closed: "The store closes at once.",
    lockAfter: "Lock automatically after",
    m5: "5 minutes", m15: "15 minutes", m30: "30 minutes", h1: "1 hour",
    hidden: "Page hidden for 5 minutes: it locks too.",
    keepTitle: "When space runs low",
    browserStore: "Browser storage",
    asks: "The app asks the browser to keep it",
    persisted: "Storage: protected from automatic clean-up.",
    notPersisted: "or: the browser may clear this data if space runs low — export regularly.",
    // backup
    bTitle: "Encrypted backup",
    fileName: "ai-nutrition-coach-2026-10-23.ancvault",
    fileNote: "Says nothing about its contents but its size.",
    bPass: "Backup passphrase",
    argon: "Argon2id",
    argonNote: "64 MiB, 3 passes",
    aes: "AES-256-GCM",
    sealed: "Sealed on your device. Nothing is uploaded.",
    inIt: "In it",
    neverIn: "Never in it",
    i_plates: "Plates", i_notes: "Coach notes", i_meals: "Saved meals",
    i_recipes: "Recipes", i_profile: "Profile", i_lang: "Language",
    n_key: "Your AI key", n_settings: "Your AI settings", n_consents: "Your consents",
    // restore
    rTitle: "Restore from a backup",
    thisDevice: "This device",
    merged: "Merged: nothing is removed for being absent from the file.",
    rWrong: "That passphrase does not open this file, or the file is damaged. Nothing was changed.",
    phone: "Phone", laptop: "Laptop",
    syncPlanned: "Sync between devices: planned, not built",
    carries: "for now, the backup file carries it",
    // leave
    eTitle: "Export",
    csvNote: "one row per food",
    jsonNote: "plates, profile, saved meals, recipes",
    plain: "Plain, unencrypted",
    noImport: "Yours to keep somewhere you trust. They cannot be imported back.",
    removeTitle: "Remove one plate",
    removeAction: "Remove this plate",
    eraseTitle: "Erase everything",
    eraseButton: "Erase all local data",
    eraseQ: "Erase everything on this device?",
    keep: "Keep my data", erase: "Erase",
    eraseLimit: "It cannot reach a file you already downloaded or shared.",
    // outro
    privacy: "What this app stores and sends",
    never: "Never collected",
    neverBody: "No analytics, no tracking, no crash reports, no advertising and no accounts.",
    telemetry: "Telemetry", none: "none",
    guide: "Back up, export, erase",
    url: "mmornati.github.io/ai-nutrition-coach/docs/guide/your-data",
  },
};

const ALL = ["veg", "protein", "starch", "dairy"];

/* The real privacy page, drawn inside the phone (preloaded below so frames are deterministic). */
const PRIVACY_IMG = new Image();
const privacyReady = new Promise(res => { PRIVACY_IMG.onload = PRIVACY_IMG.onerror = () => res(true); });
PRIVACY_IMG.src = "../shots/your-data-privacy.webp";

/* ------------------------------------------------------------ helpers */
/* A key: ring + shaft + two teeth, centred on the ring at (x, y). */
function keyIcon(x, y, s, a = 1, color = T.ink) {
  if (a <= 0) return;
  ctx.save(); ctx.globalAlpha *= a; ctx.strokeStyle = color; ctx.lineWidth = Math.max(2, s * 0.1); ctx.lineCap = "round";
  ctx.beginPath(); ctx.arc(x, y, s * 0.3, 0, Math.PI * 2); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(x + s * 0.3, y); ctx.lineTo(x + s * 1.1, y);
  ctx.moveTo(x + s * 0.85, y); ctx.lineTo(x + s * 0.85, y + s * 0.25);
  ctx.moveTo(x + s * 1.05, y); ctx.lineTo(x + s * 1.05, y + s * 0.3); ctx.stroke();
  ctx.restore();
}
/* A file: page with a folded corner. y is the top. */
function fileIcon(x, y, w, h, a = 1, o = {}) {
  if (a <= 0) return;
  const f = Math.min(w, h) * 0.28;
  ctx.save(); ctx.globalAlpha *= a; ctx.lineWidth = o.lw ?? 2; ctx.strokeStyle = T.ink; ctx.lineJoin = "round";
  ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + w - f, y); ctx.lineTo(x + w, y + f); ctx.lineTo(x + w, y + h); ctx.lineTo(x, y + h); ctx.closePath();
  ctx.fillStyle = o.fill ?? T.raised; ctx.fill(); if (o.dashed) ctx.setLineDash([5, 4]); ctx.stroke();
  ctx.setLineDash([]); ctx.beginPath(); ctx.moveTo(x + w - f, y); ctx.lineTo(x + w - f, y + f); ctx.lineTo(x + w, y + f); ctx.stroke();
  ctx.restore();
}
/* A passphrase field with k of 14 dots typed. y is the top. */
function passField(x, y, w, k, a, focus) {
  panel(x, y, w, 52, { r: 8, fill: T.raised, stroke: focus ? T.ink : T.control, lw: 2, alpha: a });
  tx("•".repeat(Math.round(14 * clamp(k))), x + 18, y + 35, { size: 24, color: T.ink, alpha: a, spacing: "2px" });
}
/* A small laptop centred on x, base at y. */
function laptopIcon(x, y, s, a) {
  if (a <= 0) return;
  panel(x - s * 0.62, y - s * 0.82, s * 1.24, s * 0.74, { r: 5, fill: T.raised, stroke: T.ink, lw: 2.5, alpha: a });
  panel(x - s * 0.82, y - s * 0.08, s * 1.64, s * 0.12, { r: 3, fill: T.ink, stroke: T.ink, lw: 2, alpha: a });
}
function phoneIcon(x, y, s, a) {
  if (a <= 0) return;
  panel(x - s * 0.3, y - s, s * 0.6, s, { r: 8, fill: T.raised, stroke: T.ink, lw: 2.5, alpha: a });
  line([[x - s * 0.08, y - s * 0.9], [x + s * 0.08, y - s * 0.9]], T.ink, 2.5, a);
}
/* A labelled column rule: small bold heading over a 2px ink rule. */
function colHead(s, x, y, w, a) {
  tx(s, x, y, { size: 18, weight: 700, color: T.thread, alpha: a });
  line([[x, y + 14], [x + w, y + 14]], T.ink, 2, a);
}

/* ------------------------------------------------------------- 1 intro */
function sIntro(t, d, cues) {
  const a1 = at(cues, 1, 2.8);
  towelBand(0, 120, W, 140, ALL, seg(t, 0.1, 2.4));
  padlock(132, 404, 104, { alpha: seg(t, 0.5, 1.0), open: 1 - seg(t, 1.6, 2.1) });
  display("title", 220, 430, 76, seg(t, 0.6, 1.4));
  sewnLabel("onDevice", 222, 462, { size: 17, dot: true, alpha: seg(t, 1.9, 2.4) });
  tx("noServer", 80, 584, { size: 30, color: T.soft, alpha: seg(t, a1, a1 + 0.6) });
}

/* ------------------------------------------------------------- 2 store */
function sStore(t, d, cues) {
  const a1 = at(cues, 1, 6.3), a2 = at(cues, 2, 12.7);
  // the store, sealed
  const ks = seg(t, 0.4, 1.0), sx = 820, sy = 120, sw = 380, sh = 300;
  panel(sx, sy + (1 - outCubic(ks)) * 14, sw, sh, { r: 8, fill: T.raised, stroke: T.ink, lw: 2, alpha: ks });
  if (ks > 0) {
    ctx.save(); ctx.translate(0, (1 - outCubic(ks)) * 14);
    heading("sqlite", sx + 28, sy + 52, 28, ks);
    for (let i = 0; i < 5; i++) gapLine(sx + 28, sy + 92 + i * 26, sx + sw - 110 - (i % 2) * 40, { color: T.seam, lw: 10, dash: [14, 6], alpha: ks });
    padlock(sx + sw - 54, sy + 140, 56, { alpha: ks, open: seg(t, a1 + 4.0, a1 + 4.5) * (1 - seg(t, a2 + 0.2, a2 + 0.6)) });
    sewnLabel("cipher", sx + 28, sy + 228, { size: 18, alpha: seg(t, 1.6, 2.2) });
    ctx.restore();
  }
  tx("pages", sx, sy + sh + 32, { size: 17, color: T.thread, alpha: seg(t, 2.4, 3.0) });
  // passphrase → key → store
  const kp = seg(t, a1, a1 + 0.5);
  tx("passphrase", 80, 150, { size: 17, weight: 600, color: T.soft, alpha: kp });
  passField(80, 164, 320, seg(t, a1 + 0.3, a1 + 1.3), kp, t > a1 && t < a1 + 1.6);
  const kk = seg(t, a1 + 1.4, a1 + 2.0);
  arrow(410, 190, 488, 190, seg(t, a1 + 1.2, a1 + 1.6), T.ink);
  panel(500, 160, 250, 64, { r: 8, fill: T.raised, stroke: T.ink, lw: 2, alpha: kk });
  keyIcon(534, 192, 34, kk);
  tx("key", 590, 200, { size: 24, weight: 800, color: T.ink, alpha: kk });
  tx("kdf", 80, 260, { size: 16, color: T.thread, alpha: seg(t, a1 + 1.6, a1 + 2.2) });
  tx("inMemory", 500, 260, { size: 16, color: T.thread, alpha: seg(t, a1 + 2.0, a1 + 2.6) });
  arrow(760, 192, 812, 192, seg(t, a1 + 3.6, a1 + 4.0), T.ink);
  // the disk: the key never lands there
  const kd = seg(t, a1 + 2.6, a1 + 3.2);
  dashedRect(80, 300, 670, 70, 8, T.control, 2, [6, 5], kd);
  tx("disk", 104, 344, { size: 22, weight: 800, color: T.ink, alpha: kd });
  keyIcon(212, 336, 26, kd * 0.35, T.control);
  strike(196, 352, 252, 320, seg(t, a1 + 3.0, a1 + 3.4), { lw: 4, alpha: kd });
  tx("neverDisk", 278, 344, { size: 20, color: T.soft, alpha: kd });
  // a wrong passphrase, refused
  const kw = seg(t, a2, a2 + 0.5);
  passField(80, 444, 320, seg(t, a2 + 0.1, a2 + 0.8), kw, t > a2 && t < a2 + 1.0);
  const press = seg(t, a2 + 0.9, a2 + 1.0) * (1 - seg(t, a2 + 1.1, a2 + 1.25));
  inkPill("Unlock", 416, 446, { size: 17, h: 48, alpha: kw, press });
  sewnLabel("wrong", 80, 520, { size: 18, alpha: seg(t, a2 + 1.2, a2 + 1.6) });
  tx("forgot", 80, 604, { size: 22, weight: 700, color: T.ink, alpha: seg(t, a2 + 2.2, a2 + 2.8) });
}

/* -------------------------------------------------------------- 3 lock */
function sLock(t, d, cues) {
  const a1 = at(cues, 1, 3.3), a2 = at(cues, 2, 9.1);
  // left: Lock, then the idle delay
  display("lockTitle", 80, 120, 56, seg(t, 0.1, 0.6));
  const press = seg(t, 0.9, 1.0) * (1 - seg(t, 1.1, 1.25));
  outlinePill("Lock", 80, 152, { size: 20, h: 54, alpha: seg(t, 0.2, 0.6), press });
  padlock(250, 186, 50, { alpha: seg(t, 0.2, 0.6), open: 1 - seg(t, 1.0, 1.4) });
  tx("closed", 300, 194, { size: 20, color: T.soft, alpha: seg(t, 1.4, 1.9) });
  const kl = seg(t, a1, a1 + 0.5);
  tx("lockAfter", 80, 280, { size: 18, weight: 700, color: T.thread, alpha: kl });
  let px = 80;
  ["m5", "m15", "m30", "h1"].forEach((k, i) => {
    const a = seg(t, a1 + 0.1 + i * 0.12, a1 + 0.5 + i * 0.12), on = i === 1 && t > a1 + 1.2;
    const fn = on ? inkPill : outlinePill;
    px += fn(k, px, 300, { size: 16, h: 46, alpha: a, edge: on ? T.ink : T.control }) + 10;
  });
  // idle clock running out
  const kc = seg(t, a1 + 1.4, a1 + 4.6);
  if (kl > 0) {
    ctx.save(); ctx.globalAlpha *= kl;
    ctx.beginPath(); ctx.arc(110, 418, 28, 0, Math.PI * 2); ctx.strokeStyle = T.seam; ctx.lineWidth = 6; ctx.stroke();
    ctx.beginPath(); ctx.arc(110, 418, 28, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * kc); ctx.strokeStyle = T.ink; ctx.stroke();
    ctx.restore();
  }
  tx("hidden", 158, 426, { size: 20, color: T.soft, alpha: seg(t, a1 + 2.6, a1 + 3.2) });
  // right: the browser may clean up; the app asks it to keep
  const x = 680, kr = seg(t, a2, a2 + 0.5);
  heading("keepTitle", x, 120, 30, kr);
  line([[x, 138], [1200, 138]], T.ink, 2, kr);
  panel(x, 164, 520, 120, { r: 8, fill: T.raised, stroke: T.control, lw: 2, alpha: kr });
  tx("browserStore", x + 22, 200, { size: 18, weight: 700, color: T.ink, alpha: kr });
  const fill = lerp(0.35, 0.92, outCubic(seg(t, a2 + 0.4, a2 + 2.2)));
  gapLine(x + 22, 244, x + 498, { color: T.seam, lw: 16, dash: [10, 5], alpha: kr });
  line([[x + 22, 244], [x + 22 + 476 * fill, 244]], T.soft, 16, kr);
  const ka = seg(t, a2 + 2.6, a2 + 3.2);
  tx("asks", x, 336, { size: 20, weight: 700, color: T.ink, alpha: ka });
  tx("navigator.storage.persist()", x, 366, { size: 17, font: MONO, color: T.thread, alpha: ka });
  const kn = seg(t, a2 + 4.0, a2 + 4.6);
  panel(x, 398, 520, 64, { r: 8, fill: T.raised, stroke: T.ink, lw: 2, alpha: kn });
  tx("persisted", x + 20, 437, { size: 19, color: T.ink, alpha: kn });
  body("notPersisted", x, 500, 520, { size: 17, color: T.thread, alpha: seg(t, a2 + 4.6, a2 + 5.2) });
}

/* ------------------------------------------------------------ 4 backup */
function sBackup(t, d, cues) {
  const a1 = at(cues, 1, 9.6), a2 = at(cues, 2, 15.0);
  display("bTitle", 80, 116, 56, seg(t, 0.1, 0.6));
  // the file
  const kf = seg(t, 0.5, 1.1);
  panel(80, 150, 450, 200, { r: 8, fill: T.raised, stroke: T.ink, lw: 2, alpha: kf });
  fileIcon(108, 176, 62, 80, kf);
  padlock(139, 228, 30, { alpha: kf * seg(t, 7.4, 7.8), lw: 2.5 });
  tx("fileName", 108, 296, { size: 17, weight: 700, color: T.ink, alpha: kf });
  tx("fileNote", 108, 326, { size: 15, color: T.thread, alpha: seg(t, 7.8, 8.4) });
  // the seal: passphrase → Argon2id → AES-256-GCM
  const steps = [["bPass", null, 1.6], ["argon", "argonNote", 3.2], ["aes", null, 5.6]];
  steps.forEach(([k, note, s0], i) => {
    const y = 156 + i * 66, a = seg(t, s0, s0 + 0.5);
    if (i) arrow(620, y - 22, 620, y - 4, seg(t, s0 - 0.2, s0 + 0.2), T.ink);
    const w = sewnLabel(k, 580, y, { size: 18, alpha: a, weight: 700 });
    if (note) tx(note, 580 + w + 14, y + 28, { size: 16, color: T.thread, alpha: a });
  });
  tx("sealed", 580, 374, { size: 19, weight: 700, color: T.ink, alpha: seg(t, 6.8, 7.4) });
  // in it / never in it
  const ki = seg(t, a1, a1 + 0.4);
  colHead("inIt", 80, 430, 520, ki);
  ["i_plates", "i_notes", "i_meals", "i_recipes", "i_profile", "i_lang"].forEach((k, i) => {
    const a = seg(t, a1 + 0.3 + i * 0.5, a1 + 0.7 + i * 0.5), col = i % 2, row = Math.floor(i / 2);
    const x = 80 + col * 270, y = 484 + row * 44;
    ctx.save(); ctx.globalAlpha *= a; ctx.fillStyle = GROUPS[i % 4].color; ctx.fillRect(x, y - 13, 26, 8); ctx.restore();
    tx(k, x + 38, y, { size: 21, color: T.ink, alpha: a });
  });
  const kn = seg(t, a2, a2 + 0.4);
  colHead("neverIn", 700, 430, 500, kn);
  ["n_key", "n_settings", "n_consents"].forEach((k, i) => {
    const a = seg(t, a2 + 0.3 + i * 0.5, a2 + 0.7 + i * 0.5), y = 484 + i * 44;
    gapLine(700, y - 9, 726, { color: T.control, lw: 3, dash: [5, 4], alpha: a });
    tx(k, 738, y, { size: 21, color: T.soft, alpha: a });
  });
}

/* ----------------------------------------------------------- 5 restore */
const HERE = [
  { name: "Breakfast", time: "08:10", groups: ["starch", "dairy"], food: "Oats, milk" },
  { name: "Lunch", time: "12:40", groups: ["veg", "protein", "starch"], food: "Lentils, tomato, bread" },
  { name: "Dinner", time: "19:30", groups: ["veg", "protein", "starch"], food: "Salmon, rice, spinach" },
];
function sRestore(t, d, cues) {
  const a1 = at(cues, 1, 5.2), a2 = at(cues, 2, 8.8);
  display("rTitle", 80, 116, 50, seg(t, 0.1, 0.6));
  // the file, opened with its passphrase
  const kf = seg(t, 0.3, 0.8);
  panel(80, 150, 340, 150, { r: 8, fill: T.raised, stroke: T.ink, lw: 2, alpha: kf });
  fileIcon(104, 172, 48, 62, kf);
  tx(".ancvault", 170, 200, { size: 20, weight: 800, color: T.ink, alpha: kf });
  passField(104, 236, 292, seg(t, 0.6, 1.4), kf, t > 0.6 && t < 1.6);
  // this device: the backup's plates weave in beside what was there
  const x = 500, kd = seg(t, 0.4, 0.9);
  heading("thisDevice", x, 158, 24, kd);
  arrow(428, 225, 490, 225, seg(t, 1.6, 2.0), T.ink);
  const meals = HERE.map((m, i) => Object.assign({}, m, { k: i === 1 ? seg(t, 0.5, 1.3) : seg(t, 2.0 + i * 0.3, 3.0 + i * 0.3) }));
  dayTowel(x, 172, 700, meals, 1, { field: 96, bandH: 78, size: 20, gapX: 16, alpha: kd });
  tx("merged", x, 434, { size: 18, color: T.soft, alpha: seg(t, 3.2, 3.8) });
  // a wrong passphrase or a damaged file: nothing changes
  const kw = seg(t, a1, a1 + 0.5);
  if (kw > 0) {
    panel(80, 318, 340, 128, { r: 8, fill: T.raised, stroke: T.ink, lw: 2, alpha: kw });
    body("rWrong", 100, 350, 300, { size: 17, color: T.ink, alpha: kw, lh: 24 });
  }
  // sync is planned; the file carries it
  const ks = seg(t, a2, a2 + 0.5), y = 566;
  phoneIcon(140, y + 34, 64, ks);
  tx("phone", 140, y + 62, { size: 15, weight: 600, color: T.soft, align: "center", alpha: ks });
  laptopIcon(1130, y + 34, 64, ks);
  tx("laptop", 1130, y + 62, { size: 15, weight: 600, color: T.soft, align: "center", alpha: ks });
  gapLine(190, y, 1070, { color: T.control, lw: 3, dash: [9, 7], alpha: ks });
  sewnLabel("syncPlanned", W / 2, y - 22, { size: 16, align: "center", alpha: ks });
  const kt = inOut(seg(t, a2 + 1.4, a2 + 4.2));
  if (kt > 0) {
    const fx = lerp(200, 1040, kt), fa = seg(t, a2 + 1.2, a2 + 1.5);
    fileIcon(fx - 14, y + 18, 28, 34, fa);
    tx("carries", W / 2, y + 66, { size: 16, color: T.thread, align: "center", alpha: fa });
  }
}

/* ------------------------------------------------------------- 6 leave */
function sLeave(t, d, cues) {
  const a1 = at(cues, 1, 6.5);
  // left: exports, plain files
  display("eTitle", 80, 116, 56, seg(t, 0.1, 0.6));
  [["CSV", "csvNote"], ["JSON", "jsonNote"]].forEach(([n, note], i) => {
    const a = seg(t, 0.6 + i * 0.4, 1.1 + i * 0.4), y = 156 + i * 120;
    fileIcon(80, y, 72, 92, a, { dashed: true });
    tx(n, 116, y + 62, { size: 20, weight: 800, color: T.ink, align: "center", alpha: a });
    tx(n === "CSV" ? "plates.csv" : "plates.json", 172, y + 40, { size: 20, weight: 700, color: T.ink, alpha: a });
    tx(note, 172, y + 68, { size: 17, color: T.thread, alpha: a });
  });
  const kp = seg(t, 3.0, 3.5);
  sewnLabel("plain", 80, 400, { size: 18, alpha: kp });
  body("noImport", 80, 470, 470, { size: 19, alpha: seg(t, 3.6, 4.2) });
  // right: remove one plate
  const x = 660, kr = seg(t, a1, a1 + 0.5);
  heading("removeTitle", x, 128, 26, kr);
  const gone = seg(t, a1 + 1.0, a1 + 1.6);
  if (kr > 0) {
    ctx.save(); ctx.globalAlpha *= 1 - 0.75 * gone;
    dayTowel(x, 140, 540, [{ name: "Lunch", time: "12:40", groups: ["veg", "protein", "starch"], food: "Lentils, tomato, bread" }], 1,
      { field: 96, bandH: 84, size: 20, gapX: 16, alpha: kr, rules: false });
    ctx.restore();
    if (gone > 0) gapLine(x, 168, x + 96, { color: T.control, lw: 3, alpha: gone });
  }
  outlinePill("removeAction", x, 232, { size: 16, h: 44, alpha: kr, press: seg(t, a1 + 0.7, a1 + 0.8) * (1 - seg(t, a1 + 0.9, a1 + 1.0)) });
  // erase everything, behind one confirmation
  const ke = seg(t, a1 + 1.8, a1 + 2.3);
  heading("eraseTitle", x, 330, 26, ke);
  outlinePill("eraseButton", x, 348, { size: 16, h: 44, alpha: ke, press: seg(t, a1 + 2.5, a1 + 2.6) * (1 - seg(t, a1 + 2.7, a1 + 2.8)) });
  const kq = seg(t, a1 + 2.8, a1 + 3.3);
  if (kq > 0) {
    panel(x, 414, 540, 124, { r: 8, fill: T.raised, stroke: T.ink, lw: 2, alpha: kq });
    tx("eraseQ", x + 22, 452, { size: 21, weight: 800, color: T.ink, alpha: kq });
    const kw = outlinePill("keep", x + 22, 472, { size: 16, h: 46, alpha: kq });
    inkPill("erase", x + 22 + kw + 12, 472, { size: 16, h: 46, alpha: kq });
  }
  body("eraseLimit", x, 574, 540, { size: 17, color: T.thread, alpha: seg(t, a1 + 3.6, a1 + 4.2) });
}

/* ------------------------------------------------------------- 7 outro */
function sOutro(t, d, cues) {
  const a1 = at(cues, 1, 5.9);
  // first: the privacy page, and zero telemetry
  const out = seg(t, a1 - 0.5, a1);
  const kp = seg(t, 0.2, 0.8) * (1 - out);
  if (kp > 0) {
    phoneFrame(110, 52, 0.66, (w, h) => { if (PRIVACY_IMG.complete && PRIVACY_IMG.naturalWidth) ctx.drawImage(PRIVACY_IMG, 0, 0, w, h); }, { alpha: kp });
    const x = 520;
    heading("privacy", x, 130, 34, seg(t, 0.4, 1.0) * (1 - out));
    line([[x, 150], [1200, 150]], T.ink, 2, kp);
    const kn = seg(t, 1.4, 2.0) * (1 - out);
    tx("never", x, 210, { size: 20, weight: 700, color: T.thread, alpha: kn });
    body("neverBody", x, 248, 640, { size: 24, color: T.ink, alpha: kn, lh: 34 });
    const kt = seg(t, 3.2, 3.8) * (1 - out);
    tx("telemetry", x, 400, { size: 28, weight: 800, color: T.ink, alpha: kt });
    gapLine(x + 170, 391, x + 170 + 220 * seg(t, 3.4, 4.2), { color: T.control, lw: 3, dash: [9, 7], alpha: kt });
    tx("none", x + 420, 400, { size: 28, color: T.thread, alpha: seg(t, 4.0, 4.4) * (1 - out) });
  }
  // then: the title again, and the guide
  const kb = seg(t, a1, a1 + 0.5);
  if (kb > 0) {
    towelBand(0, 110, W, 120, ALL, seg(t, a1, a1 + 1.8));
    padlock(W / 2, 330, 64, { alpha: kb });
    display("title", W / 2, 440, 64, kb, { align: "center" });
    const a2 = at(cues, 2, 7.9), kg = seg(t, a2, a2 + 0.5), uw = txW("url", 24, 600);
    tx("guide", W / 2, 508, { size: 26, weight: 700, color: T.soft, align: "center", alpha: kg });
    tx("url", W / 2, 556, { size: 24, weight: 600, color: T.ink, align: "center", alpha: kg });
    line([[W / 2 - uw / 2, 566], [W / 2 + uw / 2, 566]], T.ink, 2, kg);
  }
}

torchonVideo({
  title: { en: "Your data, on your device" },
  kicker: { en: "AI Nutrition Coach, in video" },
  langs: ["en"],
  strings: STR,
  poster: "backup",
  scenes: {
    intro: sIntro, store: sStore, lock: sLock, backup: sBackup, restore: sRestore, leave: sLeave, outro: sOutro,
  },
});

/* Wait for the screenshot too, so every frame that shows it is deterministic (render.py awaits this). */
window.videoReady = Promise.all([window.videoReady, privacyReady]).then(() => true);
