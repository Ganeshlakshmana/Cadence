import type { StrategyTouch } from '@/lib/llm/schemas';

export interface EmailPreviewData {
  channel: 'email';
  subject: string;
  body: string;
  variantB: string | null;
  senderName: string;
  senderAvatar: string;
  dayOffset: number;
  tone: string;
  reasoning: string;
  abTestActive: boolean;
}

export function renderEmail(
  touch: StrategyTouch,
  installerName: string = 'Solar Sales Rep',
): EmailPreviewData {
  return {
    channel: 'email',
    subject: touch.contentSubject ?? 'Following up on your solar quote',
    body: touch.contentBody,
    variantB: touch.contentVariantB,
    senderName: installerName,
    senderAvatar: '/fixtures/installer-avatar.png',
    dayOffset: touch.dayOffset,
    tone: touch.tone,
    reasoning: touch.reasoning,
    abTestActive: touch.abTestActive,
  };
}
