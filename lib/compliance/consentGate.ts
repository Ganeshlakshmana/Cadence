import { db } from '@/db/client';
import { customer } from '@/db/schema';
import { eq } from 'drizzle-orm';

export type ConsentType = 'dataProcessing' | 'marketing' | 'voiceCloning';

export interface ConsentCheckResult {
  allowed: boolean;
  missingConsents: ConsentType[];
  reason: string;
}

// Maps each action type to required consents
const CONSENT_REQUIREMENTS: Record<string, ConsentType[]> = {
  'persona_inference': ['dataProcessing'],
  'sequence_generation': ['dataProcessing', 'marketing'],
  'voice_generation': ['dataProcessing', 'marketing'],     // stock TTS — no voice cloning required
  'voice_cloning': ['dataProcessing', 'marketing', 'voiceCloning'], // actual voice cloning of installer
  'replay_simulation': ['dataProcessing'],
  'manager_one_pager': ['dataProcessing'],
  'audit_log_read': ['dataProcessing'],
};

export async function checkConsent(
  customerId: string,
  actionType: string,
): Promise<ConsentCheckResult> {
  const required = CONSENT_REQUIREMENTS[actionType] ?? ['dataProcessing'];

  const [cust] = await db
    .select()
    .from(customer)
    .where(eq(customer.id, customerId))
    .limit(1);

  if (!cust) {
    return {
      allowed: false,
      missingConsents: required,
      reason: `Customer ${customerId} not found`,
    };
  }

  const missingConsents: ConsentType[] = [];

  if (required.includes('dataProcessing') && !cust.consentDataProcessing) {
    missingConsents.push('dataProcessing');
  }
  if (required.includes('marketing') && !cust.consentMarketing) {
    missingConsents.push('marketing');
  }
  if (required.includes('voiceCloning') && !cust.consentVoiceCloning) {
    missingConsents.push('voiceCloning');
  }

  if (missingConsents.length > 0) {
    return {
      allowed: false,
      missingConsents,
      reason: `Missing consent for: ${missingConsents.join(', ')}`,
    };
  }

  return { allowed: true, missingConsents: [], reason: 'All required consents present' };
}

export function assertConsent(result: ConsentCheckResult): void {
  if (!result.allowed) {
    throw new Error(`Consent gate blocked: ${result.reason}`);
  }
}
