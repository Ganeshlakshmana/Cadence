export interface SmsSendResult {
  sid: string;
}

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

function twilioSmsFrom(): string {
  const from = process.env.TWILIO_SMS_FROM ?? process.env.TWILIO_WHATSAPP_FROM?.replace(/^whatsapp:/, '');
  if (!from) throw new Error('TWILIO_SMS_FROM not set');
  return from.startsWith('+') ? from : `+${from}`;
}

function normalizeTo(to: string): string {
  const bare = to.replace(/^whatsapp:/, '');
  return bare.startsWith('+') ? bare : `+${bare}`;
}

export async function sendSms(to: string, body: string): Promise<SmsSendResult> {
  const params = new URLSearchParams({
    To:   normalizeTo(to),
    From: twilioSmsFrom(),
    Body: body,
  });

  const res = await fetch(twilioUrl(), {
    method:  'POST',
    headers: { Authorization: twilioAuth(), 'Content-Type': 'application/x-www-form-urlencoded' },
    body:    params.toString(),
  });

  const data = await res.json() as Record<string, unknown>;
  if (!res.ok) {
    throw new Error(`Twilio SMS error ${res.status}: ${data.message ?? JSON.stringify(data)}`);
  }
  return { sid: String(data.sid) };
}
