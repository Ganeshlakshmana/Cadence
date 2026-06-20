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

import { db } from '../db/client';
import {
  customer as customerTable,
  strategy as strategyTable,
  strategyTouch as strategyTouchTable,
} from '../db/schema';
import { eq, desc } from 'drizzle-orm';
import { sendEmail } from '../lib/channels/sendEmail';

const CUSTOMER_ID = 'cust_maria_mueller';
const TEST_RECIPIENT = process.env.TEST_RECIPIENT ?? 'chatgpt@hayy.ai';

async function main() {
  console.log('=== SunPath Email Send Test ===\n');

  if (!process.env.RESEND_API_KEY) {
    console.error('❌ RESEND_API_KEY not set — add it to .env.local and retry.');
    process.exit(1);
  }

  const [cust] = await db.select().from(customerTable).where(eq(customerTable.id, CUSTOMER_ID)).limit(1);
  if (!cust) throw new Error('Maria Müller not found — run: npm run db:seed');

  const [strat] = await db.select().from(strategyTable)
    .where(eq(strategyTable.customerId, CUSTOMER_ID))
    .orderBy(desc(strategyTable.createdAt))
    .limit(1);
  if (!strat) throw new Error('No persisted strategy — run: npm run test:replay first');

  const touches = await db.select().from(strategyTouchTable)
    .where(eq(strategyTouchTable.strategyId, strat.id));

  const emailTouches = touches.filter(t => t.channel === 'email');
  if (emailTouches.length === 0) {
    console.error('No email touches in this strategy — re-run test:replay to generate one.');
    process.exit(1);
  }

  const touch = emailTouches.sort((a, b) => a.sequenceIndex - b.sequenceIndex)[0];

  console.log(`Customer   : ${cust.firstName} ${cust.lastName}`);
  console.log(`Strategy   : ${strat.id}`);
  console.log(`Touch      : #${touch.sequenceIndex} — day ${touch.dayOffset} (${touch.channel})`);
  console.log(`Subject    : ${touch.contentSubject ?? '(none)'}`);
  console.log(`Recipient  : ${TEST_RECIPIENT}`);
  console.log(`Preview    : ${(touch.contentBody ?? '').slice(0, 120)}…\n`);

  const html = `<div style="font-family:sans-serif;max-width:600px;margin:0 auto;line-height:1.6"><p>${
    (touch.contentBody ?? '').replace(/\n\n/g, '</p><p>').replace(/\n/g, '<br>')
  }</p></div>`;

  console.log('Sending via Resend…');
  const result = await sendEmail({
    to: TEST_RECIPIENT,
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
