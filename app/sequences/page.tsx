'use client';

import { useEffect, useState, useCallback } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { Suspense } from 'react';
import SideNav from '@/app/components/SideNav';

// ── Types ─────────────────────────────────────────────────────────────────────

interface CustomerDetail {
  id: string;
  firstName: string;
  lastName: string;
  city: string;
  countryCode: string;
  irradiance: number | null;
}

interface ProfileDetail {
  archetypeFamily: number;
  archetypeInvestor: number;
  archetypeEnvironmentalist: number;
  archetypeSkeptic: number;
  decisionTimeline: string;
  inferenceConfidence: number;
  statedObjections: string[];
  statedMotivations: string[];
  customerVerbatimPhrases: string[];
}

interface QuoteDetail {
  id: string;
  totalPrice: number;
  currency: string;
  annualRoiPct: number;
  paybackPeriodYears: number;
  monthlyEquivalentSavings: number;
  co2OffsetTons25yr: number;
}

interface Touch {
  id?: string;
  sequenceIndex: number;
  dayOffset: number;
  channel: string;
  tone: string;
  objective: string;
  reasoning: string;
  contentSubject: string | null;
  contentBody: string;
  abTestActive: boolean;
  audioUrl?: string | null;
}

interface StrategyData {
  id?: string;
  strategyId?: string;
  ghostRisk?: { score: number; signals: string[]; recommendation: string };
  closeReadiness?: { score: number; signals: string[]; recommendation: string };
  ghostRiskScore?: number;
  closeReadinessScore?: number;
  rationaleSummary?: string;
  personaWeights?: { family: number; investor: number; environmentalist: number; skeptic: number };
  touches: Touch[];
}

function parseJsonArr(v: unknown): string[] {
  if (Array.isArray(v)) return v as string[];
  if (typeof v === 'string') { try { return JSON.parse(v); } catch { return []; } }
  return [];
}

// ── Channel icons ─────────────────────────────────────────────────────────────

const CHANNEL_ICON: Record<string, string> = {
  email:           'mail',
  call:            'call',
  sms:             'sms',
  whatsapp_text:   'chat',
  whatsapp_voice:  'voice_chat',
  linkedin:        'link',
  video:           'videocam',
  microsite:       'article',
  in_person:       'handshake',
  postcard:        'post_add',
};

const TONE_COLOR: Record<string, string> = {
  reassuring:        'var(--color-primary-container)',
  data_driven:       'var(--color-secondary)',
  impact:            'var(--color-secondary)',
  objection_handling:'var(--color-tertiary)',
  urgency:           'var(--color-error)',
  social_proof:      'var(--color-primary)',
};

// ── Archetype gradient (dynamic) ──────────────────────────────────────────────

function archetypeGradientStyle(weights: { family: number; investor: number; environmentalist: number; skeptic: number }) {
  const pioneer = weights.family + weights.investor + weights.environmentalist;
  const conservative = weights.skeptic;
  const total = pioneer + conservative || 1;
  const pct = Math.round((pioneer / total) * 100);
  return {
    background: `linear-gradient(90deg, #2E5D4E 0%, #2E5D4E ${pct}%, #794741 ${pct}%, #794741 100%)`,
  };
}

// ── Touch card ────────────────────────────────────────────────────────────────

function TouchCard({ touch, index, onAudioReady }: { touch: Touch; index: number; onAudioReady?: (touchId: string, audioUrl: string) => void }) {
  const [expanded, setExpanded] = useState(false);
  const [audioUrl, setAudioUrl] = useState<string | null>(touch.audioUrl ?? null);
  const [generatingAudio, setGeneratingAudio] = useState(false);
  const toneColor = TONE_COLOR[touch.tone] ?? 'var(--color-primary-container)';
  const icon = CHANNEL_ICON[touch.channel] ?? 'notifications';

  useEffect(() => {
    if (touch.channel !== 'whatsapp_voice' || audioUrl || generatingAudio || !touch.id) return;
    setGeneratingAudio(true);
    fetch(`/api/touch/${touch.id}/audio`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    })
      .then(r => r.json())
      .then(data => {
        if (data.audioUrl) {
          setAudioUrl(data.audioUrl);
          onAudioReady?.(touch.id!, data.audioUrl);
        }
      })
      .catch(() => {})
      .finally(() => setGeneratingAudio(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [touch.id]);

  return (
    <div
      className="bg-white rounded-xl p-4 relative overflow-hidden transition-all hover:shadow-md"
      style={{ border: '1px solid #E8E8E3' }}
    >
      {/* Tone bar */}
      <div className="absolute top-0 left-0 right-0 h-[3px]" style={{ backgroundColor: toneColor }} />

      <div
        className="cursor-pointer active:scale-95"
        onClick={() => setExpanded(e => !e)}
      >
        <div className="flex justify-between items-start mb-4">
          <span className="font-label-caps text-outline" style={{ fontSize: 10 }}>DAY {String(touch.dayOffset).padStart(2, '0')}</span>
          <span className="material-symbols-outlined" style={{ color: toneColor, fontSize: 18 }}>{icon}</span>
        </div>

        <h4 className="font-body-strong mb-1 text-on-surface" style={{ fontSize: 13 }}>
          {touch.objective || `Touch ${index + 1}`}
        </h4>
        <p className="text-on-surface-variant leading-tight" style={{ fontSize: 11 }}>
          {touch.tone.replace(/_/g, ' ')} · {touch.channel.replace(/_/g, ' ')}
        </p>
      </div>

      {/* Audio player for voice touches */}
      {touch.channel === 'whatsapp_voice' && (
        <div className="mt-3">
          {audioUrl ? (
            <audio controls src={audioUrl} className="w-full" style={{ height: 32 }} />
          ) : generatingAudio ? (
            <p className="font-label-caps text-outline" style={{ fontSize: 9 }}>GENERATING AUDIO…</p>
          ) : null}
        </div>
      )}

      {/* Expanded reasoning */}
      {expanded && (
        <div className="mt-4 pt-4" style={{ borderTop: '1px solid #E8E8E3' }}>
          <p className="font-label-caps text-outline uppercase mb-2" style={{ fontSize: 9 }}>REASONING</p>
          <p className="font-body-main text-on-surface-variant leading-relaxed" style={{ fontSize: 12 }}>
            {touch.reasoning}
          </p>
          {touch.contentSubject && (
            <div className="mt-3">
              <p className="font-label-caps text-outline uppercase mb-1" style={{ fontSize: 9 }}>SUBJECT</p>
              <p className="font-data-mono text-on-surface" style={{ fontSize: 11 }}>{touch.contentSubject}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main page (inner) ─────────────────────────────────────────────────────────

function SequencePlannerInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const customerId = searchParams.get('customerId') ?? 'cust_maria_mueller';

  const [custDetail, setCustDetail] = useState<CustomerDetail | null>(null);
  const [profile, setProfile]   = useState<ProfileDetail | null>(null);
  const [quote, setQuote]       = useState<QuoteDetail | null>(null);
  const [strategy, setStrategy] = useState<StrategyData | null>(null);
  const [loading, setLoading]   = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError]       = useState<string | null>(null);

  const generateStrategy = useCallback(async (custId: string, quoteId: string) => {
    setGenerating(true);
    try {
      const res = await fetch('/api/strategy/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerId: custId,
          quoteId,
          installerNotes: 'Customer is interested in solar. Please generate a persuasive outreach sequence based on their profile.',
        }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setStrategy(data);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setGenerating(false);
    }
  }, []);

  useEffect(() => {
    setLoading(true);
    setError(null);
    fetch(`/api/customers/${customerId}`)
      .then(r => r.json())
      .then(async (data) => {
        if (data.error) throw new Error(data.error);
        setCustDetail(data.customer);
        setProfile(data.profile ? {
          ...data.profile,
          statedMotivations:       parseJsonArr(data.profile.statedMotivations),
          statedObjections:        parseJsonArr(data.profile.statedObjections),
          customerVerbatimPhrases: parseJsonArr(data.profile.customerVerbatimPhrases),
        } : null);
        setQuote(data.quote);

        if (data.strategy && data.strategy.touches?.length > 0) {
          // Reuse existing strategy
          setStrategy({
            id: data.strategy.id,
            strategyId: data.strategy.id,
            ghostRiskScore: data.strategy.ghostRiskScore,
            closeReadinessScore: data.strategy.closeReadinessScore,
            rationaleSummary: data.strategy.rationaleSummary,
            touches: data.strategy.touches,
          });
          setLoading(false);
        } else if (data.quote?.id) {
          setLoading(false);
          // No strategy yet — generate one
          await generateStrategy(customerId, data.quote.id);
        } else {
          setLoading(false);
        }
      })
      .catch(e => {
        setError(e.message);
        setLoading(false);
      });
  }, [customerId, generateStrategy]);

  const name = custDetail ? `${custDetail.firstName} ${custDetail.lastName}` : '…';
  const price = quote ? new Intl.NumberFormat('de-DE', { style: 'currency', currency: quote.currency, minimumFractionDigits: 0 }).format(quote.totalPrice) : '…';
  const city = custDetail ? `${custDetail.city}, ${custDetail.countryCode}` : '…';
  const irradiance = custDetail?.irradiance ? `${Math.round(custDetail.irradiance)} kWh/m²/yr` : '—';

  const archetypeWeights = {
    family:          profile?.archetypeFamily ?? 0.65,
    investor:        profile?.archetypeInvestor ?? 0,
    environmentalist: profile?.archetypeEnvironmentalist ?? 0,
    skeptic:         profile?.archetypeSkeptic ?? 0.35,
  };

  const pioneerPct = Math.round(((archetypeWeights.family + archetypeWeights.investor + archetypeWeights.environmentalist) /
    (archetypeWeights.family + archetypeWeights.investor + archetypeWeights.environmentalist + archetypeWeights.skeptic || 1)) * 100);

  const ghostScore  = strategy?.ghostRisk?.score ?? (strategy?.ghostRiskScore ?? 0);
  const readyScore  = strategy?.closeReadiness?.score ?? (strategy?.closeReadinessScore ?? 0);
  const strategyId  = strategy?.id ?? strategy?.strategyId;

  return (
    <div className="flex min-h-screen" style={{ backgroundColor: 'var(--color-background)' }}>
      <SideNav />
      <main className="ml-64 flex-1">
        {/* TopBar */}
        <header
          className="sticky top-0 w-full z-40 flex justify-between items-center px-6 py-4 no-print"
          style={{ backgroundColor: 'var(--color-surface)', borderBottom: '1px solid var(--color-outline-variant)' }}
        >
          <div className="flex items-center gap-4">
            <h1 className="font-display-md text-2xl italic text-primary">Sequence Planner</h1>
            <span
              className="px-3 py-1 font-label-caps rounded-full"
              style={{ backgroundColor: 'rgba(20,69,55,0.1)', color: 'var(--color-primary)', fontSize: 10 }}
            >
              LIVE CANVAS
            </span>
          </div>
          <div className="flex items-center gap-6">
            <button
              onClick={() => strategyId && router.push(`/replay?strategyId=${strategyId}`)}
              className="text-on-surface-variant active:scale-95 hover:opacity-80 transition-opacity"
              title="Replay simulation"
              disabled={!strategyId}
            >
              <span className="material-symbols-outlined">replay</span>
            </button>
            <button
              onClick={() => router.push('/adjust')}
              className="px-4 py-2 font-body-strong rounded-sm hover:opacity-90 active:scale-95 transition-all"
              style={{ border: '1px solid #E8E8E3', color: 'var(--color-primary)' }}
            >
              Adjust Sequence
            </button>
            <button
              onClick={() => strategyId && router.push(`/brief?strategyId=${strategyId}`)}
              className="px-4 py-2 font-body-strong rounded-sm hover:opacity-90 active:scale-95 transition-all"
              style={{ backgroundColor: 'var(--color-primary)', color: 'white' }}
              disabled={!strategyId}
            >
              Export brief
            </button>
            <div
              className="w-8 h-8 rounded-full flex items-center justify-center cursor-pointer"
              style={{ backgroundColor: 'var(--color-surface-container-highest)', border: '1px solid #E8E8E3' }}
            >
              <span className="material-symbols-outlined text-outline">person</span>
            </div>
          </div>
        </header>

        <div className="p-6 flex flex-col md:flex-row gap-6">
          {/* Main canvas */}
          <div className="flex-1 space-y-6">
            {/* Customer header card */}
            <div className="bg-white rounded-xl p-6" style={{ border: '1px solid #E8E8E3' }}>
              <div className="flex justify-between items-end">
                <div>
                  <h2 className="text-3xl font-display-md italic text-on-surface mb-2">{name}</h2>
                  <div className="flex items-center gap-4">
                    <span className="text-2xl font-medium text-on-surface">{price}</span>
                    <div
                      className="px-3 py-1 rounded-full font-label-caps flex items-center gap-1"
                      style={{ backgroundColor: 'rgba(20,69,55,0.05)', color: 'var(--color-primary)', fontSize: 9 }}
                    >
                      <span className="material-symbols-outlined" style={{ fontSize: 12 }}>location_on</span>
                      {city}
                    </div>
                    <div
                      className="px-3 py-1 rounded-full font-label-caps flex items-center gap-1"
                      style={{ backgroundColor: 'rgba(34,106,80,0.08)', color: 'var(--color-secondary)', fontSize: 9 }}
                    >
                      <span className="material-symbols-outlined" style={{ fontSize: 12 }}>wb_sunny</span>
                      {irradiance}
                    </div>
                  </div>
                </div>
                {/* Archetype blend bar */}
                <div className="flex flex-col items-end gap-2">
                  <div className="flex justify-between w-[320px] font-label-caps text-outline" style={{ fontSize: 10 }}>
                    <span>PIONEER</span><span>CONSERVATIVE</span>
                  </div>
                  <div className="w-[320px] h-2 rounded-full overflow-hidden" style={{ border: '1px solid #E8E8E3' }}>
                    <div className="h-full w-full" style={archetypeGradientStyle(archetypeWeights)} />
                  </div>
                  <span className="font-label-caps text-outline" style={{ fontSize: 9 }}>
                    ARCHETYPE BLEND: {pioneerPct}/{100 - pioneerPct}
                  </span>
                </div>
              </div>
            </div>

            {/* Score widgets */}
            <div className="grid grid-cols-2 gap-6">
              <div className="bg-white rounded-xl p-6 flex items-center justify-between" style={{ border: '1px solid #E8E8E3' }}>
                <div>
                  <p className="font-label-caps text-outline mb-1 uppercase" style={{ fontSize: 10 }}>GHOST RISK</p>
                  <h3 className="text-3xl font-body-main">{ghostScore.toFixed(2)}</h3>
                </div>
                <div className="h-10 w-1 rounded-full overflow-hidden" style={{ backgroundColor: 'var(--color-error-container)' }}>
                  <div className="w-full" style={{ height: `${ghostScore * 100}%`, backgroundColor: 'var(--color-error)' }} />
                </div>
              </div>
              <div className="bg-white rounded-xl p-6 flex items-center justify-between" style={{ border: '1px solid #E8E8E3' }}>
                <div>
                  <p className="font-label-caps text-outline mb-1 uppercase" style={{ fontSize: 10 }}>CLOSE READINESS</p>
                  <h3 className="text-3xl font-body-main">{readyScore.toFixed(2)}</h3>
                </div>
                <div className="h-10 w-1 rounded-full overflow-hidden" style={{ backgroundColor: 'var(--color-secondary-container)' }}>
                  <div className="w-full" style={{ height: `${readyScore * 100}%`, backgroundColor: 'var(--color-secondary)' }} />
                </div>
              </div>
            </div>

            {/* Touch timeline */}
            <section>
              <div className="flex items-center gap-4 mb-6">
                <span className="font-label-caps text-outline uppercase" style={{ fontSize: 10 }}>Sequence Timeline</span>
                <div className="flex-grow h-px" style={{ backgroundColor: 'rgba(192,200,195,0.3)' }} />
              </div>

              {loading ? (
                <div className="flex flex-col items-center justify-center py-16 gap-4">
                  <span className="material-symbols-outlined text-outline" style={{ fontSize: 40 }}>hourglass_empty</span>
                  <p className="font-body-main text-on-surface-variant">Loading customer data…</p>
                </div>
              ) : generating ? (
                <div className="flex flex-col items-center justify-center py-16 gap-4">
                  <div className="w-8 h-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
                  <p className="font-display-md italic text-primary text-lg">Generating strategy…</p>
                  <p className="font-body-main text-on-surface-variant text-sm">Claude is building a personalised sequence</p>
                </div>
              ) : error ? (
                <div className="p-8 rounded-xl text-center" style={{ backgroundColor: 'var(--color-error-container)' }}>
                  <p className="font-body-main text-on-error-container">{error}</p>
                </div>
              ) : strategy?.touches?.length ? (
                <div className="grid grid-cols-4 gap-4">
                  {strategy.touches.map((touch, i) => (
                    <TouchCard key={touch.id ?? i} touch={touch} index={i} />
                  ))}
                </div>
              ) : (
                <div className="p-8 rounded-xl text-center" style={{ border: '1px dashed var(--color-outline-variant)' }}>
                  <p className="font-body-main text-on-surface-variant">No strategy yet. Click a customer in Pipeline to generate one.</p>
                </div>
              )}
            </section>
          </div>

          {/* Reasoning sidebar */}
          <aside className="w-80 space-y-8 p-6" style={{ backgroundColor: 'white', borderLeft: '1px solid #E8E8E3' }}>
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-primary">psychology</span>
              <h5 className="font-label-caps uppercase tracking-wider text-on-surface" style={{ fontSize: 10 }}>Sequence Reasoning</h5>
            </div>

            {strategy?.rationaleSummary ? (
              <div className="text-on-surface-variant leading-relaxed space-y-4" style={{ fontSize: 13 }}>
                <p>{strategy.rationaleSummary}</p>
              </div>
            ) : generating ? (
              <p className="font-body-main text-on-surface-variant italic" style={{ fontSize: 13 }}>Generating rationale…</p>
            ) : (
              <p className="font-body-main text-on-surface-variant italic" style={{ fontSize: 13 }}>Generate a strategy to see reasoning here.</p>
            )}

            {/* Archetype matching */}
            {profile && (
              <div className="pt-6" style={{ borderTop: '1px solid #E8E8E3' }}>
                <p className="font-label-caps text-outline mb-3 uppercase" style={{ fontSize: 9 }}>ARCHETYPE MATCHING</p>
                <div className="flex flex-wrap gap-2">
                  {profile.archetypeFamily > 0.15 && (
                    <span className="px-2 py-1 rounded text-[11px] font-medium" style={{ backgroundColor: 'rgba(20,69,55,0.1)', color: 'var(--color-primary)' }}>Family</span>
                  )}
                  {profile.archetypeInvestor > 0.15 && (
                    <span className="px-2 py-1 rounded text-[11px] font-medium" style={{ backgroundColor: 'rgba(34,106,80,0.1)', color: 'var(--color-secondary)' }}>Investor</span>
                  )}
                  {profile.archetypeEnvironmentalist > 0.15 && (
                    <span className="px-2 py-1 rounded text-[11px] font-medium" style={{ backgroundColor: 'rgba(34,106,80,0.1)', color: 'var(--color-secondary)' }}>Eco-focused</span>
                  )}
                  {profile.archetypeSkeptic > 0.15 && (
                    <span className="px-2 py-1 rounded text-[11px] font-medium" style={{ backgroundColor: 'rgba(94,49,43,0.1)', color: 'var(--color-tertiary)' }}>Skeptic</span>
                  )}
                </div>
              </div>
            )}

            {/* Stated objections */}
            {profile?.statedObjections && (profile.statedObjections as string[]).length > 0 && (
              <div className="pt-6" style={{ borderTop: '1px solid #E8E8E3' }}>
                <p className="font-label-caps text-outline mb-3 uppercase" style={{ fontSize: 9 }}>STATED OBJECTIONS</p>
                <ul className="space-y-2">
                  {(profile.statedObjections as string[]).map((obj, i) => (
                    <li key={i} className="flex gap-2 items-start" style={{ fontSize: 12 }}>
                      <span className="material-symbols-outlined text-error" style={{ fontSize: 14, marginTop: 1 }}>warning</span>
                      <span className="text-on-surface-variant">{obj}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </aside>
        </div>
      </main>
    </div>
  );
}

// ── Page export (wrapped in Suspense for useSearchParams) ─────────────────────
export default function SequencePlannerPage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center min-h-screen">
        <p className="font-body-main text-on-surface-variant">Loading…</p>
      </div>
    }>
      <SequencePlannerInner />
    </Suspense>
  );
}
