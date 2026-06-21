import { NextRequest, NextResponse } from 'next/server';
import { db, customers, touchpoints, customerResponses, aiFollowups, auditLog } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { anthropic, SONNET } from '@/lib/llm/client';
import { unwrapArrayFields } from '@/lib/llm/toolInput';
import { z } from 'zod';

const now = () => Math.floor(Date.now() / 1000);

// ── Validation ────────────────────────────────────────────────────────────────

const ResponseBody = z.object({
  touchpoint_id: z.string(),
  response_text: z.string().min(1),
  sentiment:     z.enum(['positive', 'neutral', 'negative', 'no_response']).default('neutral'),
  action_taken:  z.string().optional().nullable(),
  channel:       z.string().optional().nullable(),
});

// ── Followup tool ─────────────────────────────────────────────────────────────

const VALID_CHANNELS = [
  'email', 'sms', 'whatsapp_text', 'whatsapp_voice',
  'phone_call', 'voice_note', 'postcard', 'video', 'linkedin', 'in_person',
] as const;

const FOLLOWUP_TOOL = {
  name: 'generate_followup',
  description: 'Generate one ideal follow-up message given a customer response.',
  input_schema: {
    type: 'object' as const,
    properties: {
      channel: {
        type: 'string',
        enum: [...VALID_CHANNELS],
        description: 'Best channel for this follow-up given the context.',
      },
      content_subject: {
        type: ['string', 'null'],
        description: 'Email subject line if channel is email, else null.',
      },
      content_body: {
        type: 'string',
        description: "Follow-up message in the customer's language. Avoid double quotes inside.",
      },
      reasoning: {
        type: 'string',
        description: '1–2 sentences: why this channel and angle given the customer response and archetype.',
      },
    },
    required: ['channel', 'content_subject', 'content_body', 'reasoning'],
  },
};

const FollowupOutputSchema = z.object({
  channel:         z.string(),
  content_subject: z.string().nullable(),
  content_body:    z.string(),
  reasoning:       z.string(),
});

// ── POST /api/responses ───────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const body = ResponseBody.parse(await req.json());
    const ts = now();

    // Load touchpoint to get customer_id and original content
    const [touch] = await db
      .select()
      .from(touchpoints)
      .where(eq(touchpoints.id, body.touchpoint_id))
      .limit(1);

    if (!touch) {
      return NextResponse.json({ data: null, error: 'Touchpoint not found' }, { status: 404 });
    }

    // Load customer for archetype blend and language
    const [cust] = await db
      .select()
      .from(customers)
      .where(eq(customers.id, touch.customerId))
      .limit(1);

    if (!cust) {
      return NextResponse.json({ data: null, error: 'Customer not found' }, { status: 404 });
    }

    // ── Insert customer response ──────────────────────────────────────────────
    const [response] = await db.insert(customerResponses).values({
      touchpointId:  body.touchpoint_id,
      customerId:    touch.customerId,
      channel:       body.channel ?? touch.channel,
      responseText:  body.response_text,
      sentiment:     body.sentiment,
      actionTaken:   body.action_taken ?? null,
      respondedAt:   ts,
      createdAt:     ts,
    }).returning();

    // ── Generate AI followup via Claude Sonnet ────────────────────────────────
    const systemPrompt = `You are a solar sales advisor generating a single ideal follow-up message.
The customer just responded to an outreach touch. Your job is to generate the one best next message
that moves the deal forward, written in the customer's language (${cust.language ?? 'en'}).

Archetype blend — use this to pick tone and angle:
- Family:           ${((cust.archetypeFamily ?? 0) * 100).toFixed(0)}%
- Investor:         ${((cust.archetypeInvestor ?? 0) * 100).toFixed(0)}%
- Environmentalist: ${((cust.archetypeEnvironmentalist ?? 0) * 100).toFixed(0)}%
- Skeptic:          ${((cust.archetypeSkeptic ?? 0) * 100).toFixed(0)}%

Rules:
- Positive sentiment: advance toward close (propose next step, meeting, or signature).
- Neutral sentiment: add one specific piece of value (number, testimonial, or visual) and ask a single easy question.
- Negative sentiment: de-escalate, acknowledge concern directly, offer an easy out.
- no_response: gentle low-pressure re-engagement; give them a reason to reply.
- Always match the customer's dominant archetype in tone.
- Keep content_body under 200 words.
- Use the generate_followup tool to return structured output.`;

    const userPrompt = `ORIGINAL TOUCHPOINT:
Channel: ${touch.channel}
${touch.contentSubject ? `Subject: ${touch.contentSubject}\n` : ''}Content: ${touch.contentBody ?? '(no body)'}

CUSTOMER RESPONSE:
Text: ${body.response_text}
Sentiment: ${body.sentiment}
Action taken: ${body.action_taken ?? 'none'}

CUSTOMER:
Name: ${cust.fname} ${cust.lname}
Price quote: ${cust.priceQuote?.toLocaleString('en') ?? 'unknown'}
Installer notes: ${cust.about ?? 'none'}

Generate the ideal next follow-up message.`;

    const llmResponse = await anthropic.messages.create({
      model: SONNET,
      max_tokens: 2048,
      system: systemPrompt,
      tools: [FOLLOWUP_TOOL],
      tool_choice: { type: 'tool', name: 'generate_followup' },
      messages: [{ role: 'user', content: userPrompt }],
    });

    const block = llmResponse.content.find(b => b.type === 'tool_use');
    if (!block || block.type !== 'tool_use') {
      throw new Error('No tool_use block in followup response');
    }

    const inp = unwrapArrayFields(block.input as Record<string, unknown>, []);
    const followupData = FollowupOutputSchema.parse(inp);

    // ── Insert AI followup ────────────────────────────────────────────────────
    const [followup] = await db.insert(aiFollowups).values({
      responseId:       response.id,
      customerId:       touch.customerId,
      triggerReason:    `customer_response:${body.sentiment}`,
      generatedContent: JSON.stringify({
        channel:         followupData.channel,
        content_subject: followupData.content_subject,
        content_body:    followupData.content_body,
        reasoning:       followupData.reasoning,
      }),
      channel:      followupData.channel,
      status:       'pending_review',
      generatedBy:  'claude-sonnet-4-6',
      generatedAt:  ts,
    }).returning();

    await db.insert(auditLog).values({
      actor:      'system',
      action:     'followup.generated',
      entityType: 'ai_followup',
      entityId:   followup.id,
      metadata:   JSON.stringify({
        customerId:    touch.customerId,
        touchpointId:  body.touchpoint_id,
        responseId:    response.id,
        sentiment:     body.sentiment,
        channel:       followupData.channel,
      }),
      createdAt: ts,
    });

    return NextResponse.json({
      data: {
        response: {
          id:           response.id,
          touchpointId: response.touchpointId,
          customerId:   response.customerId,
          sentiment:    response.sentiment,
          responseText: response.responseText,
          actionTaken:  response.actionTaken,
          respondedAt:  response.respondedAt,
        },
        followup: {
          id:              followup.id,
          status:          followup.status,
          channel:         followupData.channel,
          contentSubject:  followupData.content_subject,
          contentBody:     followupData.content_body,
          reasoning:       followupData.reasoning,
          generatedBy:     followup.generatedBy,
        },
      },
      error: null,
    }, { status: 201 });

  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ data: null, error: err.issues[0]?.message ?? 'Validation error' }, { status: 400 });
    }
    console.error('POST /api/responses', err);
    return NextResponse.json({ data: null, error: String(err) }, { status: 500 });
  }
}
