// @ts-nocheck — test script; runs against live DB
/**
 * CLI test: send one of Maria's email touches via Resend.
 *
 * Usage: npm run test:send-email
 *
 * Requires RESEND_API_KEY in .env.local.
 * Set TEST_RECIPIENT to override the default test address.
 */

import { config } from 'dotenv';
config({ path: '.env.local', override: true });
config({ path: '.env', override: true });

import { db, customers, sequences, touchpoints } from '../db/schema';
import { eq, desc } from 'drizzle-orm';
import { sendEmail } from '../lib/channels/sendEmail';

const MARIA_EMAIL   = 'maria.mueller@gmail.com';
const TEST_RECIPIENT = process.env.TEST_RECIPIENT ?? 'chatgpt@hayy.ai';

async function main() {
  console.log('=== SunPath Email Send Test ===\n');

  if (!process.env.RESEND_API_KEY) {
    console.error('❌ RESEND_API_KEY not set — add it to .env.local and retry.');
    process.exit(1);
  }

  const [cust] = await db.select().from(customers).where(eq(customers.email, MARIA_EMAIL)).limit(1);
  if (!cust) throw new Error(`Customer ${MARIA_EMAIL} not found — run: npm run db:seed`);

  const [seq] = await db.select().from(sequences)
    .where(eq(sequences.customerId, cust.id))
    .orderBy(desc(sequences.createdAt))
    .limit(1);
  if (!seq) throw new Error('No persisted sequence — run: npm run test:replay first');

  const allTouches = await db.select().from(touchpoints)
    .where(eq(touchpoints.sequenceId, seq.id));

  const emailTouches = allTouches.filter(t => t.channel === 'email');
  if (emailTouches.length === 0) {
    console.error('No email touches in this sequence — re-run test:replay to generate one.');
    process.exit(1);
  }

  const touch = emailTouches.sort((a, b) => a.dayOffset - b.dayOffset)[0];

  console.log(`Customer   : ${cust.fname} ${cust.lname}`);
  console.log(`Sequence   : ${seq.id}`);
  console.log(`Touch      : day ${touch.dayOffset} (${touch.channel})`);
  console.log(`Subject    : ${touch.contentSubject ?? '(none)'}`);
  console.log(`Recipient  : ${TEST_RECIPIENT}`);
  console.log(`Preview    : ${(touch.contentBody ?? '').slice(0, 120)}…\n`);

  const html = `<div style="font-family:sans-serif;max-width:600px;margin:0 auto;line-height:1.6"><p>${
    (touch.contentBody ?? '').replace(/\n\n/g, '</p><p>').replace(/\n/g, '<br>')
  }</p></div>`;

  console.log('Sending via Resend…');
  const result = await sendEmail({
    to:      TEST_RECIPIENT,
    subject: touch.contentSubject ?? 'Message from SunPath Solar',
    html,
  });

  console.log('\nResend response:');
  console.log(JSON.stringify(result, null, 2));

  if (result.status === 'sent') {
    console.log(`\n✅ Email sent — provider ID: ${result.providerId}`);
    console.log(`   Check inbox at: ${TEST_RECIPIENT}`);
  } else {
    console.error(`\n❌ Send failed: ${result.error}`);
    process.exit(1);
  }

  process.exit(0);
}

main().catch(err => {
  console.error('\nTest failed:', err);
  process.exit(1);
});
