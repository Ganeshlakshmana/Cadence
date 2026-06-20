import type { StrategyTouch } from '@/lib/llm/schemas';
import { generateVoiceNote, buildVoiceScript } from '@/lib/elevenlabs/client';

export interface VoicePreviewData {
  channel: 'whatsapp_voice';
  script: string;
  audioUrl: string;
  durationEstimateSeconds: number;
  senderName: string;
  dayOffset: number;
  reasoning: string;
  aiActDisclosure: string;
}

export async function renderVoice(
  touch: StrategyTouch,
  params: {
    installerName: string;
    companyName: string;
    customerFirstName: string;
    languageCode: string;
  },
): Promise<VoicePreviewData> {
  const script = buildVoiceScript({
    installerName: params.installerName,
    companyName: params.companyName,
    customerFirstName: params.customerFirstName,
    languageCode: params.languageCode,
    mainMessage: touch.contentBody,
  });

  const audioUrl = await generateVoiceNote({
    script,
    languageCode: params.languageCode,
    installerName: params.installerName,
    customerFirstName: params.customerFirstName,
  });

  // Rough estimate: 150 words/minute speaking rate
  const wordCount = script.split(/\s+/).length;
  const durationEstimateSeconds = Math.round((wordCount / 150) * 60);

  return {
    channel: 'whatsapp_voice',
    script,
    audioUrl,
    durationEstimateSeconds,
    senderName: params.installerName,
    dayOffset: touch.dayOffset,
    reasoning: touch.reasoning,
    aiActDisclosure: 'AI-assisted audio — AI Act Article 50 compliance: opening disclosure included in script',
  };
}
