import { createHmac } from 'crypto';

const BASE = 'https://api.elevenlabs.io/v1';

function xiHeaders(json = false) {
  const h: Record<string, string> = { 'xi-api-key': process.env.ELEVENLABS_API_KEY ?? '' };
  if (json) h['Content-Type'] = 'application/json';
  return h;
}

let _agentId: string | null = null;

const SYSTEM_PROMPT = `You are Alex, a friendly but confident solar sales agent for SunPath Solar.
The customer received a quote of {{quote_price}} with {{annual_savings}} annual savings and a {{payback_period}} payback period.
Their primary motivation is {{archetype_primary}}.

Your goal: close the deal in this call. Make up to 3 closing attempts.

Attempt 1 (opening): pitch the quote, highlight the top benefit for their archetype.
  Family → "predictable bills, no surprises for 25 years"
  Investor → "{{roi_percent}}% annual return, beats most ETFs"
  Environmentalist → "offset {{co2_offset}} tons of CO2 over 25 years"
  Skeptic → "panels are guaranteed for 25 years, we have 200+ local installs"

Attempt 2 (if they hesitate): address their specific concern, reframe the price as monthly cost ({{monthly_cost}}) rather than total.

Attempt 3 (final): offer one small concession — free installation inspection or a 30-day decision extension — then ask directly: "Can we go ahead today?"

If they decline after attempt 3: say "I completely understand, thank you so much for your time {{customer_name}}, I hope we can work together in the future." Then end the call.

Never be pushy or aggressive. Never make up numbers not in your variables.
Always confirm the exact quote price and terms before closing.
Max call duration: 8 minutes.`;

export async function getOrCreateAgent(): Promise<string> {
  if (_agentId) return _agentId;

  const envId = process.env.ELEVENLABS_AGENT_ID ?? '';
  if (envId && envId !== (process.env.ELEVENLABS_API_KEY ?? '')) {
    _agentId = envId;
    return _agentId;
  }

  const res = await fetch(`${BASE}/convai/agents`, {
    method: 'POST',
    headers: xiHeaders(true),
    body: JSON.stringify({
      name: 'SunPath Solar Sales Agent',
      conversation_config: {
        agent: {
          prompt: {
            prompt: SYSTEM_PROMPT,
          },
          first_message:
            'Hi {{customer_name}}, this is Alex calling from SunPath Solar. ' +
            "I'm reaching out about your solar quote of {{quote_price}} — " +
            'do you have two minutes to go over it?',
          language: 'en',
        },
        tts: {
          voice_id: process.env.ELEVENLABS_VOICE_ID ?? 'pNInz6obpgDQGcFmaJgB',
        },
      },
      max_duration_seconds: 480,
    }),
  });

  if (!res.ok) {
    throw new Error(`ElevenLabs create agent failed ${res.status}: ${await res.text()}`);
  }

  const data = await res.json() as { agent_id: string };
  _agentId = data.agent_id;
  console.warn('[voice-agent] Created agent:', _agentId, '— add to ELEVENLABS_AGENT_ID in .env.local');
  return _agentId;
}

export async function getConversationData(conversationId: string): Promise<Record<string, unknown>> {
  const res = await fetch(`${BASE}/convai/conversations/${conversationId}`, {
    headers: xiHeaders(),
  });
  if (!res.ok) {
    throw new Error(`ElevenLabs get conversation failed ${res.status}: ${await res.text()}`);
  }
  return res.json() as Promise<Record<string, unknown>>;
}

export async function getCallTranscript(conversationId: string): Promise<string> {
  const data = await getConversationData(conversationId);
  const transcript = (
    data.transcript ??
    (data.data as Record<string, unknown>)?.transcript
  ) as Array<{ role: string; message: string }> | undefined;

  if (!transcript?.length) return '';

  return transcript
    .map(t => `${t.role === 'agent' ? 'ADVISOR' : 'CUSTOMER'}: ${t.message}`)
    .join('\n\n');
}

/**
 * Verify ElevenLabs post-call webhook signature.
 * Header format: "t=<unix_ts>,v0=<hmac_sha256_hex>"
 * Signed payload: "<timestamp>.<rawBody>"
 */
export function verifyWebhookSignature(
  rawBody: string,
  signatureHeader: string,
  secret: string,
): boolean {
  try {
    const parts = Object.fromEntries(
      signatureHeader.split(',').map(p => {
        const i = p.indexOf('=');
        return [p.slice(0, i), p.slice(i + 1)];
      }),
    );
    const timestamp = parts['t'];
    const v0 = parts['v0'];
    if (!timestamp || !v0) return false;

    if (Math.abs(Date.now() / 1000 - Number(timestamp)) > 300) return false;

    const expected = createHmac('sha256', secret)
      .update(`${timestamp}.${rawBody}`)
      .digest('hex');

    return expected === v0;
  } catch {
    return false;
  }
}
