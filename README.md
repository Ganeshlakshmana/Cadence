# Cadence — AI Solar Sales Platform

> Built for  **Reonic** · Powered by OpenAI, ElevenLabs, and Twilio

Cadence is an AI-first CRM and outreach platform for residential solar installers. It generates personalised multi-touch follow-up sequences, sends voice notes and WhatsApp messages, and coaches installers through every deal — from lead to close. Designed to feel like Airtable: clean, visual, and usable by non-technical sales reps without training.

---

## Features

### Pipeline
View all customers in a single live dashboard.
- Lead status, quote amount, archetype blend, ghost risk score
- High-risk leads flagged automatically (ghost risk > 40%, close readiness > 80%)
- One-click jump to Sequence Planner or Replay timeline
- Export manager brief as PDF

### Sequence Planner
AI generates a tailored multi-touch outreach sequence for each customer based on their archetype profile and deal context.

- **Ghost Risk Score** — probability the lead goes dark (0–100%, AI-estimated at generation time)
- **Close Readiness Score** — how ready the customer is to sign
- **Archetype dimensions** — Family, Investor, Environmentalist, Skeptic (weighted blend bar)
- **Touch cards** — channel, day offset, subject, reasoning, A/B variant badge
- **Rescue insert** — one-click inject a high-priority re-engagement touch when a sequence stalls
- Sequence Reasoning sidebar explains the strategic logic
- Manager must approve AI-generated follow-ups before they update the sequence

### Airtable-Style UX for Sales Teams
Built for non-technical sales reps and field installers:
- Card-based pipeline view — no SQL, no dashboards, just rows that make sense
- Touch cards show channel icon, day, subject, and a plain-English reasoning blurb
- Send modal walks through each step (channel → review → draft → send) with no jargon
- Coaching panel works like a phone call, not a form — just talk to it before a customer call

### WhatsApp Voice Notes (AI-generated)
Voice note touch cards auto-generate on load:

1. **Personalized image card** — customer name, system price, annual savings, solar branding (800×450 PNG rendered with Sharp/SVG, server-side)
2. **ElevenLabs voice note** — AI Act Article 50 compliant (disclosure prepended); language-matched voice (German Adam, French Dorothy, Spanish Domi, etc.)
3. Both assets shown at the top of the touch card immediately, no click required
4. Re-generation skips cache-hits (SHA-256 hash deduplication)

### Max — Image Editing Chatbot
Before sending a voice card, the installer enters the **Review voice card** step in the Send modal:

- Sees the personalized PNG + audio player
- Types any edit in plain language: *"Change the subtitle to Special offer — this week only"* or *"Add a caption: Call me if you have questions"*
- **Max** (OpenAI GPT-4o mini) interprets the request, extracts changed fields (`subtitle`, `statLine`, `badge`, `customCaption`), regenerates the PNG, and replies in a chat bubble
- Unlimited back-and-forth edits before sending

### Multi-channel Send Modal
Contact a customer from any touch card via:

| Channel | Description |
|---|---|
| Email | Gmail send (OAuth) |
| WhatsApp text | Twilio / Meta Cloud API |
| WA Voice Note | Image card + audio via WhatsApp |
| SMS | Twilio SMS |

Flow for voice notes: **Channel → Review & edit with Max → Draft → Send**

### Replay Timeline
Full interaction history for a customer — every sent touch, response, and sentiment classification shown on a chronological timeline.

### Manager Brief (PDF Export)
One-pager PDF summarising the customer profile, archetype, sequence rationale, and key talking points. Streamable export route supports large payloads. Requires `dataProcessing` consent.

### AI Follow-ups (Manager Approval Gate)
When a customer responds, the AI surfaces a suggested follow-up action. It sits in `pending_review` until a manager explicitly approves or rejects it — the sequence is never updated automatically from AI output.

1. Customer response arrives via webhook → sentiment classified → stored in `customer_responses`
2. AI generates a suggested follow-up → stored in `ai_followups` with `status: pending_review`
3. Manager reviews in the pipeline UI → approves or rejects via `PATCH /api/ai-followups/[id]`
4. Both decisions are written to the audit log with `actor: manager`

### Coaching Panel
ElevenLabs Conversational AI agent embedded in the Sequence Planner. The installer can talk through the deal before a customer call — the agent coaches on objection handling, pricing anchors, and closing approach based on the customer's archetype, ghost risk score, and sequence history.

### Customer Response Handling
Incoming WhatsApp messages are received via webhook, classified by sentiment (`positive` / `negative` / `neutral` / `objection`), stored against the touchpoint, and surfaced in the Replay timeline.

---

## GDPR Compliance

Cadence is built GDPR-first. Every AI action that touches personal data is gated behind explicit consent.

### Three Consent Tiers

| Consent | Field | Required For |
|---|---|---|
| Data Processing | `consent_data_processing` | Persona inference, sequence generation, replay simulation, PDF export, audit log read |
| Marketing | `consent_marketing` | Sequence generation, voice note generation, sending any channel |
| Voice Cloning | `consent_voice_cloning` | ElevenLabs voice synthesis using customer-specific voice |

### Consent Collection Flow

1. **Installer / sales rep** takes consent from the customer verbally or via a form during onboarding
2. Consent flags are recorded per-customer in the `customers` table (`consent_data_processing`, `consent_marketing`, `consent_voice_cloning`)
3. Every API route that touches AI or outreach calls `checkConsent()` before proceeding
4. Missing consent throws a `Consent gate blocked` error — the action is hard-blocked, not just warned

```
Customer onboarding
  └── Sales rep records consent (data / marketing / voice)
        └── Stored in customers table
              └── consentGate.ts checks before every AI action
                    └── Blocked if any required consent is missing
```

### Audit Log

Every significant action — voice generation, sequence creation, PDF export, send, manager approval — is written to the `audit_log` table with:
- `actor` — who triggered it (`system`, `installer_user`, `manager`)
- `action` — namespaced event string (e.g. `sequence.generated`, `followup_approved`)
- `entityType` + `entityId` — what was affected
- `metadata` — JSON with contextual data (customer ID, model name, channel, etc.)
- `createdAt` — Unix timestamp

### AI Act Article 50

All ElevenLabs synthetic audio opens with a language-appropriate disclosure statement before the main message content, as required by EU AI Act Article 50.

---

## Databases

Cadence uses two separate SQLite databases managed with Drizzle ORM.

### `data/sunpath.db` — Main Application Database

| Table | Purpose |
|---|---|
| `products` | Solar products catalogue (panels, batteries, inverters) with warranty, power specs, target archetype, and pricing |
| `customers` | Lead/customer records — contact info, archetype blend (Family/Investor/Environmentalist/Skeptic), quote, consent flags, status |
| `sequences` | AI-generated outreach plans per customer — ghost risk score, close readiness score, rationale, day progress |
| `touchpoints` | Individual messages within a sequence — channel, day offset, content, status (`pending` / `sent`), A/B variant |
| `customer_responses` | Inbound messages from customers (WhatsApp webhook) — sentiment, response text, linked touchpoint |
| `ai_followups` | AI-suggested follow-up actions — `pending_review` until manager approves or rejects |
| `audit_log` | Immutable event log of all AI and send actions |
| `call_records` | ElevenLabs voice call outcomes — conversation ID, final decision, quote discussed, duration |

Schema: [db/schema.ts](db/schema.ts)

### `data/installers.db` — Identity & Auth Database

Kept separate from the main DB so auth data is never mixed with customer PII in the same file.

| Table | Purpose |
|---|---|
| `installers` | Installer / sales rep / manager accounts — email, phone, role, session token |

Roles: `installer` · `sales_rep` · `manager`

Schema: [db/installerSchema.ts](db/installerSchema.ts)

Session tokens are stored as cookies and validated by middleware on every request. Public routes: `/login`, `/api/installer/login`, `/api/installer/register`.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 14 App Router (TypeScript) |
| Databases | SQLite × 2 (sunpath.db + installers.db) + Drizzle ORM |
| AI — strategy & image chatbot | OpenAI (GPT-4o for sequences, GPT-4o mini for Max) |
| AI — voice synthesis | ElevenLabs TTS (`eleven_multilingual_v2`) |
| AI — coaching | ElevenLabs Conversational AI |
| Messaging | Twilio (WhatsApp, SMS) / Meta Cloud API |
| Email | Gmail API (OAuth) |
| Image generation | Sharp + SVG (server-side, no canvas) |
| Styling | Tailwind CSS + Material Symbols |
| Auth | Custom session tokens (cookie-based, middleware-protected) |
| Compliance | Consent gate + audit log (GDPR) · AI Act Article 50 (voice disclosure) |

---

## Project Structure

```
app/
  pipeline/         Customer pipeline dashboard (Airtable-style card view)
  sequences/        Sequence Planner (touch cards, Max editing, coaching)
  replay/           Customer interaction timeline
  brief/            Manager brief viewer
  login/            Auth (middleware-protected)
  api/
    customers/      CRUD + latest sequence
    customers/[id]/
      followups/    AI follow-up suggestions per customer
      responses/    Customer response history
    strategy/       Generate / regenerate / replay sequences
    touch/[id]/     Audio, image, voice card, send email, regenerate
    touch/rescue/   Insert a rescue touch into a stalled sequence
    channels/       Gmail, WhatsApp, SMS send routes
    ai-followups/   Manager approve / reject pending AI follow-ups
    coaching/       ElevenLabs coaching agent
    export/         PDF export (stream + full)
    installer/      Auth: register, login, logout, me
    products/       Products catalogue CRUD
    responses/      Inbound webhook (WhatsApp responses)

components/
  SendNowModal      Multi-step send flow with Max chatbot
  CoachingPanel     ElevenLabs embedded coaching
  SideNav           Navigation

lib/
  llm/              AI sequence generator, rescue insert, schemas, prompts
  channels/         WhatsApp card renderer, Gmail, SMS, WhatsApp
  elevenlabs/       TTS client, voice map, call agent
  compliance/       Consent gate (consentGate.ts), audit log (auditLog.ts)
  solar/            Customer enrichment (irradiance, address)
  persuasion/       Market context blocks per country
  auth/             Session helpers, constants
  agents/           AI agent utilities
  voice-agent/      Voice agent helpers

db/
  schema.ts         Main DB — Drizzle table definitions (sunpath.db)
  installerSchema.ts Auth DB — Drizzle table definitions (installers.db)
  client.ts         DB connection helper
  seed.ts           Demo data

data/
  sunpath.db        Main SQLite database (customers, sequences, etc.)
  installers.db     Auth SQLite database (installer accounts)

scripts/
  test-strategy.ts  Run sequence generation end-to-end
  test-solar.ts     Test solar enrichment / irradiance
  test-send-email.ts Send a test email via Gmail
  test-replay.ts    Verify replay timeline data
  test-manager-voice.ts Test ElevenLabs voice call flow
  test-whatsapp.ts  Test WhatsApp send
  gmail-auth.ts     Run Gmail OAuth flow
  seed-products.cjs Seed product catalogue
  seed-test-customer.cjs Add a test customer
```

---

## Key Flows

### New Customer Onboarding
```
Sales rep creates customer record
  └── Records consent (data / marketing / voice) at point of sale
        └── Customer flags stored in DB
              └── AI sequence generation unlocked
                    └── Manager brief auto-available
```

### Sequence Generation & Manager Gate
```
Installer clicks "Generate Sequence"
  └── consentGate checks dataProcessing + marketing consent
        └── AI generates sequence with ghost risk + close readiness scores
              └── Sequence stored as pending touches
                    └── AI follow-up suggestions go to pending_review
                          └── Manager approves / rejects in pipeline UI
                                └── Approved follow-ups update sequence
                                      └── All decisions written to audit_log
```

### Send Flow (Voice Note example)
```
Installer opens touch card
  └── Voice note + image card auto-generated on load
        └── Installer opens Send modal
              └── Step 1: Choose channel
              Step 2: Review & edit with Max (OpenAI GPT-4o mini chat)
              Step 3: Draft preview
              Step 4: Send (Twilio / WhatsApp)
                    └── consentGate checks marketing + voiceCloning consent
                          └── Sent → touch status = 'sent' → audit log written
```

---

## Environment Variables

```bash
# OpenAI
OPENAI_API_KEY=

# ElevenLabs
ELEVENLABS_API_KEY=
ELEVENLABS_AGENT_ID=
ELEVENLABS_COACHING_AGENT_ID=
ELEVENLABS_PHONE_NUMBER_ID=
ELEVENLABS_WEBHOOK_SECRET=

# Twilio (WhatsApp + SMS)
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
TWILIO_WHATSAPP_FROM=
TWILIO_SMS_FROM=

# Gmail
GMAIL_CLIENT_ID=
GMAIL_CLIENT_SECRET=
GMAIL_REFRESH_TOKEN=
GMAIL_SENDER_EMAIL=

# App
NEXTAUTH_SECRET=
NEXTAUTH_URL=http://localhost:3000
```

---

## Getting Started

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Log in with an installer account (see `scripts/seed-test-customer.cjs` to create demo data), then navigate to **Pipeline → Sequences** to generate a customer's first AI sequence.

---

## Scripts

| Script | Purpose |
|---|---|
| `scripts/test-strategy.ts` | Run sequence generation end-to-end |
| `scripts/test-solar.ts` | Test solar enrichment / irradiance |
| `scripts/test-send-email.ts` | Send a test email via Gmail |
| `scripts/test-replay.ts` | Verify replay timeline data |
| `scripts/test-manager-voice.ts` | Test ElevenLabs voice call flow |
| `scripts/test-whatsapp.ts` | Test WhatsApp message send |
| `scripts/gmail-auth.ts` | Run Gmail OAuth token flow |
| `scripts/seed-products.cjs` | Seed the product catalogue |
| `scripts/seed-test-customer.cjs` | Add a demo customer to the DB |
| `scripts/seed-extra-customers.cjs` | Bulk seed multiple demo customers |
| `scripts/migrate-call-records.cjs` | Run call records migration |

Run with: `npx tsx scripts/<name>.ts` or `node scripts/<name>.cjs`
