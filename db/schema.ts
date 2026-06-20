import { sqliteTable, text, integer, real } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

// PII isolated from behavioral data — supports Article 17 erasure
// while preserving anonymized profile data for product learning.
export const customer = sqliteTable('customer', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  firstName: text('first_name').notNull(),
  lastName: text('last_name').notNull(),
  email: text('email'),
  phoneNumber: text('phone_number'),
  preferredChannel: text('preferred_channel').default('email'),
  preferredLanguage: text('preferred_language').default('de'),
  formalityRegister: text('formality_register').default('formal'), // 'formal' | 'informal' (Sie/du)
  // Location — populated by geocoding service at intake
  addressLine: text('address_line'),
  city: text('city'),
  postalCode: text('postal_code'),
  countryCode: text('country_code').default('DE'),
  latitude: real('latitude'),
  longitude: real('longitude'),
  timezone: text('timezone'),
  solarIrradianceKwhM2Year: real('solar_irradiance_kwh_m2_year'), // from PVGIS, cached
  // Consent — separate flags with timestamps, never bundled
  consentDataProcessing: integer('consent_data_processing', { mode: 'boolean' }).default(false),
  consentDataProcessingAt: integer('consent_data_processing_at', { mode: 'timestamp' }),
  consentMarketing: integer('consent_marketing', { mode: 'boolean' }).default(false),
  consentMarketingAt: integer('consent_marketing_at', { mode: 'timestamp' }),
  consentVoiceCloning: integer('consent_voice_cloning', { mode: 'boolean' }).default(false),
  createdAt: integer('created_at', { mode: 'timestamp' }).default(sql`(unixepoch())`),
});

export const customerProfile = sqliteTable('customer_profile', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  customerId: text('customer_id').notNull().references(() => customer.id, { onDelete: 'cascade' }),
  // Weighted archetype blend, sums to ~1.0 but not strict
  archetypeFamily: real('archetype_family').default(0),
  archetypeInvestor: real('archetype_investor').default(0),
  archetypeEnvironmentalist: real('archetype_environmentalist').default(0),
  archetypeSkeptic: real('archetype_skeptic').default(0),
  // Verbatim phrases the customer used — drives voice-of-customer mirror
  customerVerbatimPhrases: text('customer_verbatim_phrases', { mode: 'json' }).$type<string[]>(),
  statedMotivations: text('stated_motivations', { mode: 'json' }).$type<string[]>(),
  statedObjections: text('stated_objections', { mode: 'json' }).$type<string[]>(),
  competitorMentioned: integer('competitor_mentioned', { mode: 'boolean' }).default(false),
  competitorNames: text('competitor_names', { mode: 'json' }).$type<string[]>(),
  decisionTimeline: text('decision_timeline'), // 'asap' | 'this_quarter' | 'exploring'
  householdSize: integer('household_size'),
  inferenceConfidence: real('inference_confidence'),
});

export const quote = sqliteTable('quote', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  customerId: text('customer_id').notNull().references(() => customer.id, { onDelete: 'cascade' }),
  systemSizeKw: real('system_size_kw'),
  panelCount: integer('panel_count'),
  panelBrand: text('panel_brand'),
  batteryIncluded: integer('battery_included', { mode: 'boolean' }).default(false),
  batteryKwh: real('battery_kwh'),
  totalPrice: real('total_price'),
  currency: text('currency').default('EUR'),
  financingType: text('financing_type'),
  estimatedAnnualSavings: real('estimated_annual_savings'),
  monthlyEquivalentSavings: real('monthly_equivalent_savings'), // for "€87/month" framing
  paybackPeriodYears: real('payback_period_years'),
  annualRoiPct: real('annual_roi_pct'),
  co2OffsetTons25yr: real('co2_offset_tons_25yr'),
  quotePdfUrl: text('quote_pdf_url'),
  createdAt: integer('created_at', { mode: 'timestamp' }).default(sql`(unixepoch())`),
});

export const strategy = sqliteTable('strategy', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  customerId: text('customer_id').notNull().references(() => customer.id, { onDelete: 'cascade' }),
  quoteId: text('quote_id').notNull().references(() => quote.id, { onDelete: 'cascade' }),
  status: text('status').default('draft'), // draft | active | replay_simulated
  ghostRiskScore: real('ghost_risk_score'),
  ghostRiskSignals: text('ghost_risk_signals', { mode: 'json' }).$type<string[]>(),
  closeReadinessScore: real('close_readiness_score'),
  rationaleSummary: text('rationale_summary'), // 2-3 sentence "why this strategy" for installer
  marketContextApplied: text('market_context_applied'), // e.g. 'DE_energiewende_2022'
  generatedBy: text('generated_by').default('claude-sonnet-4-6'),
  createdAt: integer('created_at', { mode: 'timestamp' }).default(sql`(unixepoch())`),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).default(sql`(unixepoch())`),
});

export const strategyTouch = sqliteTable('strategy_touch', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  strategyId: text('strategy_id').notNull().references(() => strategy.id, { onDelete: 'cascade' }),
  sequenceIndex: integer('sequence_index').notNull(),
  dayOffset: integer('day_offset').notNull(), // days after quote_sent_at
  channel: text('channel').notNull(), // email | sms | whatsapp_text | whatsapp_voice | call | video | microsite | postcard | linkedin | in_person
  tone: text('tone'), // reassuring | data_driven | impact | objection_handling | urgency
  objective: text('objective'), // short label
  reasoning: text('reasoning').notNull(), // 2-3 sentences, installer-facing, MUST reference specific archetype weights + specific quote numbers
  contentSubject: text('content_subject'), // for email
  contentBody: text('content_body').notNull(), // the actual message/script
  contentVariantB: text('content_variant_b'), // A/B variant for top 2 highest-leverage touches
  abTestActive: integer('ab_test_active', { mode: 'boolean' }).default(false),
  abCampaignTag: text('ab_campaign_tag'), // rolls up to org-level dashboard
  installerEdited: integer('installer_edited', { mode: 'boolean' }).default(false),
  status: text('status').default('pending'),
  audioUrl: text('audio_url'), // ElevenLabs cached MP3 for voice touches
  micrositeUrl: text('microsite_url'), // for proposal microsite touches
});

// Simulated customer responses for Strategy Replay scrubber
export const simulatedResponse = sqliteTable('simulated_response', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  strategyTouchId: text('strategy_touch_id').notNull().references(() => strategyTouch.id, { onDelete: 'cascade' }),
  responseType: text('response_type'), // opened | clicked | replied_positive | replied_objection | ignored | call_answered | call_voicemail
  responseSummary: text('response_summary'), // 1-line description for the replay
  responseFullText: text('response_full_text'), // simulated reply if applicable
  sentiment: text('sentiment'),
  occurredDayOffset: integer('occurred_day_offset'),
});

export const auditLog = sqliteTable('audit_log', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  actorType: text('actor_type').notNull(), // installer_user | system | customer
  actorId: text('actor_id'),
  action: text('action').notNull(),
  targetCustomerId: text('target_customer_id'),
  metadata: text('metadata', { mode: 'json' }),
  occurredAt: integer('occurred_at', { mode: 'timestamp' }).default(sql`(unixepoch())`),
});
