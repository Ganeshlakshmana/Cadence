'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import SideNav from '@/app/components/SideNav';
import Link from 'next/link';
import IntakeForm from '@/components/IntakeForm';
import type { Customer } from '@/components/IntakeForm';
import CoachingPanel from '@/components/CoachingPanel';
import AdjustSequenceModal from '@/components/AdjustSequenceModal';

interface CustomerRow {
  id: string;
  fname: string;
  lname: string;
  email: string;
  phone: string | null;
  whatsapp_enabled: number;
  price_quote: number | null;
  status: string;
  product_id: string | null;
  product_type: string | null;
  archetypes: { family: number; investor: number; environmentalist: number; skeptic: number };
  latestSequence: {
    id: string;
    status: string;
    ghost_risk_score: number | null;
    close_readiness_score: number | null;
    current_day: number | null;
  } | null;
}

const STAGE_COLORS: Record<string, string> = {
  lead:         'bg-surface-variant text-on-surface-variant',
  quoted:       'bg-primary-fixed text-on-primary-fixed',
  engaged:      'bg-secondary-fixed text-on-secondary-fixed',
  negotiating:  'bg-yellow-100 text-yellow-800',
  closed_won:   'bg-green-100 text-green-800',
  closed_lost:  'bg-red-100 text-red-700',
};

const STAGE_LABELS: Record<string, string> = {
  lead:        'Lead',
  quoted:      'Quoted',
  engaged:     'Engaged',
  negotiating: 'Negotiating',
  closed_won:  'Won',
  closed_lost: 'Lost',
};

function formatPrice(price: number) {
  return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR', minimumFractionDigits: 0 }).format(price);
}

function WhatsAppBadge({ enabled }: { enabled: number }) {
  if (!enabled) return <span className="text-outline font-data-mono" style={{ fontSize: 12 }}>—</span>;
  return (
    <span
      title="WhatsApp enabled"
      className="inline-flex items-center justify-center rounded-md"
      style={{ width: 28, height: 28, backgroundColor: '#25D366' }}
    >
      <span className="material-symbols-outlined text-white" style={{ fontSize: 16 }}>phone</span>
    </span>
  );
}

function ArchetypeMixBar({ archetypes }: { archetypes: CustomerRow['archetypes'] }) {
  const total = archetypes.family + archetypes.investor + archetypes.environmentalist + archetypes.skeptic || 1;
  const familyPct      = (archetypes.family / total) * 100;
  const investorPct    = (archetypes.investor / total) * 100;
  const envPct         = (archetypes.environmentalist / total) * 100;
  const skepticPct     = (archetypes.skeptic / total) * 100;
  return (
    <div className="flex gap-0.5 w-full" title={`Family ${Math.round(familyPct)}% · Investor ${Math.round(investorPct)}% · Env ${Math.round(envPct)}% · Skeptic ${Math.round(skepticPct)}%`}>
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
  const [generatingIds, setGeneratingIds] = useState<Set<string>>(new Set());
  const [callingIds, setCallingIds]       = useState<Set<string>>(new Set());
  const [intakeOpen, setIntakeOpen]       = useState(false);
  const [coachingOpen, setCoachingOpen]   = useState(false);
  const [preselectedId, setPreselectedId] = useState<string | undefined>();
  const [adjustOpen, setAdjustOpen]       = useState(false);
  const [adjustId, setAdjustId]           = useState<string | undefined>();

  const refreshCustomers = useCallback(() => {
    fetch('/api/customers')
      .then(r => r.json())
      .then(data => { if (!data.error) setCustomers(data.data); })
      .catch(console.error);
  }, []);

  function handleNewCustomer(_customer: Customer) {
    refreshCustomers();
  }

  useEffect(() => {
    fetch('/api/customers')
      .then(r => r.json())
      .then(data => {
        if (data.error) throw new Error(data.error);
        setCustomers(data.data);
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  async function handleCall(e: React.MouseEvent, customerId: string) {
    e.stopPropagation();
    setCallingIds(prev => new Set(prev).add(customerId));
    try {
      const res = await fetch('/api/channels/call/initiate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customer_id: customerId }),
      });
      const data = await res.json();
      if (data.error) alert(`Call failed: ${data.error}`);
    } catch (err) {
      console.error('Call initiation failed:', err);
    } finally {
      setCallingIds(prev => { const s = new Set(prev); s.delete(customerId); return s; });
    }
  }

  async function generateStrategy(e: React.MouseEvent, customerId: string) {
    e.stopPropagation();
    setGeneratingIds(prev => new Set(prev).add(customerId));
    try {
      const res = await fetch('/api/strategy/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customerId }),
      });
      if (!res.ok) throw new Error(await res.text());
      router.push(`/sequences?customerId=${customerId}`);
    } catch (err) {
      console.error('Generate strategy failed:', err);
    } finally {
      setGeneratingIds(prev => { const s = new Set(prev); s.delete(customerId); return s; });
    }
  }

  const totalValue = customers.reduce((s, c) => s + (c.price_quote ?? 0), 0);

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
              onClick={() => { setPreselectedId(undefined); setCoachingOpen(true); }}
              className="px-4 py-1.5 font-body-strong rounded-sm hover:opacity-90 active:scale-95 transition-all flex items-center gap-1.5"
              style={{ border: '1px solid #0d9488', color: '#0d9488' }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: 14 }}>psychology</span>
              Ask Max
            </button>
            <button
              onClick={() => { setAdjustId(undefined); setAdjustOpen(true); }}
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
              { label: 'Total Pipeline Value', value: loading ? '…' : formatPrice(totalValue), sub: `${customers.length} active deals`, subColor: 'var(--color-secondary)' },
              { label: 'Active Sequences',     value: loading ? '…' : String(customers.filter(c => c.latestSequence).length), sub: `${customers.filter(c => !c.latestSequence).length} pending strategy`, subColor: 'var(--color-outline)' },
              { label: 'Avg. Close Readiness', value: loading ? '…' : (() => { const scored = customers.filter(c => c.latestSequence?.close_readiness_score != null); return scored.length ? `${Math.round(scored.reduce((s,c) => s + (c.latestSequence!.close_readiness_score ?? 0), 0) / scored.length * 100)}%` : '—'; })(), sub: 'Based on live scoring', subColor: 'var(--color-secondary)' },
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
                    {['CUSTOMER', 'WHATSAPP', 'PRODUCT', 'QUOTE VALUE', 'ARCHETYPE MIX', 'STAGE', 'GHOST RISK', 'CLOSE READINESS', ''].map(h => (
                      <th key={h} className="px-6 py-4 font-label-caps text-on-surface-variant uppercase" style={{ fontSize: 10 }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody style={{ borderTop: '1px solid transparent' }}>
                  {customers.map((c, i) => {
                    const ghostScore   = c.latestSequence?.ghost_risk_score ?? null;
                    const closeScore   = c.latestSequence?.close_readiness_score ?? null;
                    const highRisk     = ghostScore != null && ghostScore > 0.4;
                    const highReady    = closeScore != null && closeScore > 0.8;
                    const isGenerating = generatingIds.has(c.id);
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
                        {/* CUSTOMER */}
                        <td className="px-6 py-6">
                          <span className="font-display-md italic text-primary" style={{ fontSize: 15 }}>{c.fname} {c.lname}</span>
                          <div className="font-data-mono text-outline mt-0.5" style={{ fontSize: 9 }}>{c.email}</div>
                        </td>

                        {/* WHATSAPP */}
                        <td className="px-6 py-6">
                          <WhatsAppBadge enabled={c.whatsapp_enabled} />
                        </td>

                        {/* PRODUCT */}
                        <td className="px-6 py-6">
                          {c.product_type ? (
                            <div>
                              <p className="font-data-mono text-xs text-on-surface" style={{ fontSize: 11 }}>{c.product_type}</p>
                            </div>
                          ) : (
                            <button
                              onClick={(e) => { e.stopPropagation(); setAdjustId(c.id); setAdjustOpen(true); }}
                              className="text-outline font-data-mono hover:text-primary transition-colors"
                              style={{ fontSize: 11 }}
                            >
                              + assign
                            </button>
                          )}
                        </td>

                        {/* QUOTE VALUE */}
                        <td className="px-6 py-6 font-data-mono text-xs">
                          {c.price_quote != null ? formatPrice(c.price_quote) : '—'}
                        </td>

                        {/* ARCHETYPE MIX */}
                        <td className="px-6 py-6 w-48">
                          <ArchetypeMixBar archetypes={c.archetypes} />
                        </td>

                        {/* STAGE */}
                        <td className="px-6 py-6">
                          <span
                            className={`px-2 py-1 font-label-caps uppercase rounded ${STAGE_COLORS[c.status] ?? 'bg-surface-variant text-on-surface-variant'}`}
                            style={{ fontSize: 10 }}
                          >
                            {STAGE_LABELS[c.status] ?? c.status}
                          </span>
                        </td>

                        {/* GHOST RISK */}
                        <td className="px-6 py-6">
                          {ghostScore == null ? (
                            <span className="text-outline font-data-mono" style={{ fontSize: 12 }}>—</span>
                          ) : (
                            <div
                              className="px-3 py-1.5 rounded-lg border w-fit flex flex-col"
                              style={{
                                backgroundColor: highRisk ? 'var(--color-error-container)' : 'var(--color-surface-container-low)',
                                color: highRisk ? 'var(--color-on-error-container)' : 'var(--color-on-surface)',
                                borderColor: highRisk ? 'rgba(186,26,26,0.2)' : 'var(--color-outline-variant)',
                              }}
                            >
                              <div className="flex items-baseline gap-2">
                                <span className="font-body-strong text-2xl leading-none">{Math.round(ghostScore * 100)}</span>
                                <span className="font-label-caps uppercase" style={{ fontSize: 9 }}>{highRisk ? 'High' : 'Low'}</span>
                              </div>
                            </div>
                          )}
                        </td>

                        {/* CLOSE READINESS */}
                        <td className="px-6 py-6">
                          {closeScore == null ? (
                            <span className="text-outline font-data-mono" style={{ fontSize: 12 }}>—</span>
                          ) : (
                            <div
                              className="px-3 py-1.5 rounded-lg w-fit flex flex-col"
                              style={{
                                backgroundColor: highReady ? 'var(--color-primary-container)' : 'var(--color-surface-container-low)',
                                color: highReady ? 'white' : 'var(--color-on-surface)',
                                border: highReady ? 'none' : '1px solid var(--color-outline-variant)',
                              }}
                            >
                              <div className="flex items-baseline gap-2">
                                <span className="font-body-strong text-2xl leading-none">{Math.round(closeScore * 100)}</span>
                                <span className="font-label-caps uppercase" style={{ fontSize: 9 }}>{highReady ? 'High' : 'Mid'}</span>
                              </div>
                            </div>
                          )}
                        </td>

                        {/* ACTIONS */}
                        <td className="px-4 py-6 text-right">
                          <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={(e) => { e.stopPropagation(); setPreselectedId(c.id); setCoachingOpen(true); }}
                            title="Get Max's coaching brief for this customer"
                            className="p-1.5 rounded hover:opacity-90 active:scale-95 transition-all"
                            style={{ border: '1px solid rgba(13,148,136,0.35)', color: '#0d9488' }}
                          >
                            <span className="material-symbols-outlined" style={{ fontSize: 14 }}>psychology</span>
                          </button>
                          {c.phone && (
                            <button
                              onClick={(e) => handleCall(e, c.id)}
                              disabled={callingIds.has(c.id)}
                              title="Initiate AI voice call"
                              className="p-1.5 rounded hover:opacity-90 active:scale-95 transition-all"
                              style={{ border: '1px solid rgba(20,69,55,0.25)', color: 'var(--color-primary)', opacity: callingIds.has(c.id) ? 0.7 : 1 }}
                            >
                              <span
                                className={`material-symbols-outlined${callingIds.has(c.id) ? ' animate-spin' : ''}`}
                                style={{ fontSize: 14 }}
                              >
                                {callingIds.has(c.id) ? 'progress_activity' : 'call'}
                              </span>
                            </button>
                          )}
                          {c.latestSequence ? (
                            <button
                              onClick={(e) => { e.stopPropagation(); router.push(`/brief?sequenceId=${c.latestSequence!.id}`); }}
                              className="px-3 py-1.5 font-label-caps rounded hover:opacity-90 active:scale-95 transition-all"
                              style={{ fontSize: 10, border: '1px solid rgba(20,69,55,0.25)', color: 'var(--color-primary)' }}
                            >
                              Export brief
                            </button>
                          ) : (
                            <button
                              onClick={(e) => generateStrategy(e, c.id)}
                              disabled={isGenerating}
                              className="px-3 py-1.5 font-label-caps rounded hover:opacity-90 active:scale-95 transition-all flex items-center gap-1.5"
                              style={{ fontSize: 10, border: '1px solid rgba(20,69,55,0.25)', color: 'var(--color-primary)', opacity: isGenerating ? 0.7 : 1 }}
                            >
                              {isGenerating ? (
                                <span className="material-symbols-outlined animate-spin" style={{ fontSize: 12 }}>progress_activity</span>
                              ) : (
                                <span className="material-symbols-outlined" style={{ fontSize: 12 }}>auto_awesome</span>
                              )}
                              {isGenerating ? 'Generating…' : 'Generate strategy'}
                            </button>
                          )}
                          </div>
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
          onClick={() => setIntakeOpen(true)}
          className="fixed bottom-10 right-10 flex items-center gap-3 shadow-lg transition-all hover:scale-105 active:scale-95 group rounded-xl px-6 py-4"
          style={{ backgroundColor: 'var(--color-primary-container)', color: 'white' }}
        >
          <span className="material-symbols-outlined group-hover:rotate-90 transition-transform">add</span>
          <span className="font-body-strong">Add Customer</span>
        </button>
      </main>

      <IntakeForm
        open={intakeOpen}
        onClose={() => setIntakeOpen(false)}
        onSuccess={handleNewCustomer}
      />

      <CoachingPanel
        open={coachingOpen}
        onClose={() => { setCoachingOpen(false); setPreselectedId(undefined); }}
        preselectedCustomerId={preselectedId}
      />

      <AdjustSequenceModal
        open={adjustOpen}
        onClose={() => { setAdjustOpen(false); setAdjustId(undefined); refreshCustomers(); }}
        initialCustomerId={adjustId}
      />
    </div>
  );
}
