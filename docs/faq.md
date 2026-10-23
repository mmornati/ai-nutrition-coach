# FAQ

Short answers, with a link to the long one.

## Using it

### Do I need an account?

No. There is no account and no sign-up. You choose a passphrase that encrypts your history in your browser. See
[your first plate](./getting-started.md#4-choose-a-passphrase).

### Does it count calories?

It shows energy alongside protein, carbohydrate, sugars, fat, saturated fat, fibre and salt, per plate and per day, as
plain values against the EU reference intakes. It never frames them as "calories remaining", a budget or a limit you
have failed. If numbers about food feel stressful, *Settings → Nutrition* hides them. See
[nutrients, against the EU reference intakes](./guide/day-and-week.md#nutrients-against-the-eu-reference-intakes).

### Is there a score, a streak or a badge?

No, and there will not be. The [No-Dark-Patterns Standard](./no-dark-patterns-standard.md) rules them out and tests
enforce it. Balance is read from which food groups a meal carries, not from a grade.

### Do I need an AI?

No. Typing, barcodes, describing a meal in words, pasting a recipe, saved meals, the coach's questions and the week
review all work without one. An AI adds photo recognition, a smarter *Describe*, voice, and coach notes written by the
AI. See [Your AI](./guide/your-ai.md).

### Which AI can I use?

Any OpenAI-compatible endpoint with your own key, or the AI your server's operator offers, if they set one up. A hosted
free quota and a local model are not built yet. See [Your AI](./guide/your-ai.md) and [AI tiers, in detail](./ai-tiers.md).

### Does it work offline?

Yes, once it has loaded once. Typing, the food list, describing without AI, the Day Board, the week and the coach's
questions run on the device. Barcode lookups and AI calls need a connection; the meal still lands without them.

### Which languages?

English and French. It follows your device until you choose in *Settings → Language*. See
[Languages](./guide/languages.md).

### Is there a video?

Yes: a [short tour](/ai-nutrition-coach/video/) of about a minute and a quarter, and an episode for each part of the app, gathered on
[Videos](./videos.md).

### Is it a medical or diet app?

No. It is a meal log with a calm coach for adults. The coach gives no diagnosis, treatment or medication advice, and
points to a doctor or a support service for a symptom or a worry about eating.

## Your data

### Where is my data?

In an encrypted database inside your browser, on your device. The server holds none of it. See
[how it is secured](./security.md).

### What if I forget my passphrase?

It cannot be recovered, by anyone. The unlock screen offers *Erase and start over*. If you saved an encrypted backup,
you can restore it into a new store with the backup's passphrase.

### Can I use it on my phone and my laptop?

Yes, but each browser has its own store for now: devices do not sync. You can carry your history across with an
encrypted backup file. A relay for cross-device sync, where the server only holds ciphertext, is planned and not built;
see [the roadmap](https://github.com/mmornati/ai-nutrition-coach/blob/main/docs/encrypted-sync-plan.md).

### I logged in Safari, then installed the app on my iPhone, and my plates are gone

iOS keeps an installed web app's data apart from Safari's. Your plates are still in Safari. Save an encrypted backup
there and restore it in the installed app. Install first, then log, to avoid this.

### Can I get my data out?

Yes: CSV and JSON exports, offline, from *Settings → Your data*. They are plain files and cannot be imported back; use
the encrypted backup for that. See [Back up, export, erase](./guide/your-data.md#export).

### Does it send anything about me?

Not by default: there is no telemetry, analytics or crash reporting, and the import-based gate
`tools/check_telemetry_claims.mjs` (`pnpm check:telemetry`) fails the build if that changes. Barcode lookups and AI
calls happen only when you use them, and nothing goes to an AI before you say yes. See [What leaves the device](./telemetry-posture.md).

### Can several people share one install?

Yes, each on their own device or browser profile, with their own passphrase and history. People who share one browser
profile share one history. See [Back up, export, erase](./guide/your-data.md#two-things-worth-knowing).

## Running it

### How do I host it?

`bin/ai-nutrition-coach up` on a machine with Docker, or the published image
`ghcr.io/mmornati/ai-nutrition-coach`. For phones you need HTTPS: `up --tls` with a domain name, or your own Traefik.
See [Self-host](./self-host.md).

### Why does it refuse plain HTTP on my network?

The browser only offers the encryption API, the camera and offline use on secure pages (HTTPS or localhost). Plain
HTTP would also let anyone on the network change the code and read your passphrase.

### How do updates reach the phones?

Deploy the new image. Installed apps notice it when they open and show "A new version is ready"; *Reload* when it
suits you. Your data is untouched. See [The installable app](./pwa.md#updating).

### Can I offer AI to everyone on my instance?

Yes: put one OpenAI-compatible key on the server. It never reaches the browsers, and each person still says yes before
anything of theirs is sent. Rate limits and costs are covered in
[Self-host](./self-host.md#offer-ai-to-everyone-on-your-instance).

### Which browsers are supported?

Chromium and WebKit are tested with Playwright, in CI and against the production image. Firefox is untested, and real
devices are not part of the automated tests. See the [known accepted gaps](https://github.com/mmornati/ai-nutrition-coach/blob/main/README.md#known-accepted-gaps).

### How can I help?

Read [CONTRIBUTING.md](https://github.com/mmornati/ai-nutrition-coach/blob/main/CONTRIBUTING.md). Translations, real-device testing and careful reviews are all welcome.
