# Cadence — AI Solar Sales Platform

> Built by **Reonic** · Powered by OpenAI, ElevenLabs, and Twilio

Cadence is an AI-first CRM and outreach platform for residential solar installers. It generates personalised multi-touch follow-up sequences, sends voice notes and WhatsApp messages, and coaches installers through every deal — from lead to close.

---

## Features

### Pipeline
View all customers in a single live dashboard.
- Lead status, quote amount, archetype blend, ghost risk
- One-click jump to Sequence Planner or Replay timeline
- Export manager brief as PDF

### Sequence Planner
Claude generates a tailored multi-touch outreach sequence for each customer based on their archetype profile and deal context.

- **Ghost Risk Score** — probability the lead goes dark
- **Close Readiness Score** — how ready the customer is to sign
- **Archetype dimensions** — Family, Investor, Environmentalist, Skeptic (Pioneer / Conservative blend bar)
- **Touch cards** — channel, day offset, subject, reasoning, A/B variant badge
- Sequence Reasoning sidebar explains the strategic logic

### WhatsApp Voice Notes (AI-generated)
Voice note touch cards auto-generate on load:

1. **Personalized image card** — customer name, system price, annual savings, solar branding (800×450 PNG rendered with Sharp/SVG)
2. **ElevenLabs voice note** — AI Act Article 50 compliant (disclosure prepended); language-matched voice (German Adam, French Dorothy, Spanish Domi, etc.)
3. Both assets shown at the top of the touch card immediately, no click required
4. Re-generation skips cache-hits (SHA-256 hash deduplication)

### Max — Image Editing Chatbot
Before sending a voice card, the installer enters the **Review voice card** step in the Send modal:

- Sees the personalized PNG + audio player
- Types any edit in plain language: *"Change the subtitle to Special offer — this week only"* or *"Add a caption: Call me if you have questions"*
- **Max** (Claude Haiku) interprets the request, extracts changed fields (`subtitle`, `statLine`, `badge`, `customCaption`), regenerates the PNG, and replies in a chat bubble
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
One-pager PDF summarising the customer profile, archetype, sequence rationale, and key talking points. Streamable export route supports large payloads.

### AI Follow-ups
Automatically surfaces suggested follow-up actions based on customer responses, sentiment analysis, and sequence state.

### Coaching Panel
ElevenLabs Conversational AI agent embedded in the Sequence Planner. The installer can talk through the deal before a call — Max coaches on objection handling, pricing anchors, and closing approach based on the customer's archetype and history.

### Customer Response Handling
Incoming WhatsApp messages are received via webhook, classified by sentiment (positive / negative / neutral / objection), stored against the touchpoint, and surfaced in the Replay timeline.

### Compliance
- **Consent gating** — all channel sends are blocked unless `consent_marketing = 1`
- **Audit log** — every voice generation, send, and AI action is logged with timestamp and actor
- **AI Act Article 50 disclosure** — synthetic audio always opens with a language-appropriate disclosure before the main message

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 14 App Router (TypeScript) |
| Database | SQLite + Drizzle ORM |
| AI — strategy & chatbot | Anthropic Claude (Sonnet for sequences, Haiku for Max) |
| AI — voice | ElevenLabs TTS (`eleven_multilingual_v2`) |
| AI — coaching | ElevenLabs Conversational AI |
| Messaging | Twilio (WhatsApp, SMS) / Meta Cloud API |
| Email | Gmail API (OAuth) |
| Image generation | Sharp + SVG (server-side, no canvas) |
| Styling | Tailwind CSS + Material Symbols |

---

## Project Structure

```
app/
  pipeline/         Customer pipeline dashboard
  sequences/        Sequence Planner (touch cards, Max editing)
  replay/           Customer interaction timeline
  brief/            Manager brief viewer
  login/            Auth (middleware-protected)
  api/
    customers/      CRUD + latest sequence
    strategy/       Generate / regenerate / replay sequences
    touch/[id]/     Audio, image, voice card, regenerate-image
    channels/       Gmail, WhatsApp, SMS send routes
    ai-followups/   Follow-up suggestions
    coaching/       ElevenLabs coaching agent
    export/         PDF export (stream + full)

components/
  SendNowModal      Multi-step send flow with Max chatbot
  CoachingPanel     ElevenLabs embedded coaching
  SideNav           Navigation

lib/
  llm/              Claude sequence generator + schemas
  channels/         WhatsApp card renderer, email, SMS
  elevenlabs/       TTS client, voice map, call agent
  compliance/       Consent gate, audit log
  solar/            Customer enrichment

db/
  schema.ts         Drizzle table definitions
  client.ts         DB connection
  seed.ts           Demo data
```

---

## Environment Variables

```bash
# Anthropic
ANTHROPIC_API_KEY=

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

Open [http://localhost:3000](http://localhost:3000). Select a customer from **Pipeline → Sequences** to generate their first AI sequence.

---

## Scripts

| Script | Purpose |
|---|---|
| `scripts/test-strategy.ts` | Run sequence generation end-to-end |
| `scripts/test-solar.ts` | Test solar enrichment / irradiance |
| `scripts/test-send-email.ts` | Send a test email via Gmail |
| `scripts/test-replay.ts` | Verify replay timeline data |
| `scripts/test-manager-voice.ts` | Test ElevenLabs voice call flow |

Run with: `npx tsx scripts/<name>.ts`
