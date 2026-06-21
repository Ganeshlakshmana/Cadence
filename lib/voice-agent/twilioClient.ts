import { getOrCreateAgent } from './elevenLabsAgent';

const BASE = 'https://api.elevenlabs.io/v1';

function xiHeaders(json = false) {
  const h: Record<string, string> = { 'xi-api-key': process.env.ELEVENLABS_API_KEY ?? '' };
  if (json) h['Content-Type'] = 'application/json';
  return h;
}

let _phoneNumberId: string | null = null;

/**
 * Returns the ElevenLabs phone_number_id to use for outbound calls.
 *
 * Priority:
 *   1. ELEVENLABS_PHONE_NUMBER_ID — native ElevenLabs number bought in their dashboard
 *   2. TWILIO_PHONE_NUMBER — legacy: registers a Twilio number with ElevenLabs (requires SID + token)
 *
 * To switch away from Twilio: buy a number at elevenlabs.io → Conversational AI → Phone Numbers,
 * copy the phone_number_id, set ELEVENLABS_PHONE_NUMBER_ID in .env.local.
 */
export async function getOrRegisterPhoneNumber(): Promise<string> {
  if (_phoneNumberId) return _phoneNumberId;

  // ── Path 1: ElevenLabs-native number (no Twilio needed) ─────────────────────
  const elPhoneId = process.env.ELEVENLABS_PHONE_NUMBER_ID ?? '';
  if (elPhoneId) {
    _phoneNumberId = elPhoneId;
    return _phoneNumberId;
  }

  // ── Path 2: Register an existing Twilio number with ElevenLabs ───────────────
  const twilioNumber = process.env.TWILIO_PHONE_NUMBER ?? '';
  if (!twilioNumber) {
    throw new Error(
      'No phone number configured. Set ELEVENLABS_PHONE_NUMBER_ID (recommended) ' +
      'or TWILIO_PHONE_NUMBER + TWILIO_ACCOUNT_SID + TWILIO_AUTH_TOKEN.',
    );
  }

  const agentId = await getOrCreateAgent();

  const res = await fetch(`${BASE}/convai/phone-numbers/twilio`, {
    method:  'POST',
    headers: xiHeaders(true),
    body: JSON.stringify({
      label:              'SunPath Main Line',
      phone_number:       twilioNumber,
      twilio_account_sid: process.env.TWILIO_ACCOUNT_SID,
      twilio_auth_token:  process.env.TWILIO_AUTH_TOKEN,
      agent_id:           agentId,
    }),
  });

  if (!res.ok) {
    const msg = await res.text();
    // Already registered — find the existing id
    if (res.status === 409 || msg.toLowerCase().includes('exist')) {
      const listRes = await fetch(`${BASE}/convai/phone-numbers`, { headers: xiHeaders() });
      if (listRes.ok) {
        const listData = await listRes.json() as {
          phone_numbers?: Array<{ phone_number_id: string; phone_number: string }>;
        };
        const match = (listData.phone_numbers ?? []).find(p => p.phone_number === twilioNumber);
        if (match) {
          _phoneNumberId = match.phone_number_id;
          return _phoneNumberId;
        }
      }
    }
    throw new Error(`ElevenLabs register phone failed ${res.status}: ${msg}`);
  }

  const data = await res.json() as { phone_number_id: string };
  _phoneNumberId = data.phone_number_id;
  console.log('[voice-agent] Registered Twilio number with ElevenLabs:', _phoneNumberId);
  return _phoneNumberId;
}

export interface OutboundCallParams {
  customer_name:     string;
  customer_number:   string;
  quote_price:       number | string;
  annual_savings:    number | string;
  payback_period:    string;
  archetype_primary: string;
  roi_percent?:      number;
  co2_offset?:       number;
  monthly_cost?:     number;
}

export async function initiateOutboundCall(
  params: OutboundCallParams,
): Promise<{ call_sid: string; conversation_id: string }> {
  const phoneNumberId = await getOrRegisterPhoneNumber();
  const agentId =
    process.env.ELEVENLABS_AGENT_ID
      ? process.env.ELEVENLABS_AGENT_ID
      : await getOrCreateAgent();

  const res = await fetch(`${BASE}/convai/conversations/outbound-call`, {
    method:  'POST',
    headers: xiHeaders(true),
    body: JSON.stringify({
      agent_id:        agentId,
      phone_number_id: phoneNumberId,
      to:              params.customer_number,
      conversation_initiation_client_data: {
        dynamic_variables: { ...params },
      },
    }),
  });

  if (!res.ok) {
    throw new Error(`ElevenLabs outbound call failed ${res.status}: ${await res.text()}`);
  }

  const data = await res.json() as Record<string, string>;
  return {
    call_sid:        data['call_sid']        ?? data['callSid']        ?? '',
    conversation_id: data['conversation_id'] ?? data['conversationId'] ?? '',
  };
}
