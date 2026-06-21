'use client';

import { useEffect, useState, useCallback } from 'react';

// ── Types ─────────────────────────────────────────────────────────────────────

interface Product {
  id: string;
  name: string;
  type: string;
  sku: string | null;
  price_base: number | null;
  description: string | null;
  warranty_years: number | null;
  target_archetype: string | null;
}

interface CustomerRow {
  id: string;
  fname: string;
  lname: string;
  email: string;
  status: string;
  price_quote: number | null;
  about: string | null;
  product_id: string | null;
  product_type: string | null;
  language: string;
  archetypes: { family: number; investor: number; environmentalist: number; skeptic: number };
  latestSequence: { id: string; current_day: number | null; total_days: number | null } | null;
}

const STATUSES = [
  { value: 'lead',         label: 'Lead',         color: '#6b7280' },
  { value: 'quoted',       label: 'Quoted',       color: '#2563eb' },
  { value: 'engaged',      label: 'Engaged',      color: '#7c3aed' },
  { value: 'negotiating',  label: 'Negotiating',  color: '#d97706' },
  { value: 'closed_won',   label: 'Closed Won',   color: '#16a34a' },
  { value: 'closed_lost',  label: 'Closed Lost',  color: '#dc2626' },
];

const TYPE_ICONS: Record<string, string> = {
  panel:      'solar_power',
  battery:    'battery_charging_full',
  inverter:   'electrical_services',
  ev_charger: 'ev_station',
  monitoring: 'monitoring',
  package:    'inventory_2',
};

export interface AdjustSequenceModalProps {
  open: boolean;
  onClose: () => void;
  initialCustomerId?: string;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function AdjustSequenceModal({ open, onClose, initialCustomerId }: AdjustSequenceModalProps) {
  const [customers,  setCustomers]  = useState<CustomerRow[]>([]);
  const [products,   setProducts]   = useState<Product[]>([]);
  const [loading,    setLoading]    = useState(false);
  const [selected,   setSelected]   = useState<CustomerRow | null>(null);
  const [search,     setSearch]     = useState('');
  const [saving,     setSaving]     = useState(false);
  const [saveMsg,    setSaveMsg]    = useState('');

  // Editable form state
  const [status,     setStatus]     = useState('');
  const [priceQuote, setPriceQuote] = useState('');
  const [productId,  setProductId]  = useState('');
  const [about,      setAbout]      = useState('');

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [custRes, prodRes] = await Promise.all([
        fetch('/api/customers'),
        fetch('/api/products'),
      ]);
      const custData = await custRes.json();
      const prodData = await prodRes.json();
      const custs: CustomerRow[] = (custData.data ?? []).map((c: Record<string, unknown>) => ({
        id:           c.id,
        fname:        c.fname,
        lname:        c.lname,
        email:        c.email,
        status:       c.status ?? 'lead',
        price_quote:  c.price_quote,
        about:        c.about,
        product_id:   c.product_id ?? null,
        product_type: c.product_type ?? null,
        language:     c.language ?? 'en',
        archetypes: {
          family:          (c.archetypes as Record<string,number>)?.family ?? 0,
          investor:        (c.archetypes as Record<string,number>)?.investor ?? 0,
          environmentalist:(c.archetypes as Record<string,number>)?.environmentalist ?? 0,
          skeptic:         (c.archetypes as Record<string,number>)?.skeptic ?? 0,
        },
        latestSequence: c.latestSequence as CustomerRow['latestSequence'] ?? null,
      }));
      setCustomers(custs);
      setProducts(prodData.data ?? []);
      if (initialCustomerId) {
        const found = custs.find(c => c.id === initialCustomerId);
        if (found) selectCustomer(found);
      }
    } finally {
      setLoading(false);
    }
  }, [initialCustomerId]);

  useEffect(() => {
    if (open) {
      fetchData();
      setSearch('');
      setSaveMsg('');
      if (!initialCustomerId) setSelected(null);
    }
  }, [open, fetchData, initialCustomerId]);

  function selectCustomer(c: CustomerRow) {
    setSelected(c);
    setStatus(c.status);
    setPriceQuote(c.price_quote != null ? String(Math.round(c.price_quote)) : '');
    setProductId(c.product_id ?? '');
    setAbout(c.about ?? '');
    setSaveMsg('');
  }

  async function handleSave() {
    if (!selected) return;
    setSaving(true);
    setSaveMsg('');
    try {
      const body: Record<string, unknown> = {
        status,
        about,
        price_quote: priceQuote ? parseFloat(priceQuote) : null,
        product_id:   productId || null,
        product_type: productId ? (products.find(p => p.id === productId)?.type ?? null) : null,
      };
      const res = await fetch(`/api/customers/${selected.id}`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(body),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setSaveMsg('Saved successfully');
      // Refresh
      await fetchData();
    } catch (err) {
      setSaveMsg(`Error: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setSaving(false);
    }
  }

  if (!open) return null;

  const filtered = customers.filter(c =>
    `${c.fname} ${c.lname} ${c.email}`.toLowerCase().includes(search.toLowerCase())
  );

  const selectedProduct = products.find(p => p.id === productId) ?? null;

  return (
    <>
      <div className="fixed inset-0 z-50 bg-black/30" onClick={onClose} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-6 pointer-events-none">
        <div className="pointer-events-auto w-full max-w-5xl rounded-2xl bg-white shadow-2xl flex overflow-hidden" style={{ height: '85vh', border: '1px solid #e5e7eb' }}>

          {/* ── Left: customer list ── */}
          <div className="w-72 flex-shrink-0 flex flex-col border-r" style={{ borderColor: '#f0f0eb' }}>
            <div className="px-4 py-4 border-b" style={{ borderColor: '#f0f0eb' }}>
              <h2 className="font-bold text-gray-900 mb-3" style={{ fontSize: 15 }}>Adjust Sequence</h2>
              <div className="flex items-center gap-2 px-3 py-2 rounded-xl" style={{ border: '1px solid #e5e7eb', backgroundColor: '#fafafa' }}>
                <span className="material-symbols-outlined text-gray-400" style={{ fontSize: 16 }}>search</span>
                <input
                  type="text"
                  placeholder="Search customer…"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  className="flex-1 outline-none bg-transparent text-sm"
                />
              </div>
            </div>
            <div className="flex-1 overflow-y-auto">
              {loading ? (
                <div className="p-4 text-center text-gray-400 text-sm">Loading…</div>
              ) : filtered.map(c => {
                const isActive = selected?.id === c.id;
                const statusInfo = STATUSES.find(s => s.value === c.status);
                return (
                  <button
                    key={c.id}
                    onClick={() => selectCustomer(c)}
                    className="w-full px-4 py-3 text-left hover:bg-gray-50 transition-colors"
                    style={{
                      borderBottom: '1px solid #f3f4f6',
                      backgroundColor: isActive ? '#f0fdfa' : undefined,
                      borderLeft: isActive ? '3px solid #0d9488' : '3px solid transparent',
                    }}
                  >
                    <p className="font-semibold text-gray-800" style={{ fontSize: 13 }}>{c.fname} {c.lname}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-xs font-semibold uppercase px-1.5 py-0.5 rounded"
                        style={{ fontSize: 9, color: statusInfo?.color ?? '#6b7280', backgroundColor: (statusInfo?.color ?? '#6b7280') + '15' }}>
                        {statusInfo?.label ?? c.status}
                      </span>
                      {c.product_type && (
                        <span className="text-gray-400 text-xs" style={{ fontSize: 9 }}>{c.product_type}</span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* ── Right: edit form ── */}
          <div className="flex-1 flex flex-col min-w-0">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b" style={{ borderColor: '#f0f0eb' }}>
              <h3 className="font-bold text-gray-900" style={{ fontSize: 16 }}>
                {selected ? `${selected.fname} ${selected.lname}` : 'Select a customer'}
              </h3>
              <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100">
                <span className="material-symbols-outlined text-gray-400" style={{ fontSize: 18 }}>close</span>
              </button>
            </div>

            {!selected ? (
              <div className="flex-1 flex items-center justify-center">
                <div className="text-center text-gray-400">
                  <span className="material-symbols-outlined" style={{ fontSize: 40, display: 'block', marginBottom: 8 }}>touch_app</span>
                  <p className="text-sm">Select a customer from the left to edit their sequence</p>
                </div>
              </div>
            ) : (
              <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">

                {/* Status */}
                <div>
                  <label className="block text-xs font-semibold uppercase text-gray-500 mb-2" style={{ letterSpacing: '0.05em' }}>Deal Stage</label>
                  <div className="grid grid-cols-3 gap-2">
                    {STATUSES.map(s => (
                      <button
                        key={s.value}
                        onClick={() => setStatus(s.value)}
                        className="px-3 py-2 rounded-lg text-sm font-medium transition-colors"
                        style={{
                          border:           `1px solid ${status === s.value ? s.color : '#e5e7eb'}`,
                          backgroundColor:  status === s.value ? s.color + '15' : 'white',
                          color:            status === s.value ? s.color : '#6b7280',
                        }}
                      >
                        {s.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Product */}
                <div>
                  <label className="block text-xs font-semibold uppercase text-gray-500 mb-2" style={{ letterSpacing: '0.05em' }}>Assigned Product</label>
                  <div className="grid grid-cols-1 gap-1.5 max-h-48 overflow-y-auto pr-1">
                    {/* None option */}
                    <button
                      onClick={() => setProductId('')}
                      className="flex items-center gap-3 px-3 py-2 rounded-lg text-left"
                      style={{
                        border: `1px solid ${!productId ? '#0d9488' : '#e5e7eb'}`,
                        backgroundColor: !productId ? '#f0fdfa' : 'white',
                      }}
                    >
                      <span className="material-symbols-outlined text-gray-300" style={{ fontSize: 16 }}>block</span>
                      <span className="text-sm text-gray-400">No product assigned</span>
                    </button>
                    {products.map(p => (
                      <button
                        key={p.id}
                        onClick={() => setProductId(p.id)}
                        className="flex items-center gap-3 px-3 py-2 rounded-lg text-left"
                        style={{
                          border: `1px solid ${productId === p.id ? '#0d9488' : '#e5e7eb'}`,
                          backgroundColor: productId === p.id ? '#f0fdfa' : 'white',
                        }}
                      >
                        <span className="material-symbols-outlined" style={{ fontSize: 16, color: productId === p.id ? '#0d9488' : '#9ca3af' }}>
                          {TYPE_ICONS[p.type] ?? 'inventory_2'}
                        </span>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-800 truncate">{p.name}</p>
                          <p className="text-xs text-gray-400">{p.type}{p.price_base ? ` · €${Math.round(p.price_base).toLocaleString()}` : ''}{p.warranty_years ? ` · ${p.warranty_years}yr warranty` : ''}</p>
                        </div>
                      </button>
                    ))}
                  </div>

                  {/* Selected product detail */}
                  {selectedProduct && (
                    <div className="mt-3 p-3 rounded-xl" style={{ backgroundColor: '#f0fdfa', border: '1px solid #5eead4' }}>
                      <p className="font-semibold text-teal-800 text-sm">{selectedProduct.name}</p>
                      <p className="text-xs text-teal-600 mt-1 leading-relaxed">{selectedProduct.description}</p>
                      {selectedProduct.target_archetype && (
                        <p className="text-xs text-teal-500 mt-1">Best for: {selectedProduct.target_archetype}</p>
                      )}
                    </div>
                  )}
                </div>

                {/* Price quote */}
                <div>
                  <label className="block text-xs font-semibold uppercase text-gray-500 mb-2" style={{ letterSpacing: '0.05em' }}>Price Quote (€)</label>
                  <div className="flex items-center gap-2">
                    <span className="text-gray-400 font-mono">€</span>
                    <input
                      type="number"
                      value={priceQuote}
                      onChange={e => setPriceQuote(e.target.value)}
                      placeholder="0"
                      className="flex-1 px-3 py-2 rounded-lg text-sm outline-none"
                      style={{ border: '1px solid #e5e7eb' }}
                    />
                    {selectedProduct?.price_base && (
                      <button
                        onClick={() => setPriceQuote(String(Math.round(selectedProduct.price_base!)))}
                        className="text-xs px-2 py-1 rounded"
                        style={{ color: '#0d9488', border: '1px solid #0d9488' }}
                      >
                        Use base €{Math.round(selectedProduct.price_base).toLocaleString()}
                      </button>
                    )}
                  </div>
                </div>

                {/* Notes */}
                <div>
                  <label className="block text-xs font-semibold uppercase text-gray-500 mb-2" style={{ letterSpacing: '0.05em' }}>Installer Notes</label>
                  <textarea
                    value={about}
                    onChange={e => setAbout(e.target.value)}
                    rows={4}
                    placeholder="Update notes about this customer's situation, motivations, objections…"
                    className="w-full px-3 py-2 rounded-lg text-sm outline-none resize-none leading-relaxed"
                    style={{ border: '1px solid #e5e7eb' }}
                  />
                </div>

                {/* Sequence info */}
                {selected.latestSequence && (
                  <div className="p-3 rounded-xl" style={{ backgroundColor: '#f9fafb', border: '1px solid #e5e7eb' }}>
                    <p className="text-xs font-semibold uppercase text-gray-400 mb-1" style={{ letterSpacing: '0.05em' }}>Active Sequence</p>
                    <p className="text-sm text-gray-700">Day {selected.latestSequence.current_day ?? 0} of {selected.latestSequence.total_days ?? 30}</p>
                    <p className="text-xs text-gray-400 mt-0.5">Changes above will take effect on the next touchpoint generation. Regenerate the sequence from Pipeline to apply product messaging.</p>
                  </div>
                )}
              </div>
            )}

            {/* Footer */}
            {selected && (
              <div className="flex-shrink-0 flex items-center justify-between gap-3 px-6 py-4 border-t" style={{ borderColor: '#f0f0eb' }}>
                {saveMsg && (
                  <p className="text-sm" style={{ color: saveMsg.startsWith('Error') ? '#dc2626' : '#16a34a' }}>{saveMsg}</p>
                )}
                {!saveMsg && <div />}
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="px-5 py-2 rounded-lg text-sm font-semibold text-white disabled:opacity-50"
                  style={{ backgroundColor: '#0d9488' }}
                >
                  {saving ? 'Saving…' : 'Save changes'}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
