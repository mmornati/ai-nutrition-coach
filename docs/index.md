---
title: Documentation
hide:
  - navigation
  - toc
---

# AI Nutrition Coach

<div class="anc-hero">
<div class="anc-hero__text">
<p class="anc-hero__kicker">The documentation</p>
<p class="anc-hero__title">Know what is on your plate. Keep it to yourself.</p>
<p class="anc-hero__lead">A calm meal log for adults. It shows real grams and nutrients, asks one kind question
instead of passing a verdict, and keeps your history encrypted on your own device. No account, and nothing sent
until you choose to.</p>
<p class="anc-hero__actions">
<a class="md-button md-button--primary" href="getting-started/">Log your first plate</a>
<a class="md-button" href="/ai-nutrition-coach/video/">Watch the short tour</a>
</p>
</div>
<figure class="anc-towel" aria-hidden="true">
  <div class="anc-towel__band">
    <div class="anc-towel__stripes"><i class="veg"></i><i class="bare"></i><i class="starch"></i><i class="dairy"></i></div>
    <div class="anc-towel__meal"><span class="anc-towel__name">Breakfast <small>08:10</small></span><span class="anc-towel__foods">Oats, banana, milk</span></div>
  </div>
  <div class="anc-towel__band">
    <div class="anc-towel__stripes"><i class="veg"></i><i class="protein"></i><i class="starch"></i><i class="bare"></i></div>
    <div class="anc-towel__meal"><span class="anc-towel__name">Lunch <small>12:45</small></span><span class="anc-towel__foods">Lentils, rice, spinach</span></div>
  </div>
  <div class="anc-towel__band">
    <div class="anc-towel__open"></div>
    <div class="anc-towel__meal"><span class="anc-towel__name">Dinner</span><span class="anc-towel__foods">Nothing logged yet.</span></div>
  </div>
  <ul class="anc-legend">
    <li class="veg">Veg and fruit</li>
    <li class="protein">Protein</li>
    <li class="starch">Starch</li>
    <li class="dairy">Dairy</li>
  </ul>
</figure>
</div>

The day is a kitchen towel laid on the table. Each meal weaves one band across it, and every food group on the
plate is a dyed stripe in a fixed order: veg and fruit, protein, starch, dairy. A group that is not there leaves
bare cotton. You read balance from which stripes a band carries, never from a score. Tap a band and the numbers
are there, plainly.

## Where to start

<div class="grid cards" markdown>

-   **[Your first plate](getting-started.md)**

    ---

    Install it on your phone, choose a passphrase, log a meal. A few minutes, no sign-up.

-   **[Log a plate](guide/log-a-plate.md)**

    ---

    Type it, scan a barcode, describe it in words or out loud, paste a recipe, or take one photo.

-   **[Your day and your week](guide/day-and-week.md)**

    ---

    The Day Board, a plate's nutrients against the EU reference intakes, and the week as seven towels.

-   **[How it is secured](security.md)**

    ---

    Where your history lives, what could ever leave the device, and the tests that hold each promise.

-   **[Your AI, only if you want it](guide/your-ai.md)**

    ---

    The app is complete without AI. Add your own key, or the AI your server offers, and say yes per use.

-   **[Run your own](self-host.md)**

    ---

    One command, one small hardened container. Your family's app, on your own server.

</div>

## What it will not do

It will not count down calories, keep a streak, hand out badges or turn a plate red. It will not ask for an
account, send your history to a server, or show you an advert. These are rules, written down in the
[No-Dark-Patterns Standard](no-dark-patterns-standard.md) and checked by tests on every change.

## What is not built yet

Sync between devices, a hosted free AI quota, a model running on your device and a dark theme are not built.
Each browser keeps its own encrypted store; an [encrypted backup file](guide/your-data.md) carries your history
from one to another. The plan for an encrypted relay is in the
[roadmap on GitHub](https://github.com/mmornati/ai-nutrition-coach/blob/main/docs/encrypted-sync-plan.md).
