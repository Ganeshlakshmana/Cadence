import type { StrategyTouch } from '@/lib/llm/schemas';

export interface PostcardPreviewData {
  channel: 'postcard';
  frontHeadline: string;
  body: string;
  callToAction: string;
  fontStyle: 'handwritten' | 'print';
  dayOffset: number;
  reasoning: string;
  sendNote: string;
}

export function renderPostcard(
  touch: StrategyTouch,
  installerName: string = 'Solar Sales Rep',
): PostcardPreviewData {
  const lines = touch.contentBody.split('\n').filter(Boolean);
  const frontHeadline = lines[0] ?? touch.objective;
  const body = lines.slice(1, -1).join('\n') || touch.contentBody;
  const callToAction = lines[lines.length - 1] ?? `Contact ${installerName} to learn more`;

  return {
    channel: 'postcard',
    frontHeadline,
    body,
    callToAction,
    fontStyle: 'handwritten',
    dayOffset: touch.dayOffset,
    reasoning: touch.reasoning,
    sendNote: 'Physical mailing via Lob — integration available in production build',
  };
}
