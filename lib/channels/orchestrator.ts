import type { StrategyTouch } from '@/lib/llm/schemas';
import { renderEmail } from './renderEmail';
import { renderSms } from './renderSms';
import { renderWhatsApp } from './renderWhatsApp';
import { renderVideo } from './renderVideo';
import { renderPostcard } from './renderPostcard';
import { renderMicrosite } from './renderMicrosite';

export type ChannelPreviewData =
  | ReturnType<typeof renderEmail>
  | ReturnType<typeof renderSms>
  | ReturnType<typeof renderWhatsApp>
  | ReturnType<typeof renderVideo>
  | ReturnType<typeof renderPostcard>
  | ReturnType<typeof renderMicrosite>
  | { channel: 'call' | 'linkedin' | 'in_person'; body: string; dayOffset: number; tone: string; reasoning: string };

export interface OrchestratorParams {
  installerName?: string;
  companyName?: string;
  customerId?: string;
  customerFirstName?: string;
  languageCode?: string;
  monthlyEquivalentSavings?: number;
  currency?: string;
  co2OffsetTons25yr?: number;
  audioUrl?: string;
}

export function renderTouch(
  touch: StrategyTouch,
  params: OrchestratorParams = {},
): ChannelPreviewData {
  const installerName = params.installerName ?? 'Solar Sales Rep';

  switch (touch.channel) {
    case 'email':
      return renderEmail(touch, installerName);
    case 'sms':
      return renderSms(touch, installerName);
    case 'whatsapp_text':
    case 'whatsapp_voice':
      return renderWhatsApp(touch, installerName, params.audioUrl);
    case 'video':
      return renderVideo(touch, installerName);
    case 'postcard':
      return renderPostcard(touch, installerName);
    case 'microsite':
      if (params.customerId && params.customerFirstName) {
        return renderMicrosite(touch, {
          customerId: params.customerId,
          customerFirstName: params.customerFirstName,
          monthlyEquivalentSavings: params.monthlyEquivalentSavings ?? 0,
          currency: params.currency ?? 'EUR',
          co2OffsetTons25yr: params.co2OffsetTons25yr ?? 0,
        });
      }
      return renderMicrosite(touch, {
        customerId: 'unknown',
        customerFirstName: 'Customer',
        monthlyEquivalentSavings: 0,
        currency: 'EUR',
        co2OffsetTons25yr: 0,
      });
    case 'call':
    case 'linkedin':
    case 'in_person':
    default:
      return {
        channel: touch.channel as 'call' | 'linkedin' | 'in_person',
        body: touch.contentBody,
        dayOffset: touch.dayOffset,
        tone: touch.tone,
        reasoning: touch.reasoning,
      };
  }
}

export function renderAllTouches(
  touches: StrategyTouch[],
  params: OrchestratorParams = {},
): ChannelPreviewData[] {
  return touches.map(touch => renderTouch(touch, params));
}
