'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface Customer {
  id: string;
  fname: string;
  lname: string;
  email: string;
  phone: string | null;
  whatsappEnabled: number | null;
  address: string | null;
  postalCode: string | null;
  priceQuote: number | null;
  status: string | null;
  language: string | null;
  archetypeFamily: number | null;
  archetypeInvestor: number | null;
  archetypeEnvironmentalist: number | null;
  archetypeSkeptic: number | null;
  about: string | null;
  consentDataProcessing: number | null;
  consentMarketing: number | null;
  consentVoiceCloning: number | null;
}

export interface IntakeFormProps {
  open: boolean;
  onClose: () => void;
  onSuccess: (customer: Customer) => void;
}

// ── Constants ──────────────────────────────────────────────────────────────────

const ARCHETYPE_KEYS = ['family', 'investor', 'environmentalist', 'skeptic'] as const;
type ArchKey = typeof ARCHETYPE_KEYS[number];

const ARCH_CONFIG: { key: ArchKey; emoji: string; label: string; color: string }[] = [
  { key: 'family',           emoji: '🏠', label: 'Family',           color: '#22c55e' },
  { key: 'investor',         emoji: '📈', label: 'Investor',         color: '#3b82f6' },
  { key: 'environmentalist', emoji: '🌱', label: 'Environmentalist', color: '#14b8a6' },
  { key: 'skeptic',          emoji: '🔍', label: 'Skeptic',          color: '#f97316' },
];

const GENERATE_STEPS = ['Saving…', 'Analysing profile…', 'Generating sequence…'] as const;

// ── Helpers ────────────────────────────────────────────────────────────────────

function rebalance(
  current: Record<ArchKey, number>,
  changed: ArchKey,
  newVal: number,
): Record<ArchKey, number> {
  const next = { ...current, [changed]: newVal };
  let delta = newVal - current[changed];
  if (delta === 0) return next;

  // Sequential waterfall: take from / give to one slider at a time in reverse key order.
  // This keeps exactly one other slider moving per drag step, not all three at once.
  const absorbers = ([...ARCHETYPE_KEYS] as ArchKey[]).reverse().filter(k => k !== changed);

  for (const k of absorbers) {
    if (delta === 0) break;
    if (delta > 0) {
      const take = Math.min(delta, next[k]);
      next[k] -= take;
      delta -= take;
    } else {
      const give = Math.min(-delta, 100 - next[k]);
      next[k] += give;
      delta += give;
    }
  }

  return next;
}

function currencyPrefix(lang: string) {
  return lang === 'en' ? '$' : '€';
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="font-label-caps text-on-surface-variant uppercase" style={{ fontSize: 10 }}>
        {label}
        {required && (
          <span className="text-error ml-1" style={{ fontSize: 9 }}>*</span>
        )}
      </label>
      {children}
    </div>
  );
}

const IC = 'w-full px-3 py-2 rounded-sm font-body-main text-on-surface';
const IS: React.CSSProperties = {
  border: '1px solid var(--color-outline-variant)',
  backgroundColor: 'white',
  fontSize: 13,
  outline: 'none',
};

function Switch({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="relative inline-flex h-6 w-11 items-center rounded-full transition-colors duration-200 shrink-0"
      style={{ backgroundColor: checked ? 'var(--color-primary)' : 'var(--color-outline-variant)' }}
    >
      <span
        className="inline-block h-5 w-5 rounded-full bg-white shadow-sm transition-transform duration-200"
        style={{ transform: checked ? 'translateX(22px)' : 'translateX(2px)' }}
      />
    </button>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function IntakeForm({ open, onClose, onSuccess }: IntakeFormProps) {
  const router = useRouter();

  // Form fields
  const [fname,    setFname]    = useState('');
  const [lname,    setLname]    = useState('');
  const [email,    setEmail]    = useState('');
  const [phone,    setPhone]    = useState('');
  const [address,  setAddress]  = useState('');
  const [postal,   setPostal]   = useState('');
  const [language, setLanguage] = useState('en');
  const [price,    setPrice]    = useState('');
  const [whatsapp, setWhatsapp] = useState(false);
  const [about,    setAbout]    = useState('');

  const [archetypes, setArchetypes] = useState<Record<ArchKey, number>>({
    family: 25, investor: 25, environmentalist: 25, skeptic: 25,
  });

  const [consentData,  setConsentData]  = useState(false);
  const [consentMkt,   setConsentMkt]   = useState(false);
  const [consentVoice, setConsentVoice] = useState(false);

  // UI state
  const [saving,       setSaving]       = useState(false);
  const [saveError,    setSaveError]    = useState<string | null>(null);
  const [generateStep, setGenerateStep] = useState<number | null>(null);
  const [toast,        setToast]        = useState<string | null>(null);

  // Close on Escape
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && open) onClose();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  // Reset state when sheet closes
  useEffect(() => {
    if (!open) {
      setFname(''); setLname(''); setEmail(''); setPhone('');
      setAddress(''); setPostal(''); setLanguage('en'); setPrice('');
      setWhatsapp(false); setAbout('');
      setArchetypes({ family: 25, investor: 25, environmentalist: 25, skeptic: 25 });
      setConsentData(false); setConsentMkt(false); setConsentVoice(false);
      setSaving(false); setSaveError(null); setGenerateStep(null);
    }
  }, [open]);

  function handleSlider(key: ArchKey, val: number) {
    setArchetypes(prev => rebalance(prev, key, val));
  }

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 2500);
  }

  function buildPayload() {
    return {
      fname,
      lname,
      email,
      phone:                     phone || null,
      address:                   address || null,
      postal_code:               postal || null,
      language,
      price_quote:               price ? Number(price) : null,
      whatsapp_enabled:          whatsapp ? 1 : 0,
      about:                     about || null,
      archetype_family:           archetypes.family / 100,
      archetype_investor:         archetypes.investor / 100,
      archetype_environmentalist: archetypes.environmentalist / 100,
      archetype_skeptic:          archetypes.skeptic / 100,
      consent_data_processing:   consentData ? 1 : 0,
      consent_marketing:         consentMkt ? 1 : 0,
      consent_voice_cloning:     consentVoice ? 1 : 0,
    };
  }

  async function saveCustomer(): Promise<Customer> {
    const res = await fetch('/api/customers', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(buildPayload()),
    });
    const json = await res.json();
    if (json.error) throw new Error(json.error as string);
    return json.data as Customer;
  }

  async function handleSave() {
    setSaving(true);
    setSaveError(null);
    try {
      const customer = await saveCustomer();
      showToast('Customer saved');
      onSuccess(customer);
      onClose();
    } catch (e: unknown) {
      setSaveError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveAndGenerate() {
    setGenerateStep(0);
    setSaveError(null);
    try {
      const customer = await saveCustomer();
      setGenerateStep(1);
      await new Promise<void>(r => setTimeout(r, 700));
      setGenerateStep(2);
      const res = await fetch('/api/strategy/generate', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ customerId: customer.id }),
      });
      if (!res.ok) throw new Error(await res.text());
      onSuccess(customer);
      router.push(`/sequences?customerId=${customer.id}`);
    } catch (e: unknown) {
      setSaveError(e instanceof Error ? e.message : String(e));
      setGenerateStep(null);
    }
  }

  const canSubmit = Boolean(consentData && fname.trim() && lname.trim() && email.trim());
  const isLoading = saving || generateStep !== null;

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed', inset: 0, zIndex: 90,
          backgroundColor: 'rgba(20,24,32,0.35)',
          backdropFilter: 'blur(2px)',
          opacity: open ? 1 : 0,
          pointerEvents: open ? 'auto' : 'none',
          transition: 'opacity 0.25s ease',
        }}
      />

      {/* Slide-over panel */}
      <div
        style={{
          position: 'fixed', top: 0, right: 0, bottom: 0, zIndex: 100,
          width: 540,
          backgroundColor: 'white',
          boxShadow: '-4px 0 32px rgba(20,24,32,0.14)',
          borderLeft: '1px solid var(--color-outline-variant)',
          display: 'flex', flexDirection: 'column',
          transform: open ? 'translateX(0)' : 'translateX(100%)',
          transition: 'transform 0.3s cubic-bezier(0.4,0,0.2,1)',
        }}
      >
        {/* Header */}
        <div
          style={{
            flexShrink: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '20px 24px',
            borderBottom: '1px solid var(--color-outline-variant)',
          }}
        >
          <div>
            <h2 className="font-body-strong text-on-surface" style={{ fontSize: 16, margin: 0 }}>Add customer</h2>
            <p className="font-body-main text-on-surface-variant" style={{ fontSize: 13, marginTop: 2 }}>New lead from intake</p>
          </div>
          <button
            onClick={onClose}
            className="flex items-center justify-center rounded-full hover:opacity-70 transition-opacity"
            style={{ width: 36, height: 36, backgroundColor: 'var(--color-surface-container)', flexShrink: 0 }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 20 }}>close</span>
          </button>
        </div>

        {/* Scrollable form body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '24px', display: 'flex', flexDirection: 'column', gap: 20 }}>

          {/* Row 1: First name | Last name */}
          <div className="grid grid-cols-2 gap-4">
            <Field label="First name" required>
              <input type="text" value={fname} onChange={e => setFname(e.target.value)}
                placeholder="Maria" className={IC} style={IS} />
            </Field>
            <Field label="Last name" required>
              <input type="text" value={lname} onChange={e => setLname(e.target.value)}
                placeholder="Müller" className={IC} style={IS} />
            </Field>
          </div>

          {/* Row 2: Email | Phone */}
          <div className="grid grid-cols-2 gap-4">
            <Field label="Email" required>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)}
                placeholder="maria@example.com" className={IC} style={IS} />
            </Field>
            <Field label="Phone">
              <input type="tel" value={phone} onChange={e => setPhone(e.target.value)}
                placeholder="+49 123 456 789" className={IC} style={IS} />
            </Field>
          </div>

          {/* Row 3: Address */}
          <Field label="Address">
            <input type="text" value={address} onChange={e => setAddress(e.target.value)}
              placeholder="Hauptstraße 1, Munich" className={IC} style={IS} />
          </Field>

          {/* Row 4: Postal code | Language */}
          <div style={{ display: 'flex', gap: 16 }}>
            <div style={{ width: '33%' }}>
              <Field label="Postal code">
                <input type="text" value={postal} onChange={e => setPostal(e.target.value)}
                  placeholder="80331" className={IC} style={IS} />
              </Field>
            </div>
            <div style={{ width: '67%' }}>
              <Field label="Language">
                <select value={language} onChange={e => setLanguage(e.target.value)} className={IC} style={IS}>
                  <option value="en">English</option>
                  <option value="de">Deutsch</option>
                  <option value="es">Español</option>
                  <option value="fr">Français</option>
                </select>
              </Field>
            </div>
          </div>

          {/* Row 5: Solar quote price */}
          <Field label="Solar quote price">
            <div style={{ position: 'relative' }}>
              <span
                className="font-data-mono text-on-surface-variant"
                style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', fontSize: 14, pointerEvents: 'none' }}
              >
                {currencyPrefix(language)}
              </span>
              <input
                type="number" min="0" step="100" value={price}
                onChange={e => setPrice(e.target.value)}
                placeholder="12500"
                className={IC}
                style={{ ...IS, paddingLeft: 28 }}
              />
            </div>
          </Field>

          {/* Row 6: WhatsApp toggle */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '4px 0' }}>
            <div>
              <p className="font-body-main text-on-surface" style={{ fontSize: 14, margin: 0 }}>WhatsApp enabled?</p>
              <p className="font-body-main text-on-surface-variant" style={{ fontSize: 12, marginTop: 2 }}>Customer accepts messages via WhatsApp</p>
            </div>
            <Switch checked={whatsapp} onChange={setWhatsapp} />
          </div>

          <div style={{ height: 1, backgroundColor: 'var(--color-outline-variant)' }} />

          {/* Row 7: About */}
          <Field label="About this customer">
            <textarea
              rows={4}
              value={about}
              onChange={e => setAbout(e.target.value)}
              placeholder="What did they say? What matters to them? Any objections?"
              className={IC}
              style={{ ...IS, resize: 'none' }}
            />
          </Field>

          <div style={{ height: 1, backgroundColor: 'var(--color-outline-variant)' }} />

          {/* Row 8: Archetype sliders */}
          <div>
            <p className="font-body-strong text-on-surface" style={{ fontSize: 14, marginBottom: 4 }}>
              What type is this customer?
            </p>
            <p className="font-body-main text-on-surface-variant" style={{ fontSize: 12, marginBottom: 20 }}>
              Drag to blend — sliders auto-balance to 100%
            </p>

            <div className="grid grid-cols-2 gap-x-6 gap-y-5">
              {ARCH_CONFIG.map(({ key, emoji, label, color }) => (
                <div key={key}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                    <span className="font-body-main text-on-surface" style={{ fontSize: 13 }}>
                      {emoji} {label}
                    </span>
                    <span className="font-data-mono text-on-surface-variant" style={{ fontSize: 12 }}>
                      {archetypes[key]}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={archetypes[key]}
                    onChange={e => handleSlider(key, Number(e.target.value))}
                    style={{ width: '100%', accentColor: color, cursor: 'pointer' }}
                  />
                </div>
              ))}
            </div>

            {/* Live blend summary */}
            <div
              className="font-data-mono text-on-surface-variant"
              style={{
                marginTop: 16,
                padding: '10px 16px',
                borderRadius: 8,
                backgroundColor: 'var(--color-surface-container-low)',
                fontSize: 11,
              }}
            >
              Family {archetypes.family}%
              {' · '}Investor {archetypes.investor}%
              {' · '}Environmentalist {archetypes.environmentalist}%
              {' · '}Skeptic {archetypes.skeptic}%
            </div>
          </div>

          <div style={{ height: 1, backgroundColor: 'var(--color-outline-variant)' }} />

          {/* Row 9: Consent */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <p className="font-body-strong text-on-surface" style={{ fontSize: 14 }}>Consent</p>

            {[
              {
                checked: consentData,
                onChange: setConsentData,
                label: 'I confirm this customer consents to data processing',
                tag: 'GDPR — required',
                tagColor: 'var(--color-error)',
              },
              {
                checked: consentMkt,
                onChange: setConsentMkt,
                label: 'Customer consents to receive marketing messages',
                tag: null,
                tagColor: null,
              },
              {
                checked: consentVoice,
                onChange: setConsentVoice,
                label: 'Customer consents to AI voice cloning (for voice notes)',
                tag: null,
                tagColor: null,
              },
            ].map((item, i) => (
              <label
                key={i}
                style={{ display: 'flex', alignItems: 'flex-start', gap: 12, cursor: 'pointer' }}
              >
                <input
                  type="checkbox"
                  checked={item.checked}
                  onChange={e => item.onChange(e.target.checked)}
                  style={{ marginTop: 2, width: 16, height: 16, cursor: 'pointer', accentColor: 'var(--color-primary)', flexShrink: 0 }}
                />
                <span className="font-body-main text-on-surface" style={{ fontSize: 13 }}>
                  {item.label}
                  {item.tag && (
                    <span
                      className="font-label-caps"
                      style={{ fontSize: 9, marginLeft: 8, color: item.tagColor ?? undefined }}
                    >
                      {item.tag}
                    </span>
                  )}
                </span>
              </label>
            ))}
          </div>

          {/* Error display */}
          {saveError && (
            <div
              style={{
                padding: '12px 16px',
                borderRadius: 8,
                backgroundColor: 'var(--color-error-container)',
              }}
            >
              <p className="font-body-main" style={{ fontSize: 13, color: 'var(--color-on-error-container)', margin: 0 }}>
                {saveError}
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div
          style={{
            flexShrink: 0,
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            padding: '16px 24px',
            borderTop: '1px solid var(--color-outline-variant)',
            backgroundColor: 'var(--color-surface-container-lowest)',
          }}
        >
          <button
            onClick={onClose}
            disabled={isLoading}
            className="font-body-strong hover:opacity-90 transition-all rounded-sm"
            style={{
              padding: '10px 16px',
              border: '1px solid var(--color-outline-variant)',
              color: 'var(--color-on-surface)',
              fontSize: 13,
              opacity: isLoading ? 0.5 : 1,
              backgroundColor: 'white',
            }}
          >
            Cancel
          </button>

          <div style={{ flex: 1 }} />

          {/* Save only */}
          <button
            onClick={handleSave}
            disabled={!canSubmit || isLoading}
            className="font-body-strong hover:opacity-90 active:scale-95 transition-all rounded-sm flex items-center gap-2"
            style={{
              padding: '10px 16px',
              border: '1px solid var(--color-outline-variant)',
              color: canSubmit && !isLoading ? 'var(--color-primary)' : 'var(--color-outline)',
              fontSize: 13,
              backgroundColor: 'white',
              opacity: !canSubmit || isLoading ? 0.5 : 1,
            }}
          >
            {saving && (
              <span className="material-symbols-outlined animate-spin" style={{ fontSize: 14 }}>progress_activity</span>
            )}
            Save customer
          </button>

          {/* Save + Generate */}
          <button
            onClick={handleSaveAndGenerate}
            disabled={!canSubmit || isLoading}
            className="font-body-strong hover:opacity-90 active:scale-95 transition-all rounded-sm flex items-center gap-2"
            style={{
              padding: '10px 16px',
              backgroundColor: canSubmit && !isLoading ? 'var(--color-primary)' : 'var(--color-surface-container)',
              color: canSubmit && !isLoading ? 'var(--color-on-primary)' : 'var(--color-outline)',
              fontSize: 13,
              minWidth: 200,
              justifyContent: 'center',
            }}
          >
            {generateStep !== null ? (
              <>
                <span className="material-symbols-outlined animate-spin" style={{ fontSize: 14 }}>progress_activity</span>
                {GENERATE_STEPS[generateStep]}
              </>
            ) : (
              <>
                <span className="material-symbols-outlined" style={{ fontSize: 14 }}>auto_awesome</span>
                Save + Generate strategy
              </>
            )}
          </button>
        </div>
      </div>

      {/* Toast */}
      {toast && (
        <div
          className="flex items-center gap-2"
          style={{
            position: 'fixed',
            bottom: 32,
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 110,
            padding: '12px 20px',
            borderRadius: 12,
            backgroundColor: '#166534',
            color: 'white',
            boxShadow: '0 4px 16px rgba(0,0,0,0.2)',
          }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: 18 }}>check_circle</span>
          <span className="font-body-strong" style={{ fontSize: 14 }}>{toast}</span>
        </div>
      )}
    </>
  );
}
