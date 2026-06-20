'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import SideNav from '@/app/components/SideNav';
import Link from 'next/link';

interface CustomerRow {
  id: string;
  name: string;
  firstName: string;
  city: string;
  countryCode: string;
  quoteId: string | null;
  strategyId: string | null;
  totalPrice: number;
  currency: string;
  stage: string;
  lastTouchDate: string;
  ghostRisk:     { score: number; pct: number; recommendation: string };
  closeReadiness:{ score: number; pct: number; recommendation: string };
  archetypeWeights: { family: number; investor: number; environmentalist: number; skeptic: number };
}

const STAGE_COLORS: Record<string, string> = {
  Contracting: 'bg-secondary-fixed text-on-secondary-fixed',
  Validation:  'bg-primary-fixed text-on-primary-fixed',
  Proposal:    'bg-surface-variant text-on-surface-variant',
  Discovery:   'bg-surface-variant text-on-surface-variant',
};

function formatPrice(price: number, currency: string) {
  return new Intl.NumberFormat('de-DE', { style: 'currency', currency, minimumFractionDigits: 0 }).format(price);
}

function ArchetypeMixBar({ weights }: { weights: CustomerRow['archetypeWeights'] }) {
  const total = weights.family + weights.investor + weights.environmentalist + weights.skeptic || 1;
  const familyPct      = (weights.family / total) * 100;
  const investorPct    = (weights.investor / total) * 100;
  const envPct         = (weights.environmentalist / total) * 100;
  const skepticPct     = (weights.skeptic / total) * 100;
  return (
    <div className="flex gap-0.5 w-full" title={`Family ${Math.round(familyPct)}% / Investor ${Math.round(investorPct)}% / Env ${Math.round(envPct)}% / Skeptic ${Math.round(skepticPct)}%`}>
      {familyPct   > 2 && <div className="h-1" style={{ width: `${familyPct}%`,   backgroundColor: '#8ca6c0' }} />}
      {investorPct > 2 && <div className="h-1" style={{ width: `${investorPct}%`, backgroundColor: '#2e5d4e' }} />}
      {envPct      > 2 && <div className="h-1" style={{ width: `${envPct}%`,      backgroundColor: '#a6b599' }} />}
      {skepticPct  > 2 && <div className="h-1" style={{ width: `${skepticPct}%`,  backgroundColor: '#c0a1a1' }} />}
    </div>
  );
}

export default function PipelinePage() {
  const router = useRouter();
  const [customers, setCustomers] = useState<CustomerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/customers')
      .then(r => r.json())
      .then(data => {
        if (data.error) throw new Error(data.error);
        setCustomers(data.customers);
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const totalValue = customers.reduce((s, c) => s + c.totalPrice, 0);

  return (
    <div className="flex min-h-screen" style={{ backgroundColor: 'var(--color-background)' }}>
      <SideNav />

      <main className="ml-64 flex-1">
        {/* Inline TopBar (pipeline-specific buttons) */}
        <header
          className="sticky top-0 w-full z-40 flex justify-between items-center px-6 py-4 no-print"
          style={{ backgroundColor: 'var(--color-surface)', borderBottom: '1px solid var(--color-outline-variant)' }}
        >
          <span className="font-display-md text-2xl italic text-primary">Pipeline</span>
          <div className="flex items-center gap-6">
            <Link href="/sequences" className="text-primary font-body-strong hover:opacity-80 transition-opacity">
              Sequence Planner
            </Link>
            <button
              onClick={() => router.push('/adjust')}
              className="px-4 py-1.5 font-body-strong rounded-sm hover:opacity-90 active:scale-95 transition-all"
              style={{ border: '1px solid var(--color-outline-variant)', color: 'var(--color-primary)' }}
            >
              Adjust Sequence
            </button>
            <button
              onClick={() => router.push('/brief')}
              className="px-4 py-1.5 font-body-strong rounded-sm hover:opacity-90 active:scale-95 transition-all"
              style={{ backgroundColor: 'var(--color-primary)', color: 'var(--color-on-primary)' }}
            >
              Export brief
            </button>
          </div>
        </header>

        <div className="p-6 max-w-[1400px] mx-auto">
          {/* Summary stat cards */}
          <div
            className="grid grid-cols-4 gap-px overflow-hidden mb-10 rounded-xl"
            style={{ backgroundColor: 'var(--color-outline-variant)', border: '1px solid var(--color-outline-variant)' }}
          >
            {[
              { label: 'Total Pipeline Value', value: loading ? '…' : formatPrice(totalValue, 'EUR'), sub: `${customers.length} active deals`, subColor: 'var(--color-secondary)' },
              { label: 'Active Sequences',     value: loading ? '…' : String(customers.filter(c => c.strategyId).length), sub: `${customers.filter(c => !c.strategyId).length} pending strategy`, subColor: 'var(--color-outline)' },
              { label: 'Avg. Close Readiness', value: loading ? '…' : (customers.length ? `${Math.round(customers.reduce((s,c) => s + c.closeReadiness.score, 0) / customers.length * 100)}%` : '—'), sub: 'Based on live scoring', subColor: 'var(--color-secondary)' },
              { label: 'Audit Status',         value: 'Compliant', sub: 'EU AI Act Art. 50', subColor: 'var(--color-secondary)' },
            ].map((card) => (
              <div key={card.label} className="p-6" style={{ backgroundColor: 'white' }}>
                <p className="font-label-caps text-outline uppercase mb-2" style={{ fontSize: 10 }}>{card.label}</p>
                <p className="font-display-md text-3xl text-primary">{card.value}</p>
                <p className="font-data-mono mt-1" style={{ fontSize: 11, color: card.subColor }}>{card.sub}</p>
              </div>
            ))}
          </div>

          {/* Customer table */}
          <div className="bg-white rounded-xl overflow-hidden" style={{ border: '1px solid var(--color-outline-variant)' }}>
            {loading ? (
              <div className="p-16 flex flex-col items-center justify-center gap-4">
                <span className="material-symbols-outlined text-outline" style={{ fontSize: 40 }}>hourglass_empty</span>
                <p className="font-body-main text-on-surface-variant">Loading customers…</p>
              </div>
            ) : error ? (
              <div className="p-16 text-center">
                <p className="font-body-main text-error">{error}</p>
              </div>
            ) : (
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr style={{ backgroundColor: 'var(--color-surface-container-low)', borderBottom: '1px solid var(--color-outline-variant)' }}>
                    {['CUSTOMER', 'QUOTE VALUE', 'ARCHETYPE MIX', 'STAGE', 'LAST TOUCH', 'GHOST RISK', 'CLOSE READINESS', ''].map(h => (
                      <th key={h} className="px-6 py-4 font-label-caps text-on-surface-variant uppercase" style={{ fontSize: 10 }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody style={{ borderTop: '1px solid transparent' }}>
                  {customers.map((c, i) => {
                    const highRisk = c.ghostRisk.score > 0.4;
                    const highReady = c.closeReadiness.score > 0.8;
                    return (
                      <tr
                        key={c.id}
                        onClick={() => router.push(`/sequences?customerId=${c.id}`)}
                        className="hover:bg-surface-container-lowest transition-colors cursor-pointer"
                        style={{
                          borderBottom: i < customers.length - 1 ? '1px solid var(--color-outline-variant)' : 'none',
                          borderLeft: i === 0 ? '4px solid var(--color-primary)' : '4px solid transparent',
                        }}
                      >
                        <td className="px-6 py-6">
                          <span className="font-display-md italic text-primary" style={{ fontSize: 15 }}>{c.name}</span>
                          <div className="font-data-mono text-outline mt-0.5" style={{ fontSize: 9 }}>{c.city}, {c.countryCode}</div>
                        </td>
                        <td className="px-6 py-6 font-data-mono text-xs">{formatPrice(c.totalPrice, c.currency)}</td>
                        <td className="px-6 py-6 w-48">
                          <ArchetypeMixBar weights={c.archetypeWeights} />
                        </td>
                        <td className="px-6 py-6">
                          <span
                            className={`px-2 py-1 font-label-caps uppercase rounded ${STAGE_COLORS[c.stage] ?? 'bg-surface-variant text-on-surface-variant'}`}
                            style={{ fontSize: 10 }}
                          >
                            {c.stage}
                          </span>
                        </td>
                        <td className="px-6 py-6 font-data-mono text-outline" style={{ fontSize: 12 }}>{c.lastTouchDate}</td>
                        <td className="px-6 py-6">
                          <div
                            className="px-3 py-1.5 rounded-lg border w-fit flex flex-col"
                            style={{
                              backgroundColor: highRisk ? 'var(--color-error-container)' : 'var(--color-surface-container-low)',
                              color: highRisk ? 'var(--color-on-error-container)' : 'var(--color-on-surface)',
                              borderColor: highRisk ? 'rgba(186,26,26,0.2)' : 'var(--color-outline-variant)',
                            }}
                          >
                            <div className="flex items-baseline gap-2">
                              <span className="font-body-strong text-2xl leading-none">{c.ghostRisk.pct}</span>
                              <span className="font-label-caps uppercase" style={{ fontSize: 9 }}>{highRisk ? 'High' : 'Low'}</span>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-6">
                          <div
                            className="px-3 py-1.5 rounded-lg w-fit flex flex-col"
                            style={{
                              backgroundColor: highReady ? 'var(--color-primary-container)' : 'var(--color-surface-container-low)',
                              color: highReady ? 'white' : 'var(--color-on-surface)',
                              border: highReady ? 'none' : '1px solid var(--color-outline-variant)',
                            }}
                          >
                            <div className="flex items-baseline gap-2">
                              <span className="font-body-strong text-2xl leading-none">{c.closeReadiness.pct}</span>
                              <span className="font-label-caps uppercase" style={{ fontSize: 9 }}>{highReady ? 'High' : 'Mid'}</span>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-6 text-right">
                          {c.strategyId && (
                            <button
                              onClick={(e) => { e.stopPropagation(); router.push(`/brief?strategyId=${c.strategyId}`); }}
                              className="px-3 py-1.5 font-label-caps rounded hover:opacity-90 active:scale-95 transition-all"
                              style={{ fontSize: 10, border: '1px solid rgba(20,69,55,0.25)', color: 'var(--color-primary)' }}
                            >
                              Export brief
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* FAB */}
        <button
          onClick={() => router.push('/intake')}
          className="fixed bottom-10 right-10 flex items-center gap-3 shadow-lg transition-all hover:scale-105 active:scale-95 group rounded-xl px-6 py-4"
          style={{ backgroundColor: 'var(--color-primary-container)', color: 'white' }}
        >
          <span className="material-symbols-outlined group-hover:rotate-90 transition-transform">add</span>
          <span className="font-body-strong">New Customer</span>
        </button>
      </main>
    </div>
  );
}
