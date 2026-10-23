/* AI Nutrition Coach — "Run your own" (self-host). Drawn with ../torchon.js on ../engine/engine.js.
 * Facts: docs/self-host.md, docs/pwa.md, bin/ai-nutrition-coach, infra/. Terminal lines are the
 * script's real output; plate.example.com is a placeholder domain. Each scene is fn(t, d, cues),
 * a pure function of t; animations hook onto the spoken sentences with at(cues, i). */
"use strict";

const STR = {
  en: {
    episode: "Self-host",
    title: "Run your own",
    tagline: "One command, HTTPS for the phones, and a server that holds none of your data.",
    // server
    sTitle: "A static server, nothing more",
    nginx: "nginx", nginxSub: "nginx-unprivileged · uid 101 · port 8080",
    served: "What it serves",
    noData: "/data", noDataSub: "No volume: nothing on the server to back up",
    c1: "Serves the built app, nothing else", c2: "Needs no outbound network",
    c3: "Non-root user", c4: "Read-only filesystem", c5: "All capabilities dropped",
    c6: "Strict CSP on every response", c7: "Access log off by default",
    // local
    lTitle: "Try it on this machine", yourComputer: "your computer",
    protect: "Protect your history",
    protectSub: "Choose a passphrase. It encrypts everything AI Nutrition Coach saves in this browser.",
    loopback: "127.0.0.1 only", others: "Other devices can't reach it",
    // https
    hTitle: "HTTPS for the phones",
    insecure: "AI Nutrition Coach needs a secure page (https:// or localhost) to protect your data.",
    xStore: "Encrypted store", xCamera: "Camera", xOffline: "Offline use",
    yourServer: "your server",
    secure: "https:// or localhost",
    secureSub: "Browsers give the encryption API, the camera and the service worker only to a secure page. Plain http:// over the network gets none of them.",
    le: "Let's Encrypt, renewed automatically", hsts: "HTTP → HTTPS · HSTS",
    behindTraefik: "behind your Traefik · no published port",
    // update
    uTitle: "The image, and updates",
    edge: "the head of main", release: "a release", sha: "one exact commit",
    scanned: "Scanned with trivy before it is pushed", driven: "Driven in WebKit and Chromium",
    updateMsg: "A new version is ready. Reloading locks your data, so you will enter your passphrase again.",
    reload: "Reload", later: "Later",
    // ai
    aTitle: "AI for everyone here",
    browser: "This browser", browserSub: "a photo, after you say yes",
    server: "This server", serverSub: "adds the key, forces the model", serverPath: "POST /ai/v1/chat/completions",
    provider: "OpenRouter", providerSub: "the provider you name",
    offDefault: "Off by default", rate: "10 requests a minute per address", signIn: "Keep it behind a sign-in",
    spend: "And set a spend limit at the provider.",
    // outro
    stays: "Your data stays in each browser",
    url: "mmornati.github.io/ai-nutrition-coach/docs/self-host/",
  },
};

const ALL = ["veg", "protein", "starch", "dairy"];
const CMD = "bin/ai-nutrition-coach";

/* ------------------------------------------------------------- 1 intro */
function sIntro(t, d, cues) {
  const a1 = at(cues, 1, 2.2);
  towelBand(0, 140, W, 150, ALL, seg(t, 0.15, 2.6));
  sewnLabel("episode", 80, 340, { size: 17, alpha: seg(t, 0.9, 1.4) });
  display("title", 80, 486, 104, seg(t, 0.5, 1.3));
  tx("tagline", 80, 548, { size: 30, color: T.soft, alpha: seg(t, a1, a1 + 0.6) });
}

/* ------------------------------------------------------------ 2 server */
function sServer(t, d, cues) {
  const a0 = at(cues, 0, 0.5), a1 = at(cues, 1, 5.5), a2 = at(cues, 2, 10.5);
  display("sTitle", 80, 120, 52, seg(t, 0.1, 0.7));
  // the container
  const kc = seg(t, 0.3, 0.9), x = 80, y = 162, w = 480, h = 420;
  panel(x, y + (1 - outCubic(kc)) * 14, w, h, { r: 8, fill: T.raised, stroke: T.ink, lw: 2, alpha: kc });
  if (kc > 0) {
    heading("nginx", x + 28, y + 52, 32, kc);
    tx("nginxSub", x + 28, y + 84, { size: 17, color: T.thread, alpha: kc });
    padlock(x + w - 46, y + 50, 40, { alpha: seg(t, a1 + 0.9, a1 + 1.4) });
    tx("served", x + 28, y + 128, { size: 16, weight: 700, color: T.thread, alpha: kc });
    line([[x + 28, y + 140], [x + w - 28, y + 140]], T.ink, 2, kc);
    ["index.html", "assets/…  (content-hashed)", "sw.js", "sqlite3mc/…/sqlite3.wasm"].forEach((f, i) => {
      const fy = y + 172 + i * 34, a = seg(t, a0 + 0.6 + i * 0.2, a0 + 1.0 + i * 0.2);
      tx(f, x + 28, fy, { size: 19, color: T.ink, alpha: a });
      if (i < 3) line([[x + 28, fy + 12], [x + w - 28, fy + 12]], T.seam, 1, a);
    });
    // absence: no data volume, drawn as a dashed seam
    const kd = seg(t, a1 + 1.8, a1 + 2.4);
    dashedRect(x + 28, y + 314, w - 56, 80, 6, T.control, 2, [7, 5], kd);
    tx("noData", x + 50, y + 348, { size: 22, weight: 800, color: T.thread, alpha: kd });
    tx("noDataSub", x + 50, y + 376, { size: 16, color: T.soft, alpha: kd });
  }
  // what that means
  const rows = [["c1", a0 + 1.2], ["c2", a0 + 2.4], ["c3", a1 + 0.3], ["c4", a1 + 1.2], ["c5", a1 + 2.4],
    ["c6", a2 + 0.4], ["c7", a2 + 3.0]];
  rows.forEach(([k, s], i) => {
    const ry = 202 + i * 56, a = seg(t, s, s + 0.5);
    if (a <= 0) return;
    check(660, ry - 8, 26, T.ink, seg(t, s, s + 0.6));
    tx(k, 700, ry, { size: 23, weight: 600, color: T.ink, alpha: a });
    if (i < rows.length - 1) line([[640, ry + 24], [1200, ry + 24]], T.seam, 1, a);
  });
}

/* ------------------------------------------------------------- 3 local */
function sLocal(t, d, cues) {
  const a0 = at(cues, 0, 0.5), a1 = at(cues, 1, 4.0), a2 = at(cues, 2, 8.0);
  display("lTitle", 80, 120, 52, seg(t, 0.1, 0.7));
  terminalCard(80, 152, 1120, 224, t, [
    { p: "$ ", s: CMD + " up", a: a0 + 1.2, b: a0 + 2.4 },
    { s: "ai-nutrition-coach: building ai-nutrition-coach:dev ...", a: a1, c: T.control },
    { s: "ai-nutrition-coach: starting container (static server; your data stays in your browser) ...", a: a1 + 1.1, c: T.control },
    { s: "ai-nutrition-coach is up at http://localhost:8080/", a: a1 + 2.4, w: 700 },
  ], { title: "yourComputer", size: 19, alpha: seg(t, 0.2, 0.6) });
  // the browser on this machine: the first screen
  const kb = seg(t, a1 + 2.8, a1 + 3.4), bx = 80, by = 404, bw = 640, bh = 186;
  if (kb > 0) {
    ctx.save(); ctx.translate(0, (1 - outCubic(kb)) * 12);
    panel(bx, by, bw, bh, { r: 8, fill: T.raised, stroke: T.ink, lw: 2, alpha: kb });
    line([[bx, by + 48], [bx + bw, by + 48]], T.ink, 2, kb);
    [0, 1, 2].forEach(i => ring(bx + 24 + i * 20, by + 24, 5, T.control, 1.5, kb));
    panel(bx + 100, by + 10, 300, 28, { r: 14, fill: T.cloth, stroke: T.controlRaised, lw: 1.5, alpha: kb });
    tx("localhost:8080", bx + 118, by + 30, { size: 16, color: T.soft, alpha: kb });
    display("protect", bx + 28, by + 106, 36, kb);
    body("protectSub", bx + 28, by + 140, bw - 56, { size: 18, alpha: kb });
    ctx.restore();
  }
  // loopback only
  const kl = seg(t, a2, a2 + 0.5);
  if (kl > 0) {
    sewnLabel("loopback", 780, 416, { size: 18, dot: true, alpha: kl });
    gapLine(780, 520, 780 + 300 * seg(t, a2 + 0.2, a2 + 1.0), { color: T.control, lw: 3, dash: [9, 7], alpha: kl });
    dashedRect(1110, 462, 64, 116, 12, T.control, 2, [6, 4], kl);
    cross(1142, 520, 26, T.ink, seg(t, a2 + 0.9, a2 + 1.3));
    tx("others", 780, 572, { size: 20, color: T.soft, alpha: seg(t, a2 + 0.6, a2 + 1.1) });
  }
}

/* ------------------------------------------------------------- 4 https */
function insecureScreen(w, t, a1) {
  panel(20, 60, w - 40, 52, { r: 26, fill: T.raised, stroke: T.controlRaised, lw: 2 });
  tx("http://192.168.1.20:8080", w / 2, 94, { size: 20, color: T.soft, align: "center" });
  body("insecure", 24, 180, w - 48, { size: 25, lh: 34, color: T.ink });
  ["xStore", "xCamera", "xOffline"].forEach((k, i) => {
    const y = 470 + i * 78, a = seg(t, a1 + 0.4 + i * 0.7, a1 + 0.9 + i * 0.7);
    if (a <= 0) return;
    panel(24, y - 38, w - 48, 60, { r: 6, fill: T.raised, stroke: T.controlRaised, lw: 2, alpha: a });
    tx(k, 48, y, { size: 24, weight: 700, color: T.ink, alpha: a });
    cross(w - 60, y - 8, 22, T.ink, seg(t, a1 + 0.6 + i * 0.7, a1 + 1.1 + i * 0.7));
  });
}
function sHttps(t, d, cues) {
  const a1 = at(cues, 1, 2.0), a2 = at(cues, 2, 6.0), a3 = at(cues, 3, 11.5);
  display("hTitle", 80, 120, 52, seg(t, 0.1, 0.7));
  const upAt = a2 + 3.4, sw = seg(t, upAt + 0.2, upAt + 0.7);
  phoneFrame(80, 160, 0.5, (w) => {
    if (sw < 1) { ctx.save(); ctx.globalAlpha *= 1 - sw; insecureScreen(w, t, a1); ctx.restore(); }
    if (sw > 0) { ctx.save(); ctx.globalAlpha *= sw; todayScreen({ k: seg(t, upAt + 0.4, upAt + 2.0) }); ctx.restore(); }
  }, { alpha: seg(t, 0.3, 0.9) });
  // why: a secure context, before the server card takes its place
  const kw = seg(t, a1 + 0.5, a1 + 1.1) * (1 - seg(t, a2 - 0.6, a2 - 0.2));
  if (kw > 0) {
    display("secure", 350, 300, 64, kw);
    body("secureSub", 350, 350, 800, { size: 24, lh: 34, alpha: kw });
  }
  // Caddy
  const kt = seg(t, a2 - 0.2, a2 + 0.3);
  terminalCard(350, 152, 850, 222, t, [
    { p: "$ ", s: "export AI_NUTRITION_COACH_DOMAIN=plate.example.com", a: a2 + 0.2, b: a2 + 1.2 },
    { p: "$ ", s: CMD + " up --tls", a: a2 + 1.4, b: a2 + 2.1 },
    { s: "ai-nutrition-coach: building ai-nutrition-coach:dev ...", a: a2 + 2.4, c: T.control },
    { s: "ai-nutrition-coach: starting compose stack ...", a: a2 + 2.9, c: T.control },
    { s: "ai-nutrition-coach is up at https://plate.example.com/", a: upAt, w: 700 },
  ], { title: "yourServer", size: 18, alpha: kt });
  const kc = seg(t, upAt + 0.3, upAt + 0.8);
  padlock(376, 418, 40, { alpha: kc });
  const lw = sewnLabel("le", 410, 392, { size: 16, alpha: kc });
  sewnLabel("hsts", 410 + lw + 12, 392, { size: 16, alpha: seg(t, upAt + 0.6, upAt + 1.1) });
  // Traefik
  terminalCard(350, 456, 850, 136, t, [
    { p: "$ ", s: CMD + " up --traefik", a: a3 + 1.0, b: a3 + 1.8 },
    { s: "ai-nutrition-coach is up behind Traefik: https://plate.example.com/", a: a3 + 2.6, w: 700 },
  ], { title: "behindTraefik", size: 18, alpha: seg(t, a3, a3 + 0.5) });
}

/* ------------------------------------------------------------ 5 update */
function sUpdate(t, d, cues) {
  const a0 = at(cues, 0, 0.5), a1 = at(cues, 1, 5.0), a2 = at(cues, 2, 8.5);
  display("uTitle", 80, 120, 52, seg(t, 0.1, 0.7));
  const img = "ghcr.io/mmornati/ai-nutrition-coach";
  [[":edge", "edge"], [":X.Y.Z", "release"], [":sha-<7>", "sha"]].forEach(([tag, note], i) => {
    const y = 156 + i * 58, a = seg(t, a0 + 1.0 + i * 0.4, a0 + 1.5 + i * 0.4);
    const w = sewnLabel(img + tag, 80, y, { size: 17, alpha: a });
    tx(note, 80 + w + 16, y + 26, { size: 18, color: T.thread, alpha: a });
  });
  terminalCard(80, 336, 680, 80, t, [
    { p: "$ ", s: "docker compose pull && docker compose up -d", a: a0 + 2.6, b: a0 + 3.8 },
  ], { size: 19, alpha: seg(t, a0 + 2.2, a0 + 2.7) });
  [["scanned", a1 + 0.2], ["driven", a1 + 1.4]].forEach(([k, s], i) => {
    const y = 476 + i * 48, a = seg(t, s, s + 0.5);
    if (a <= 0) return;
    check(96, y - 8, 24, T.ink, seg(t, s, s + 0.6));
    tx(k, 130, y, { size: 22, weight: 600, color: T.ink, alpha: a });
  });
  // the installed app: the calm update line
  const kb = seg(t, a2 + 1.6, a2 + 2.2), press = seg(t, a2 + 4.6, a2 + 4.72) * (1 - seg(t, a2 + 4.85, a2 + 5.0));
  phoneFrame(880, 110, 0.56, (w) => {
    todayScreen({ log: kb <= 0 });
    if (kb > 0) {
      ctx.save(); ctx.translate(0, (1 - outCubic(kb)) * 20);
      panel(14, 560, w - 28, 186, { r: 8, fill: T.raised, stroke: T.ink, lw: 2, alpha: kb });
      body("updateMsg", 34, 598, w - 68, { size: 18, lh: 25, color: T.ink, alpha: kb });
      const rw = inkPill("reload", 34, 680, { size: 18, h: 50, alpha: kb, press });
      outlinePill("later", 34 + rw + 12, 680, { size: 18, h: 50, alpha: kb });
      ctx.restore();
    }
  }, { alpha: seg(t, 0.3, 0.9) });
}

/* ---------------------------------------------------------------- 6 ai */
function flowBox(k, x, y, w, h, title, sub, o = {}) {
  if (k <= 0) return;
  const ink = !!o.ink;
  ctx.save(); ctx.translate(0, (1 - outCubic(k)) * 12);
  panel(x, y, w, h, { r: 8, fill: ink ? T.ink : T.raised, stroke: T.ink, lw: 2, alpha: k });
  heading(title, x + 24, y + 40, 26, k, { color: ink ? T.cloth : T.ink });
  tx(sub, x + 24, y + 70, { size: 18, color: ink ? T.cloth : T.soft, alpha: k });
  if (o.path) tx(o.path, x + 24, y + 98, { size: 16, color: ink ? T.seam : T.thread, alpha: k });
  ctx.restore();
}
function sAi(t, d, cues) {
  const a0 = at(cues, 0, 0.5), a1 = at(cues, 1, 4.5), a2 = at(cues, 2, 9.0);
  display("aTitle", 80, 120, 52, seg(t, 0.1, 0.7));
  terminalCard(80, 152, 600, 228, t, [
    { s: "AI_PROXY_ENABLED=1", a: a0 + 1.6, b: a0 + 2.1 },
    { s: "AI_PROXY_UPSTREAM=https://openrouter.ai/api/v1", a: a0 + 2.2, b: a0 + 3.0 },
    { s: "AI_PROXY_KEY=••••••••••••", a: a0 + 3.1, b: a0 + 3.6 },
    { s: "AI_PROXY_MODEL=google/gemini-2.0-flash-001", a: a0 + 3.7, b: a0 + 4.4 },
  ], { title: "infra/.env", size: 18, alpha: seg(t, a0 + 1.2, a0 + 1.7) });
  // the flow, top to bottom
  const x = 760, w = 440;
  flowBox(seg(t, a1, a1 + 0.5), x, 152, w, 92, "browser", "browserSub");
  flowBox(seg(t, a1 + 0.6, a1 + 1.1), x, 290, w, 120, "server", "serverSub", { ink: true, path: "serverPath" });
  flowBox(seg(t, a1 + 2.4, a1 + 2.9), x, 456, w, 92, "provider", "providerSub");
  const k1 = seg(t, a1 + 0.4, a1 + 0.9), k2 = seg(t, a1 + 2.2, a1 + 2.7);
  arrow(x + 60, 248, x + 60, 286, k1, T.ink);
  arrow(x + 60, 414, x + 60, 452, k2, T.ink);
  if (k1 >= 1) packets(x + 60, 248, x + 60, 280, t, { n: 1, period: 1.0, color: T.ink, r: 3 });
  if (k2 >= 1) packets(x + 60, 414, x + 60, 446, t, { n: 1, period: 1.0, color: T.ink, r: 3 });
  padlock(x + w - 44, 330, 36, { alpha: seg(t, a1 + 1.0, a1 + 1.5), fill: T.ink, color: T.cloth });
  // the guard rails
  [["offDefault", a2 + 0.3], ["rate", a2 + 1.0], ["signIn", a2 + 2.0]].forEach(([k, s], i) => {
    sewnLabel(k, 80, 404 + i * 52, { size: 17, dot: true, alpha: seg(t, s, s + 0.5) });
  });
  tx("spend", 80, 584, { size: 19, color: T.soft, alpha: seg(t, a2 + 2.6, a2 + 3.1) });
}

/* ------------------------------------------------------------- 7 outro */
function sOutro(t, d, cues) {
  const a0 = at(cues, 0, 0.5), a1 = at(cues, 1, 4.0);
  towelBand(0, 96, W, 110, ALL, seg(t, 0.1, 2.2));
  terminalCard(W / 2 - 330, 238, 660, 128, t, [
    { p: "$ ", s: CMD + " down", a: a0 + 0.6, b: a0 + 1.4 },
    { s: "ai-nutrition-coach: stopped.", a: a0 + 1.8, w: 700 },
  ], { size: 20, alpha: seg(t, 0.2, 0.6) });
  sewnLabel("stays", W / 2, 390, { size: 17, dot: true, align: "center", alpha: seg(t, a0 + 2.4, a0 + 2.9) });
  display("title", W / 2, 510, 64, seg(t, a1 - 0.3, a1 + 0.4), { align: "center" });
  const ku = seg(t, a1 + 0.6, a1 + 1.2), uw = txW("url", 24, 600);
  tx("url", W / 2, 566, { size: 24, weight: 600, color: T.ink, align: "center", alpha: ku });
  line([[W / 2 - uw / 2, 576], [W / 2 + uw / 2, 576]], T.ink, 2, ku);
}

torchonVideo({
  title: { en: "Run your own · AI Nutrition Coach" },
  kicker: { en: "One command, HTTPS for the phones, and a server that holds none of your data" },
  langs: ["en"],
  strings: STR,
  poster: "https",
  scenes: { intro: sIntro, server: sServer, local: sLocal, https: sHttps, update: sUpdate, ai: sAi, outro: sOutro },
});
