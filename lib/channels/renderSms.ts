import type { StrategyTouch } from '@/lib/llm/schemas';

export interface SmsPreviewData {
  channel: 'sms';
  body: string;
  variantB: string | null;
  senderName: string;
  characterCount: number;
  segmentCount: number;
  dayOffset: number;
  tone: string;
  reasoning: string;
}

export function renderSms(
  touch: StrategyTouch,
  installerName: string = 'Solar Sales Rep',
): SmsPreviewData {
  const body = touch.contentBody;
  const characterCount = body.length;
  const segmentCount = Math.ceil(characterCount / 160);

  return {
    channel: 'sms',
    body,
    variantB: touch.contentVariantB,
    senderName: installerName,
    characterCount,
    segmentCount,
    dayOffset: touch.dayOffset,
    tone: touch.tone,
    reasoning: touch.reasoning,
  };
}
