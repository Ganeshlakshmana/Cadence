import { sqliteTable, text, integer, real } from 'drizzle-orm/sqlite-core';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import Database from 'better-sqlite3';
import { nanoid } from 'nanoid';
import path from 'path';

// ── Tables ─────────────────────────────────────────────────────────────────────

export const products = sqliteTable('products', {
  id:              text('id').primaryKey().$defaultFn(() => nanoid()),
  name:            text('name').notNull(),
  sku:             text('sku'),
  type:            text('type').notNull(),
  brand:           text('brand').default('Reonic'),
  powerWatts:      integer('power_watts'),
  capacityKwh:     real('capacity_kwh'),
  priceBase:       real('price_base'),
  warrantyYears:   integer('warranty_years'),
  description:     text('description'),
  features:        text('features'),
  targetArchetype: text('target_archetype'),
  active:          integer('active').default(1),
  createdAt:       integer('created_at'),
  updatedAt:       integer('updated_at'),
});

export const customers = sqliteTable('customers', {
  id:                        text('id').primaryKey().$defaultFn(() => nanoid()),
  fname:                     text('fname').notNull(),
  lname:                     text('lname').notNull(),
  email:                     text('email').unique().notNull(),
  phone:                     text('phone'),
  whatsappEnabled:           integer('whatsapp_enabled').default(0),
  address:                   text('address'),
  postalCode:                text('postal_code'),
  priceQuote:                real('price_quote'),
  archetypeFamily:           real('archetype_family').default(0),
  archetypeInvestor:         real('archetype_investor').default(0),
  archetypeEnvironmentalist: real('archetype_environmentalist').default(0),
  archetypeSkeptic:          real('archetype_skeptic').default(0),
  about:                     text('about'),
  status:                    text('status').default('lead'),
  language:                  text('language').default('en'),
  consentDataProcessing:     integer('consent_data_processing').default(0),
  consentMarketing:          integer('consent_marketing').default(0),
  consentVoiceCloning:       integer('consent_voice_cloning').default(0),
  phoneVerified:             integer('phone_verified').default(0),
  preferredCallTime:         text('preferred_call_time').default('anytime'),
  productId:                 text('product_id'),
  productType:               text('product_type'),
  createdAt:                 integer('created_at'),
  updatedAt:                 integer('updated_at'),
});

export const sequences = sqliteTable('sequences', {
  id:                  text('id').primaryKey().$defaultFn(() => nanoid()),
  customerId:          text('customer_id').notNull().references(() => customers.id, { onDelete: 'cascade' }),
  totalDays:           integer('total_days').default(30),
  currentDay:          integer('current_day').default(0),
  status:              text('status').default('active'),
  ghostRiskScore:      real('ghost_risk_score').default(0),
  closeReadinessScore: real('close_readiness_score').default(0),
  rationale:           text('rationale'),
  generatedBy:         text('generated_by'),
  createdAt:           integer('created_at'),
  updatedAt:           integer('updated_at'),
});

export const touchpoints = sqliteTable('touchpoints', {
  id:              text('id').primaryKey().$defaultFn(() => nanoid()),
  sequenceId:      text('sequence_id').notNull().references(() => sequences.id, { onDelete: 'cascade' }),
  customerId:      text('customer_id').notNull().references(() => customers.id, { onDelete: 'cascade' }),
  dayOffset:       integer('day_offset').notNull(),
  channel:         text('channel').notNull(),
  scheduledAt:     integer('scheduled_at'),
  sentAt:          integer('sent_at'),
  contentSubject:  text('content_subject'),
  contentBody:     text('content_body'),
  contentImageUrl: text('content_image_url'),
  contentAudioUrl: text('content_audio_url'),
  reasoning:       text('reasoning'),
  abVariant:       text('ab_variant'),
  status:          text('status').default('pending'),
  createdAt:       integer('created_at'),
});

export const customerResponses = sqliteTable('customer_responses', {
  id:             text('id').primaryKey().$defaultFn(() => nanoid()),
  touchpointId:   text('touchpoint_id').references(() => touchpoints.id),
  customerId:     text('customer_id').notNull().references(() => customers.id, { onDelete: 'cascade' }),
  dayNumber:      integer('day_number'),
  channel:        text('channel'),
  responseText:   text('response_text'),
  sentiment:      text('sentiment').default('no_response'),
  actionTaken:    text('action_taken'),
  respondedAt:    integer('responded_at'),
  rawWebhookData: text('raw_webhook_data'),
  createdAt:      integer('created_at'),
});

export const aiFollowups = sqliteTable('ai_followups', {
  id:               text('id').primaryKey().$defaultFn(() => nanoid()),
  responseId:       text('response_id').references(() => customerResponses.id),
  customerId:       text('customer_id').notNull().references(() => customers.id, { onDelete: 'cascade' }),
  triggerReason:    text('trigger_reason'),
  generatedContent: text('generated_content'),
  channel:          text('channel'),
  status:           text('status').default('pending_review'),
  generatedBy:      text('generated_by'),
  generatedAt:      integer('generated_at'),
  approvedAt:       integer('approved_at'),
});

export const auditLog = sqliteTable('audit_log', {
  id:         text('id').primaryKey().$defaultFn(() => nanoid()),
  actor:      text('actor'),
  action:     text('action'),
  entityType: text('entity_type'),
  entityId:   text('entity_id'),
  metadata:   text('metadata'),
  createdAt:  integer('created_at'),
});

export const callRecords = sqliteTable('call_records', {
  id:              text('id').primaryKey().$defaultFn(() => nanoid()),
  customerId:      text('customer_id').notNull().references(() => customers.id, { onDelete: 'cascade' }),
  callSid:         text('call_sid'),
  conversationId:  text('conversation_id'),
  finalDecision:   text('final_decision'),
  finalQuote:      text('final_quote'),
  attemptsMade:    integer('attempts_made').default(0),
  summary:         text('summary'),
  durationSeconds: integer('duration_seconds'),
  customerNumber:  text('customer_number'),
  timestamp:       integer('timestamp'),
  rawWebhookData:  text('raw_webhook_data'),
  createdAt:       integer('created_at'),
});

// ── DB connection ──────────────────────────────────────────────────────────────

const dbPath = path.join(process.cwd(), 'data', 'sunpath.db');
const sqlite = new Database(dbPath);
sqlite.pragma('journal_mode = WAL');

const schemaMap = { products, customers, sequences, touchpoints, customerResponses, aiFollowups, auditLog, callRecords };

export const db = drizzle(sqlite, { schema: schemaMap });
export type DB = typeof db;

export function closeDb() {
  sqlite.close();
}
