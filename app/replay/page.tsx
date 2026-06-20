'use client';

import { useEffect, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { Suspense } from 'react';

interface SimulatedResponse {
  touchSequenceIndex: number;
  responseType: string;
  responseSummary: string;
  responseFullText: string | null;
  sentiment: 'positive' | 'neutral' | 'negative' | 'objection' | 'ready_to_buy';
  occurredDayOffset: number;
}

interface ReplayResult {
  simulatedResponses: SimulatedResponse[];
  predictedOutcome: 'closed_won' | 'closed_lost' | 'still_engaged_at_day_30' | 'ghosted';
  predictedCloseProbability: number;
  criticalMomentTouchIndex: number;
  criticalMomentDescription: string;
}

const SENTIMENT_STYLE: Record<string, { bg: string; text: string; label: string }> = {
  positive:     { bg: '#f0fdf4', text: '#166534', label: 'Positive' },
  neutral:      { bg: '#f8fafc', text: '#475569', label: 'Neutral'  },
  negative:     { bg: '#fef2f2', text: '#991b1b', label: 'Negative' },
  objection:    { bg: '#fff7ed', text: '#9a3412', label: 'Objection' },
  ready_to_buy: { bg: '#f0fdf4', text: '#14532d', label: 'Ready!' },
};

const OUTCOME_LABEL: Record<string, string> = {
  closed_won:             'Closed won.',
  closed_lost:            'Closed lost.',
  still_engaged_at_day_30:'Still engaged at day 30.',
  ghosted:                'Ghosted.',
};

function ReplayInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const strategyId = searchParams.get('strategyId');

  const [loading, setLoading]   = useState(false);
  const [result, setResult]     = useState<ReplayResult | null>(null);
  const [error, setError]       = useState<string | null>(null);
  const [day, setDay]           = useState(12);
  const [ran, setRan]           = useState(false);

  useEffect(() => {
    if (!strategyId || ran) return;
    setLoading(true);
    setRan(true);
    fetch('/api/strategy/replay', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ strategyId, includeCoaching: false }),
    })
      .then(r => r.json())
      .then(data => {
        if (data.error) throw new Error(data.error);
        setResult(data.simulation);
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [strategyId, ran]);

  // Responses visible up to current day
  const visibleResponses = result?.simulatedResponses.filter(r => r.occurredDayOffset <= day) ?? [];
  const maxDay = result?.simulatedResponses.reduce((m, r) => Math.max(m, r.occurredDayOffset), 30) ?? 30;

  const ghostRiskPct = result ? Math.round((1 - result.predictedCloseProbability) * 40) : 12;
  const closePct = result ? Math.round(result.predictedCloseProbability * 100) : 0;

  return (
    <div
      className="fixed inset-0 z-[100] flex flex-col overflow-hidden"
      style={{ backdropFilter: 'blur(12px)', backgroundColor: 'rgba(249,250,247,0.90)' }}
    >
      {/* Header */}
      <header className="flex justify-between items-center px-6 py-4">
        <div className="flex flex-col">
          <h1 className="font-display-md italic text-primary leading-none" style={{ fontSize: 22 }}>Replay</h1>
          <p className="font-body-main text-on-surface-variant text-sm mt-1">
            Simulated outcome for this sequence.
          </p>
        </div>
        <button
          onClick={() => router.back()}
          className="w-10 h-10 flex items-center justify-center rounded-full hover:opacity-80 active:scale-95 transition-all"
          style={{ backgroundColor: 'var(--color-surface-container)' }}
        >
          <span className="material-symbols-outlined">close</span>
        </button>
      </header>

      <main className="flex-1 relative overflow-hidden px-10 flex flex-col items-center justify-center">
        {loading ? (
          <div className="flex flex-col items-center gap-6">
            <div className="w-10 h-10 rounded-full border-2 border-primary border-t-transparent animate-spin" />
            <p className="font-display-md italic text-primary text-xl">Simulating sequence…</p>
            <p className="font-body-main text-on-surface-variant text-sm">Claude is predicting customer responses</p>
          </div>
        ) : error ? (
          <div className="text-center p-8 rounded-xl" style={{ backgroundColor: 'var(--color-error-container)' }}>
            <p className="font-body-main text-on-error-container">{error}</p>
          </div>
        ) : (
          <>
            {/* Floating response bubbles */}
            <div className="absolute inset-0 pointer-events-none">
              {visibleResponses.slice(0, 3).map((r, i) => (
                <div
                  key={r.touchSequenceIndex}
                  className="absolute bg-white p-4 rounded-lg animate-float"
                  style={{
                    border: '1px solid #E8E8E3',
                    top:  i === 0 ? '15%' : i === 1 ? '30%' : '55%',
                    left: i === 0 ? '20%' : undefined,
                    right: i === 1 ? '25%' : i === 2 ? '15%' : undefined,
                    width: i === 1 ? 288 : 256,
                    animationDelay: `${-i * 1.2}s`,
                  }}
                >
                  <div className="font-label-caps text-outline uppercase mb-2" style={{ fontSize: 9 }}>
                    DAY {r.occurredDayOffset} · {r.responseType.replace(/_/g, ' ').toUpperCase()}
                  </div>
                  <p className="font-display-md italic text-on-surface leading-tight mb-2" style={{ fontSize: 14 }}>
                    &ldquo;{r.responseSummary}&rdquo;
                  </p>
                  <div className="flex justify-end">
                    <div
                      className="px-2 py-0.5 font-label-caps rounded-full"
                      style={{
                        fontSize: 8,
                        backgroundColor: SENTIMENT_STYLE[r.sentiment]?.bg ?? '#f8fafc',
                        color: SENTIMENT_STYLE[r.sentiment]?.text ?? '#475569',
                      }}
                    >
                      {SENTIMENT_STYLE[r.sentiment]?.label ?? r.sentiment}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Stat widgets */}
            <div className="z-10 flex gap-4 mb-10">
              <div className="w-48 p-6 bg-white rounded-xl flex flex-col items-center" style={{ border: '1px solid #E8E8E3' }}>
                <span className="font-label-caps text-outline mb-2 uppercase" style={{ fontSize: 9 }}>GHOST RISK</span>
                <div className="text-3xl font-data-mono text-error">{ghostRiskPct}%</div>
                <div className="w-full h-1 mt-4 rounded-full overflow-hidden" style={{ backgroundColor: 'var(--color-surface-container-high)' }}>
                  <div className="h-full" style={{ width: `${ghostRiskPct}%`, backgroundColor: 'var(--color-error)' }} />
                </div>
              </div>
              <div className="w-48 p-6 bg-white rounded-xl flex flex-col items-center" style={{ border: '1px solid #E8E8E3' }}>
                <span className="font-label-caps text-outline mb-2 uppercase" style={{ fontSize: 9 }}>ENGAGEMENT QUALITY</span>
                <div className="text-3xl font-data-mono text-secondary">
                  {visibleResponses.filter(r => r.sentiment === 'positive' || r.sentiment === 'ready_to_buy').length > 1 ? 'High' : 'Mid'}
                </div>
                <div className="flex gap-1 mt-4">
                  {[0, 1, 2, 3].map(i => (
                    <div
                      key={i}
                      className="w-2 h-2 rounded-full"
                      style={{ backgroundColor: i < visibleResponses.filter(r => r.sentiment === 'positive').length ? 'var(--color-secondary)' : 'rgba(34,106,80,0.2)' }}
                    />
                  ))}
                </div>
              </div>
            </div>

            {/* Day scrubber */}
            <div className="w-full max-w-4xl px-10 mt-10">
              <div className="relative py-10">
                <div className="flex justify-between mb-4 font-data-mono text-outline" style={{ fontSize: 10 }}>
                  <span>0</span><span>10</span><span>20</span><span>30</span>
                </div>
                <div className="h-0.5 w-full relative rounded-full" style={{ backgroundColor: '#E8E8E3' }}>
                  <div
                    className="absolute h-full rounded-full"
                    style={{ width: `${(day / 30) * 100}%`, backgroundColor: 'rgba(46,93,78,0.2)' }}
                  />
                  <input
                    type="range" min="0" max="30" value={day}
                    onChange={(e) => setDay(Number(e.target.value))}
                    className="absolute top-1/2 -translate-y-1/2 w-full opacity-0 cursor-pointer z-20"
                  />
                  <div
                    className="absolute top-1/2 -translate-y-1/2 flex flex-col items-center"
                    style={{ left: `${(day / 30) * 100}%`, transform: 'translate(-50%, -50%)', transition: 'left 0.1s' }}
                  >
                    <div className="mb-2 px-2 py-1 font-data-mono rounded-sm text-white" style={{ fontSize: 10, backgroundColor: 'var(--color-primary)' }}>
                      DAY {day}
                    </div>
                    <div className="w-4 h-4 rounded-full border-2 border-white shadow-sm" style={{ backgroundColor: 'var(--color-primary)' }} />
                  </div>
                </div>
              </div>
            </div>

            {/* Predicted outcome panel */}
            {result && (
              <div
                className="w-full max-w-md bg-white rounded-t-xl p-8 mt-auto shadow-sm"
                style={{ border: '1px solid #E8E8E3', borderTop: '2px solid var(--color-primary-container)' }}
              >
                <div className="flex justify-between items-end mb-6">
                  <div className="flex flex-col">
                    <span className="font-label-caps text-outline uppercase mb-1" style={{ fontSize: 9 }}>PROJECTED OUTCOME</span>
                    <h2 className="font-display-md text-3xl italic text-primary leading-tight">
                      {OUTCOME_LABEL[result.predictedOutcome] ?? result.predictedOutcome}
                    </h2>
                  </div>
                  <div className="text-right">
                    <span className="font-data-mono text-2xl text-on-surface">{closePct}%</span>
                    <p className="font-label-caps text-outline uppercase" style={{ fontSize: 8 }}>PROBABILITY</p>
                  </div>
                </div>
                {result.criticalMomentDescription && (
                  <p className="font-body-main text-on-surface-variant mb-6" style={{ fontSize: 13 }}>
                    <span className="font-body-strong text-primary">Key moment: </span>{result.criticalMomentDescription}
                  </p>
                )}
                <div className="flex flex-col gap-3">
                  <button
                    className="w-full py-4 font-body-strong rounded-sm hover:opacity-90 active:scale-95 transition-all"
                    style={{ backgroundColor: 'var(--color-primary-container)', color: 'white' }}
                  >
                    Generate coaching note
                  </button>
                  <button
                    className="w-full py-4 font-body-strong rounded-sm hover:opacity-90 active:scale-95 transition-all"
                    style={{ border: '1px solid #E8E8E3', color: 'var(--color-on-surface)' }}
                  >
                    What if she ghosts…?
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}

export default function ReplayPage() {
  return (
    <Suspense fallback={
      <div className="fixed inset-0 flex items-center justify-center" style={{ backgroundColor: 'rgba(249,250,247,0.9)' }}>
        <p className="font-body-main text-on-surface-variant">Loading replay…</p>
      </div>
    }>
      <ReplayInner />
    </Suspense>
  );
}
