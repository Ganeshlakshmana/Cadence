// ── Provider selection ────────────────────────────────────────────────────────
// Set WHATSAPP_PROVIDER='twilio' (default) or 'meta' in .env.local

type Provider = 'twilio' | 'meta';

function provider(): Provider {
  const p = process.env.WHATSAPP_PROVIDER ?? 'twilio';
  if (p !== 'twilio' && p !== 'meta') throw new Error(`Unknown WHATSAPP_PROVIDER: ${p}`);
  return p;
}

// ── Shared result type ────────────────────────────────────────────────────────

export interface WhatsAppSendResult {
  sid: string;
}

// ── Twilio helpers ────────────────────────────────────────────────────────────

function twilioUrl(): string {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  if (!sid) throw new Error('TWILIO_ACCOUNT_SID not set');
  return `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`;
}

function twilioAuth(): string {
  const sid   = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  if (!sid || !token) throw new Error('TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN not set');
  return 'Basic ' + Buffer.from(`${sid}:${token}`).toString('base64');
}

function twilioFrom(): string {
  const from = process.env.TWILIO_WHATSAPP_FROM;
  if (!from) throw new Error('TWILIO_WHATSAPP_FROM not set');
  // Accept both 'whatsapp:+14155238886' and '+14155238886'
  return from.startsWith('whatsapp:') ? from : `whatsapp:${from}`;
}

/** Normalise a bare phone number to the whatsapp:+ prefix Twilio expects. */
function twilioTo(to: string): string {
  if (to.startsWith('whatsapp:')) return to;
  return `whatsapp:${to.startsWith('+') ? to : '+' + to}`;
}

async function twilioSend(params: Record<string, string>): Promise<WhatsAppSendResult> {
  const body = new URLSearchParams({ From: twilioFrom(), ...params });
  const res  = await fetch(twilioUrl(), {
    method:  'POST',
    headers: { Authorization: twilioAuth(), 'Content-Type': 'application/x-www-form-urlencoded' },
    body:    body.toString(),
  });
  const data = await res.json() as Record<string, unknown>;
  if (!res.ok) {
    throw new Error(`Twilio error ${res.status}: ${data.message ?? JSON.stringify(data)}`);
  }
  return { sid: String(data.sid) };
}

// ── Meta Cloud API helpers ────────────────────────────────────────────────────

function metaUrl(): string {
  const phoneId = process.env.META_PHONE_NUMBER_ID;
  if (!phoneId) throw new Error('META_PHONE_NUMBER_ID not set');
  return `https://graph.facebook.com/v18.0/${phoneId}/messages`;
}

function metaHeaders(): Record<string, string> {
  const token = process.env.META_WHATSAPP_TOKEN;
  if (!token) throw new Error('META_WHATSAPP_TOKEN not set');
  return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
}

/** Bare phone number for Meta (no '+', no 'whatsapp:' prefix). */
function metaTo(to: string): string {
  return to.replace(/^whatsapp:\+?/, '').replace(/^\+/, '');
}

async function metaSend(payload: Record<string, unknown>): Promise<WhatsAppSendResult> {
  const res  = await fetch(metaUrl(), {
    method:  'POST',
    headers: metaHeaders(),
    body:    JSON.stringify({ messaging_product: 'whatsapp', ...payload }),
  });
  const data = await res.json() as Record<string, unknown>;
  if (!res.ok) {
    throw new Error(`Meta error ${res.status}: ${JSON.stringify(data)}`);
  }
  const messages = data.messages as Array<{ id: string }> | undefined;
  return { sid: messages?.[0]?.id ?? String(data.id ?? '') };
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Send a plain-text WhatsApp message.
 */
export async function sendWhatsAppText(
  to: string,
  body: string,
): Promise<WhatsAppSendResult> {
  if (provider() === 'twilio') {
    return twilioSend({ To: twilioTo(to), Body: body });
  }
  return metaSend({
    to:   metaTo(to),
    type: 'text',
    text: { preview_url: false, body },
  });
}

/**
 * Send an image followed by an audio file as two separate WhatsApp messages.
 * The caption appears as the body of the image message.
 */
export async function sendWhatsAppImageVoice(
  to: string,
  imageUrl: string,
  audioUrl: string,
  caption: string,
): Promise<WhatsAppSendResult[]> {
  if (provider() === 'twilio') {
    const img = await twilioSend({ To: twilioTo(to), Body: caption, MediaUrl: imageUrl });
    const aud = await twilioSend({ To: twilioTo(to), Body: '',     MediaUrl: audioUrl });
    return [img, aud];
  }
  const img = await metaSend({
    to:    metaTo(to),
    type:  'image',
    image: { link: imageUrl, caption },
  });
  const aud = await metaSend({
    to:    metaTo(to),
    type:  'audio',
    audio: { link: audioUrl },
  });
  return [img, aud];
}

/**
 * Send an audio-only WhatsApp message (voice note without image).
 */
export async function sendWhatsAppAudio(
  to: string,
  audioUrl: string,
): Promise<WhatsAppSendResult> {
  if (provider() === 'twilio') {
    return twilioSend({ To: twilioTo(to), Body: '', MediaUrl: audioUrl });
  }
  return metaSend({
    to:    metaTo(to),
    type:  'audio',
    audio: { link: audioUrl },
  });
}

/**
 * Send a pre-approved Meta/Twilio template message.
 * vars are positional body component parameters ({{1}}, {{2}}, …).
 */
export async function sendWhatsAppTemplate(
  to: string,
  templateName: string,
  vars: string[],
): Promise<WhatsAppSendResult> {
  if (provider() === 'twilio') {
    // Twilio uses Content Templates via ContentSid + ContentVariables (JSON)
    const contentSid = process.env[`TWILIO_TEMPLATE_${templateName.toUpperCase()}`];
    if (!contentSid) throw new Error(`No Twilio ContentSid for template: ${templateName}`);
    const varMap: Record<string, string> = {};
    vars.forEach((v, i) => { varMap[String(i + 1)] = v; });
    return twilioSend({
      To:               twilioTo(to),
      ContentSid:       contentSid,
      ContentVariables: JSON.stringify(varMap),
    });
  }

  // Meta template
  const langCode = process.env.META_TEMPLATE_LANG ?? 'en_US';
  return metaSend({
    to:   metaTo(to),
    type: 'template',
    template: {
      name:     templateName,
      language: { code: langCode },
      ...(vars.length > 0 ? {
        components: [{
          type:       'body',
          parameters: vars.map(v => ({ type: 'text', text: v })),
        }],
      } : {}),
    },
  });
}
