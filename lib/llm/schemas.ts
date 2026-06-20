import { z } from 'zod';

// ── 6.1 Persona inference ───────────────────────────────────────────────────
export const PersonaInferenceSchema = z.object({
  archetypeBlend: z.object({
    family: z.number().min(0).max(1),
    investor: z.number().min(0).max(1),
    environmentalist: z.number().min(0).max(1),
    skeptic: z.number().min(0).max(1),
  }),
  topObjections: z.array(z.string()).min(1).max(5),
  statedMotivations: z.array(z.string()).min(1).max(5),
  customerVerbatimPhrases: z.array(z.string()).min(0).max(8),
  competitorMentioned: z.boolean(),
  competitorNames: z.array(z.string()),
  decisionTimeline: z.enum(['asap', 'this_quarter', 'exploring']),
  inferenceConfidence: z.number().min(0).max(1),
  roiFramingPreference: z.enum(['monthly_savings', 'payback_years', 'annual_roi_pct', 'co2_impact']),
});

export type PersonaInference = z.infer<typeof PersonaInferenceSchema>;

// ── 6.2 Sequence generation ─────────────────────────────────────────────────

const VALID_TONES = ['reassuring', 'data_driven', 'impact', 'objection_handling', 'urgency', 'social_proof'] as const;
type ValidTone = typeof VALID_TONES[number];

/** Map Claude's inventive tone names to the valid enum set */
function normalizeTone(raw: string): ValidTone {
  const v = raw.toLowerCase().replace(/[^a-z_]/g, '');
  if ((VALID_TONES as readonly string[]).includes(v)) return v as ValidTone;
  if (/family|trust|reassur|warm|comfort|personal/.test(v)) return 'reassuring';
  if (/invest|data|roi|analyt|number|financ/.test(v)) return 'data_driven';
  if (/impact|environ|sustain|green|co2|climate|eco/.test(v)) return 'impact';
  if (/object|skeptic|doubt|concern|fear|proof|verif/.test(v)) return 'objection_handling';
  if (/urgent|scarcit|deadline|limit|closing/.test(v)) return 'urgency';
  if (/social|proof|testimon|review|neighbor|neighbor/.test(v)) return 'social_proof';
  return 'reassuring'; // safe fallback
}

const VALID_CHANNELS = [
  'email', 'sms', 'whatsapp_text', 'whatsapp_voice',
  'call', 'video', 'microsite', 'postcard', 'linkedin', 'in_person',
] as const;
type ValidChannel = typeof VALID_CHANNELS[number];

function normalizeChannel(raw: string): ValidChannel {
  const v = raw.toLowerCase().replace(/[^a-z_]/g, '');
  if ((VALID_CHANNELS as readonly string[]).includes(v)) return v as ValidChannel;
  if (/whatsapp.*voice|voice.*whatsapp/.test(v)) return 'whatsapp_voice';
  if (/whatsapp/.test(v)) return 'whatsapp_text';
  if (/call|phone|tel/.test(v)) return 'call';
  if (/sms|text|message/.test(v)) return 'sms';
  if (/video|loom|zoom/.test(v)) return 'video';
  if (/micro|site|web|link/.test(v)) return 'microsite';
  if (/post|mail|letter/.test(v)) return 'postcard';
  if (/linkedin/.test(v)) return 'linkedin';
  if (/person|visit|meet/.test(v)) return 'in_person';
  return 'email'; // safe fallback
}

export const StrategySchema = z.object({
  // Use transform-only (no .max()) — Zod validates before transforming, so max would reject first
  rationaleSummary: z.string().min(10).transform(s => s.slice(0, 400)),
  marketContextApplied: z.string(),
  touches: z.array(z.object({
    sequenceIndex: z.number(),
    dayOffset: z.number().min(0).max(30),
    channel: z.string().transform(normalizeChannel),
    tone: z.string().transform(normalizeTone),
    objective: z.string().transform(s => s.slice(0, 80)),
    reasoning: z.string().min(10).max(300),
    contentSubject: z.string().nullable(),
    contentBody: z.string(),
    // contentVariantB: Claude sometimes outputs an object instead of null — coerce to null
    contentVariantB: z.union([z.string(), z.null(), z.undefined(), z.object({}).passthrough()])
      .transform(v => (typeof v === 'string' ? v : null)),
    abTestActive: z.boolean(),
  }).passthrough()).min(5).max(9),
});


export type Strategy = z.infer<typeof StrategySchema>;
export type StrategyTouch = Strategy['touches'][number];

// ── 6.3 Delta regeneration ──────────────────────────────────────────────────
export const DeltaRegenSchema = StrategySchema.extend({
  changes: z.array(z.object({
    touchIndex: z.number(),
    changeType: z.enum(['modified', 'added', 'removed', 'rescheduled', 'channel_changed', 'tone_changed']),
    summary: z.string(),
    before: z.string().nullable(),
    after: z.string().nullable(),
  })),
});

export type DeltaRegen = z.infer<typeof DeltaRegenSchema>;

// ── 6.6 Coaching mode ───────────────────────────────────────────────────────
export const CoachingNoteSchema = z.object({
  whatWorked: z.string(),
  whatToTryNext: z.string(),
  oneQuestionToAsk: z.string(),
  overallReadiness: z.enum(['close_today', 'one_more_touch', 'needs_rescue', 'likely_lost']),
});

export type CoachingNote = z.infer<typeof CoachingNoteSchema>;

// ── 6.7 Sales Manager One-Pager ─────────────────────────────────────────────
export const ManagerOnePagerSchema = z.object({
  dealHeader: z.string(),
  myRead: z.string(),
  myPlan: z.string(),
  risksAndMitigations: z.array(z.object({ risk: z.string(), mitigation: z.string() })),
  whereIneedHelp: z.string(),
  closeTargetDate: z.string(),
  expectedOutcome: z.string(),
});

export type ManagerOnePager = z.infer<typeof ManagerOnePagerSchema>;

// ── 6.9 Strategy Replay simulator ──────────────────────────────────────────
export const ReplaySimulationSchema = z.object({
  simulatedResponses: z.array(z.object({
    touchSequenceIndex: z.number(),
    responseType: z.enum([
      'opened_not_clicked', 'clicked_no_reply', 'replied_positive',
      'replied_objection', 'replied_question', 'ignored', 'call_answered',
      'call_voicemail', 'booked_meeting', 'unsubscribed',
    ]),
    responseSummary: z.string(),
    responseFullText: z.string().nullable(),
    sentiment: z.enum(['positive', 'neutral', 'negative', 'objection', 'ready_to_buy']),
    occurredDayOffset: z.number(),
  })),
  predictedOutcome: z.enum(['closed_won', 'closed_lost', 'still_engaged_at_day_30', 'ghosted']),
  predictedCloseProbability: z.number().min(0).max(1),
  criticalMomentTouchIndex: z.number(),
  criticalMomentDescription: z.string(),
});

export type ReplaySimulation = z.infer<typeof ReplaySimulationSchema>;

// ── Rescue insert (single touch) ────────────────────────────────────────────
export const RescueTouchSchema = z.object({
  touch: z.object({
    dayOffset: z.number().min(0).max(30),
    channel: z.enum([
      'email', 'sms', 'whatsapp_text', 'whatsapp_voice',
      'call', 'video', 'microsite', 'postcard', 'linkedin', 'in_person',
    ]),
    tone: z.enum(['reassuring', 'data_driven', 'impact', 'objection_handling', 'urgency', 'social_proof']),
    objective: z.string().max(80),
    reasoning: z.string().min(50).max(300),
    contentSubject: z.string().nullable(),
    contentBody: z.string(),
    contentVariantB: z.string().nullable(),
    abTestActive: z.boolean(),
  }),
  rationale: z.string(),
});

export type RescueTouch = z.infer<typeof RescueTouchSchema>;

// ── Competitive displacement (single touch) ──────────────────────────────────
export const CompetitiveTouchSchema = z.object({
  dayOffset: z.number().min(0).max(30),
  channel: z.enum([
    'email', 'sms', 'whatsapp_text', 'whatsapp_voice',
    'call', 'video', 'microsite', 'postcard', 'linkedin', 'in_person',
  ]),
  tone: z.enum(['reassuring', 'data_driven', 'impact', 'objection_handling', 'urgency', 'social_proof']),
  objective: z.string().max(80),
  reasoning: z.string().min(50).max(300),
  contentSubject: z.string().nullable(),
  contentBody: z.string(),
  contentVariantB: z.string().nullable(),
  abTestActive: z.boolean(),
});

export type CompetitiveTouch = z.infer<typeof CompetitiveTouchSchema>;
