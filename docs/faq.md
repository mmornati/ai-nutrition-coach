# FAQ

Short answers, with a link to the long one.

## Using it

### Do I need an account?

No. There is no account and no sign-up. You choose a passphrase that encrypts your history in your browser. See
[your first plate](./getting-started.md#4-choose-a-passphrase).

### Does it count calories?

It shows energy alongside protein, carbohydrate, sugars, fat, saturated fat, fibre and salt, per plate and per day, as
plain values against the EU reference intakes, or against your daily guide when you fill in the optional profile. It never
frames them as "calories remaining", a budget or a limit you have failed; past your guide it only says a plain
percentage. An opt-in setting can add one plain line with the distance to your guide. If numbers about food feel stressful, *Settings → Nutrition* hides them. See
[nutrients, against the EU reference intakes](./guide/day-and-week.md#nutrients-against-the-eu-reference-intakes).

### Does it need my weight or height?

No. Both are optional, as is the waist. If you enter them, your daily guide becomes more personal, they stay encrypted
on your device (and in your encrypted backup or sync), you can export and erase them, and they are never sent to an
AI (the coach receives your daily guide, rounded, which is worked out from them). The app never asks for a name or a birth date. See [Settings](./guide/settings.md#profile).

### Does it remind me to weigh myself?

No. There are no reminders, no notifications and no "you have not weighed in" lines. A weigh-in is something you add
when you want to; [Trends](./guide/progress.md) shows a trend through them, in words, without a target.

### Can it help me lose weight?

If you choose that goal and have entered your height and weight, yes, gently: a modest pace, a floor your daily guide
never goes under, and a pointer to a doctor or a dietitian when it would not be wise to go further (a low BMI,
pregnancy or breastfeeding, 65 and over). Without a height and a weight, the guide stays at what keeps your weight
steady and asks for them.
It never labels you and never colours a weight. The floors are conventions, not clinical thresholds.

With that goal the coach helps too, calmly and without AI: at dinner, with a guide of your own, a day well above the guide gets a
note naming the foods that carried the energy; it suggests protein, vegetables or water in place of a sugary drink from the foods
you already log; the week review describes your logged energy and, if you weigh in, your weight trend, as information and never
as a verdict. With an AI and your yes, "how do I lose weight with what I eat?" gets a real answer, within limits: never below
your guide, never fasting or skipped meals, never a comment on your body, and a pointer to a doctor or a dietitian when it matters.
A request for a very low intake or a very fast loss is answered on the device, never sent. With any other goal the coach does
not bring weight loss up.

### Can I change a plate I already logged?

Yes. Open the plate and choose *Edit this plate*: change an amount, remove or add a food, or move it to another meal
or day. A food without a weight or nutrition can be completed there too. See
[editing a plate](./guide/day-and-week.md#editing-a-plate).

An edit replaces the plate with the edited one, so its coach note is rewritten. Two limits are worth knowing when you
use more than one device. If two devices edit the same plate before they sync, both edited versions are kept, and you
can remove the one you do not want. If one device deletes a plate while another edits it, the edit wins only when it
reaches the sync first; otherwise the plate stays deleted, and the editing device says it could not save the changes.

### Why does a total say "at least"?

Because some food on it has no weight, or no value for that nutrient, so the real amount may be higher. A food with
no weight always makes the energy total "at least". For any other nutrient the mark appears only when the foods that
do not know it are more than a tenth of what you ate (by energy, or by weight when the energy is unknown), so one
pinch of herbs without fibre data does not turn the whole day's fibre into "at least". The day lists the foods it
could not count, each with a way to complete it.

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
you can restore it into a new store with the backup's passphrase. For a copy on a server, the **recovery key** you were
shown when you created it lets you set a new passphrase for that copy; without it, a forgotten passphrase for the copy
means it cannot be opened.

### Can I use it on my phone and my laptop?

Yes, but each browser has its own store, and live sync between devices is not built yet. You can carry your history
across with an encrypted backup file, or, if the server you got the app from runs the optional relay, keep an
encrypted copy there (*Your data → Back up to this server*) and restore it, or connect a second device to it, where the
server only ever holds ciphertext
([how it works](./your-data.md#backing-up-to-a-server);
[the roadmap](https://github.com/mmornati/ai-nutrition-coach/blob/main/docs/encrypted-sync-plan.md)).

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

Yes, each on their own device or browser profile, with their own passphrase and history. On a server shared by a family,
each person can keep an encrypted copy with an invite from whoever runs it, and the AI can have a per-person daily limit
([Sharing the instance](./self-host.md#sharing-the-instance-with-other-people)). A copy is not tied to a sign-in identity, and a
browser holds one profile. People who share one browser
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
