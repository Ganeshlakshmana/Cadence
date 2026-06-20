# SunPath — Complete Build Guide
**Hackathon: Reonic — AI-Powered Marketing to Enable Renewable Installers**
**Prize: Reonic Car Package + AirPods (Reonic track) + ElevenLabs side prize**

---

## 0. For the AI agent or developer reading this

If you are an AI assistant being asked to help build this, here is your context: you are continuing a planning conversation about a hackathon project called **SunPath**. The user has already validated the product direction. Your job is to help them build it — not re-plan it. Treat every section as decided unless the user explicitly overrides.

If you are a human developer, this is your build spec. Read sections 1, 2, 7 first to get oriented, then dive into section 6 (the LLM prompts) — that is where the IP lives.

This guide is opinionated on purpose. The choices are made to maximize hackathon-win probability, not long-term scalability. Where AGENTS.md (the original spec) suggested production patterns, this guide picks the hackathon-appropriate subset and notes the future path as a comment.

---

## 1. The hackathon and the winning thesis

### What Reonic is asking for

Solar installers spend hours crafting personal pitches, then lose deals between "quote sent" and "contract signed." Build a system that takes a homeowner's profile + quote and generates a **strategic communication chain** that moves them to signature. Not just emails — a coherent persuasion strategy with reasoning, timing, and flexibility. Something an installer trusts, can show their sales manager, and can adapt.

### Four customer archetypes (from the brief)

- **Family** — wants reassurance, predictability, peace of mind
- **Investor** — wants hard ROI numbers, comparisons, returns
- **Environmentalist** — wants impact narrative, CO₂ offset, legacy
- **Skeptic** — needs objection handling, proof, third-party validation

Real customers are **weighted blends**, never pure archetypes. The system must support this.

### The winning thesis

Every team at this hackathon will build a strategy generator with Claude or GPT. To win, SunPath has to do three things no other team will do:

1. **Build the literal artifact the brief asks for** — "something an installer would show their sales manager." That artifact is a one-page PDF written installer-to-manager. Almost no team will build this.
2. **Show real solar-domain intelligence** — actual irradiance data per postal code, market-specific framing (German Energiewende, US ITC), competitor-aware sequences. This proves we understand solar, not just LLMs.
3. **Build one "wow" moment** — the Strategy Replay scrubber, where the installer scrubs through 30 days and watches the strategy play out with simulated customer responses. This is the screenshot judges will share.

Everything else (the canvas, the reasoning sidebar, the channel previews, the voice note) is **table stakes**. We must execute it well, but those features alone won't win. The three above are what wins.

---

## 2. Tech stack (decided, do not re-debate)

| Layer | Choice | Reason |
|---|---|---|
| Framework | Next.js 15 (App Router) | Single app, server actions, fast to ship |
| Language | TypeScript everywhere | Type safety on LLM JSON outputs |
| Styling | Tailwind CSS + shadcn/ui | Compelling UI cheaply |
| Database | SQLite via Drizzle ORM | Real schema, file-based, zero ops |
| LLM | Anthropic Claude API | Sonnet 4.6 for generation, Haiku 4.5 for cheap classification |
| Voice | ElevenLabs (multilingual v2) | Required for side prize, one touchpoint only |
| Solar data | PVGIS (free, no API key) | Real irradiance per lat/lng |
| Geocoding | OpenStreetMap Nominatim (free) | Address → lat/lng/timezone |
| Charts | Recharts | ROI charts, A/B dashboard |
| Animation | Framer Motion | Strategy Replay scrubber |
| PDF | `@react-pdf/renderer` | Sales Manager One-Pager |
| i18n | `next-intl` | German + English at minimum |
| Deploy | Vercel | One command, free, fast |

**Do not use** NestJS, Postgres, Twilio Voice, WhatsApp Business Platform, pgvector, or any voice infrastructure beyond ElevenLabs TTS. These belong in the production roadmap document, not the hackathon build.

---

## 3. Architecture overview (text)

Single Next.js application. All backend logic lives in either server actions or API routes inside `/app/api/`. No separate backend service. No microservices. No message queue. No Redis.

There is one SQLite database file in the repo (`./data/sunpath.db`) accessed via Drizzle. In production this would swap to Postgres without code changes — Drizzle handles that.

Claude is called directly from server-side code using the official `@anthropic-ai/sdk` package. JSON outputs are validated using Zod schemas. If validation fails, retry once with a stricter prompt, then surface a clear error to the user.

ElevenLabs is called the same way — server-side, the resulting MP3 is cached in `/public/audio/{hash}.mp3` so the same voice script isn't regenerated. PVGIS and Nominatim are called once per customer at intake and the result is cached on the customer row.

The frontend is four screens (intake, strategy canvas, touch detail drawer, manager export view) with one slide-out override panel. Strategy Canvas is the centerpiece and gets ~50% of the UI build time. Everything else is supporting.

Communication channels are **rendered as visual previews**, never actually sent. The channel renderer takes a touchpoint and returns a styled component (email card, SMS bubble, voice player, video script card, postcard preview). This is deliberate: the brief is about the strategy, not the SMTP wiring. Real sending is a production concern.

Compliance is a thin cross-cutting layer: a consent gate function that runs before any PII-touching LLM call, an audit log writer called from key actions, an "AI generated" badge component used everywhere AI content appears, and an EU region flag in the footer.

---

## 4. Data model (Drizzle schema)

Create `/db/schema.ts` with the following. Comments explain the why.

```typescript
import { sqliteTable, text, integer, real, blob } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

// PII isolated from behavioral data — supports Article 17 erasure
// while preserving anonymized profile data for product learning.
export const customer = sqliteTable('customer', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  firstName: text('first_name').notNull(),
  lastName: text('last_name').notNull(),
  email: text('email'),
  phoneNumber: text('phone_number'),
  preferredChannel: text('preferred_channel').default('email'),
  preferredLanguage: text('preferred_language').default('de'),
  formalityRegister: text('formality_register').default('formal'), // 'formal' | 'informal' (Sie/du)
  // Location — populated by geocoding service at intake
  addressLine: text('address_line'),
  city: text('city'),
  postalCode: text('postal_code'),
  countryCode: text('country_code').default('DE'),
  latitude: real('latitude'),
  longitude: real('longitude'),
  timezone: text('timezone'),
  solarIrradianceKwhM2Year: real('solar_irradiance_kwh_m2_year'), // from PVGIS, cached
  // Consent — separate flags with timestamps, never bundled
  consentDataProcessing: integer('consent_data_processing', { mode: 'boolean' }).default(false),
  consentDataProcessingAt: integer('consent_data_processing_at', { mode: 'timestamp' }),
  consentMarketing: integer('consent_marketing', { mode: 'boolean' }).default(false),
  consentMarketingAt: integer('consent_marketing_at', { mode: 'timestamp' }),
  consentVoiceCloning: integer('consent_voice_cloning', { mode: 'boolean' }).default(false),
  createdAt: integer('created_at', { mode: 'timestamp' }).default(sql`(unixepoch())`),
});

export const customerProfile = sqliteTable('customer_profile', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  customerId: text('customer_id').notNull().references(() => customer.id, { onDelete: 'cascade' }),
  // Weighted archetype blend, sums to ~1.0 but not strict
  archetypeFamily: real('archetype_family').default(0),
  archetypeInvestor: real('archetype_investor').default(0),
  archetypeEnvironmentalist: real('archetype_environmentalist').default(0),
  archetypeSkeptic: real('archetype_skeptic').default(0),
  // Verbatim phrases the customer used — drives voice-of-customer mirror
  customerVerbatimPhrases: text('customer_verbatim_phrases', { mode: 'json' }).$type<string[]>(),
  statedMotivations: text('stated_motivations', { mode: 'json' }).$type<string[]>(),
  statedObjections: text('stated_objections', { mode: 'json' }).$type<string[]>(),
  competitorMentioned: integer('competitor_mentioned', { mode: 'boolean' }).default(false),
  competitorNames: text('competitor_names', { mode: 'json' }).$type<string[]>(),
  decisionTimeline: text('decision_timeline'), // 'asap' | 'this_quarter' | 'exploring'
  householdSize: integer('household_size'),
  inferenceConfidence: real('inference_confidence'),
});

export const quote = sqliteTable('quote', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  customerId: text('customer_id').notNull().references(() => customer.id, { onDelete: 'cascade' }),
  systemSizeKw: real('system_size_kw'),
  panelCount: integer('panel_count'),
  panelBrand: text('panel_brand'),
  batteryIncluded: integer('battery_included', { mode: 'boolean' }).default(false),
  batteryKwh: real('battery_kwh'),
  totalPrice: real('total_price'),
  currency: text('currency').default('EUR'),
  financingType: text('financing_type'),
  estimatedAnnualSavings: real('estimated_annual_savings'),
  monthlyEquivalentSavings: real('monthly_equivalent_savings'), // for "€87/month" framing
  paybackPeriodYears: real('payback_period_years'),
  annualRoiPct: real('annual_roi_pct'),
  co2OffsetTons25yr: real('co2_offset_tons_25yr'),
  quotePdfUrl: text('quote_pdf_url'),
  createdAt: integer('created_at', { mode: 'timestamp' }).default(sql`(unixepoch())`),
});

export const strategy = sqliteTable('strategy', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  customerId: text('customer_id').notNull().references(() => customer.id, { onDelete: 'cascade' }),
  quoteId: text('quote_id').notNull().references(() => quote.id, { onDelete: 'cascade' }),
  status: text('status').default('draft'), // draft | active | replay_simulated
  ghostRiskScore: real('ghost_risk_score'),
  ghostRiskSignals: text('ghost_risk_signals', { mode: 'json' }).$type<string[]>(),
  closeReadinessScore: real('close_readiness_score'),
  rationaleSummary: text('rationale_summary'), // 2-3 sentence "why this strategy" for installer
  marketContextApplied: text('market_context_applied'), // e.g. 'DE_energiewende_2022'
  generatedBy: text('generated_by').default('claude-sonnet-4-6'),
  createdAt: integer('created_at', { mode: 'timestamp' }).default(sql`(unixepoch())`),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).default(sql`(unixepoch())`),
});

export const strategyTouch = sqliteTable('strategy_touch', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  strategyId: text('strategy_id').notNull().references(() => strategy.id, { onDelete: 'cascade' }),
  sequenceIndex: integer('sequence_index').notNull(),
  dayOffset: integer('day_offset').notNull(), // days after quote_sent_at
  channel: text('channel').notNull(), // email | sms | whatsapp_text | whatsapp_voice | call | video | microsite | postcard | linkedin | in_person
  tone: text('tone'), // reassuring | data_driven | impact | objection_handling | urgency
  objective: text('objective'), // short label
  reasoning: text('reasoning').notNull(), // 2-3 sentences, installer-facing, MUST reference specific archetype weights + specific quote numbers
  contentSubject: text('content_subject'), // for email
  contentBody: text('content_body').notNull(), // the actual message/script
  contentVariantB: text('content_variant_b'), // A/B variant for top 2 highest-leverage touches
  abTestActive: integer('ab_test_active', { mode: 'boolean' }).default(false),
  abCampaignTag: text('ab_campaign_tag'), // rolls up to org-level dashboard
  installerEdited: integer('installer_edited', { mode: 'boolean' }).default(false),
  status: text('status').default('pending'),
  audioUrl: text('audio_url'), // ElevenLabs cached MP3 for voice touches
  micrositeUrl: text('microsite_url'), // for proposal microsite touches
});

// Simulated customer responses for Strategy Replay scrubber
export const simulatedResponse = sqliteTable('simulated_response', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  strategyTouchId: text('strategy_touch_id').notNull().references(() => strategyTouch.id, { onDelete: 'cascade' }),
  responseType: text('response_type'), // opened | clicked | replied_positive | replied_objection | ignored | call_answered | call_voicemail
  responseSummary: text('response_summary'), // 1-line description for the replay
  responseFullText: text('response_full_text'), // simulated reply if applicable
  sentiment: text('sentiment'),
  occurredDayOffset: integer('occurred_day_offset'),
});

export const auditLog = sqliteTable('audit_log', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  actorType: text('actor_type').notNull(), // installer_user | system | customer
  actorId: text('actor_id'),
  action: text('action').notNull(),
  targetCustomerId: text('target_customer_id'),
  metadata: text('metadata', { mode: 'json' }),
  occurredAt: integer('occurred_at', { mode: 'timestamp' }).default(sql`(unixepoch())`),
});
```

That's six tables. Run `drizzle-kit generate` and `drizzle-kit migrate` to create the file. Seed three fixture customers in `/db/seed.ts` spanning the archetype space (one family-skeptic blend, one investor-dominant, one environmentalist-family).

---

## 5. Module layout (file structure)

```
/app
  /(public)
    /intake/[token]/page.tsx        — customer self-serve intake (token-gated)
    /p/[customerId]/page.tsx        — proposal microsite (public read-only)
  /(installer)
    /dashboard/page.tsx             — pipeline view
    /customer/[id]
      /page.tsx                     — customer overview
      /intake/page.tsx              — installer-side intake form
      /strategy/[strategyId]/page.tsx — THE HERO: StrategyCanvas
    /experiments/page.tsx           — A/B dashboard
    /audit/page.tsx                 — audit log view
  /api
    /strategy/generate/route.ts     — POST: create strategy
    /strategy/regenerate/route.ts   — POST: delta regeneration
    /strategy/replay/route.ts       — POST: simulate customer responses
    /touch/[id]/regenerate/route.ts — POST: single-touch regen
    /touch/[id]/audio/route.ts      — POST: generate ElevenLabs voice
    /export/manager-pdf/route.ts    — POST: generate Sales Manager One-Pager
    /irradiance/route.ts            — GET: PVGIS lookup by lat/lng
  layout.tsx
  globals.css

/components
  /strategy
    StrategyCanvas.tsx              — horizontal timeline, the centerpiece
    TouchCard.tsx                   — one touchpoint card
    ReasoningSidebar.tsx            — updates on hover/click
    OverridePanel.tsx               — tone slider, channel toggles, regenerate
    ReplayScrubber.tsx              — THE WOW: day 0-30 timeline scrubber
    RiskBadges.tsx                  — ghost risk + close readiness gauges
    ArchetypeBars.tsx               — stacked horizontal weight bars
    DiffHighlight.tsx               — green/red diff on regeneration
  /channels
    EmailPreview.tsx                — inbox-card preview
    SmsPreview.tsx                  — chat-bubble preview
    WhatsAppPreview.tsx             — chat bubble + audio player
    CallScriptCard.tsx              — script card
    VideoScriptCard.tsx             — HeyGen-style avatar preview placeholder
    PostcardPreview.tsx             — handwritten-style preview
    MicrositePreview.tsx            — proposal site preview thumbnail
    LinkedInPreview.tsx             — message preview
  /compliance
    ConsentGate.tsx                 — checkbox with timestamp display
    AiGeneratedBadge.tsx            — small "AI-generated" pill, used everywhere
    AiActDisclosure.tsx             — voice-script disclosure line
    EuResidencyFooter.tsx           — footer pill
  /export
    ManagerOnePagerPdf.tsx          — React PDF component for the manager export
  /ui                               — shadcn/ui components

/lib
  /llm
    client.ts                       — Anthropic SDK initialization
    personaInference.ts             — Haiku call 1
    sequenceGenerator.ts            — Sonnet call 2 (main IP)
    deltaRegen.ts                   — Sonnet call 3
    rescueInsert.ts                 — Sonnet call 4 (on-demand)
    coachingMode.ts                 — Sonnet, after replay
    voiceOfCustomer.ts              — Haiku, verbatim phrase extraction
    managerOnePager.ts              — Sonnet, installer-to-manager voice
    competitiveDisplacement.ts      — Sonnet, side-by-side comparison
    replaySimulator.ts              — Sonnet, simulates customer responses
    schemas.ts                      — Zod schemas for all LLM JSON outputs
    prompts.ts                      — system prompts as exported constants
  /scoring
    ghostRisk.ts                    — heuristic with explainable signals
    closeReadiness.ts               — same shape
  /channels
    renderEmail.ts                  — touchpoint → email preview data
    renderSms.ts
    renderWhatsApp.ts
    renderVoice.ts                  — calls ElevenLabs, returns audio URL
    renderVideo.ts                  — for now: returns avatar script + placeholder
    renderPostcard.ts
    renderMicrosite.ts              — generates the /p/[id] route data
    orchestrator.ts                 — picks channel per touchpoint, fallback logic
  /persuasion
    archetypes.ts                   — the 4 personas verbatim from Reonic brief
    marketContext.ts                — country code → market framing
    objectionLibrary.ts             — seeded common solar objections
    toneMatrix.ts                   — tone × archetype → channel/timing heuristics
  /solar
    pvgis.ts                        — PVGIS API client
    roiCalculator.ts                — payback, monthly equivalent, CO2
  /geo
    geocoding.ts                    — Nominatim client
    timezone.ts                     — lat/lng → IANA tz
  /elevenlabs
    client.ts                       — ElevenLabs SDK
    voiceMap.ts                     — language → voice ID (use stock multilingual voices)
  /compliance
    consentGate.ts                  — server-side check function
    auditLog.ts                     — append-only writer
  /db
    schema.ts                       — Drizzle schema (section 4)
    seed.ts                         — three fixture customers
    client.ts                       — Drizzle client

/messages
  en.json                            — UI strings
  de.json                            — UI strings

/public
  /audio                             — ElevenLabs cache
  /fixtures                          — seed quote PDFs
```

---

## 6. The LLM calls — system prompts and schemas

This section is the IP. Every prompt below has been engineered for the specific output we need. **Do not generalize them or strip the constraints.** The constraints are what make the output feel intelligent.

### 6.1 Persona inference (`personaInference.ts`)

Model: `claude-haiku-4-5` (cheap, fast, sufficient for classification).
Input: customer intake notes + quote summary.
Output (Zod-validated):

```typescript
const PersonaInferenceSchema = z.object({
  archetypeBlend: z.object({
    family: z.number().min(0).max(1),
    investor: z.number().min(0).max(1),
    environmentalist: z.number().min(0).max(1),
    skeptic: z.number().min(0).max(1),
  }),
  topObjections: z.array(z.string()).min(1).max(5),
  statedMotivations: z.array(z.string()).min(1).max(5),
  customerVerbatimPhrases: z.array(z.string()).min(0).max(8),
  competitorMentioned: z.boolean(),
  competitorNames: z.array(z.string()),
  decisionTimeline: z.enum(['asap', 'this_quarter', 'exploring']),
  inferenceConfidence: z.number().min(0).max(1),
  roiFramingPreference: z.enum(['monthly_savings', 'payback_years', 'annual_roi_pct', 'co2_impact']),
});
```

System prompt:

```
You are a customer profiling analyst for a solar installer. You receive raw intake notes from a sales rep and quote summary. Your job is to infer a probabilistic persona blend across four archetypes defined verbatim below, extract verbatim phrases the customer used, and detect competitor mentions.

The four archetypes (use exactly these labels):
1. FAMILY — prioritizes stability, no surprises, predictability, warranty, peace of mind
2. INVESTOR — prioritizes hard ROI numbers, payback period, returns vs alternatives
3. ENVIRONMENTALIST — prioritizes climate impact, CO2 offset, legacy, community
4. SKEPTIC — prioritizes objection handling, proof, third-party validation, fears being scammed

RULES:
- Output a probabilistic blend. Sum should be approximately 1.0 but does not need to be strict.
- Never assign 1.0 to a single archetype. Real humans are blends.
- Skeptic weight should be > 0.15 whenever the customer mentions price comparison, asks "is this a scam," questions warranty claims, or references reviews.
- Investor weight should be > 0.4 when they ask about ROI, payback, or compare to financial instruments.
- For verbatim phrases: extract the customer's exact wording for emotional or motivational statements, paraphrased only to remove identifying details. Max 8 phrases. These will be reused in messaging — quality over quantity.
- For roiFramingPreference: pick what they are most likely to respond to based on the dominant archetype.
- For decisionTimeline: infer from urgency cues in the notes ("we want this before winter" → asap).
- inferenceConfidence: 0.5 if notes are sparse, 0.9 if rich.

Output ONLY valid JSON matching the provided schema. No prose.
```

User prompt template:

```
INSTALLER NOTES:
{notes}

QUOTE SUMMARY:
System: {systemSizeKw}kW, {panelCount} panels, battery: {batteryIncluded}
Total: {currency}{totalPrice}
Annual savings: {currency}{estimatedAnnualSavings}
Payback: {paybackPeriodYears} years
CO2 offset 25yr: {co2OffsetTons25yr} tons
```

### 6.2 Sequence generation (`sequenceGenerator.ts`) — THE CORE

Model: `claude-sonnet-4-6`. This is where 60% of the product value comes from.
Output:

```typescript
const StrategySchema = z.object({
  rationaleSummary: z.string().min(50).max(400),
  marketContextApplied: z.string(),
  touches: z.array(z.object({
    sequenceIndex: z.number(),
    dayOffset: z.number().min(0).max(30),
    channel: z.enum([
      'email', 'sms', 'whatsapp_text', 'whatsapp_voice',
      'call', 'video', 'microsite', 'postcard', 'linkedin', 'in_person'
    ]),
    tone: z.enum(['reassuring', 'data_driven', 'impact', 'objection_handling', 'urgency', 'social_proof']),
    objective: z.string().max(80),
    reasoning: z.string().min(50).max(300),
    contentSubject: z.string().nullable(),
    contentBody: z.string(),
    contentVariantB: z.string().nullable(),
    abTestActive: z.boolean(),
  })).min(5).max(9),
});
```

System prompt:

```
You are a senior solar sales strategist building a persuasion sequence for a specific customer. The installer will see your reasoning and trust depends on it being specific, not generic.

HARD RULES — every single one is non-negotiable:

1. Every touch's "reasoning" field MUST reference specific archetype weights (e.g. "62% family-weighted") AND specific quote numbers (e.g. "€87/month savings"). Never write generic reasoning like "this builds rapport." If your reasoning could apply to any customer, REWRITE IT.

2. Channel choice must match dominant archetype + sequence position:
   - Family-dominant: lead with reassurance (email recap, then voice note by day 5)
   - Investor-dominant: lead with hard data (ROI microsite, comparison table)
   - Environmentalist-dominant: lead with impact (CO2 visualization, community story)
   - Skeptic-dominant: lead with proof (third-party reviews, warranty documentation), NO calls before day 10

3. Channel ladder principle: text-light channels first (email, SMS), voice/video later as trust builds. Never call before day 4 unless the customer requested it.

4. Spacing: front-load days 1-5 (3-4 touches), then taper. Day 14-21 has at most 2 touches. Day 22-30 is the close window with at most 2 touches.

5. Skeptic-weighted customers (>0.25): at least one touchpoint MUST be pure objection handling. Address the BIGGEST objection on touch 2 or 3, never touch 1.

6. Urgency tone: only in the last 1-2 touches, and only if there is a TRUE urgency reason (price lock expiring, incentive deadline). Never fabricate urgency.

7. Verbatim phrase reuse: when the customer's verbatim phrases are provided, weave 2-3 of them into the messaging EXACTLY. This is the single highest-leverage personalization technique.

8. Language: write the contentBody in the customer's preferredLanguage. Use the specified formality register (formal/informal — Sie/du for German, tú/usted for Spanish, tu/vous for French).

9. Market context: incorporate the provided marketContext block into the framing. For DE, lean on energy independence and Energiewende. For US, lean on the 30% ITC. For ES, lean on autoconsumo legislation.

10. A/B variants: produce contentVariantB for exactly 2 touches — the highest-leverage ones (typically the day-1 opener and the day-21 urgency push). Mark abTestActive: true on those. All other touches: contentVariantB null, abTestActive false.

11. Competitive context: if competitorMentioned is true, exactly one touch (typically day 7-10) must be a competitive displacement — fair side-by-side comparison focused on differentiators. NEVER disparage named competitors.

12. Sequence length: 5-9 touches. Choose the right number for this customer — sparse for high-confidence ready-to-buy signals, denser for skeptic-heavy or competitor-shopping customers.

13. Channel coverage: across the full sequence, use at least 4 different channels. Demonstrate multi-channel thinking. Include at least one of: whatsapp_voice, video, microsite, or postcard.

14. The first touch (day 0 or 1) is ALWAYS an email recap with a personal angle — never a cold "thanks for your interest" template.

15. rationaleSummary: 2-3 sentences explaining the overall arc of the sequence to the installer. Why this archetype-weighted approach. What the risk is. Where the close moment is targeted. Plain language.

OUTPUT FORMAT: JSON only matching the provided schema. No prose, no markdown, no preamble.
```

User prompt template:

```
CUSTOMER:
Name: {firstName} {lastName}
Language: {preferredLanguage} ({formalityRegister})
Country: {countryCode}
Location: {city}, postal {postalCode}
Local solar irradiance: {solarIrradianceKwhM2Year} kWh/m²/year

ARCHETYPE BLEND:
Family: {archetypeFamily}
Investor: {archetypeInvestor}
Environmentalist: {archetypeEnvironmentalist}
Skeptic: {archetypeSkeptic}

CUSTOMER VERBATIM PHRASES (reuse 2-3 EXACTLY):
{customerVerbatimPhrases}

STATED MOTIVATIONS: {statedMotivations}
TOP OBJECTIONS: {topObjections}
DECISION TIMELINE: {decisionTimeline}
COMPETITOR MENTIONED: {competitorMentioned} ({competitorNames})

QUOTE:
System: {systemSizeKw}kW, {panelCount} panels
Total: {currency}{totalPrice}
Monthly equivalent savings: {currency}{monthlyEquivalentSavings}
Payback: {paybackPeriodYears} years
Annual ROI: {annualRoiPct}%
CO2 offset 25yr: {co2OffsetTons25yr} tons

MARKET CONTEXT:
{marketContextBlock}
```

### 6.3 Delta regeneration (`deltaRegen.ts`)

Model: `claude-sonnet-4-6`.
When the installer adjusts the strategy (warmer, more urgent, drop calls, shift to informal), we don't regenerate from scratch — we send the current strategy plus a delta instruction and get back the modified strategy plus a `changes` array that powers the diff view.

Output adds a `changes` field:

```typescript
const DeltaRegenSchema = StrategySchema.extend({
  changes: z.array(z.object({
    touchIndex: z.number(),
    changeType: z.enum(['modified', 'added', 'removed', 'rescheduled', 'channel_changed', 'tone_changed']),
    summary: z.string(), // 1-line description for the diff UI
    before: z.string().nullable(),
    after: z.string().nullable(),
  })),
});
```

System prompt:

```
You are modifying an existing solar sales sequence based on an installer's adjustment request. Preserve what works, change only what the adjustment requires.

RULES:
1. Keep the overall touch count within ±1 of the original unless the installer explicitly requested adding/removing touches.
2. Keep the channel ladder coherent — don't break the "text-first, voice-later" principle without reason.
3. For every change made, populate a "changes" entry explaining what changed and why.
4. The "reasoning" field on modified touches MUST be updated to reflect the new logic — never leave stale reasoning.
5. All the rules from sequence generation still apply (specific archetype weights, specific numbers, verbatim phrase reuse, channel coverage, etc).

OUTPUT: JSON matching the provided schema including the changes array.
```

User prompt template:

```
CURRENT STRATEGY:
{currentStrategyJson}

ADJUSTMENT REQUEST:
{installerFreeTextInstruction}

CUSTOMER CONTEXT (unchanged):
{customerContextBlock}
```

### 6.4 Voice-of-customer extraction (`voiceOfCustomer.ts`)

Model: `claude-haiku-4-5`.
Runs as part of persona inference but worth calling out separately. The output `customerVerbatimPhrases` array feeds directly into the sequence generation prompt. This is the highest-leverage personalization trick and most teams won't do it.

Example extraction:
- Input note: *"Maria mentioned her husband is worried they'll get scammed. She said 'we want this done before the kids leave for uni next September'. Also said she's tired of her bill going up every year."*
- Output phrases: `["worried we'll get scammed", "done before the kids leave for uni next September", "tired of my bill going up every year"]`

Then in the sequence generator output, you'll see touchpoints with content like *"Maria, I know you mentioned wanting this done before the kids leave for uni next September — here's a timeline that gets you there..."* — which feels written specifically for her because it was.

### 6.5 Rescue insert (`rescueInsert.ts`)

Model: `claude-sonnet-4-6`.
Triggered when `ghostRiskScore > 0.6`. Generates a single new touchpoint to splice into the sequence — typically a low-pressure check-in or a neighbor-success story.

System prompt:

```
A customer is at high ghost risk. Generate ONE rescue touchpoint to insert into the sequence. The tone must be low-pressure, never demanding. It should give the customer an easy "yes" or "no" path with no shame attached to either.

OPTIONS for rescue type:
- Neighbor case study (if postal code area data is available)
- "No pressure" check-in with explicit out: "Just want to know if you'd like me to close this file or keep it open"
- New information drop (a recent local incentive announcement, a relevant article)
- Personal voice note from installer

OUTPUT: single touchpoint JSON matching the strategy_touch schema, plus a 1-sentence rationale for the installer.
```

### 6.6 Coaching mode (`coachingMode.ts`)

Model: `claude-sonnet-4-6`.
Runs after the Strategy Replay simulation completes. Analyzes the simulated outcome and produces a 3-bullet coaching note for the installer.

Output:

```typescript
const CoachingNoteSchema = z.object({
  whatWorked: z.string(),
  whatToTryNext: z.string(),
  oneQuestionToAsk: z.string(),
  overallReadiness: z.enum(['close_today', 'one_more_touch', 'needs_rescue', 'likely_lost']),
});
```

System prompt:

```
You are a senior solar sales coach reviewing a simulated customer journey. Generate a brief, actionable coaching note for the sales rep.

Tone: direct, kind, specific. Like a manager who has seen 1000 deals.
Format: 3 short bullets. No more.

- whatWorked: cite a specific touchpoint and what it accomplished
- whatToTryNext: cite a specific moment and what the rep could do differently
- oneQuestionToAsk: a question that would advance the deal, written in the rep's voice to use on the next call

OUTPUT: JSON only.
```

### 6.7 Sales Manager One-Pager (`managerOnePager.ts`)

Model: `claude-sonnet-4-6`.
Generates the export PDF content — written installer-to-manager, NOT installer-to-customer. This is the literal artifact the brief asks for.

Output:

```typescript
const ManagerOnePagerSchema = z.object({
  dealHeader: z.string(), // "Maria Müller — €18,400 — 60% Family, 30% Skeptic"
  myRead: z.string(), // 2-3 sentences in installer voice
  myPlan: z.string(), // 3-4 sentences summarizing the sequence
  risksAndMitigations: z.array(z.object({ risk: z.string(), mitigation: z.string() })),
  whereIneedHelp: z.string(), // 1-2 sentences asking the manager for specific input
  closeTargetDate: z.string(),
  expectedOutcome: z.string(),
});
```

System prompt:

```
You are a solar installer drafting a one-page deal brief for your sales manager. This is YOUR voice as the installer, not a customer-facing message.

Tone: peer-to-peer, professional, slightly informal. Like an email to a colleague.
NEVER use marketing language. NEVER say things like "drive engagement" or "leverage." Write like a real sales rep.

The manager wants to know:
- What's the deal worth and who is the customer
- Your read on what they care about
- The plan and the rationale (briefly)
- The risks you see and what you're doing about them
- Where you need the manager's help (pricing flexibility, escalation, etc)
- When you expect to close and the outcome

Keep each section to 2-4 sentences max. Total length: fits on one page.

OUTPUT: JSON only.
```

### 6.8 Competitive displacement (`competitiveDisplacement.ts`)

Model: `claude-sonnet-4-6`.
Triggered when `competitorMentioned = true`. Generates a single touchpoint with a fair side-by-side comparison.

System prompt:

```
A customer mentioned a competitor. Generate ONE comparison touchpoint that is FAIR and FACTUAL.

ABSOLUTE RULES:
1. NEVER disparage the named competitor. Never claim they are worse. Never use language like "unlike them" or "they don't offer."
2. Focus on YOUR differentiators: warranty terms, install timeline, local service, customer reviews, monitoring, post-install support.
3. Use a clear visual structure: short side-by-side bullet list. Easy to scan.
4. Acknowledge the competitor is a legitimate choice ("I understand you're comparing options — here's a fair side-by-side").
5. End with a no-pressure invitation: "Happy to answer any specific questions about either option."

This builds MORE trust than disparagement. Trust closes deals.

OUTPUT: single touchpoint JSON.
```

### 6.9 Strategy Replay simulator (`replaySimulator.ts`) — THE WOW

Model: `claude-sonnet-4-6`.
This is the differentiator. Given a strategy, simulate the customer's likely responses to each touchpoint based on their archetype blend.

Output:

```typescript
const ReplaySimulationSchema = z.object({
  simulatedResponses: z.array(z.object({
    touchSequenceIndex: z.number(),
    responseType: z.enum([
      'opened_not_clicked', 'clicked_no_reply', 'replied_positive',
      'replied_objection', 'replied_question', 'ignored', 'call_answered',
      'call_voicemail', 'booked_meeting', 'unsubscribed'
    ]),
    responseSummary: z.string(),
    responseFullText: z.string().nullable(), // simulated reply if applicable
    sentiment: z.enum(['positive', 'neutral', 'negative', 'objection', 'ready_to_buy']),
    occurredDayOffset: z.number(),
  })),
  predictedOutcome: z.enum(['closed_won', 'closed_lost', 'still_engaged_at_day_30', 'ghosted']),
  predictedCloseProbability: z.number().min(0).max(1),
  criticalMomentTouchIndex: z.number(), // which touch was the inflection point
  criticalMomentDescription: z.string(),
});
```

System prompt:

```
You are simulating a specific homeowner's journey through a solar sales sequence. Given the customer's archetype blend, objections, and the planned sequence, predict realistic responses to each touchpoint.

RULES:
1. Be realistic. Real customers ghost about 40% of the time. Don't bias toward closing — show what would actually happen.
2. Archetype-driven response patterns:
   - Family-dominant: respond positively to voice notes and reassurance, hesitate at urgency
   - Investor-dominant: engage with data, click ROI calculators, ignore emotional appeals
   - Environmentalist-dominant: engage with impact framing, hesitate at price urgency
   - Skeptic-dominant: ghost early, respond to objection handling and proof, hate pressure
3. Mid-sequence inflection: identify ONE touchpoint that is the critical moment — either where the deal was won or lost.
4. Simulate replies in the customer's language and formality register.
5. Include realistic objections in negative responses ("worried about winter performance", "need to discuss with spouse", "comparing another quote").
6. predictedCloseProbability should reflect the realistic outcome of THIS specific sequence for THIS specific customer.

OUTPUT: JSON only matching the schema.
```

This is the call that powers the Replay Scrubber UI. When the installer drags the day slider, they see what happens at each step. It is the screenshot moment.

---

## 7. Build order (Phase 0 through Phase 10)

Time estimates assume one capable full-stack developer or a small team of 2-3. Total ~45 hours of focused work. Hackathons are usually 48-72 hours, so this fits with breathing room.

### Phase 0 — Foundations (2 hours)

- Initialize Next.js 15 project with TypeScript, Tailwind, App Router
- Install dependencies: `@anthropic-ai/sdk`, `drizzle-orm`, `better-sqlite3`, `drizzle-kit`, `zod`, `next-intl`, `framer-motion`, `recharts`, `@react-pdf/renderer`, `lucide-react`, `elevenlabs`
- Install shadcn/ui CLI and add base components: Button, Card, Dialog, Drawer, Slider, Switch, Badge, Toast
- Set up `.env.local` with placeholders for: `ANTHROPIC_API_KEY`, `ELEVENLABS_API_KEY`
- Create the Drizzle schema file (section 4) and run initial migration
- Build the seed script with 3 fixture customers

### Phase 1 — Strategy engine working end-to-end via CLI (4 hours)

- Build the Anthropic SDK client wrapper with Zod-validated outputs
- Implement `personaInference.ts` with the prompt from section 6.1
- Implement `sequenceGenerator.ts` with the prompt from section 6.2
- Implement `deltaRegen.ts` with the prompt from section 6.3
- Build a test script `/scripts/test-strategy.ts` that runs all three calls on a seeded customer and dumps the JSON
- Iterate the prompts until every `reasoning` field references specific numbers and specific archetype weights — do not move on until this is good

**Critical**: this phase produces no UI. The goal is to make sure the LLM output is high quality before the UI is built on top. If the JSON is good, the rest is presentation. If the JSON is generic, no UI will save it.

### Phase 2 — Strategy Canvas rendering from JSON (5 hours)

- Build `StrategyCanvas.tsx` — horizontal scrollable timeline, one `TouchCard` per touch
- Build `TouchCard.tsx` with channel icon, day label, tone color band, headline
- Build `ReasoningSidebar.tsx` that updates on touch hover/click
- Build `ArchetypeBars.tsx` (4-segment stacked horizontal bar)
- Build `RiskBadges.tsx` (ghost risk + close readiness gauges with tooltips)
- Wire to a hardcoded mock strategy JSON first, then replace with real LLM output
- Add dark mode support — Tailwind's `dark:` variants

At end of phase 2: hardcoded customer renders the full canvas, click-through to touch details, mobile-responsive enough for the demo.

### Phase 3 — Iteration loop (4 hours)

- Build `OverridePanel.tsx` as a slide-out drawer with: tone slider (warmer ↔ more urgent), channel toggle group, formality toggle (formal/informal), free-text instruction box
- Wire to `deltaRegen.ts` server action
- Build `DiffHighlight.tsx` — renders the `changes` array as green/red inline annotations on the canvas
- Add per-touch "regenerate just this one" button using a smaller scope of the same prompt
- Add "regenerate from this touch onward" cascade option

### Phase 4 — Channel previews (4 hours)

Build all preview components. Each takes a touchpoint and returns a styled preview. None of them actually send anything.

- `EmailPreview.tsx` — Gmail-style inbox card with subject + body, sender avatar
- `SmsPreview.tsx` — iMessage-style chat bubble
- `WhatsAppPreview.tsx` — WhatsApp-style bubble with optional audio player below
- `CallScriptCard.tsx` — script formatted with stage directions ("Open with...", "If they raise winter concern...")
- `VideoScriptCard.tsx` — placeholder showing avatar thumbnail + script + "Generate with HeyGen" button (mocked for hackathon, real integration optional)
- `PostcardPreview.tsx` — handwritten-font preview with "Send via Lob" mocked button
- `MicrositePreview.tsx` — thumbnail with link to actual `/p/[id]` route
- `LinkedInPreview.tsx` — LinkedIn-style message preview

Each preview includes the `AiGeneratedBadge` in a corner — that's the AI Act Article 50 transparency signal.

### Phase 5 — ElevenLabs voice integration (2 hours)

- Implement `elevenlabs/client.ts` using the `elevenlabs` npm package
- Use the multilingual v2 model with a stock voice ID (Antoni or another deep multilingual voice)
- Add caching: hash the script text, save MP3 to `/public/audio/{hash}.mp3`
- Wire the WhatsApp voice touchpoint preview to play the audio
- Add the AI Act disclosure to the voice script: opening line "This is an AI-assisted message from [installer name] at [company]"

Total: one touchpoint has real audio. That is enough for the ElevenLabs side prize.

### Phase 6 — Real solar irradiance + market context (3 hours)

- Implement `pvgis.ts` calling the PVGIS API with `/v5_3/PVcalc` endpoint to get annual irradiance for the customer's lat/lng. No API key needed.
- Cache result on the `customer` row (`solarIrradianceKwhM2Year`)
- Implement `geocoding.ts` using Nominatim to convert address → lat/lng
- Build `marketContext.ts` with country-keyed blocks for DE, US, ES, FR, UK — each block has 3-4 paragraphs of context that goes into the sequence generation prompt
- Wire these into the strategy generation flow so every generated strategy uses real irradiance numbers and the right market framing
- Show the irradiance prominently in the customer header: *"Berlin — 1,050 kWh/m²/year (14% above German average)"*

### Phase 7 — Strategy Replay scrubber (5 hours) — THE BIG ONE

This is the feature that wins. Do not skip it. Do not de-prioritize it.

- Implement `replaySimulator.ts` with the prompt from section 6.9
- Build `ReplayScrubber.tsx` as a horizontal slider from day 0 to day 30 with Framer Motion
- As the user drags, animate the visible touchpoints lighting up in sequence
- For each touchpoint that has a simulated response, show a small bubble below it ("Maria opened, didn't reply" or "Maria replied: 'still thinking it over'")
- Show the running ghost risk score updating as the day progresses
- At the end, show the predicted outcome ("Closed won — 73% probability" or "Ghosted — recommend rescue insert")
- Add a "Try a different strategy" button that re-runs simulation with a modified sequence

This is what the judges screenshot. Make it look good.

### Phase 8 — Sales Manager One-Pager export (3 hours)

- Implement `managerOnePager.ts` with the prompt from section 6.7
- Build `ManagerOnePagerPdf.tsx` using `@react-pdf/renderer`
- One-page A4 PDF layout: header with customer + value + archetype, "My Read" section, "My Plan" section, "Risks & Mitigations" table, "Where I Need Your Help" callout, footer with installer name + close target date
- Wire the export button on the Strategy Canvas: "Export for Manager" → downloads PDF
- Style it like a real internal sales doc, not a marketing brochure

This is the literal artifact Reonic asked for. No other team will build it as a PDF.

### Phase 9 — Differentiators and bonus channels (5 hours)

In priority order, build until time runs out:

- **Coaching Mode** (1h) — `coachingMode.ts` + UI panel that appears after Replay
- **Competitive Displacement** (1h) — branching prompt that injects a comparison touch when `competitorMentioned`
- **Proposal Microsite** (2h) — actual public route at `/p/[customerId]` with animated ROI chart, CO₂ counter, financing toggle, "book a call" button. Tracks scroll depth in a JSON column.
- **A/B Framework Dashboard** (1h) — `/experiments` route showing variant A vs B across all customers with a two-proportion z-test

### Phase 10 — Compliance signals + polish (3 hours)

- `ConsentGate.tsx` on intake — three separate checkboxes (data processing, marketing comms, voice cloning) each with timestamp shown back
- `AiGeneratedBadge.tsx` on every AI-generated content card
- `AiActDisclosure.tsx` baked into every voice script first line
- `/audit` route — table view of audit log entries
- `EuResidencyFooter.tsx` — small "🇪🇺 EU eu-central-1" pill in footer
- Dark mode pass — make sure everything works
- Mobile responsive pass — make sure demo works on a phone
- Loading states everywhere
- Error states for failed LLM calls

### Phase 11 (if time) — Localization

- Set up `next-intl` with `en` and `de` locales
- Translate the installer dashboard UI strings (the customer-facing content is already in their language thanks to the LLM)
- Add a language switcher in the header

---

## 8. The differentiator features — implementation detail

### 8.1 Strategy Replay Scrubber

This is the single most important UI feature. Spec:

- Horizontal Framer Motion slider, day 0 on the left, day 30 on the right
- Below the slider: the touchpoint timeline from the Strategy Canvas, slightly scaled down
- As the user drags the day cursor right, touchpoints to the left of the cursor "activate" (icon fills with color, animation pulse)
- For each activated touchpoint, a small bubble appears below showing the simulated customer response: opened, clicked, replied, ignored
- A running ghost-risk gauge updates as the day increases
- A running "engagement quality" indicator (sentiment color flowing from neutral → positive or → negative)
- At day 30, a final card slides up showing the predicted outcome with probability and the critical moment touchpoint highlighted
- Below the final card: "Get coaching note" button → runs Coaching Mode
- A "What if she ghosts after day 7?" button that re-runs the simulation with that constraint and shows the rescue insert path

This is doable in 5 hours if you stay focused. Use Framer Motion's `useMotionValue` for the scrubber state and derive everything else from it.

### 8.2 Sales Manager One-Pager (PDF)

Use `@react-pdf/renderer`. Layout:

```
┌──────────────────────────────────────────────┐
│  [SunPath logo]    Deal Brief — [Date]      │
├──────────────────────────────────────────────┤
│  Customer: Maria Müller                      │
│  Value: €18,400  |  Close target: Mar 15    │
│  Archetype: 60% Family, 30% Skeptic, 10% Env│
├──────────────────────────────────────────────┤
│  MY READ                                     │
│  [2-3 sentences from LLM]                    │
├──────────────────────────────────────────────┤
│  MY PLAN                                     │
│  [3-4 sentences summarizing the sequence]    │
│  [Mini timeline: 8 touchpoints, 30 days]    │
├──────────────────────────────────────────────┤
│  RISKS & MITIGATIONS                         │
│  • Risk 1 → Mitigation 1                     │
│  • Risk 2 → Mitigation 2                     │
├──────────────────────────────────────────────┤
│  WHERE I NEED YOUR HELP                      │
│  [Specific ask for the manager]              │
├──────────────────────────────────────────────┤
│  Expected outcome: [LLM-generated]           │
│  Generated by [Installer Name] via SunPath   │
└──────────────────────────────────────────────┘
```

Style it muted, professional, not flashy. Looks like a real internal doc.

### 8.3 Real solar irradiance integration

PVGIS endpoint: `https://re.jrc.ec.europa.eu/api/v5_3/PVcalc?lat={lat}&lon={lon}&peakpower=1&loss=14&outputformat=json`

This is a free European Commission API, no key needed. Returns annual energy production and irradiance data.

On customer creation:
1. Address → Nominatim → lat/lng/timezone
2. lat/lng → PVGIS → irradiance kWh/m²/year
3. Cache both on the customer row

In the strategy prompt, include: `Local solar irradiance: {value} kWh/m²/year (X% relative to national average)`. The LLM will weave this into reasoning naturally.

In the customer header UI, show this prominently with a small info icon explaining the source. Credibility builder.

### 8.4 Voice-of-customer extraction loop

This is a 30-line feature that delivers 10x the impact.

In persona inference output, the `customerVerbatimPhrases` field contains 3-8 phrases the customer used.

In sequence generation, the system prompt requires reusing 2-3 of these phrases EXACTLY in the message content.

In the UI, show these phrases as small pills under the customer header: "Customer's own words" → click any pill to see which touchpoint reuses it.

Effect: every message feels written for this specific customer because phrases they used are echoed back.

### 8.5 Competitive displacement

Logic:
- If `competitorMentioned = true`, the sequence generator is instructed to include one comparison touchpoint
- That touchpoint uses the `competitiveDisplacement.ts` prompt to generate a fair side-by-side
- The side-by-side renders as a styled table preview: "SunPath Installer" column vs "Other quote" column, with 4-5 differentiator rows
- Differentiators are factual: warranty years, install timeline, local reviews count, monitoring app, post-install support hours
- Never disparaging language

### 8.6 Du/Sie toggle and market context

Tiny features that show product judgment:

- On intake, after language is set to German, show a formality toggle (Sie / du) defaulting to Sie
- Same for ES (tú/usted) and FR (tu/vous)
- This value is passed to every generation prompt
- The LLM handles the actual register switch — you don't write rules

`marketContext.ts` exports a function `getMarketContext(countryCode: string): string` returning a multi-paragraph context block. For DE:

```
GERMAN MARKET CONTEXT (2024-2026):
- Post-2022 energy crisis: gas prices spiked 4x, public consciousness of energy dependence high
- Energiewende narrative is mainstream — independence from grid framing resonates
- EEG feed-in tariff currently 8.2 cents/kWh for systems under 10kW
- Battery storage subsidies vary by Bundesland — check local KfW programs
- Average German household electricity price: 40 cents/kWh, rising 3-5% annually
- Customer concerns often: roof aesthetics, neighborhood reactions, insurance
- Decision pace: typically slower than US, expect 4-8 weeks from quote to signature
- Trust drivers: TÜV certification, German manufacturer panels (SMA, Solarwatt), local installer reputation
```

For US, lean on ITC, utility rates by state, and net metering policy. For ES, autoconsumo legislation post-2018. For FR, MaPrimeRénov' and EDF feed-in.

### 8.7 ElevenLabs voice note

Single touchpoint at day 5-7 of the sequence. Channel: `whatsapp_voice`.

The content is written by the LLM as a 20-second script in the customer's language. It opens with the AI Act disclosure: *"Hallo Maria, das ist eine KI-assistierte Nachricht von Stefan bei SunSolar..."* and continues with a personal note referencing her roof, her objection, and a soft next step.

Use ElevenLabs multilingual v2 with a stock German voice. Cache by SHA-256 hash of the script. Audio plays in the WhatsApp preview component using the native `<audio>` element with custom styling.

If you have time and consent: clone the installer's actual voice using a 30-second sample. Add the consent toggle in installer settings. This is the side-prize-winning detail.

### 8.8 Proposal microsite

Public route: `/p/[customerId]`. Personalized landing page.

Content:
- Hero: customer first name + "Your solar journey starts here"
- Animated ROI chart (Recharts) showing monthly savings stacking up over years
- Animated CO₂ counter ticking up — "By year 25, you'll have offset X tons"
- Financing options as toggleable cards (cash / loan / lease) — clicking each updates the ROI chart
- A short testimonial paragraph from a real-sounding neighbor in their postal code
- Two CTAs: "Book a 15-minute call" and "Send me the contract"
- Scroll depth and click tracking written to `simulated_response` table

This is a real working page, not a mock. Day 10 touchpoint URL points here.

### 8.9 Coaching mode

Runs after Strategy Replay. UI: a card slides in below the replay results.

```
┌──────────────────────────────────────────────┐
│  📋 Coaching note from SunPath               │
├──────────────────────────────────────────────┤
│  ✅ What worked                              │
│  Your day-4 voice note caught her right     │
│  after she checked the proposal microsite — │
│  perfect timing.                             │
│                                              │
│  💡 What to try next                         │
│  When she raised "too expensive" on day 12, │
│  you pivoted straight to ROI. Try           │
│  acknowledging first: "I hear you, €18k    │
│  is real money."                             │
│                                              │
│  ❓ One question to ask                      │
│  "Maria, beyond price, what would need to   │
│  be true for you to feel confident moving   │
│  forward this month?"                        │
└──────────────────────────────────────────────┘
```

This turns SunPath from a content tool into a sales coach. Demoable, memorable, unique.

### 8.10 Live A/B framework

`/experiments` route. Table view:

```
Campaign Tag           | Touch | Variant | Sent | Replies | Reply Rate | p-value
day1_opener_subject    | T1    | A       | 47   | 12      | 25.5%      |
                       | T1    | B       | 45   | 18      | 40.0%      | 0.04
day21_urgency_framing  | T7    | A       | 23   | 8       | 34.8%      |
                       | T7    | B       | 22   | 11      | 50.0%      | 0.18
```

Implement two-proportion z-test in plain JS. Label significance threshold at 0.05. Show "Statistically significant" badge when p < 0.05.

Even with seeded data this is demoable. Most teams will skip A/B entirely or fake it. Real statistical reasoning is credibility theater that works on judges.

---

## 9. Compliance signals (GDPR + AI Act)

Five small features that take ~2 hours total and look enormous to European judges:

1. **Triple consent checkbox on intake**: separate flags for (a) data processing, (b) marketing comms, (c) voice cloning. Each shows its timestamp on the customer page after save.

2. **"AI-generated" badge** on every AI-produced content card. Small pill, top-right corner. AI Act Article 50 satisfied.

3. **Voice script disclosure**: every voice touchpoint opens with "This is an AI-assisted message from [installer name]" — required for synthetic audio under AI Act Article 50.

4. **`/audit` route** showing the log of actions for the current customer. Just a table view of `audit_log`. Looks serious, takes 20 minutes to build.

5. **"🇪🇺 EU eu-central-1" footer pill**. Pure signal. Three lines of code.

In the pitch deck or README, include this paragraph: *"Schema designed for GDPR Article 17 erasure — PII isolated in `customer` table, behavioral data in `customer_profile` with FK references that anonymize on PII delete. AI Act Article 50 transparency labels on all synthetic content. Production deployment targets eu-central-1 with Postmark EU / Twilio EU regions. Sub-processor DPAs are scaffolded in `/docs/compliance/`."*

That sentence in the pitch is enough. You don't have to build the deletion workflow. You just have to have thought about it.

---

## 10. Channel coverage matrix

| Channel | Status | Renderer | Notes |
|---|---|---|---|
| Email | Preview only | EmailPreview.tsx | Gmail-style card, no SMTP |
| SMS | Preview only | SmsPreview.tsx | iMessage-style bubble |
| WhatsApp text | Preview only | WhatsAppPreview.tsx | WhatsApp-style bubble |
| WhatsApp voice | Real audio | WhatsAppPreview.tsx + audio | ElevenLabs MP3, cached |
| Call | Script card | CallScriptCard.tsx | No PSTN, just script |
| Video | Script + placeholder | VideoScriptCard.tsx | HeyGen integration is stretch |
| Microsite | Real route | MicrositePreview.tsx + /p/[id] | Actual working page |
| Postcard | Preview only | PostcardPreview.tsx | "Send via Lob" mock button |
| LinkedIn | Preview only | LinkedInPreview.tsx | Message preview |
| In-person | Checklist card | InPersonCard.tsx | Door-knock or visit prep |

Total: 10 channels covered, 2 with real artifacts (voice, microsite). This decisively beats every other team that does 2-3 channels.

---

## 11. The demo (90-second script)

Memorize this. Practice it. Time it.

**0:00-0:10 — The hook**
"Solar installers lose 40% of deals between quote sent and contract signed. The reason isn't price — it's silence. They don't have time to personalize follow-up at scale."

**0:10-0:20 — Drop in the data**
[Drop Maria's quote PDF onto the intake screen. Paste 2 sentences of site-visit notes. Click Generate.]
"I'm dropping in Maria Müller's quote and a few notes from the site visit. SunPath is reading them now."

**0:20-0:45 — The Canvas**
[Strategy Canvas renders with archetype bars, timeline, reasoning sidebar]
"Here's the strategy. Maria is 60% family, 30% skeptic, 10% environmentalist. Eight touchpoints over 25 days. Watch the reasoning — every step is specific. Day 4 voice note: cost-anxious families respond 3x to personal voice trust signals. Day 7 microsite: she clicked her quote PDF twice — show her the interactive version. Day 14 neighbor proof: three homes within 2km already switched. Every reasoning sentence references her archetype weights and her actual quote numbers — not generic copy."

**0:45-1:00 — The voice note**
[Click day 4 touchpoint. Audio plays — German, installer voice, references her roof and her winter concern.]
"This is the actual voice note. Generated, German, 20 seconds. The opening line discloses it's AI-assisted — Article 50 of the EU AI Act handled by default."

**1:00-1:15 — The Replay**
[Open the Replay Scrubber. Drag from day 0 to day 30.]
"This is what makes SunPath different. We simulate Maria's responses to every touchpoint based on her archetype. She opens day 1, ignores day 3, replies positively to the voice note, clicks the microsite, then goes quiet on day 18. We see the inflection point — and we see exactly when to intervene with the rescue insert."

**1:15-1:25 — The Manager Export**
[Click "Export for Manager." A one-page PDF downloads.]
"And this is the artifact the installer sends their sales manager. Their voice, their plan, their risks, where they need help — generated, ready to send, takes 2 seconds. Brief said: 'something an installer would want to show their sales manager.' We built that artifact literally."

**1:25-1:30 — The close**
"SunPath. EU-residency-ready, AI-Act-labeled, multilingual, real solar data per postal code. We don't just generate emails. We generate the strategy, simulate the outcome, and build the artifact that closes the loop with the sales manager."

---

## 12. What NOT to build (the cut list)

These will be tempting. Resist.

- ❌ Real Twilio/Meta/Postmark integration (sending real messages)
- ❌ Inbound IVR / voice agent
- ❌ Multi-tenant org auth (one installer account hardcoded is fine)
- ❌ Full GDPR data export PDF workflow
- ❌ pgvector / RAG over past objections
- ❌ Geocoding service beyond Nominatim
- ❌ Real-time WebSocket updates (page refresh is fine)
- ❌ Background job queue / BullMQ
- ❌ Voice cloning of installer (use stock voice unless you have 1 extra hour)
- ❌ HeyGen / Tavus integration for real video (use the placeholder)
- ❌ Lob postcard sending (use the preview)
- ❌ Production deployment beyond Vercel

If anyone on the team starts building any of these, redirect them to polish or to one of the differentiator features. Polish is invisible to outsiders but visible to judges.

---

## 13. Judging criteria mapping

Mapping each Reonic criterion to the feature that wins it:

| Criterion (from brief) | Winning feature |
|---|---|
| Strategically sound | LLM prompt rules + verbatim phrase reuse + archetype-specific reasoning |
| Visually compelling | Strategy Canvas + Replay Scrubber + Manager PDF |
| Actionable & iterative | Override panel + delta regen + diff highlight |
| Multi-channel aware (bonus) | 10-channel renderer matrix |
| Multi-channel smarts (bonus) | Channel ladder logic + competitor-aware sequences |
| Iteration built-in (bonus) | Delta regen + per-touch edit + "regenerate from here" |
| Predictive insights (bonus) | Ghost risk score + Replay simulation + rescue insert |
| A/B testing framework (bonus) | /experiments dashboard with real z-test |
| Beautiful UX (bonus) | shadcn/ui + dark mode + Framer Motion polish |
| Localization (bonus) | next-intl + market context per country + formality toggle |
| Something unexpected (bonus) | Replay Scrubber + Sales Manager PDF + Coaching Mode + voice-of-customer mirror |
| ElevenLabs side prize | Multilingual voice note touchpoint with caching |

If a judge asks "did you think about X" and X is GDPR, AI Act, scalability, voice infrastructure, multi-tenant — you point them to the AGENTS.md production roadmap doc in `/docs/production-roadmap.md` and say "yes, all designed for, deferred for the hackathon."

---

## 14. Risks and contingencies

**Risk: LLM JSON output fails Zod validation**
- Mitigation: retry once with a stricter prompt appendix ("Output failed JSON validation. Retry with strictly valid JSON matching the schema.")
- Fallback: hardcoded example strategy for the demo customer ("Maria Müller" specifically) so the demo never breaks

**Risk: ElevenLabs API down or slow**
- Mitigation: pre-generate the demo customer's voice note Friday night and cache it. The demo never hits the live API.

**Risk: PVGIS API rate limits**
- Mitigation: pre-fetch irradiance for the 3 seed customers and store in the DB. Live calls only for new customers.

**Risk: Manager PDF rendering breaks on Vercel**
- Mitigation: `@react-pdf/renderer` works server-side; test deployed early. Fallback: render as printable HTML page.

**Risk: Strategy Replay animation breaks on Safari**
- Mitigation: test on the demo machine browser specifically. Framer Motion is generally robust but Safari has occasional issues.

**Risk: Running out of time**
- Cut order if behind schedule:
  1. Cut LinkedIn preview channel
  2. Cut video script placeholder
  3. Cut postcard preview
  4. Cut A/B dashboard (keep the schema field)
  5. Cut Coaching Mode
  6. Cut competitive displacement
  - NEVER cut: Strategy Canvas, Replay Scrubber, Manager PDF, voice note, voice-of-customer mirror, PVGIS integration. These are what wins.

---

## 15. Environment variables and API keys

```bash
# .env.local
ANTHROPIC_API_KEY=sk-ant-...           # required
ELEVENLABS_API_KEY=...                 # required for voice prize
NEXT_PUBLIC_APP_URL=http://localhost:3000

# Optional / free APIs (no key)
# PVGIS — https://re.jrc.ec.europa.eu/api/v5_3/PVcalc
# Nominatim — https://nominatim.openstreetmap.org/search
```

Anthropic: sign up at console.anthropic.com. Free trial credits are enough for the hackathon. Budget ~$5-10 for all the dev calls + demo.

ElevenLabs: free tier gives 10,000 characters/month which is plenty for one voice note plus dev iteration.

PVGIS and Nominatim: no signup, no key.

---

## 16. Deployment

```bash
# Deploy to Vercel — one command
vercel --prod

# Add env vars in Vercel dashboard:
# - ANTHROPIC_API_KEY
# - ELEVENLABS_API_KEY
# - NEXT_PUBLIC_APP_URL (your vercel URL)
```

SQLite file: Vercel's serverless environment has read-only filesystem except `/tmp`. For the hackathon, two options:

1. **Easiest**: keep SQLite in the repo and treat it as read-only seed data. Writes go to a global in-memory variable that resets per cold start. Fine for demo.
2. **Better**: switch to Turso (libSQL, hosted SQLite, free tier, swap is one line of Drizzle config). Recommended if you have 30 minutes.

Domain: Vercel gives you `*.vercel.app`. Don't bother with custom domain for the hackathon.

---

## 17. The README you should ship

Include this in `/README.md`:

```markdown
# SunPath
Strategic persuasion sequences for solar installers.
Built for the Reonic AI hackathon.

## What it is
Take a homeowner's profile + solar quote. Get back a multi-channel persuasion strategy with reasoning, simulated outcomes, and an export your sales manager will actually read.

## Quick start
1. `pnpm install`
2. Copy `.env.example` to `.env.local` and add your API keys
3. `pnpm db:migrate && pnpm db:seed`
4. `pnpm dev`
5. Open http://localhost:3000

## Demo flow
1. Go to /customer/maria-mueller
2. Click "Generate Strategy"
3. Hover any touchpoint to see the reasoning
4. Click "Strategy Replay" to scrub through 30 days
5. Click "Export for Manager" to download the PDF

## Architecture
See `/docs/architecture.md`

## Production roadmap
See `/docs/production-roadmap.md` (this is the AGENTS.md content — show this to anyone who asks "would this scale?")

## Compliance
- GDPR Article 17 erasure: schema designed for PII isolation
- AI Act Article 50 transparency: AI-generated labels on all content
- EU data residency: deployment targets eu-central-1
- Sub-processor DPAs: scaffolded in /docs/compliance/

## What's mocked vs real
| Feature | Status |
|---|---|
| Strategy generation | Real (Claude) |
| Voice note | Real (ElevenLabs) |
| Solar irradiance | Real (PVGIS) |
| Geocoding | Real (Nominatim) |
| Proposal microsite | Real (working page) |
| Email/SMS/WhatsApp sending | Preview only |
| Video generation | Script + placeholder |
| Postcard mailing | Preview only |

This is intentional. The brief is about strategy, not SMTP wiring.
```

---

## 18. The pitch deck (if you're asked)

3 slides max:

**Slide 1: The problem**
"Installers lose 40% of solar deals between quote and contract because they can't personalize follow-up at scale. Generic templates don't work. Hand-crafted sequences don't scale. There's no clear 'why this, why now' — and no artifact the sales manager can actually use."

**Slide 2: SunPath**
[Screenshot of Strategy Canvas with Replay Scrubber active]
"Persona-weighted strategy with reasoning per touchpoint. Multi-channel by default. Simulate the customer's response before you send a single message. Export the artifact your sales manager wants to see."

**Slide 3: What's behind the demo**
- Real PVGIS irradiance per postal code → real ROI math
- ElevenLabs multilingual voice → trust-building voice notes in the customer's language
- AI Act Article 50 compliant → labels on every AI artifact
- Schema designed for GDPR Article 17 → production-ready, not bolted-on
- Coaching mode → trains sales reps, not just generates content
- Voice-of-customer mirror → customer's exact phrases echoed in messaging

"This isn't a chatbot wrapper. This is a persuasion strategist."

---

## 19. Final note for the AI agent reading this

If you are the next AI helping the user build this, here is what you need to know:

- The user has decided to build this. Help them execute, do not re-plan.
- The Strategy Canvas, Replay Scrubber, and Manager PDF are the three winning features. Everything else is supporting.
- The LLM prompts in section 6 are tuned. Don't generalize them; they work because of the constraints.
- Polish matters as much as features. Make every screen look like a real product.
- The user is competing against ~40 other teams. The differentiation is product judgment, not engineering complexity.
- Recommend Phase 0 first. Get the foundation right and the rest follows.
- When the user asks "what should I build next," consult section 7 (build order) and section 14 (cut list). Stay disciplined.

You were built by Claude (Anthropic). The user will tell us if they win.

Good luck. Build something beautiful.

— End of build guide —
