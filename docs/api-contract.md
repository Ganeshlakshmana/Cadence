# SunPath API Contract

All routes return `application/json`. All POST bodies are `application/json`.

## LLM Provider Routing

| Call | Provider | Model | Constant |
|---|---|---|---|
| Persona inference | **OpenAI** | `gpt-4o-mini` | `OPENAI_PROFILING_MODEL` in `lib/llm/client.ts` |
| Voice-of-customer extraction | **OpenAI** | `gpt-4o-mini` | `OPENAI_PROFILING_MODEL` in `lib/llm/client.ts` |
| Sequence generation | **Anthropic Claude** | `claude-sonnet-4-6` | `SONNET` in `lib/llm/client.ts` |
| Delta regeneration | **Anthropic Claude** | `claude-sonnet-4-6` | `SONNET` |
| Replay simulation | **Anthropic Claude** | `claude-sonnet-4-6` | `SONNET` |
| Manager one-pager | **Anthropic Claude** | `claude-sonnet-4-6` | `SONNET` |
| Rescue insert | **Anthropic Claude** | `claude-sonnet-4-6` | `SONNET` |
| Coaching mode | **Anthropic Claude** | `claude-sonnet-4-6` | `SONNET` |
| Competitive displacement | **Anthropic Claude** | `claude-sonnet-4-6` | `SONNET` |

OpenAI calls use **Structured Outputs** via `zodResponseFormat` from `openai/helpers/zod` — output is type-identical to the Claude path (same Zod schemas, same TypeScript types).

---

---

## POST `/api/strategy/generate`

Generate a full persuasion strategy for a customer + quote.

### Request Body
```json
{
  "customerId": "string",
  "quoteId": "string",
  "installerNotes": "string (min 10 chars — raw site visit / call notes)"
}
```

### Response
```json
{
  "strategyId": "string (UUID)",
  "rationaleSummary": "string (2-3 sentences)",
  "marketContextApplied": "string (e.g. 'DE_energiewende_2024')",
  "ghostRisk": {
    "score": 0.0,
    "signals": ["string"],
    "recommendation": "'on_track' | 'watch' | 'rescue_needed'"
  },
  "closeReadiness": {
    "score": 0.0,
    "signals": ["string"],
    "recommendation": "'not_yet' | 'warming_up' | 'close_now'"
  },
  "personaWeights": {
    "family": 0.0,
    "investor": 0.0,
    "environmentalist": 0.0,
    "skeptic": 0.0
  },
  "touches": [
    {
      "sequenceIndex": 0,
      "dayOffset": 0,
      "channel": "'email' | 'sms' | 'whatsapp_text' | 'whatsapp_voice' | 'call' | 'video' | 'microsite' | 'postcard' | 'linkedin' | 'in_person'",
      "tone": "'reassuring' | 'data_driven' | 'impact' | 'objection_handling' | 'urgency' | 'social_proof'",
      "objective": "string",
      "reasoning": "string (references archetype weights + quote numbers)",
      "contentSubject": "string | null",
      "contentBody": "string",
      "contentVariantB": "string | null",
      "abTestActive": false
    }
  ]
}
```

### Errors
- `400` — validation error in body
- `404` — customer or quote not found
- `403` — consent gate blocked (missing consent)
- `500` — LLM error

---

## POST `/api/strategy/regenerate`

Delta-regenerate an existing strategy based on installer instruction. Returns diff.

### Request Body
```json
{
  "strategyId": "string",
  "instruction": "string (min 5 chars — e.g. 'make it warmer', 'remove calls', 'add urgency')"
}
```

### Response
```json
{
  "strategyId": "string",
  "rationaleSummary": "string",
  "touches": [ "... same touch shape as /generate ..." ],
  "changes": [
    {
      "touchIndex": 0,
      "changeType": "'modified' | 'added' | 'removed' | 'rescheduled' | 'channel_changed' | 'tone_changed'",
      "summary": "string (1 line)",
      "before": "string | null",
      "after": "string | null"
    }
  ]
}
```

---

## POST `/api/strategy/replay`

Simulate customer responses across the full strategy timeline (powers the Replay Scrubber UI).

### Request Body
```json
{
  "strategyId": "string",
  "includeCoaching": false
}
```

### Response
```json
{
  "strategyId": "string",
  "simulation": {
    "simulatedResponses": [
      {
        "touchSequenceIndex": 0,
        "responseType": "'opened_not_clicked' | 'clicked_no_reply' | 'replied_positive' | 'replied_objection' | 'replied_question' | 'ignored' | 'call_answered' | 'call_voicemail' | 'booked_meeting' | 'unsubscribed'",
        "responseSummary": "string",
        "responseFullText": "string | null",
        "sentiment": "'positive' | 'neutral' | 'negative' | 'objection' | 'ready_to_buy'",
        "occurredDayOffset": 0
      }
    ],
    "predictedOutcome": "'closed_won' | 'closed_lost' | 'still_engaged_at_day_30' | 'ghosted'",
    "predictedCloseProbability": 0.0,
    "criticalMomentTouchIndex": 0,
    "criticalMomentDescription": "string"
  },
  "coaching": null
}
```

If `includeCoaching: true`, `coaching` is:
```json
{
  "whatWorked": "string",
  "whatToTryNext": "string",
  "oneQuestionToAsk": "string",
  "overallReadiness": "'close_today' | 'one_more_touch' | 'needs_rescue' | 'likely_lost'"
}
```

---

## POST `/api/touch/[id]/regenerate`

Regenerate a single touchpoint. `id` is the `strategyTouch.id`.

### Request Body
```json
{
  "instruction": "string (optional — e.g. 'make this warmer')"
}
```

### Response
```json
{
  "touchId": "string",
  "touch": { "... same touch shape ..." }
}
```

---

## POST `/api/touch/[id]/audio`

Generate ElevenLabs voice note for a `whatsapp_voice` touch. Returns cached URL on repeat calls.

### Request Body
```json
{
  "installerName": "string (default: 'Your Solar Advisor')",
  "companyName": "string (default: 'SunPath Solar')"
}
```

### Response
```json
{
  "touchId": "string",
  "audioUrl": "/audio/{hash}.mp3",
  "script": "string",
  "durationEstimateSeconds": 20,
  "aiActDisclosure": "string",
  "cached": false
}
```

### Errors
- `400` — touch is not `whatsapp_voice` channel
- `403` — missing `consentVoiceCloning`

---

## POST `/api/export/manager-pdf`

Generate Sales Manager One-Pager content JSON. Frontend `ManagerOnePagerPdf.tsx` renders the actual PDF.

### Request Body
```json
{
  "strategyId": "string",
  "installerName": "string (default: 'Solar Sales Rep')"
}
```

### Response
```json
{
  "strategyId": "string",
  "generatedAt": "ISO8601",
  "installerName": "string",
  "customer": { "firstName": "string", "lastName": "string", "city": "string", "countryCode": "string" },
  "quote": { "totalPrice": 0, "currency": "string", "paybackPeriodYears": 0, "annualRoiPct": 0 },
  "archetypeBlend": { "family": 0, "investor": 0, "environmentalist": 0, "skeptic": 0 },
  "scores": { "ghostRisk": 0, "closeReadiness": 0 },
  "onePager": {
    "dealHeader": "string",
    "myRead": "string",
    "myPlan": "string",
    "risksAndMitigations": [{ "risk": "string", "mitigation": "string" }],
    "whereIneedHelp": "string",
    "closeTargetDate": "string",
    "expectedOutcome": "string"
  },
  "touchSummary": [{ "dayOffset": 0, "channel": "string", "objective": "string" }]
}
```

---

## GET `/api/irradiance`

Look up PVGIS solar irradiance for a lat/lng. Optionally caches on a customer row.

### Query Parameters
| Param | Required | Description |
|---|---|---|
| `lat` | yes | Latitude (decimal) |
| `lon` | yes | Longitude (decimal) |
| `countryCode` | no | ISO 2-letter code for relative comparison (default: `DE`) |
| `customerId` | no | If provided, caches result on customer row |

### Response
```json
{
  "lat": 52.52,
  "lon": 13.405,
  "annualIrradianceKwhM2": 1050,
  "annualEnergyKwh": 840,
  "relative": { "pct": -5, "label": "5% below average" },
  "displayLabel": "1050 kWh/m²/year (5% below average)"
}
```

---

## Zod Types

All request/response shapes are derived from Zod schemas in `/lib/llm/schemas.ts`. Import types directly:

```typescript
import type { Strategy, PersonaInference, ReplaySimulation, ManagerOnePager, CoachingNote, DeltaRegen } from '@/lib/llm/schemas';
```
