import type { StrategyTouch } from '@/lib/llm/schemas';

export interface WhatsAppPreviewData {
  channel: 'whatsapp_text' | 'whatsapp_voice';
  body: string;
  audioUrl: string | null;
  senderName: string;
  dayOffset: number;
  tone: string;
  reasoning: string;
  isVoice: boolean;
  voiceScriptDisclosure: string | null;
}

export function renderWhatsApp(
  touch: StrategyTouch,
  installerName: string = 'Solar Sales Rep',
  audioUrl?: string,
): WhatsAppPreviewData {
  const isVoice = touch.channel === 'whatsapp_voice';
  const voiceScriptDisclosure = isVoice
    ? `[AI Act Art. 50 disclosure: Opening line identifies this as AI-assisted audio]`
    : null;

  return {
    channel: touch.channel as 'whatsapp_text' | 'whatsapp_voice',
    body: touch.contentBody,
    audioUrl: audioUrl ?? null,
    senderName: installerName,
    dayOffset: touch.dayOffset,
    tone: touch.tone,
    reasoning: touch.reasoning,
    isVoice,
    voiceScriptDisclosure,
  };
}
