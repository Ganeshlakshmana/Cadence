import type { StrategyTouch } from '@/lib/llm/schemas';

export interface MicrositePreviewData {
  channel: 'microsite';
  micrositeUrl: string;
  headline: string;
  subheadline: string;
  roiHighlight: string;
  co2Highlight: string;
  ctaPrimary: string;
  ctaSecondary: string;
  dayOffset: number;
  reasoning: string;
}

export function renderMicrosite(
  touch: StrategyTouch,
  params: {
    customerId: string;
    customerFirstName: string;
    monthlyEquivalentSavings: number;
    currency: string;
    co2OffsetTons25yr: number;
    appUrl?: string;
  },
): MicrositePreviewData {
  const appUrl = params.appUrl ?? process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';
  const micrositeUrl = `${appUrl}/p/${params.customerId}`;

  return {
    channel: 'microsite',
    micrositeUrl,
    headline: `${params.customerFirstName}, your solar journey starts here`,
    subheadline: touch.contentBody.split('\n')[0] ?? touch.objective,
    roiHighlight: `Save ${params.currency}${params.monthlyEquivalentSavings}/month`,
    co2Highlight: `Offset ${params.co2OffsetTons25yr} tons of CO₂ over 25 years`,
    ctaPrimary: 'Book a 15-minute call',
    ctaSecondary: 'Send me the contract',
    dayOffset: touch.dayOffset,
    reasoning: touch.reasoning,
  };
}
