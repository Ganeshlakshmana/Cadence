import { google } from 'googleapis';
import type { gmail_v1 } from 'googleapis';

// ── OAuth2 client (singleton) ─────────────────────────────────────────────────

function getGmailClient(): gmail_v1.Gmail {
  const oauth2 = new google.auth.OAuth2(
    process.env.GMAIL_CLIENT_ID,
    process.env.GMAIL_CLIENT_SECRET,
  );
  oauth2.setCredentials({ refresh_token: process.env.GMAIL_REFRESH_TOKEN });
  return google.gmail({ version: 'v1', auth: oauth2 });
}

// ── Sending ───────────────────────────────────────────────────────────────────

export interface GmailSendResult {
  status: 'sent' | 'failed';
  messageId?: string;
  threadId?: string;
  error?: string;
}

/**
 * Send an HTML email via the Gmail API.
 * Optionally pass threadId to reply into an existing thread.
 */
export async function sendGmailEmail(params: {
  to: string;
  subject: string;
  htmlBody: string;
  threadId?: string;
}): Promise<GmailSendResult> {
  if (!process.env.GMAIL_CLIENT_ID || !process.env.GMAIL_REFRESH_TOKEN) {
    return { status: 'failed', error: 'GMAIL_CLIENT_ID / GMAIL_REFRESH_TOKEN not set in env' };
  }

  const from = process.env.GMAIL_FROM ?? 'me';

  // RFC 2822 message — boundary keeps HTML isolated
  const boundary = `--_sp_${Date.now()}`;
  const raw = [
    `From: ${from}`,
    `To: ${params.to}`,
    `Subject: ${params.subject}`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/alternative; boundary="${boundary.slice(2)}"`,
    '',
    boundary,
    'Content-Type: text/html; charset=utf-8',
    'Content-Transfer-Encoding: quoted-printable',
    '',
    params.htmlBody,
    `${boundary}--`,
  ].join('\r\n');

  const encoded = Buffer.from(raw).toString('base64url');

  try {
    const gmail = getGmailClient();
    const res = await gmail.users.messages.send({
      userId: 'me',
      requestBody: {
        raw: encoded,
        ...(params.threadId ? { threadId: params.threadId } : {}),
      },
    });
    return {
      status: 'sent',
      messageId: res.data.id ?? undefined,
      threadId:  res.data.threadId ?? undefined,
    };
  } catch (err) {
    return { status: 'failed', error: String(err) };
  }
}

// ── Receiving ─────────────────────────────────────────────────────────────────

export interface GmailMessage {
  messageId: string;
  threadId:  string;
  fromEmail: string;
  subject:   string;
  bodyText:  string;
}

/** Recursively extract plain text (or stripped HTML) from a MIME payload. */
function extractBodyText(payload: gmail_v1.Schema$MessagePart | null | undefined): string {
  if (!payload) return '';

  // Simple non-multipart body
  if (payload.body?.data) {
    const text = Buffer.from(payload.body.data, 'base64url').toString('utf-8');
    return payload.mimeType === 'text/html'
      ? text.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
      : text;
  }

  // Multipart — prefer text/plain
  const parts = payload.parts ?? [];
  const plain = parts.find(p => p.mimeType === 'text/plain');
  if (plain?.body?.data) {
    return Buffer.from(plain.body.data, 'base64url').toString('utf-8');
  }

  // Fall back to text/html stripped of tags
  const html = parts.find(p => p.mimeType === 'text/html');
  if (html?.body?.data) {
    return Buffer.from(html.body.data, 'base64url')
      .toString('utf-8')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  // Recurse into nested multipart parts
  for (const part of parts) {
    const nested = extractBodyText(part);
    if (nested) return nested;
  }

  return '';
}

/**
 * Fetch messages added to INBOX since a given Gmail historyId.
 * Called by the Push Notification webhook handler.
 */
export async function fetchNewMessages(historyId: string): Promise<GmailMessage[]> {
  const gmail = getGmailClient();

  const historyRes = await gmail.users.history.list({
    userId: 'me',
    startHistoryId: historyId,
    historyTypes: ['messageAdded'],
    labelId: 'INBOX',
  });

  const results: GmailMessage[] = [];

  for (const entry of historyRes.data.history ?? []) {
    for (const added of entry.messagesAdded ?? []) {
      const id = added.message?.id;
      if (!id) continue;

      const msg = await gmail.users.messages.get({
        userId: 'me',
        id,
        format: 'full',
      });

      const headers = msg.data.payload?.headers ?? [];
      const header = (name: string) =>
        headers.find(h => h.name?.toLowerCase() === name.toLowerCase())?.value ?? '';

      const fromRaw = header('From');
      // Extract bare address from "Name <addr@host>" or "addr@host"
      const fromEmail = (fromRaw.match(/<([^>]+)>/) ?? [null, fromRaw])[1]?.trim() ?? '';

      results.push({
        messageId: id,
        threadId:  msg.data.threadId ?? id,
        fromEmail,
        subject:   header('Subject'),
        bodyText:  extractBodyText(msg.data.payload),
      });
    }
  }

  return results;
}
