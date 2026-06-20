CREATE TABLE `audit_log` (
	`id` text PRIMARY KEY NOT NULL,
	`actor_type` text NOT NULL,
	`actor_id` text,
	`action` text NOT NULL,
	`target_customer_id` text,
	`metadata` text,
	`occurred_at` integer DEFAULT (unixepoch())
);
--> statement-breakpoint
CREATE TABLE `customer` (
	`id` text PRIMARY KEY NOT NULL,
	`first_name` text NOT NULL,
	`last_name` text NOT NULL,
	`email` text,
	`phone_number` text,
	`preferred_channel` text DEFAULT 'email',
	`preferred_language` text DEFAULT 'de',
	`formality_register` text DEFAULT 'formal',
	`address_line` text,
	`city` text,
	`postal_code` text,
	`country_code` text DEFAULT 'DE',
	`latitude` real,
	`longitude` real,
	`timezone` text,
	`solar_irradiance_kwh_m2_year` real,
	`consent_data_processing` integer DEFAULT false,
	`consent_data_processing_at` integer,
	`consent_marketing` integer DEFAULT false,
	`consent_marketing_at` integer,
	`consent_voice_cloning` integer DEFAULT false,
	`created_at` integer DEFAULT (unixepoch())
);
--> statement-breakpoint
CREATE TABLE `customer_profile` (
	`id` text PRIMARY KEY NOT NULL,
	`customer_id` text NOT NULL,
	`archetype_family` real DEFAULT 0,
	`archetype_investor` real DEFAULT 0,
	`archetype_environmentalist` real DEFAULT 0,
	`archetype_skeptic` real DEFAULT 0,
	`customer_verbatim_phrases` text,
	`stated_motivations` text,
	`stated_objections` text,
	`competitor_mentioned` integer DEFAULT false,
	`competitor_names` text,
	`decision_timeline` text,
	`household_size` integer,
	`inference_confidence` real,
	FOREIGN KEY (`customer_id`) REFERENCES `customer`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `quote` (
	`id` text PRIMARY KEY NOT NULL,
	`customer_id` text NOT NULL,
	`system_size_kw` real,
	`panel_count` integer,
	`panel_brand` text,
	`battery_included` integer DEFAULT false,
	`battery_kwh` real,
	`total_price` real,
	`currency` text DEFAULT 'EUR',
	`financing_type` text,
	`estimated_annual_savings` real,
	`monthly_equivalent_savings` real,
	`payback_period_years` real,
	`annual_roi_pct` real,
	`co2_offset_tons_25yr` real,
	`quote_pdf_url` text,
	`created_at` integer DEFAULT (unixepoch()),
	FOREIGN KEY (`customer_id`) REFERENCES `customer`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `simulated_response` (
	`id` text PRIMARY KEY NOT NULL,
	`strategy_touch_id` text NOT NULL,
	`response_type` text,
	`response_summary` text,
	`response_full_text` text,
	`sentiment` text,
	`occurred_day_offset` integer,
	FOREIGN KEY (`strategy_touch_id`) REFERENCES `strategy_touch`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `strategy` (
	`id` text PRIMARY KEY NOT NULL,
	`customer_id` text NOT NULL,
	`quote_id` text NOT NULL,
	`status` text DEFAULT 'draft',
	`ghost_risk_score` real,
	`ghost_risk_signals` text,
	`close_readiness_score` real,
	`rationale_summary` text,
	`market_context_applied` text,
	`generated_by` text DEFAULT 'claude-sonnet-4-6',
	`created_at` integer DEFAULT (unixepoch()),
	`updated_at` integer DEFAULT (unixepoch()),
	FOREIGN KEY (`customer_id`) REFERENCES `customer`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`quote_id`) REFERENCES `quote`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `strategy_touch` (
	`id` text PRIMARY KEY NOT NULL,
	`strategy_id` text NOT NULL,
	`sequence_index` integer NOT NULL,
	`day_offset` integer NOT NULL,
	`channel` text NOT NULL,
	`tone` text,
	`objective` text,
	`reasoning` text NOT NULL,
	`content_subject` text,
	`content_body` text NOT NULL,
	`content_variant_b` text,
	`ab_test_active` integer DEFAULT false,
	`ab_campaign_tag` text,
	`installer_edited` integer DEFAULT false,
	`status` text DEFAULT 'pending',
	`audio_url` text,
	`microsite_url` text,
	FOREIGN KEY (`strategy_id`) REFERENCES `strategy`(`id`) ON UPDATE no action ON DELETE cascade
);
