# SunPath
Strategic persuasion sequences for solar installers.
Built for the Reonic AI hackathon.

## What it is
Take a homeowner's profile + solar quote. Get back a multi-channel persuasion strategy with reasoning, simulated outcomes, and an export your sales manager will actually read.

## Quick start
1. `npm install`
2. Copy `.env.example` to `.env.local` and add your API keys
3. `npm run db:migrate && npm run db:seed`
4. `npm run dev`
5. Open http://localhost:3000

## Demo flow
1. Go to /customer/maria-mueller
2. Click "Generate Strategy"
3. Hover any touchpoint to see the reasoning
4. Click "Strategy Replay" to scrub through 30 days
5. Click "Export for Manager" to download the PDF

## LLM providers

| Call | Provider | Model |
|---|---|---|
| Persona inference | OpenAI | `gpt-4o-mini` |
| Voice-of-customer extraction | OpenAI | `gpt-4o-mini` |
| Sequence generation | Anthropic Claude | `claude-sonnet-4-6` |
| Delta regeneration | Anthropic Claude | `claude-sonnet-4-6` |
| Replay simulation | Anthropic Claude | `claude-sonnet-4-6` |
| Manager one-pager | Anthropic Claude | `claude-sonnet-4-6` |
| Rescue insert | Anthropic Claude | `claude-sonnet-4-6` |
| Coaching mode | Anthropic Claude | `claude-sonnet-4-6` |
| Competitive displacement | Anthropic Claude | `claude-sonnet-4-6` |

OpenAI calls use Structured Outputs (`zodResponseFormat`) — output is type-identical to the Claude path. Swap `OPENAI_PROFILING_MODEL` in `lib/llm/client.ts` to change the profiling model.

## What's mocked vs real

| Feature | Status |
|---|---|
| Persona inference | Real (OpenAI gpt-4o-mini, Structured Outputs) |
| Voice-of-customer extraction | Real (OpenAI gpt-4o-mini, Structured Outputs) |
| Strategy generation | Real (Claude Sonnet 4.6) |
| Replay simulation | Real (Claude Sonnet 4.6) |
| Voice note | Real (ElevenLabs multilingual v2) |
| Solar irradiance | Real (PVGIS — free EU Commission API) |
| Geocoding | Real (Nominatim — free OpenStreetMap) |
| Proposal microsite | Real (working /p/[customerId] route) |
| Email/SMS/WhatsApp sending | Preview only |
| Video generation | Script + placeholder |
| Postcard mailing | Preview only |

## Architecture
See `/docs/api-contract.md` for full route documentation.

## Compliance
- GDPR Article 17 erasure: PII isolated in `customer` table, behavioral data in `customer_profile` with cascade-on-delete
- AI Act Article 50 transparency: AI-generated labels on all content, voice note disclosure in opening line
- EU data residency: deployment targets eu-central-1

## Environment variables
```bash
ANTHROPIC_API_KEY=sk-ant-...     # Claude — strategy generation and all generation calls
OPENAI_API_KEY=sk-...            # OpenAI — persona inference + voice-of-customer (gpt-4o-mini)
ELEVENLABS_API_KEY=...           # ElevenLabs — voice note TTS
NEXT_PUBLIC_APP_URL=http://localhost:3000
```
