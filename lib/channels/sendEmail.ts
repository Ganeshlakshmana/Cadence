import { Resend } from 'resend';
export { sendGmailEmail } from './gmail';
export type { GmailSendResult } from './gmail';

let _client: Resend | null = null;

function getClient(): Resend {
  if (!_client) {
    if (!process.env.RESEND_API_KEY) {
      throw new Error('RESEND_API_KEY is not set. Add it to .env.local.');
    }
    _client = new Resend(process.env.RESEND_API_KEY);
  }
  return _client;
}

export interface SendEmailResult {
  status: 'sent' | 'failed';
  providerId?: string;
  error?: string;
}

export async function sendEmail(params: {
  to: string;
  subject: string;
  html: string;
  from?: string;
}): Promise<SendEmailResult> {
  try {
    const from = params.from ?? process.env.RESEND_FROM ?? 'SunPath Solar <onboarding@resend.dev>';
    const { data, error } = await getClient().emails.send({
      from,
      to: [params.to],
      subject: params.subject,
      html: params.html,
    });
    if (error) {
      return { status: 'failed', error: (error as { message?: string }).message ?? String(error) };
    }
    return { status: 'sent', providerId: data?.id };
  } catch (err) {
    return { status: 'failed', error: String(err) };
  }
}
