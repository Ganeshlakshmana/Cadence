'use client';

import { useEffect, useState, useRef } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { Suspense } from 'react';

// ── Types ─────────────────────────────────────────────────────────────────────

interface Customer {
  id: string;
  fname: string;
  lname: string;
  email: string;
  language: string | null;
  archetypeFamily: number | null;
  archetypeInvestor: number | null;
  archetypeEnvironmentalist: number | null;
  archetypeSkeptic: number | null;
}

interface Sequence {
  id: string;
  status: string;
  ghost_risk_score: number | null;
  close_readiness_score: number | null;
  current_day: number | null;
  total_days: number | null;
}

interface Touchpoint {
  id: string;
  dayOffset: number;
  channel: string;
  contentSubject: string | null;
  contentBody: string | null;
  reasoning: string | null;
  status: string;
}

interface CustomerResponse {
  id: string;
  touchpointId: string | null;
  channel: string | null;
  responseText: string | null;
  sentiment: string;
  actionTaken: string | null;
  respondedAt: number | null;
}

interface SimulatedResponse {
  touchSequenceIndex: number;
  responseType: string;
  responseSummary: string;
  responseFullText: string | null;
  sentiment: string;
  occurredDayOffset: number;
}

interface CoachingNote {
  whatWorked: string;
  whatToTryNext: string;
  oneQuestionToAsk: string;
  overallReadiness: 'close_today' | 'one_more_touch' | 'needs_rescue' | 'likely_lost';
}

// ── Constants ──────────────────────────────────────────────────────────────────

const SENTIMENT: Record<string, { bg: string; border: string; text: string; label: string; icon: string }> = {
  positive:    { bg: '#f0fdf4', border: '#86efac', text: '#166534', label: 'Positive',    icon: 'thumb_up' },
  neutral:     { bg: '#f8fafc', border: '#e2e8f0', text: '#475569', label: 'Neutral',     icon: 'remove' },
  negative:    { bg: '#fef2f2', border: '#fca5a5', text: '#991b1b', label: 'Negative',    icon: 'thumb_down' },
  no_response: { bg: '#f9fafb', border: '#e5e7eb', text: '#6b7280', label: 'No response', icon: 'notifications_off' },
};

const CHANNEL_ICON: Record<string, string> = {
  email:          'email',
  sms:            'sms',
  whatsapp_text:  'chat_bubble',
  whatsapp_voice: 'phone_in_talk',
  phone_call:     'call',
  call:           'call',
  voice_note:     'mic',
  postcard:       'mail',
  video:          'videocam',
  microsite:      'language',
  linkedin:       'person',
  in_person:      'handshake',
};

const READINESS: Record<string, { label: string; color: string }> = {
  close_today:    { label: 'Close today',    color: '#166534' },
  one_more_touch: { label: 'One more touch', color: '#92400e' },
  needs_rescue:   { label: 'Needs rescue',   color: '#991b1b' },
  likely_lost:    { label: 'Likely lost',    color: '#7f1d1d' },
};

// ── Helpers ────────────────────────────────────────────────────────────────────

function fmtDate(ts: number | null) {
  if (!ts) return null;
  return new Date(ts * 1000).toLocaleDateString('en', { month: 'short', day: 'numeric' });
}

function xPos(dayOffset: number) {
  return `calc(5% + ${(dayOffset / 30) * 90}%)`;
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function TouchChip({ touch, responded }: { touch: Touchpoint; responded: boolean }) {
  const icon = CHANNEL_ICON[touch.channel] ?? 'notifications';
  return (
    <div
      className="flex flex-col items-center gap-1"
      title={`Day ${touch.dayOffset}: ${touch.channel}${touch.contentSubject ? ` — ${touch.contentSubject}` : ''}`}
    >
      <div
        className="w-9 h-9 rounded-full flex items-center justify-center border-2"
        style={{
          backgroundColor: responded ? '#f0fdf4' : 'var(--color-primary-container)',
          borderColor:     responded ? '#86efac' : 'var(--color-primary)',
        }}
      >
        <span
          className="material-symbols-outlined"
          style={{ fontSize: 16, color: responded ? '#166534' : 'var(--color-primary)' }}
        >
          {icon}
        </span>
      </div>
      <span className="font-data-mono" style={{ fontSize: 8, color: 'var(--color-outline)' }}>
        D{touch.dayOffset}
      </span>
    </div>
  );
}

function ResponseCard({
  sentiment,
  text,
  respondedAt,
  isAi = false,
}: {
  sentiment: string;
  text: string;
  respondedAt?: number | null;
  isAi?: boolean;
}) {
  const s = SENTIMENT[sentiment] ?? SENTIMENT.neutral;
  return (
    <div
      className="rounded-lg p-2.5 text-left"
      style={{ backgroundColor: s.bg, border: `1px solid ${s.border}`, minWidth: 130, maxWidth: 170 }}
    >
      {isAi && (
        <div className="font-label-caps mb-1" style={{ fontSize: 8, color: s.text, opacity: 0.7 }}>
          🤖 AI prediction
        </div>
      )}
      <p className="font-body-main leading-snug" style={{ fontSize: 11, color: s.text }}>
        &ldquo;{text.slice(0, 90)}{text.length > 90 ? '…' : ''}&rdquo;
      </p>
      <div className="flex items-center gap-1 mt-1.5">
        <span className="material-symbols-outlined" style={{ fontSize: 10, color: s.text }}>{s.icon}</span>
        <span className="font-label-caps uppercase" style={{ fontSize: 8, color: s.text }}>{s.label}</span>
        {!isAi && respondedAt && (
          <span className="font-data-mono ml-auto" style={{ fontSize: 8, color: 'var(--color-outline)' }}>
            {fmtDate(respondedAt)}
          </span>
        )}
      </div>
    </div>
  );
}

// ── Main inner component ────────────────────────────────────────────────────────

function ReplayInner() {
  const router      = useRouter();
  const searchParams = useSearchParams();
  const customerId   = searchParams.get('customerId');

  const [customer,  setCustomer]  = useState<Customer | null>(null);
  const [sequence,  setSequence]  = useState<Sequence | null>(null);
  const [touches,   setTouches]   = useState<Touchpoint[]>([]);
  const [responses, setResponses] = useState<CustomerResponse[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [error,     setError]     = useState<string | null>(null);

  const [simResponses,      setSimResponses]      = useState<SimulatedResponse[]>([]);
  const [simulationLoading, setSimulationLoading] = useState(false);
  const [shownPredictions,  setShownPredictions]  = useState<Set<string>>(new Set());

  const [rescueLoading,   setRescueLoading]   = useState(false);
  const [rescueRationale, setRescueRationale] = useState<string | null>(null);

  const [coaching,        setCoaching]        = useState<CoachingNote | null>(null);
  const [coachingLoading, setCoachingLoading] = useState(false);

  const [logOpen,       setLogOpen]       = useState(false);
  const [logTouchId,    setLogTouchId]    = useState('');
  const [logText,       setLogText]       = useState('');
  const [logSentiment,  setLogSentiment]  = useState('neutral');
  const [logSubmitting, setLogSubmitting] = useState(false);
  const [logError,      setLogError]      = useState<string | null>(null);

  const logTouchIdRef = useRef(logTouchId);
  logTouchIdRef.current = logTouchId;

  // ── Data fetching ──────────────────────────────────────────────────────────

  useEffect(() => {
    if (!customerId) return;
    setLoading(true);
    fetch(`/api/customers/${customerId}/responses?format=timeline`)
      .then(r => r.json())
      .then(data => {
        if (data.error) throw new Error(data.error as string);
        const d = data.data;
        setCustomer(d.customer);
        setSequence(d.latestSequence);
        setTouches(d.touchpoints ?? []);
        setResponses(d.responses ?? []);
        if ((d.touchpoints ?? []).length > 0 && !logTouchIdRef.current) {
          setLogTouchId((d.touchpoints as Touchpoint[])[0].id);
        }
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, [customerId]);

  async function refreshData() {
    if (!customerId) return;
    try {
      const data = await fetch(`/api/customers/${customerId}/responses?format=timeline`).then(r => r.json());
      if (!data.error) {
        setTouches(data.data.touchpoints ?? []);
        setResponses(data.data.responses ?? []);
        setSequence(data.data.latestSequence);
      }
    } catch (_) { /* silent */ }
  }

  // ── Derived maps ───────────────────────────────────────────────────────────

  const responseByTouch = new Map<string, CustomerResponse>();
  for (const r of responses) {
    if (r.touchpointId && !responseByTouch.has(r.touchpointId)) {
      responseByTouch.set(r.touchpointId, r);
    }
  }

  const simByIndex = new Map<number, SimulatedResponse>();
  for (const s of simResponses) {
    simByIndex.set(s.touchSequenceIndex, s);
  }

  const ghostRisk = sequence?.ghost_risk_score ?? 0;

  // ── Actions ────────────────────────────────────────────────────────────────

  async function fetchPrediction(touchId: string, touchIdx: number) {
    setShownPredictions(prev => new Set(prev).add(touchId));
    if (simResponses.length > 0) return;
    if (!sequence) return;
    setSimulationLoading(true);
    try {
      const res = await fetch('/api/strategy/replay', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ sequenceId: sequence.id, includeCoaching: false }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error as string);
      setSimResponses((data.simulation as { simulatedResponses: SimulatedResponse[] })?.simulatedResponses ?? []);
    } catch (err) {
      console.error('Prediction failed:', err);
    } finally {
      setSimulationLoading(false);
    }
  }

  async function generateRescueTouch() {
    if (!customerId || !sequence) return;
    setRescueLoading(true);
    setRescueRationale(null);
    try {
      const res = await fetch('/api/touch/rescue', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ customer_id: customerId, sequence_id: sequence.id }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error as string);
      setRescueRationale((data.data as { rationale: string }).rationale);
      await refreshData();
    } catch (err) {
      console.error('Rescue touch failed:', err);
    } finally {
      setRescueLoading(false);
    }
  }

  async function fetchCoaching() {
    if (!sequence) return;
    setCoachingLoading(true);
    try {
      const res = await fetch('/api/strategy/replay', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ sequenceId: sequence.id, includeCoaching: true }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error as string);
      if (data.coaching) setCoaching(data.coaching as CoachingNote);
    } catch (err) {
      console.error('Coaching failed:', err);
    } finally {
      setCoachingLoading(false);
    }
  }

  async function submitLog() {
    if (!logTouchId || !logText.trim()) return;
    setLogSubmitting(true);
    setLogError(null);
    try {
      const res = await fetch('/api/responses', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          touchpoint_id: logTouchId,
          response_text: logText,
          sentiment:     logSentiment,
        }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error as string);
      setLogText('');
      setLogOpen(false);
      await refreshData();
    } catch (e: unknown) {
      setLogError(e instanceof Error ? e.message : String(e));
    } finally {
      setLogSubmitting(false);
    }
  }

  // ── Guard: no customer ─────────────────────────────────────────────────────

  if (!customerId) {
    return (
      <div className="fixed inset-0 flex items-center justify-center" style={{ backgroundColor: 'rgba(249,250,247,0.95)' }}>
        <p className="font-body-main text-on-surface-variant">No customer selected.</p>
      </div>
    );
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div
      className="fixed inset-0 z-[100] flex flex-col"
      style={{ backdropFilter: 'blur(12px)', backgroundColor: 'rgba(249,250,247,0.95)' }}
    >
      {/* Header */}
      <header
        className="shrink-0 flex justify-between items-center px-6 py-4"
        style={{ borderBottom: '1px solid var(--color-outline-variant)' }}
      >
        <div>
          <h1 className="font-display-md italic text-primary leading-none" style={{ fontSize: 22 }}>
            {customer ? `${customer.fname} ${customer.lname}` : 'Timeline'}
          </h1>
          <p className="font-body-main text-on-surface-variant text-sm mt-0.5">
            {sequence
              ? `Sequence active · Day ${sequence.current_day ?? 0} of ${sequence.total_days ?? 30}`
              : 'No active sequence'}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {responses.length > 0 && !coaching && (
            <button
              onClick={fetchCoaching}
              disabled={coachingLoading}
              className="flex items-center gap-2 px-4 py-2 font-body-strong rounded-sm hover:opacity-90 transition-all"
              style={{ border: '1px solid var(--color-outline-variant)', color: 'var(--color-primary)', fontSize: 13 }}
            >
              {coachingLoading
                ? <span className="material-symbols-outlined animate-spin" style={{ fontSize: 14 }}>progress_activity</span>
                : <span className="material-symbols-outlined" style={{ fontSize: 14 }}>tips_and_updates</span>}
              Coaching insights
            </button>
          )}
          <button
            onClick={() => router.back()}
            className="w-10 h-10 flex items-center justify-center rounded-full hover:opacity-80 transition-all"
            style={{ backgroundColor: 'var(--color-surface-container)' }}
          >
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>
      </header>

      {/* Scrollable body */}
      <div className="flex-1 overflow-y-auto">

        {/* Ghost risk banner */}
        {!loading && ghostRisk > 0.6 && (
          <div
            className="mx-6 mt-4 px-5 py-3 rounded-xl flex items-center justify-between gap-4"
            style={{ backgroundColor: 'var(--color-error-container)', border: '1px solid rgba(186,26,26,0.2)' }}
          >
            <div className="flex items-center gap-3 min-w-0">
              <span className="material-symbols-outlined shrink-0" style={{ color: 'var(--color-error)', fontSize: 20 }}>warning</span>
              <div className="min-w-0">
                <p className="font-body-strong" style={{ color: 'var(--color-on-error-container)', fontSize: 13 }}>
                  ⚠️ High ghost risk detected — consider a rescue touch
                  <span className="font-data-mono ml-2" style={{ fontSize: 11, opacity: 0.7 }}>
                    ({Math.round(ghostRisk * 100)}%)
                  </span>
                </p>
                {rescueRationale && (
                  <p className="font-body-main mt-0.5 truncate" style={{ color: 'var(--color-on-error-container)', fontSize: 11 }}>
                    {rescueRationale}
                  </p>
                )}
              </div>
            </div>
            <button
              onClick={generateRescueTouch}
              disabled={rescueLoading || !!rescueRationale}
              className="shrink-0 flex items-center gap-2 px-4 py-2 font-body-strong rounded-sm hover:opacity-90 transition-all"
              style={{
                backgroundColor: 'var(--color-error)',
                color:           'white',
                fontSize:        12,
                opacity:         rescueRationale ? 0.6 : 1,
              }}
            >
              {rescueLoading
                ? <span className="material-symbols-outlined animate-spin" style={{ fontSize: 14 }}>progress_activity</span>
                : <span className="material-symbols-outlined" style={{ fontSize: 14 }}>
                    {rescueRationale ? 'check' : 'add'}
                  </span>}
              {rescueRationale ? 'Rescue added' : 'Generate rescue touch'}
            </button>
          </div>
        )}

        {/* Content */}
        {loading ? (
          <div className="flex flex-col items-center gap-6 mt-24">
            <div className="w-10 h-10 rounded-full border-2 border-primary border-t-transparent animate-spin" />
            <p className="font-display-md italic text-primary text-xl">Loading timeline…</p>
          </div>
        ) : error ? (
          <div className="m-6 p-6 rounded-xl text-center" style={{ backgroundColor: 'var(--color-error-container)' }}>
            <p className="font-body-main" style={{ color: 'var(--color-on-error-container)' }}>{error}</p>
          </div>
        ) : !sequence ? (
          <div className="flex flex-col items-center gap-4 mt-24">
            <span className="material-symbols-outlined text-outline" style={{ fontSize: 48 }}>timeline</span>
            <p className="font-body-main text-on-surface-variant">No sequence yet — generate one from the Pipeline.</p>
          </div>
        ) : (
          <div className="px-6 pb-10 pt-6 space-y-6">

            {/* ── Dual-track timeline ──────────────────────────────────────── */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="font-label-caps text-on-surface-variant uppercase" style={{ fontSize: 10 }}>
                  Sequence timeline
                </span>
                <span className="font-data-mono text-outline" style={{ fontSize: 10 }}>
                  {touches.length} touches · {responses.length} responses logged
                </span>
              </div>

              <div
                className="rounded-xl overflow-hidden"
                style={{ border: '1px solid var(--color-outline-variant)', backgroundColor: 'white' }}
              >
                <div className="overflow-x-auto">
                  {/* Fixed-width inner so touches have room; 120px per touch, min 700 */}
                  <div
                    className="relative"
                    style={{ minWidth: Math.max(touches.length * 120, 700), height: 240 }}
                  >
                    {/* Day labels */}
                    {[0, 5, 10, 15, 20, 25, 30].map(d => (
                      <div
                        key={d}
                        className="absolute font-data-mono"
                        style={{ fontSize: 8, color: 'var(--color-outline)', bottom: 8, left: xPos(d), transform: 'translateX(-50%)' }}
                      >
                        {d}
                      </div>
                    ))}

                    {/* Horizontal rail */}
                    <div
                      className="absolute"
                      style={{ left: '5%', right: '5%', top: 96, height: 1, backgroundColor: 'var(--color-outline-variant)' }}
                    />

                    {/* Per-touchpoint rows */}
                    {touches.map((touch, idx) => {
                      const x        = xPos(touch.dayOffset);
                      const response = responseByTouch.get(touch.id);
                      const sim      = simByIndex.get(idx + 1);
                      const showing  = shownPredictions.has(touch.id) && !response;

                      return (
                        <div key={touch.id}>
                          {/* Touch chip — top track */}
                          <div className="absolute" style={{ left: x, top: 44, transform: 'translateX(-50%)' }}>
                            <TouchChip touch={touch} responded={!!response} />
                          </div>

                          {/* Connector line */}
                          {(response || showing) && (
                            <div
                              className="absolute"
                              style={{
                                left:            x,
                                top:             97,
                                width:           1,
                                height:          22,
                                backgroundColor: response
                                  ? (SENTIMENT[response.sentiment]?.border ?? '#e2e8f0')
                                  : 'var(--color-outline-variant)',
                                transform: 'translateX(-50%)',
                              }}
                            />
                          )}

                          {/* Bottom track */}
                          <div className="absolute" style={{ left: x, top: 120, transform: 'translateX(-50%)' }}>
                            {response ? (
                              <ResponseCard
                                sentiment={response.sentiment}
                                text={response.responseText ?? '—'}
                                respondedAt={response.respondedAt}
                              />
                            ) : showing && sim ? (
                              <ResponseCard
                                sentiment={sim.sentiment}
                                text={sim.responseSummary}
                                isAi
                              />
                            ) : showing && simulationLoading ? (
                              <div
                                className="flex items-center gap-1.5 px-3 py-2 rounded-lg"
                                style={{ backgroundColor: 'var(--color-surface-container-low)' }}
                              >
                                <span
                                  className="material-symbols-outlined animate-spin"
                                  style={{ fontSize: 13, color: 'var(--color-outline)' }}
                                >
                                  progress_activity
                                </span>
                                <span className="font-label-caps text-outline" style={{ fontSize: 9 }}>Thinking…</span>
                              </div>
                            ) : (
                              <button
                                onClick={() => fetchPrediction(touch.id, idx + 1)}
                                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg hover:opacity-80 transition-opacity"
                                style={{
                                  backgroundColor: 'var(--color-surface-container-low)',
                                  border:          '1px dashed var(--color-outline-variant)',
                                }}
                              >
                                <span className="material-symbols-outlined" style={{ fontSize: 12, color: 'var(--color-outline)' }}>psychology</span>
                                <span className="font-label-caps text-outline" style={{ fontSize: 9 }}>What might happen?</span>
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Legend */}
                <div
                  className="flex flex-wrap items-center gap-4 px-6 py-3"
                  style={{ borderTop: '1px solid var(--color-outline-variant)', backgroundColor: 'var(--color-surface-container-lowest)' }}
                >
                  <div className="flex items-center gap-1.5">
                    <div className="w-3 h-3 rounded-full border-2" style={{ borderColor: 'var(--color-primary)', backgroundColor: 'var(--color-primary-container)' }} />
                    <span className="font-label-caps text-outline" style={{ fontSize: 9 }}>Pending touch</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <div className="w-3 h-3 rounded-full border-2" style={{ borderColor: '#86efac', backgroundColor: '#f0fdf4' }} />
                    <span className="font-label-caps" style={{ fontSize: 9, color: '#166534' }}>Has response</span>
                  </div>
                  {Object.entries(SENTIMENT).map(([k, v]) => (
                    <div key={k} className="flex items-center gap-1.5">
                      <div className="w-3 h-3 rounded" style={{ backgroundColor: v.bg, border: `1px solid ${v.border}` }} />
                      <span className="font-label-caps" style={{ fontSize: 9, color: v.text }}>{v.label}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* ── Coaching panel ───────────────────────────────────────────── */}
            {coaching && (
              <div
                className="rounded-xl p-6"
                style={{ border: '1px solid var(--color-outline-variant)', backgroundColor: 'white' }}
              >
                <div className="flex items-center gap-2 mb-4">
                  <span className="material-symbols-outlined" style={{ fontSize: 18, color: 'var(--color-primary)' }}>tips_and_updates</span>
                  <span className="font-body-strong text-primary" style={{ fontSize: 14 }}>Coaching insights</span>
                  <span
                    className="ml-auto px-2 py-0.5 font-label-caps rounded-full"
                    style={{
                      fontSize:        9,
                      backgroundColor: '#f0fdf4',
                      color:           READINESS[coaching.overallReadiness]?.color ?? '#166534',
                      border:          `1px solid ${READINESS[coaching.overallReadiness]?.color ?? '#86efac'}`,
                    }}
                  >
                    {READINESS[coaching.overallReadiness]?.label ?? coaching.overallReadiness}
                  </span>
                </div>
                <div className="grid gap-4">
                  {[
                    { icon: 'check_circle', label: "What's working", text: coaching.whatWorked,        color: '#166534' },
                    { icon: 'lightbulb',    label: 'Try next',       text: coaching.whatToTryNext,     color: '#92400e' },
                    { icon: 'help',         label: 'Ask them',       text: coaching.oneQuestionToAsk,  color: 'var(--color-primary)' },
                  ].map(item => (
                    <div key={item.label} className="flex items-start gap-3">
                      <span className="material-symbols-outlined shrink-0 mt-0.5" style={{ fontSize: 16, color: item.color }}>
                        {item.icon}
                      </span>
                      <div>
                        <p className="font-label-caps uppercase mb-0.5" style={{ fontSize: 9, color: 'var(--color-outline)' }}>
                          {item.label}
                        </p>
                        <p className="font-body-main" style={{ fontSize: 13, color: 'var(--color-on-surface)' }}>
                          {item.text}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ── Log response form ────────────────────────────────────────── */}
            <div
              className="rounded-xl overflow-hidden"
              style={{ border: '1px solid var(--color-outline-variant)', backgroundColor: 'white' }}
            >
              <button
                onClick={() => setLogOpen(v => !v)}
                className="w-full flex items-center justify-between px-6 py-4 hover:bg-surface-container-lowest transition-colors"
              >
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined" style={{ fontSize: 18, color: 'var(--color-primary)' }}>add_comment</span>
                  <span className="font-body-strong text-on-surface" style={{ fontSize: 14 }}>Log today&apos;s response</span>
                </div>
                <span className="material-symbols-outlined text-outline" style={{ fontSize: 18 }}>
                  {logOpen ? 'expand_less' : 'expand_more'}
                </span>
              </button>

              {logOpen && (
                <div
                  className="px-6 pb-6 pt-4 flex flex-col gap-4"
                  style={{ borderTop: '1px solid var(--color-outline-variant)' }}
                >
                  {/* Touchpoint selector */}
                  <div>
                    <label className="font-label-caps text-on-surface-variant uppercase block mb-1.5" style={{ fontSize: 10 }}>
                      Touchpoint
                    </label>
                    <select
                      value={logTouchId}
                      onChange={e => setLogTouchId(e.target.value)}
                      className="w-full px-3 py-2 rounded-sm font-body-main text-on-surface"
                      style={{ fontSize: 13, border: '1px solid var(--color-outline-variant)', backgroundColor: 'white', outline: 'none' }}
                    >
                      {touches.map(t => (
                        <option key={t.id} value={t.id}>
                          Day {t.dayOffset} · {t.channel}{t.contentSubject ? ` — ${t.contentSubject}` : ''}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Response text */}
                  <div>
                    <label className="font-label-caps text-on-surface-variant uppercase block mb-1.5" style={{ fontSize: 10 }}>
                      What did they say / do?
                    </label>
                    <textarea
                      value={logText}
                      onChange={e => setLogText(e.target.value)}
                      rows={3}
                      placeholder="e.g. They replied asking about the warranty period…"
                      className="w-full px-3 py-2 rounded-sm font-body-main text-on-surface resize-none"
                      style={{ fontSize: 13, border: '1px solid var(--color-outline-variant)', backgroundColor: 'white', outline: 'none' }}
                    />
                  </div>

                  {/* Sentiment picker */}
                  <div>
                    <label className="font-label-caps text-on-surface-variant uppercase block mb-1.5" style={{ fontSize: 10 }}>
                      Sentiment
                    </label>
                    <div className="flex flex-wrap gap-2">
                      {Object.entries(SENTIMENT).map(([val, s]) => (
                        <button
                          key={val}
                          type="button"
                          onClick={() => setLogSentiment(val)}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-all"
                          style={{
                            backgroundColor: logSentiment === val ? s.bg                            : 'var(--color-surface-container-low)',
                            border:          `1px solid ${logSentiment === val ? s.border           : 'var(--color-outline-variant)'}`,
                            color:           logSentiment === val ? s.text                          : 'var(--color-outline)',
                          }}
                        >
                          <span className="material-symbols-outlined" style={{ fontSize: 14 }}>{s.icon}</span>
                          <span className="font-label-caps" style={{ fontSize: 10 }}>{s.label}</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  {logError && (
                    <p className="font-body-main" style={{ fontSize: 12, color: 'var(--color-error)' }}>{logError}</p>
                  )}

                  <div className="flex justify-end">
                    <button
                      onClick={submitLog}
                      disabled={logSubmitting || !logText.trim()}
                      className="flex items-center gap-2 px-6 py-2.5 font-body-strong rounded-sm hover:opacity-90 active:scale-95 transition-all"
                      style={{
                        backgroundColor: 'var(--color-primary)',
                        color:           'var(--color-on-primary)',
                        fontSize:        13,
                        opacity:         logSubmitting || !logText.trim() ? 0.6 : 1,
                      }}
                    >
                      {logSubmitting && (
                        <span className="material-symbols-outlined animate-spin" style={{ fontSize: 14 }}>progress_activity</span>
                      )}
                      Log response
                    </button>
                  </div>
                </div>
              )}
            </div>

          </div>
        )}
      </div>
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
