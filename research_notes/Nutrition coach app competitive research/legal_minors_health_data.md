# Legal and regulatory constraints: minors and health data for a self-hosted, local-first nutrition coach PWA (as of Oct 2026)

> NOT LEGAL ADVICE. These are research notes compiled 2026-10-21 from primary sources where they could be fetched and law-firm analyses (marked as secondary). Several items are subject to pending litigation or recent amendments; dates are flagged. A lawyer in each target jurisdiction should review before any children/family mode ships.

Context assumed: open-source PWA, no accounts, no telemetry, encrypted on-device storage, optional sync to user's own server, optional AI via the user's own API key or an instance-wide key proxied through the self-hoster's server. Currently adults-only.

## 1. COPPA (US): the 2025 amended rule, scope, and the "parent logs child's meals" case

### Takeaway
The amended COPPA Rule (published 22 Apr 2025, effective 23 Jun 2025, full compliance due 22 Apr 2026, now in force) adds biometric identifiers, a separate parental consent for third-party disclosures (with AI training expressly "never integral"), a written retention policy and a written security programme. COPPA attaches to the "operator" that collects personal information online *from* children; information an adult provides about a child, and data that stays on the device and is never transmitted, are outside it, which makes a parent-operated, local-only family mode the lowest-risk design.

### Cited Findings
- Timeline: published in the Federal Register 22 Apr 2025, effective 23 Jun 2025, full compliance 22 Apr 2026 (safe-harbor programmes had earlier dates) — [Latham & Watkins (secondary)](https://www.lw.com/en/insights/ftc-publishes-updates-to-coppa-rule); [Loeb & Loeb (secondary)](https://www.loeb.com/en/insights/publications/2025/05/childrens-online-privacy-in-2025-the-amended-coppa-rule). Primary text: [Federal Register 2025-05904](https://www.federalregister.gov/documents/2025/04/22/2025-05904/childrens-online-privacy-protection-rule) (the page could not be fetched directly; it was blocked by a bot-check).
- History: the FTC announced the final amendments on 16 Jan 2025, but they had not been published before the change of administration. A 20 Jan 2025 regulatory freeze delayed them until Chair Ferguson's review — [Venable (secondary)](https://www.venable.com/insights/publications/2025/01/ftc-finalizes-coppa-rule-changes-in-the-biden).
- Biometric identifiers are now part of "personal information": fingerprints, voiceprints, handprints, retina and iris patterns, and genetic data. The rule also covers cases where an image of a biometric trait (e.g., a photograph) is turned into a template that can identify a person. The broader proposed language on data derived from voice, gait or face was dropped — [Latham & Watkins](https://www.lw.com/en/insights/ftc-publishes-updates-to-coppa-rule).
- Separate verifiable parental consent is now required before disclosing a child's personal information to third parties (§312.5(a)(2)), unless the disclosure is integral to the service. The FTC states that disclosures "for developing or training AI technology" are never integral, and neither are disclosures for money or advertising — [Latham & Watkins](https://www.lw.com/en/insights/ftc-publishes-updates-to-coppa-rule).
- The direct notice to parents must name the third-party recipients (or specific categories of them) and their purposes. It must also say that a parent can consent to collection without consenting to disclosure — [Loeb & Loeb](https://www.loeb.com/en/insights/publications/2025/05/childrens-online-privacy-in-2025-the-amended-coppa-rule).
- Written data retention policy (§312.10): data may be kept only as long as reasonably necessary for the purpose it was collected for, never indefinitely, and the policy must be in the online notice. A general policy covering all data is sufficient — [Latham & Watkins](https://www.lw.com/en/insights/ftc-publishes-updates-to-coppa-rule).
- Written information security programme: safeguards proportionate to the sensitivity of the data and the operator's size. It must designate a coordinator and include at least annual risk assessments — [Latham & Watkins](https://www.lw.com/en/insights/ftc-publishes-updates-to-coppa-rule); [Data Privacy + Security Insider (secondary)](https://www.dataprivacyandsecurityinsider.com/2025/01/ftc-announces-updates-to-coppa-rule/).
- "Mixed audience" is now a standalone definition. It is a subset of child-directed services, and such services may age-screen and then apply COPPA to users under 13. New evidence factors for "directed to children" include marketing materials, representations to consumers or third parties, user and third-party reviews, and the age of users on similar services. The FTC rejected a percentage-of-users safe harbor — [Latham & Watkins](https://www.lw.com/en/insights/ftc-publishes-updates-to-coppa-rule).
- Not adopted: limits on push notifications or engagement nudges. The FTC said it "remains deeply concerned" about these practices and may pursue them under FTC Act §5 — [Latham & Watkins](https://www.lw.com/en/insights/ftc-publishes-updates-to-coppa-rule).
- Who is covered: operators of commercial websites or online services, including apps, that are directed to children under 13 and collect their personal information. Operators of general-audience services are covered when they have "actual knowledge" that they collect from under-13s. Nonprofits are generally not covered (FAQ B.5). Foreign services directed to US children are covered (B.7) — [FTC COPPA FAQ](https://www.ftc.gov/business-guidance/resources/complying-coppa-frequently-asked-questions).
- **Parent as user:** COPPA applies only to information collected online *from* a child. Information collected from parents or other adults is not covered (FAQ A.8). An adult uploading a photo of a child to a general-audience service does not trigger COPPA, but a child-directed operator should assume the uploader may be a child (F.4) — [FTC COPPA FAQ](https://www.ftc.gov/business-guidance/resources/complying-coppa-frequently-asked-questions).
- **Local-only processing:** an app is not "collecting" personal information when it only uses data stored on the device and never transmits it (FAQ F.5) — [FTC COPPA FAQ](https://www.ftc.gov/business-guidance/resources/complying-coppa-frequently-asked-questions).
- Actual knowledge can come from a parent stating a child's age, from age-identifying content seen by staff, or from an email from a child (H.1, H.4, H.6). Age screens must be neutral (D.7, D.8). General-audience sites may block under-13s (H.3) — [FTC COPPA FAQ](https://www.ftc.gov/business-guidance/resources/complying-coppa-frequently-asked-questions).
- Child-directed operators are responsible for data collected by third parties (plug-ins, SDKs) on their service and must investigate those parties' practices (D.9, D.11) — [FTC COPPA FAQ](https://www.ftc.gov/business-guidance/resources/complying-coppa-frequently-asked-questions).

### Inferences
- **Open-source code vs. operator:** COPPA regulates the "operator" who collects data through a commercial online service. A project that only publishes code and never receives data is probably not an operator for self-hosted instances. The self-hoster who runs a sync server or AI proxy that receives data could be one, but only if the instance is commercial and either child-directed or has actual knowledge. A family self-hosting for itself is very unlikely to be a "commercial" operator. No source addressed open-source self-hosting directly, so this is an inference.
- **Direct-to-AI calls:** when the user's own API key sends a child's meal photo or text from the browser straight to an AI provider, the transmission is to a third party. If the app counted as child-directed, or the child were the user, this would fall under the new separate-consent rule. Training use by the provider would never be integral. Keeping the parent as the user (FAQ A.8) and keeping the service general-audience and adult-directed is the main mitigation.
- A child-facing UI (cartoon characters, child-oriented language, marketing to families with young children) could make the service "directed to children" under the new factors. Marketing copy and app-store listings count as evidence.
- Photos of a child's face sent to an AI provider are "personal information" (photo or image of a child). They could also be a biometric template if the provider derives one.

### Gaps
- Could not fetch the Federal Register text itself (bot-block), so section-number citations come from Latham & Watkins.
- No FTC guidance found on open-source or self-hosted software and "operator" status.
- No FTC enforcement since April 2026 under the amended rule was researched.

## 2. FTC/DOJ v. Kurbo and WW International (2022)

### Takeaway
Kurbo was a children's weight-management app. Its weak age gate and unverifiable "I'm a parent" sign-up led to a $1.5M penalty, deletion of the unlawfully collected data, destruction of models and algorithms derived from it, and retention limits. It is the closest precedent for any kids' nutrition feature.

### Cited Findings
- Kurbo by WW was marketed to children "as young as eight" as well as teens and families. It tracked food intake, activity and weight, and collected names, emails and birth dates — [FTC press release, 4 Mar 2022](https://www.ftc.gov/news-events/news/press-releases/2022/03/ftc-takes-action-against-company-formerly-known-weight-watchers-illegally-collecting-kids-sensitive).
- Users could sign up as a parent or as a child over 13. The FTC alleged the flow encouraged under-13s to claim to be older. From 2014 to 2019, hundreds of users later changed their birthdates to under 13 and kept access. There was no mechanism to confirm that "parents" were parents, and the parental notice sat behind a buried hyperlink — [FTC press release](https://www.ftc.gov/news-events/news/press-releases/2022/03/ftc-takes-action-against-company-formerly-known-weight-watchers-illegally-collecting-kids-sensitive).
- Data was kept indefinitely unless a parent asked for deletion. The order bars keeping data from under-13s for more than a year after the child's last use — [FTC press release](https://www.ftc.gov/news-events/news/press-releases/2022/03/ftc-takes-action-against-company-formerly-known-weight-watchers-illegally-collecting-kids-sensitive).
- Remedies: delete illegally collected data, destroy algorithms and work product derived from it, destroy non-compliant data unless parental consent is obtained, and pay a $1.5M civil penalty. The DOJ filed the case in N.D. Cal. on the FTC's referral (5-0 vote), and the order was approved on 3 Mar 2022 — [FTC press release](https://www.ftc.gov/news-events/news/press-releases/2022/03/ftc-takes-action-against-company-formerly-known-weight-watchers-illegally-collecting-kids-sensitive).
- This was the first COPPA order requiring deletion of algorithms built from unlawfully collected data — [WilmerHale (secondary)](https://www.wilmerhale.com/en/insights/blogs/wilmerhale-privacy-and-cybersecurity-law/20220309-ftc-settles-with-weight-loss-company-over-childrens-data); [CyberScoop](https://cyberscoop.com/ftc-settlement-ww-weight-watchers-kurbo-children-prvacy/).

### Inferences
- Lessons for this project:
  - Do not offer a child-self-signup path.
  - An age gate that children can bypass, combined with knowledge that they are under 13, creates liability.
  - Indefinite retention of children's data is itself a violation theme.
  - Any model or personalisation trained on children's data is at risk of a destruction order.
  - Weight-focused framing for children drew public criticism, though the legal action rested on privacy, not content.
- The project's local-first design avoids the central collection that made Kurbo an operator. The risk comes back through the sync server or AI proxy if a self-hoster runs them for other families.

### Gaps
- The complaint PDF was not fetched. Details come from the FTC press release.

## 3. GDPR, UK Children's Code, DSA

### Takeaway
In the EU, data revealing health (meal logs tied to diet or weight goals, allergies, conditions) is special-category data, which needs explicit consent (Art. 9) and probably a DPIA. A child can consent alone only from the national age (13 to 16; France 15, Germany 16). The household exemption covers a family processing its own data locally. It does not cover anyone who "provides the means" and processes data, such as a self-hoster running sync or an AI proxy for others, who becomes a controller. The UK Children's Code (15 standards) applies to services "likely to be accessed" by children. The DSA minors guidelines largely exempt micro and small enterprises.

### Cited Findings
- Art. 8 GDPR: when consent is the legal basis for an information-society service offered directly to a child, the child must be at least 16, or a lower national age not below 13. Otherwise a holder of parental responsibility must give or authorise consent, and the controller must make "reasonable efforts" to verify this — [GDPR Art. 8 text](https://rgpd.com/gdpr/chapter-2-principles/article-8-conditions-applicable-to-childs-consent-in-relation-to-information-society-services); official: [EUR-Lex Regulation 2016/679](https://eur-lex.europa.eu/eli/reg/2016/679/oj).
- National ages per one secondary table: 13 for BE, CZ, DK, EE, FI, LV, PT, SE (and the UK); 14 for AT, BG, CY, IT, LT, ES; 15 for FR, GR, SI; 16 for DE, IE, HR, HU, LU, MT, NL, PL, RO, SK — [presencis.com (secondary)](https://presencis.com/regulations/gdpr/article-8/); also [Bird & Bird children-in-digital-world tracker](https://childreninthedigitalworld.twobirds.com/home/eu). Ireland is disputed in older sources, where 13 was proposed in 2017 — [Irish Legal News](https://www.irishlegal.com/articles/department-of-justice-consulting-on-age-of-digital-consent). The table should be verified against national statutes.
- Recital 18: the GDPR does not apply to a natural person's purely personal or household activity, "however, this Regulation applies to controllers or processors which provide the means for processing personal data for such personal or household activities" — [Recital 18](https://luxgap.com/lois/rgpd/cons-18/?lang=en); [EUR-Lex](https://eur-lex.europa.eu/eli/reg/2016/679/oj).
- CNIL mobile app recommendations (Sept 2024):
  - A party that only provides application code to the publisher has "no responsibility" as controller or processor.
  - For health apps, the household exemption may apply where data is "stored locally, without external connection, for personal purposes only" and the app has no remote-service function.
  - Health data needs explicit, informed, separate consent, and device permissions are not GDPR consent.
  - Source: [Simmons & Simmons summary (secondary)](https://www.simmons-simmons.com/en/publications/cm3x6ddmg03zqtr0k9i1261m7/cnil-s-mobile-app-review-balancing-innovation-and-data-protection).
- EDPB connected-vehicle guidelines take the same line: a driver's local processing may be household, but designers, suppliers and manufacturers who provide the means remain subject to the GDPR — [McCann FitzGerald (secondary)](https://www.mccannfitzgerald.com/knowledge/data-privacy-and-cyber-risk/edpb-adopts-guidelines-on-connected-vehicles-following-public-consultation).
- UK Children's Code: a statutory code under the DPA 2018, in force since 2 Sep 2021, for services "likely to be accessed by a child" — [Simmons & Simmons](https://www.simmons-simmons.com/en/publications/ckgs2ty6aadwl0a43e3avb7r3/ico-s-age-appropriate-design-code-comes-into-force); [ICO standards page](https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/childrens-information/childrens-code-guidance-and-resources/age-appropriate-design-a-code-of-practice-for-online-services/code-standards/). Its 15 standards are:
  1. best interests of the child
  2. DPIAs
  3. age-appropriate application
  4. transparency
  5. detrimental use of data
  6. policies and community standards
  7. default settings (high privacy)
  8. data minimisation
  9. data sharing
  10. geolocation (off by default)
  11. parental controls (child told when monitored)
  12. profiling (off by default)
  13. nudge techniques
  14. connected toys and devices
  15. online tools
  - Source: [ICO](https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/childrens-information/childrens-code-guidance-and-resources/age-appropriate-design-a-code-of-practice-for-online-services/code-standards/).
- Code standard 3: either establish age with certainty proportionate to the risk or apply the code to all users. Standard 13: nudges must not lead children to provide unnecessary data or weaken their privacy settings — [HSF (secondary)](https://www.hsfkramer.com/notes/data/2020-01/the-ico-publishes-its-age-appropriate-design-code-of-practice-for-online-services).
- DSA Art. 28 minors guidelines (14 Jul 2025): non-binding. They apply to online platforms "accessible to minors", read broadly, so a clause saying minors are not allowed does not exempt a platform without effective measures. Micro and small enterprises are excluded unless designated as a VLOP — [Taylor Wessing](https://www.taylorwessing.com/en/insights-and-events/insights/2025/07/rd-european-commission-guidelines-on-protection-of-minors-under-the-digital-services-act); [William Fry](https://www.williamfry.com/knowledge/deep-dive-on-new-child-online-safety-guidelines/); [Merlin/EAO](https://merlin.obs.coe.int/article/10383).

### Inferences
- **Art. 9 health data:** meal logs alone may not be health data. Combined with weight, goals, allergies, conditions or dietary restrictions they likely reveal health status. For a child they should be treated as special-category data. Lawful processing by a controller would need explicit consent (Art. 9(2)(a)) given by the parent for a child under the national age. Art. 35 DPIAs are expected for large-scale special-category data or vulnerable data subjects (children). Primary text: [EUR-Lex GDPR](https://eur-lex.europa.eu/eli/reg/2016/679/oj). Art. 9 and Art. 35 wording was not fetched in this session.
- **Roles:**
  - The upstream open-source project is likely neither controller nor processor if it receives no data (CNIL "code only").
  - A household self-hosting for itself is likely within the household exemption.
  - A self-hoster running sync or an AI proxy for other families is a controller. With a family mode, that controller processes children's health data and needs Art. 8/9 consent, a DPIA and privacy-by-design (Art. 25).
  - The AI provider is a processor, or an independent controller if it uses inputs for training.
- **Art. 25 privacy by design and by default:** the existing on-device encryption, no telemetry and no accounts are strong evidence of compliance. Defaults should keep AI and sync off for child profiles.
- **DSA:** the app is not an "online platform", since there is no dissemination of user content to the public. The DSA is therefore likely irrelevant unless a sharing or social feature is added.
- **UK Code:** if a family mode makes the service "likely to be accessed" by children, the self-hoster or operator would need to apply the 15 standards. Parent-operated design reduces but does not eliminate this, because children may view or use the parent's device.

### Gaps
- No EDPB statement found that directly addresses open-source self-hosted apps.
- No CNIL guidance specific to parental use of nutrition apps for children.
- The national digital consent ages come from a secondary table.

## 4. US state laws: consumer health data, Age-Appropriate Design Codes, app-store age verification

### Takeaway
Washington's My Health My Data Act (in force since March 2024, with a private right of action and no size threshold) is the main state risk for any operator that receives consumer health data from Washington residents. Nevada SB 370 and Connecticut's CTDPA amendments are similar. New York's broader bill was vetoed (19 Dec 2025). California's AADC is partly enjoined after a 12 Mar 2026 Ninth Circuit ruling. App-store age-verification laws are in flux: Texas is in effect after a 5th Cir. stay (28 May 2026), and Utah's operational duties were delayed to 6 May 2027.

### Cited Findings
- MHMDA: in effect since March 2024. It applies to entities doing business in WA, or targeting WA consumers, that determine the purpose and means of processing consumer health data. Its definition covers data identifying past, present or future physical or mental health status. It has a private right of action through the WA Consumer Protection Act. The first class action, against Amazon over an Ads SDK collecting location data, was filed 10 Feb 2025 — [Orrick (secondary)](https://www.orrick.com/en/Insights/2025/02/First-Lawsuit-Filed-Under-Washingtons-My-Health-My-Data-Act); [WilmerHale](https://www.wilmerhale.com/en/insights/blogs/wilmerhale-privacy-and-cybersecurity-law/20250220-first-lawsuit-filed-under-washingtons-my-health-my-data-act); [FKKS](https://technologylaw.fkks.com/post/102jzzg/amazon-faces-lawsuit-under-washingtons-my-health-my-data-privacy-law).
- Other consumer health data laws: WA MHMDA (May 2023), Connecticut Data Privacy Act amendments (June 2023), Nevada SB 370 (described as passed March 2024 by the source). New York's S.929 would have been the fourth but was vetoed on 19 Dec 2025 over broad definitions — [Healthcare Brew](https://www.healthcare-brew.com/stories/2026/01/12/new-york-governor-vetoes-health-data-privacy-bill); [Epstein Becker Green](https://www.ebglaw.com/health-law-advisor/new-yorks-health-information-privacy-act-poised-to-become-the-latest-in-a-growing-trend-of-state-data-privacy-laws). Connecticut's law lacks a private right of action and exempts nonprofits — [Captain Compliance (low-quality secondary)](https://captaincompliance.com/education/the-veto-of-new-york-senate-bill-s929-divergence-in-state-consumer-health-data-privacy-frameworks/).
- California AADC (NetChoice v. Bonta, 9th Cir. No. 25-2366, decided 12 Mar 2026): the injunction was narrowed. The coverage definition and the age-estimation provision were not facially enjoined. The data-use restrictions and the dark-patterns ban remain blocked as likely vague. The case was remanded on age estimation and severability. The state had agreed to a temporary stay of enforcement, so the practical enforceability of the law is uncertain — [Cooley](https://www.cooley.com/news/insight/2026/2026-03-30-netchoice-v-bonta-ninth-circuit-narrows-injunction-against-californias-ageappropriate-design-code-act); [Holland & Knight](https://www.hklaw.com/en/insights/publications/2026/03/ninth-circuit-issues-mixed-ruling-on-california-age-appropriate-design-code-act).
- Texas App Store Accountability Act (SB 2420): preliminarily enjoined in late 2025 (W.D. Tex., 1:25-cv-01660-RP). The 5th Circuit stayed that injunction on 28 May 2026, so the law is in effect pending the merits. One firm reports the Supreme Court declined to block it, which is unconfirmed — [Morrison Foerster](https://www.mofo.com/resources/insights/251111-texas-targets-app-stores-with-new-accountability-law).
- Utah: CCIA voluntarily dismissed its challenge on 21 Apr 2026 after amendments that delay operational requirements to 6 May 2027. Louisiana enacted a similar law in 2025 — [FPF comparison](https://fpf.org/blog/comparing-enacted-app-store-accountability-acts/); [JD Supra topic page](https://jdsupra.com/topics/app-store/).

### Inferences
- MHMDA has no revenue threshold and includes a private right of action, so a self-hoster that serves WA residents through sync or an AI proxy could face exposure. A family using its own instance is unlikely to be "conducting business". The upstream project, which collects nothing, is likely out of scope.
- App-store laws mainly bind app stores and developers distributing through them. A PWA installed from the browser largely sidesteps them. Listing in the Apple or Google stores would bring age-rating and age-signal duties, especially in Texas.

### Gaps
- MHMDA case progress after early 2025 was not checked.
- Exact Nevada and Connecticut thresholds were not verified.
- Other 2026 state kids' codes (e.g., Maryland Kids Code, Vermont, Nebraska) were not researched.
- The Supreme Court action on Texas SB 2420 is unconfirmed.

## 5. Medical device, health claims, and the EU AI Act

### Takeaway
A nutrition coach that only supports a healthy lifestyle is outside the FDA device definition and EU MDR, provided its intended purpose avoids diagnosing, treating or preventing disease. Features for diabetes, eating disorders, renal diets or clinical weight-loss would change that. Under the EU AI Act, an AI nutrition coach is not a listed Annex III high-risk use. Art. 50 chatbot disclosure has applied since 2 Aug 2026. The Art. 5(1)(b) ban on exploiting age-related vulnerabilities is relevant to any child-facing engagement design.

### Cited Findings
- FDA General Wellness guidance was revised 6 Jan 2026 and supersedes the 2019 and 2022 versions. It keeps a two-part test: intended only for general wellness, and low risk. Software functions intended solely for maintaining or encouraging a healthy lifestyle, and unrelated to diagnosis, cure, mitigation, prevention or treatment of disease, are excluded from the device definition. The guidance's examples include products that "help the user manage a healthy eating plan". It also loosened the rules for wellness wearables that estimate physiologic parameters — [Covington](https://www.cov.com/news-and-insights/insights/2026/01/fda-issues-revised-guidance-on-general-wellness-products); [King & Spalding](https://www.kslaw.com/insights/articles/fda-updates-general-wellness-and-clinical-decision-support-guidance-documents); [Foley](https://www.foley.com/p/102meea/digital-health-policy-fda-relaxes-restrictions-over-wearables-and-ai-decision-ma/); [Honigman](https://www.honigman.com/alert-3236).
- EU MDR software qualification (MDCG 2019-11 Rev.1, June 2025): qualification depends on the manufacturer's stated intended purpose. General wellness and lifestyle software is excluded. Under Rule 11, software informing diagnostic or therapeutic decisions is class IIa or higher — [OpenRegulatory](https://openregulatory.com/mdcg/mdcg-2019-11); [GMP Insiders](https://gmpinsiders.com/mdcg-2019-11-rev1-mdr-ivdr/); [mdrregulator](https://mdrregulator.com/news/revised-mdcg-2019-11-guidance-updated-approach-to-qualification-and-classification-of-medical-software).
- AI Act Art. 50: disclosure that a user is interacting with AI has applied since 2 Aug 2026. The Digital Omnibus did not delay it; it only extended Art. 50(2) machine-readable marking to 2 Dec 2026 for generative systems already on the market. The Omnibus moved Annex III high-risk obligations to 2 Dec 2027 and Annex I to 2 Aug 2028. Art. 50 fines go up to €15M or 3% of turnover. The Commission published Art. 50 guidelines before the deadline — [CSA research note](https://labs.cloudsecurityalliance.org/research/csa-research-note-eu-ai-act-article-50-transparency-20260729/); [Jones Walker](https://www.joneswalker.com/en/insights/blogs/ai-law-blog/yes-august-2-still-matters-the-eu-approved-a-high-risk-ai-delay-but-most-trans.html). Sources conflict on the Omnibus entry-into-force date; one says 27 Jul 2026.
- AI Act Art. 5(1)(b), in force since 2 Feb 2025, prohibits AI that exploits vulnerabilities due to age, disability or socio-economic situation and materially distorts behaviour, causing or being likely to cause significant harm. Intent is not required. Guidance examples include addictive reward schedules aimed at children — [Arthur Cox](https://www.arthurcox.com/knowledge/the-eu-commission-guidelines-on-prohibited-ai-practices/); [Openlayer (secondary)](https://www.openlayer.com/blog/post/eu-ai-act-prohibited-practices-compliance-guide). Primary text: [EUR-Lex AI Act 2024/1689](https://eur-lex.europa.eu/eli/reg/2024/1689/oj).

### Inferences
- **AI Act high-risk:** Annex III lists biometrics, critical infrastructure, education, employment, essential services (including health and life insurance pricing and emergency triage), law enforcement, migration and justice. A consumer nutrition coach is not on that list. It would become high-risk under Art. 6(1) only if it were a safety component of, or itself, an MDR-regulated device (class IIa+). This is based on the AI Act structure; the Annex III text was not fetched.
- **Role under the AI Act:** the project and the self-hoster are likely "deployers" or "providers" of a system built on a general-purpose AI model. The Art. 50(1) duty to make clear the user is interacting with AI falls on the provider of the system that interacts with people. Labelling the coach as AI covers it.
- **Nutrition and Health Claims Regulation (EC) 1924/2006** applies to claims in commercial communications about foods ([EUR-Lex](https://eur-lex.europa.eu/eli/reg/2006/1924/oj)). It is probably not engaged by non-commercial, personalised dietary guidance from an open-source app that does not sell food. It would matter if the app promoted specific products, e.g., partner foods or supplements. This is an inference; no source was found applying it to apps.
- **Child-specific risk:** calorie or weight targets for children, and AI dietary advice for children with conditions, raise both the medical-device boundary (treatment or prevention of obesity as a disease) and the risk of harm, such as disordered eating. Keeping children's features descriptive (food-group variety, no weight targets) stays within wellness.

### Gaps
- The FDA guidance PDF and MDCG 2019-11 Rev.1 text were not fetched directly, and no diet-app-specific example from MDCG was found.
- No authoritative source applies the AI Act's Annex III to nutrition apps.
- Specific AI Act obligations concerning minors beyond Art. 5(1)(b) and the Art. 9 risk-management mention of under-18s for high-risk systems were not verified.

## 6. Sending meal photos and data to third-party AI providers, and practical safe design for a family mode

### Takeaway
Sending a child's data, especially photos, to an AI provider is the point where the app's legal profile changes most. It is a third-party disclosure under COPPA, which needs separate consent where COPPA applies, and AI training is never integral. Under the GDPR it is a transfer of possibly special-category data to a processor or controller, often outside the EU. A parent-operated family mode can avoid most obligations by design: no child accounts, no identifying data, nothing leaving the device for child profiles, and no weight targets.

### Cited Findings
- COPPA: separate verifiable parental consent before disclosure to third parties; AI training disclosures are never integral; the direct notice must name recipients and purposes — [Latham & Watkins](https://www.lw.com/en/insights/ftc-publishes-updates-to-coppa-rule); [Loeb & Loeb](https://www.loeb.com/en/insights/publications/2025/05/childrens-online-privacy-in-2025-the-amended-coppa-rule).
- A photo or image containing a child's face is COPPA personal information (FAQ A.3). Adults uploading photos of children to general-audience services do not trigger COPPA (F.4) — [FTC COPPA FAQ](https://www.ftc.gov/business-guidance/resources/complying-coppa-frequently-asked-questions).
- Operators are responsible for third parties that collect through their service and must vet their data practices — [FTC COPPA FAQ](https://www.ftc.gov/business-guidance/resources/complying-coppa-frequently-asked-questions).
- CNIL: health data needs explicit, separate consent, and the household exemption is lost when there is an external connection or remote-service functionality — [Simmons & Simmons](https://www.simmons-simmons.com/en/publications/cm3x6ddmg03zqtr0k9i1261m7/cnil-s-mobile-app-review-balancing-innovation-and-data-protection).
- ICO Code: data sharing only with a compelling reason in the child's best interests; profiling off by default; data minimisation with separate choices per feature — [ICO](https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/childrens-information/childrens-code-guidance-and-resources/age-appropriate-design-a-code-of-practice-for-online-services/code-standards/).
- Kurbo: indefinite retention, an unverifiable parent path and a bypassable age gate were the core violations — [FTC](https://www.ftc.gov/news-events/news/press-releases/2022/03/ftc-takes-action-against-company-formerly-known-weight-watchers-illegally-collecting-kids-sensitive).

### Inferences: what a minimal-risk "family mode" looks like
1. **The parent is the only user.** No child login, no child-facing onboarding and no child-oriented branding or marketing. This keeps the service general-audience and adult-directed under COPPA, where data is collected from the adult (FAQ A.8). Keep the adults-only Terms; the family profile is a "household member" the parent logs about.
2. **No child identifiers.** Use a nickname or initial only, with no birthdate (an age band at most, e.g., "4–8", for portion guidance), no photo of the child, no location and no contact info. Treat any child-profile field as minimised (ICO std 8).
3. **Child-profile data never leaves the device by default.** AI features are disabled for child profiles, or text-only with an explicit per-use warning. Meal photos are stripped of EXIF and must not contain people, and the UI tells users not to photograph children. Sync for child profiles is opt-in, end-to-end encrypted so the self-hoster cannot read it, which is ideally ciphertext-only. Local-only data is not "collection" under COPPA (FAQ F.5) and stays within the GDPR household exemption (CNIL).
4. **Instance AI-key proxy:** the self-hoster's server sees plaintext prompts, which makes the self-hoster a controller under GDPR and a possible COPPA operator or MHMDA regulated entity. Block child-profile data from the proxy at code level. Document this in the self-hosting guide, and state that the self-hoster is the controller if they enable sync or the proxy for people outside their household.
5. **No weight, BMI or calorie targets for children,** and no streaks, rewards or nudges. This aligns with ICO std 5 and 13, avoids Art. 5(1)(b) AI Act risk and the medical-device boundary, and matches the project's no-dark-patterns standard and calm framing. Use descriptive food-group variety only.
6. **Retention:** an automatic deletion policy for child profiles (e.g., purge logs older than N months, delete profile on request). This mirrors the amended COPPA §312.10 and the Kurbo order's one-year-after-last-use limit.
7. **Transparency:** AI labelled as AI (Art. 50), a plain-language notice in the family-mode setup about what stays local and what would be sent where, and a DPIA template for self-hosters who enable sync or proxy for others (GDPR Art. 35, ICO std 2).
8. **Keep the "not a medical device" intended-purpose statement,** and add an explicit exclusion for children with medical conditions (refer to a paediatrician or dietitian).

### Gaps
- No regulator guidance found specifically on parents logging children's data in a general-audience app. The COPPA FAQ A.8/F.4 is the closest.
- AI provider terms (training opt-outs, zero-retention, age restrictions; e.g., most providers require users to be 18+ or 13+ with consent) were not researched and should be checked per provider.
- International transfer mechanics (EU-US Data Privacy Framework status in 2026) were not researched.
