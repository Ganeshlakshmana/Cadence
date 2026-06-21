'use client';

import { useEffect, useState, useCallback } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { Suspense } from 'react';
import SideNav from '@/app/components/SideNav';
import CoachingPanel from '@/components/CoachingPanel';
import { SendNowModal, type SendNowCustomer } from '@/components/SendNowModal';

// ── Types ─────────────────────────────────────────────────────────────────────

interface CustomerDetail {
  id: string;
  fname: string;
  lname: string;
  email: string | null;
  phone: string | null;
  whatsappEnabled: boolean;
  consentMarketing: boolean;
  priceQuote: number | null;
  archetypeFamily: number;
  archetypeInvestor: number;
  archetypeEnvironmentalist: number;
  archetypeSkeptic: number;
  about: string | null;
  language: string | null;
}

interface Touch {
  id?: string;
  dayOffset: number;
  channel: string;
  reasoning: string | null;
  contentSubject: string | null;
  contentBody: string | null;
  contentAudioUrl?: string | null;
  contentImageUrl?: string | null;
  abVariant?: string | null;
  status?: string;
}

interface StrategyData {
  id?: string;
  ghostRiskScore?: number;
  closeReadinessScore?: number;
  rationale?: string;
  touches: Touch[];
}

function parseJsonArr(v: unknown): string[] {
  if (Array.isArray(v)) return v as string[];
  if (typeof v === 'string') { try { return JSON.parse(v); } catch { return []; } }
  return [];
}

// ── Channel icons + colors ─────────────────────────────────────────────────────

const CHANNEL_ICON: Record<string, string> = {
  email:           'mail',
  call:            'call',
  phone_call:      'call',
  sms:             'sms',
  whatsapp_text:   'chat',
  whatsapp_voice:  'voice_chat',
  voice_note:      'voice_chat',
  linkedin:        'link',
  video:           'videocam',
  microsite:       'article',
  in_person:       'handshake',
  postcard:        'post_add',
};

const CHANNEL_COLOR: Record<string, string> = {
  email:          'var(--color-primary-container)',
  call:           'var(--color-tertiary)',
  phone_call:     'var(--color-tertiary)',
  sms:            'var(--color-secondary)',
  whatsapp_text:  '#25D366',
  whatsapp_voice: '#25D366',
  voice_note:     '#25D366',
  linkedin:       '#0077B5',
  video:          'var(--color-error)',
  microsite:      'var(--color-secondary)',
  in_person:      'var(--color-primary)',
  postcard:       'var(--color-outline)',
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

function formatPrice(price: number) {
  return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR', minimumFractionDigits: 0 }).format(price);
}

// ── Touch card ────────────────────────────────────────────────────────────────

function TouchCard({ touch, index, onMediaReady, onSendNow }: { touch: Touch; index: number; onMediaReady?: (touchId: string, audioUrl: string, imageUrl: string) => void; onSendNow?: () => void }) {
  const [expanded, setExpanded] = useState(false);
  const [audioUrl, setAudioUrl] = useState<string | null>(touch.contentAudioUrl ?? null);
  const [imageUrl, setImageUrl] = useState<string | null>(touch.contentImageUrl ?? null);
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState<string | null>(null);
  const accentColor = CHANNEL_COLOR[touch.channel] ?? 'var(--color-primary-container)';
  const icon = CHANNEL_ICON[touch.channel] ?? 'notifications';
  const title = touch.contentSubject || touch.reasoning?.slice(0, 60) || `Touch ${index + 1}`;
  const isVoice = touch.channel === 'whatsapp_voice' || touch.channel === 'voice_note';

  async function generateVoiceCard() {
    if (!touch.id || generating) return;
    setGenerating(true);
    setGenError(null);
    try {
      const r = await fetch(`/api/touch/${touch.id}/generate-voice-card`, { method: 'POST' });
      const data = await r.json();
      if (!r.ok || data.error) throw new Error(data.error ?? `HTTP ${r.status}`);
      const au = data.data?.audio_url ?? null;
      const iu = data.data?.image_url ?? null;
      if (au) setAudioUrl(au);
      if (iu) setImageUrl(iu);
      if (au && iu) onMediaReady?.(touch.id!, au, iu);
    } catch (e: unknown) {
      setGenError(e instanceof Error ? e.message : String(e));
    } finally {
      setGenerating(false);
    }
  }

  // Auto-generate on mount for voice touches that have no real media yet.
  // Treat placeholder images and missing audio as "not yet generated".
  useEffect(() => {
    const isPlaceholder = !imageUrl || imageUrl.includes('/placeholders/');
    if (isVoice && touch.id && (isPlaceholder || !audioUrl)) {
      generateVoiceCard();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [touch.id]);

  return (
    <div
      className="bg-white rounded-xl relative overflow-hidden transition-all hover:shadow-md"
      style={{ border: '1px solid #E8E8E3' }}
    >
      {/* Channel accent bar */}
      <div className="absolute top-0 left-0 right-0 h-[3px]" style={{ backgroundColor: accentColor }} />

      {/* Voice card: image + audio at TOP */}
      {isVoice && (
        <div className="px-4 pt-5 pb-3">
          {generating ? (
            <div className="flex items-center gap-2 py-6 justify-center rounded-lg" style={{ backgroundColor: '#f8f8f6' }}>
              <div className="w-4 h-4 rounded-full border-2 border-t-transparent animate-spin" style={{ borderColor: accentColor }} />
              <p className="font-label-caps text-outline" style={{ fontSize: 9 }}>GENERATING VOICE CARD…</p>
            </div>
          ) : genError ? (
            <div className="p-3 rounded-lg" style={{ backgroundColor: 'var(--color-error-container)' }}>
              <p className="text-on-error-container mb-1" style={{ fontSize: 11 }}>{genError}</p>
              <button
                onClick={e => { e.stopPropagation(); generateVoiceCard(); }}
                className="font-label-caps underline"
                style={{ fontSize: 9, color: 'var(--color-error)' }}
              >
                RETRY
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              {imageUrl ? (
                <img
                  src={imageUrl}
                  alt="Personalized solar proposal card"
                  className="w-full rounded-lg"
                  style={{ aspectRatio: '16/9', objectFit: 'cover' }}
                />
              ) : (
                <div className="w-full rounded-lg flex items-center justify-center" style={{ aspectRatio: '16/9', backgroundColor: '#f0f4f2' }}>
                  <span className="material-symbols-outlined text-outline" style={{ fontSize: 32 }}>image</span>
                </div>
              )}
              {audioUrl ? (
                <audio controls src={audioUrl} className="w-full" style={{ height: 36 }} />
              ) : (
                <div className="w-full rounded flex items-center justify-center py-2" style={{ backgroundColor: '#f0f4f2' }}>
                  <span className="font-label-caps text-outline" style={{ fontSize: 9 }}>AUDIO PENDING</span>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Card header (clickable to expand reasoning) */}
      <div
        className="cursor-pointer active:scale-95 px-4 pb-4"
        style={{ paddingTop: isVoice ? 0 : '1.25rem' }}
        onClick={() => setExpanded(e => !e)}
      >
        {!isVoice && (
          <div className="flex justify-between items-start mb-4">
            <span className="font-label-caps text-outline" style={{ fontSize: 10 }}>DAY {String(touch.dayOffset).padStart(2, '0')}</span>
            <span className="material-symbols-outlined" style={{ color: accentColor, fontSize: 18 }}>{icon}</span>
          </div>
        )}
        {isVoice && (
          <div className="flex justify-between items-center mb-2">
            <span className="font-label-caps text-outline" style={{ fontSize: 10 }}>DAY {String(touch.dayOffset).padStart(2, '0')}</span>
            <span className="material-symbols-outlined" style={{ color: accentColor, fontSize: 16 }}>{icon}</span>
          </div>
        )}

        <h4 className="font-body-strong mb-1 text-on-surface" style={{ fontSize: 13 }}>
          {title}
        </h4>
        <p className="text-on-surface-variant leading-tight" style={{ fontSize: 11 }}>
          {touch.channel.replace(/_/g, ' ')}
          {touch.abVariant && <span className="ml-2 font-label-caps" style={{ fontSize: 9, color: 'var(--color-secondary)' }}>A/B</span>}
        </p>
      </div>

      {/* Expanded reasoning */}
      {expanded && (
        <div className="mt-4 pt-4" style={{ borderTop: '1px solid #E8E8E3' }}>
          {touch.reasoning && (
            <>
              <p className="font-label-caps text-outline uppercase mb-2" style={{ fontSize: 9 }}>REASONING</p>
              <p className="font-body-main text-on-surface-variant leading-relaxed" style={{ fontSize: 12 }}>
                {touch.reasoning}
              </p>
            </>
          )}
          {touch.contentBody && (
            <div className="mt-3">
              <p className="font-label-caps text-outline uppercase mb-1" style={{ fontSize: 9 }}>CONTENT</p>
              <p className="font-data-mono text-on-surface" style={{ fontSize: 11 }}>{touch.contentBody.slice(0, 200)}{touch.contentBody.length > 200 ? '…' : ''}</p>
            </div>
          )}
        </div>
      )}

      {/* Contact now button */}
      {onSendNow && (
        <div className="mt-3 pt-3" style={{ borderTop: '1px solid #E8E8E3' }}>
          <button
            onClick={e => { e.stopPropagation(); onSendNow(); }}
            className="w-full flex items-center justify-center gap-1.5 py-2 rounded-lg font-body-strong hover:opacity-90 active:scale-95 transition-all"
            style={{ backgroundColor: 'rgba(20,69,55,0.08)', color: 'var(--color-primary)', fontSize: 12 }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 14 }}>send</span>
            Contact now
          </button>
        </div>
      )}
    </div>
  );
}

// ── Main page (inner) ─────────────────────────────────────────────────────────

function SequencePlannerInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const customerId = searchParams.get('customerId') ?? '';

  const [custDetail, setCustDetail]   = useState<CustomerDetail | null>(null);
  const [strategy, setStrategy]       = useState<StrategyData | null>(null);
  const [loading, setLoading]         = useState(true);
  const [generating, setGenerating]   = useState(false);
  const [error, setError]             = useState<string | null>(null);
  const [coachingOpen, setCoachingOpen]     = useState(false);
  const [sendModalTouch, setSendModalTouch] = useState<Touch | null>(null);

  const generateStrategy = useCallback(async (custId: string) => {
    setGenerating(true);
    try {
      const res = await fetch('/api/strategy/generate', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ customerId: custId }),
      });
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      setStrategy(json.data);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setGenerating(false);
    }
  }, []);

  useEffect(() => {
    if (!customerId) { setLoading(false); return; }
    setLoading(true);
    setError(null);
    fetch(`/api/customers/${customerId}`)
      .then(r => r.json())
      .then(async (json) => {
        if (json.error) throw new Error(json.error as string);
        const d = json.data;

        setCustDetail({
          id:                        d.id,
          fname:                     d.fname,
          lname:                     d.lname,
          email:                     d.email ?? null,
          phone:                     d.phone ?? null,
          whatsappEnabled:           d.whatsappEnabled ?? false,
          consentMarketing:          d.consentMarketing ?? false,
          priceQuote:                d.priceQuote ?? null,
          archetypeFamily:           d.archetypeFamily ?? 0,
          archetypeInvestor:         d.archetypeInvestor ?? 0,
          archetypeEnvironmentalist: d.archetypeEnvironmentalist ?? 0,
          archetypeSkeptic:          d.archetypeSkeptic ?? 0,
          about:                     d.about ?? null,
          language:                  d.language ?? 'en',
        });

        const seq = d.latestSequence;
        if (seq && (seq.touchpoints ?? []).length > 0) {
          setStrategy({
            id:                  seq.id,
            ghostRiskScore:      seq.ghostRiskScore,
            closeReadinessScore: seq.closeReadinessScore,
            rationale:           seq.rationale,
            touches:             seq.touchpoints,
          });
          setLoading(false);
        } else {
          setLoading(false);
          await generateStrategy(d.id);
        }
      })
      .catch(e => {
        setError((e as Error).message);
        setLoading(false);
      });
  }, [customerId, generateStrategy]);

  const name  = custDetail ? `${custDetail.fname} ${custDetail.lname}` : '…';
  const price = custDetail?.priceQuote ? formatPrice(custDetail.priceQuote) : '—';

  const archetypeWeights = {
    family:           custDetail?.archetypeFamily ?? 0,
    investor:         custDetail?.archetypeInvestor ?? 0,
    environmentalist: custDetail?.archetypeEnvironmentalist ?? 0,
    skeptic:          custDetail?.archetypeSkeptic ?? 0,
  };

  const pioneerPct = Math.round(
    ((archetypeWeights.family + archetypeWeights.investor + archetypeWeights.environmentalist) /
    (archetypeWeights.family + archetypeWeights.investor + archetypeWeights.environmentalist + archetypeWeights.skeptic || 1)) * 100,
  );

  function handleMediaReady(touchId: string, audioUrl: string, imageUrl: string) {
    setStrategy(prev => prev ? {
      ...prev,
      touches: prev.touches.map(t =>
        t.id === touchId ? { ...t, contentAudioUrl: audioUrl, contentImageUrl: imageUrl } : t,
      ),
    } : prev);
  }

  const ghostScore = strategy?.ghostRiskScore ?? 0;
  const readyScore = strategy?.closeReadinessScore ?? 0;
  const strategyId = strategy?.id;

  const activeArchetypes: { label: string; bg: string; text: string }[] = [];
  if (archetypeWeights.family > 0.15)           activeArchetypes.push({ label: 'Family',    bg: 'rgba(20,69,55,0.1)',   text: 'var(--color-primary)' });
  if (archetypeWeights.investor > 0.15)         activeArchetypes.push({ label: 'Investor',  bg: 'rgba(34,106,80,0.1)', text: 'var(--color-secondary)' });
  if (archetypeWeights.environmentalist > 0.15) activeArchetypes.push({ label: 'Eco',       bg: 'rgba(34,106,80,0.1)', text: 'var(--color-secondary)' });
  if (archetypeWeights.skeptic > 0.15)          activeArchetypes.push({ label: 'Skeptic',   bg: 'rgba(94,49,43,0.1)',  text: 'var(--color-tertiary)' });

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
              onClick={() => customerId && router.push(`/replay?customerId=${customerId}`)}
              className="text-on-surface-variant active:scale-95 hover:opacity-80 transition-opacity"
              title="Replay timeline"
              disabled={!customerId}
            >
              <span className="material-symbols-outlined">replay</span>
            </button>
            {customerId && (
              <button
                onClick={() => setCoachingOpen(true)}
                className="px-3 py-1.5 font-body-strong rounded-sm hover:opacity-90 active:scale-95 transition-all flex items-center gap-1.5"
                style={{ border: '1px solid #0d9488', color: '#0d9488', fontSize: 13 }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: 13 }}>psychology</span>
                Coach me on this call
              </button>
            )}
            <button
              onClick={() => strategyId && router.push(`/brief?sequenceId=${strategyId}`)}
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
                    {activeArchetypes.map(a => (
                      <span
                        key={a.label}
                        className="px-2 py-1 rounded font-label-caps"
                        style={{ fontSize: 9, backgroundColor: a.bg, color: a.text }}
                      >
                        {a.label}
                      </span>
                    ))}
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
                    <TouchCard
                      key={touch.id ?? i}
                      touch={touch}
                      index={i}
                      onMediaReady={handleMediaReady}
                      onSendNow={custDetail ? () => setSendModalTouch(touch) : undefined}
                    />
                  ))}
                </div>
              ) : !customerId ? (
                <div className="p-8 rounded-xl text-center" style={{ border: '1px dashed var(--color-outline-variant)' }}>
                  <p className="font-body-main text-on-surface-variant">Select a customer from Pipeline to view their sequence.</p>
                </div>
              ) : (
                <div className="p-8 rounded-xl text-center" style={{ border: '1px dashed var(--color-outline-variant)' }}>
                  <p className="font-body-main text-on-surface-variant">No strategy yet. Use "Generate strategy" from Pipeline first.</p>
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

            {strategy?.rationale ? (
              <div className="text-on-surface-variant leading-relaxed space-y-4" style={{ fontSize: 13 }}>
                <p>{strategy.rationale}</p>
              </div>
            ) : generating ? (
              <p className="font-body-main text-on-surface-variant italic" style={{ fontSize: 13 }}>Generating rationale…</p>
            ) : (
              <p className="font-body-main text-on-surface-variant italic" style={{ fontSize: 13 }}>Generate a strategy to see reasoning here.</p>
            )}

            {/* Archetype blend chips */}
            {activeArchetypes.length > 0 && (
              <div className="pt-6" style={{ borderTop: '1px solid #E8E8E3' }}>
                <p className="font-label-caps text-outline mb-3 uppercase" style={{ fontSize: 9 }}>ARCHETYPE MATCHING</p>
                <div className="flex flex-wrap gap-2">
                  {activeArchetypes.map(a => (
                    <span
                      key={a.label}
                      className="px-2 py-1 rounded text-[11px] font-medium"
                      style={{ backgroundColor: a.bg, color: a.text }}
                    >
                      {a.label}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* About / notes */}
            {custDetail?.about && (
              <div className="pt-6" style={{ borderTop: '1px solid #E8E8E3' }}>
                <p className="font-label-caps text-outline mb-3 uppercase" style={{ fontSize: 9 }}>INSTALLER NOTES</p>
                <p className="font-body-main text-on-surface-variant leading-relaxed" style={{ fontSize: 12 }}>
                  {custDetail.about}
                </p>
              </div>
            )}
          </aside>
        </div>
      </main>

      <CoachingPanel
        open={coachingOpen}
        onClose={() => setCoachingOpen(false)}
        preselectedCustomerId={customerId || undefined}
      />

      <SendNowModal
        open={!!sendModalTouch}
        onClose={() => setSendModalTouch(null)}
        touch={sendModalTouch}
        customer={custDetail as SendNowCustomer | null}
      />
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
