'use client';

import { useEffect, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { Suspense } from 'react';
import SideNav from '@/app/components/SideNav';
import GlobalFooter from '@/app/components/GlobalFooter';

interface OnePager {
  dealHeader: string;
  myRead: string;
  myPlan: string;
  risksAndMitigations: { risk: string; mitigation: string }[];
  whereIneedHelp: string;
  closeTargetDate: string;
  expectedOutcome: string;
}

interface BriefData {
  strategyId: string;
  generatedAt: string;
  installerName: string;
  customer: { firstName: string; lastName: string; city: string; countryCode: string };
  quote: { totalPrice: number; currency: string; paybackPeriodYears: number; annualRoiPct: number };
  archetypeBlend: { family: number; investor: number; environmentalist: number; skeptic: number };
  scores: { ghostRisk: number; closeReadiness: number };
  onePager: OnePager;
  touchSummary: { dayOffset: number; channel: string; objective: string | null }[];
}

function TOUCH_ICON(channel: string): string {
  const map: Record<string, string> = {
    email: 'mail', call: 'call', sms: 'sms', whatsapp_text: 'chat',
    linkedin: 'link', video: 'videocam', microsite: 'article', in_person: 'handshake',
  };
  return map[channel] ?? 'notifications';
}

function BriefInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const strategyId = searchParams.get('strategyId');

  const [loading, setLoading] = useState(false);
  const [data, setData]       = useState<BriefData | null>(null);
  const [error, setError]     = useState<string | null>(null);

  useEffect(() => {
    if (!strategyId) return;
    setLoading(true);
    fetch('/api/export/manager-pdf', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ strategyId, installerName: 'Cadence Rep' }),
    })
      .then(r => r.json())
      .then(d => {
        if (d.error) throw new Error(d.error);
        setData(d);
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [strategyId]);

  const today = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }).toUpperCase();
  const refCode = data
    ? `${data.customer.countryCode}-${Date.now().toString(36).toUpperCase().slice(-4)}-${data.customer.lastName?.toUpperCase().slice(0, 6)}`
    : '—';

  const fullName = data ? `${data.customer.firstName} ${data.customer.lastName}` : '—';
  const price = data
    ? new Intl.NumberFormat('de-DE', { style: 'currency', currency: data.quote.currency, minimumFractionDigits: 0 }).format(data.quote.totalPrice)
    : '—';

  // Derive archetype chips
  const chips: { label: string; bg: string; text: string; border: string }[] = [];
  if (data) {
    const b = data.archetypeBlend;
    if (b.family > 0.2)          chips.push({ label: 'Family',      bg: 'rgba(20,69,55,0.1)',   text: 'var(--color-primary)',   border: 'rgba(20,69,55,0.1)' });
    if (b.investor > 0.2)        chips.push({ label: 'Investor',    bg: 'rgba(34,106,80,0.15)', text: 'var(--color-secondary)', border: 'rgba(34,106,80,0.1)' });
    if (b.environmentalist > 0.2) chips.push({ label: 'Eco-focus',  bg: 'rgba(34,106,80,0.15)', text: 'var(--color-secondary)', border: 'rgba(34,106,80,0.1)' });
    if (b.skeptic > 0.15)        chips.push({ label: 'Skeptic',     bg: 'rgba(94,49,43,0.1)',   text: 'var(--color-tertiary)',  border: 'rgba(94,49,43,0.1)' });
  }

  return (
    <div className="flex min-h-screen" style={{ backgroundColor: 'var(--color-background)' }}>
      <SideNav />
      <main className="ml-64 flex-1 p-10 flex flex-col items-center">
        {/* Controls (no-print) */}
        <div className="w-full max-w-[210mm] flex justify-between items-end mb-8 no-print">
          <div>
            <h2 className="font-headline-section text-2xl font-semibold">Preview Deal Brief</h2>
            <p className="text-on-surface-variant font-body-main mt-1">Review the generated summary before exporting to PDF.</p>
          </div>
          <div className="flex gap-4">
            <button
              onClick={() => router.back()}
              className="px-4 py-2 rounded-sm font-body-strong hover:opacity-90 active:scale-95 transition-all"
              style={{ border: '1px solid var(--color-outline-variant)', color: 'var(--color-on-surface)' }}
            >
              Edit before sending
            </button>
            <button
              className="px-4 py-2 rounded-sm font-body-strong flex items-center gap-2 hover:opacity-90 active:scale-95 transition-all"
              style={{ backgroundColor: 'var(--color-primary)', color: 'white' }}
              onClick={() => window.print()}
            >
              <span className="material-symbols-outlined" style={{ fontSize: 18 }}>download</span>
              Download PDF
            </button>
          </div>
        </div>

        {loading ? (
          <div className="flex flex-col items-center gap-6 py-24">
            <div className="w-8 h-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
            <p className="font-display-md italic text-primary text-xl">Generating brief…</p>
          </div>
        ) : error ? (
          <div className="w-full max-w-[210mm] p-8 rounded-xl text-center" style={{ backgroundColor: 'var(--color-error-container)' }}>
            <p className="font-body-main text-on-error-container">{error}</p>
            <p className="font-body-main text-on-error-container text-sm mt-2">Make sure a strategy has been generated for this customer first.</p>
          </div>
        ) : !strategyId ? (
          <div className="w-full max-w-[210mm] p-8 rounded-xl text-center" style={{ border: '1px dashed var(--color-outline-variant)' }}>
            <p className="font-body-main text-on-surface-variant">No strategy selected. Go to Sequence Planner and generate a strategy first.</p>
          </div>
        ) : (
          /* A4 document */
          <article
            className="a4-container bg-white flex flex-col relative overflow-hidden"
            style={{
              boxShadow: '0 1px 2px rgba(20,24,32,0.04)',
              border: '1px solid #E8E8E3',
              padding: '4rem',
            }}
          >
            {/* Document header */}
            <header className="flex justify-between items-start pb-8 mb-10" style={{ borderBottom: '1px solid #E8E8E3' }}>
              <div>
                <span className="font-wordmark text-3xl italic text-primary leading-none">Cadence</span>
              </div>
              <div className="text-right">
                <span className="font-label-caps text-outline block mb-1" style={{ fontSize: 10 }}>
                  DEAL BRIEF · {today}
                </span>
                <span className="font-data-mono text-outline-variant" style={{ fontSize: 9 }}>REF: {refCode}</span>
              </div>
            </header>

            {/* Deal header */}
            <section className="mb-10">
              <div className="flex justify-between items-end">
                <div>
                  <h1 className="font-display-lg text-4xl italic text-primary mb-2">{fullName}</h1>
                  <div
                    className="flex items-center gap-4 font-data-mono text-on-surface-variant uppercase tracking-wider"
                    style={{ fontSize: 11 }}
                  >
                    <span>{price}</span>
                    <span className="w-1 h-1 rounded-full" style={{ backgroundColor: 'var(--color-outline-variant)' }} />
                    {data?.onePager?.closeTargetDate && (
                      <span>CLOSE TARGET {data.onePager.closeTargetDate.toUpperCase()}</span>
                    )}
                  </div>
                  {data?.onePager?.dealHeader && (
                    <p className="font-body-main text-on-surface-variant mt-3 italic" style={{ fontSize: 13 }}>
                      {data.onePager.dealHeader}
                    </p>
                  )}
                </div>
                <div className="flex gap-2">
                  {chips.map(chip => (
                    <span
                      key={chip.label}
                      className="archetype-chip"
                      style={{ backgroundColor: chip.bg, color: chip.text, border: `1px solid ${chip.border}` }}
                    >
                      {chip.label}
                    </span>
                  ))}
                </div>
              </div>
              <div className="mt-8 h-px w-full" style={{ backgroundColor: '#E8E8E3' }} />
            </section>

            {/* Body grid */}
            <div className="grid gap-10 flex-grow" style={{ gridTemplateColumns: '7fr 5fr' }}>
              {/* Left column */}
              <div className="space-y-10">
                <section>
                  <h3 className="font-label-caps text-outline mb-4 uppercase" style={{ fontSize: 10 }}>My Read</h3>
                  <p className="font-body-main text-on-surface-variant leading-relaxed" style={{ fontSize: 13 }}>
                    {data?.onePager?.myRead ?? '—'}
                  </p>
                </section>

                <section
                  className="pl-6 py-4"
                  style={{ backgroundColor: 'rgba(20,69,55,0.04)', borderLeft: '2px solid var(--color-primary-container)' }}
                >
                  <h3 className="font-label-caps text-primary mb-2 uppercase" style={{ fontSize: 10 }}>Where I need help</h3>
                  <p className="font-body-main text-on-surface-variant italic" style={{ fontSize: 13 }}>
                    &ldquo;{data?.onePager?.whereIneedHelp ?? '—'}&rdquo;
                  </p>
                </section>
              </div>

              {/* Right column */}
              <div className="space-y-10">
                <section>
                  <h3 className="font-label-caps text-outline mb-4 uppercase" style={{ fontSize: 10 }}>My Plan</h3>
                  {data?.touchSummary && data.touchSummary.length > 0 ? (
                    <div className="flex justify-between items-center relative py-4">
                      <div className="absolute top-1/2 left-0 w-full h-px" style={{ backgroundColor: '#E8E8E3', zIndex: 0 }} />
                      {data.touchSummary.slice(0, 8).map((t, idx) => (
                        <div key={idx} className="flex flex-col items-center gap-1 px-1 z-10" style={{ backgroundColor: 'white' }}>
                          <span
                            className="material-symbols-outlined"
                            style={{
                              fontSize: 16,
                              color: idx < Math.ceil(data.touchSummary.length / 2)
                                ? 'var(--color-primary)'
                                : 'var(--color-outline)',
                              opacity: idx < Math.ceil(data.touchSummary.length / 2) ? 1 : 0.4,
                            }}
                          >
                            {TOUCH_ICON(t.channel)}
                          </span>
                          <span className="font-data-mono text-outline" style={{ fontSize: 8 }}>D{t.dayOffset}</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="font-body-main text-on-surface-variant italic" style={{ fontSize: 13 }}>
                      {data?.onePager?.myPlan ?? '—'}
                    </p>
                  )}
                </section>

                <section>
                  <h3 className="font-label-caps text-outline mb-4 uppercase" style={{ fontSize: 10 }}>Risks &amp; Mitigations</h3>
                  <ul className="space-y-4">
                    {data?.onePager?.risksAndMitigations?.length
                      ? data.onePager.risksAndMitigations.map((r, i) => (
                          <li key={i} className="flex gap-3">
                            <span className="material-symbols-outlined text-error mt-1" style={{ fontSize: 14 }}>warning</span>
                            <div>
                              <p className="font-body-strong text-on-surface" style={{ fontSize: 13 }}>{r.risk}</p>
                              <p className="text-on-surface-variant leading-tight" style={{ fontSize: 11 }}>{r.mitigation}</p>
                            </div>
                          </li>
                        ))
                      : <li className="font-body-main text-on-surface-variant italic" style={{ fontSize: 13 }}>No risks identified.</li>
                    }
                  </ul>
                </section>
              </div>
            </div>

            {/* Document footer */}
            <footer
              className="mt-auto pt-8 flex justify-between items-center text-outline font-label-caps uppercase tracking-widest"
              style={{ borderTop: '1px solid #E8E8E3', fontSize: 9 }}
            >
              <div className="font-data-mono">Generated by {data?.installerName ?? 'Cadence Rep'}</div>
              <div>EU-RESIDENT · AI ACT ART. 50</div>
              <div>Page 01/01</div>
            </footer>

            {/* Grain texture overlay */}
            <div className="pointer-events-none absolute inset-0 overflow-hidden" style={{ opacity: 0.03, mixBlendMode: 'multiply' }}>
              <svg viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg" width="100%" height="100%">
                <filter id="noiseFilter">
                  <feTurbulence type="fractalNoise" baseFrequency="0.65" numOctaves="3" stitchTiles="stitch" />
                </filter>
                <rect width="100%" height="100%" filter="url(#noiseFilter)" />
              </svg>
            </div>
          </article>
        )}

        <GlobalFooter />
      </main>
    </div>
  );
}

export default function BriefPage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center min-h-screen">
        <p className="font-body-main text-on-surface-variant">Loading brief…</p>
      </div>
    }>
      <BriefInner />
    </Suspense>
  );
}
