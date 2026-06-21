'use client';

import { useState, FormEvent } from 'react';
import { useRouter } from 'next/navigation';

type Tab = 'signin' | 'register';

const ROLE_LABELS: Record<string, string> = {
  installer: 'Installer',
  sales_rep: 'Sales Representative',
  manager:   'Manager',
};

export default function LoginPage() {
  const router = useRouter();
  const [tab, setTab]       = useState<Tab>('signin');
  const [loading, setLoading] = useState(false);
  const [error, setError]   = useState<string | null>(null);

  // Sign-in fields
  const [siEmail, setSiEmail] = useState('');
  const [siPhone, setSiPhone] = useState('');

  // Register fields
  const [rFullName,    setRFullName]    = useState('');
  const [rEmail,       setREmail]       = useState('');
  const [rPhone,       setRPhone]       = useState('');
  const [rCompany,     setRCompany]     = useState('');
  const [rRole,        setRRole]        = useState('installer');

  async function handleSignIn(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res  = await fetch('/api/installer/login', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ email: siEmail, phone: siPhone }),
      });
      const json = await res.json();
      if (!res.ok || json.error) throw new Error(json.error ?? `HTTP ${res.status}`);
      router.push('/pipeline');
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  async function handleRegister(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res  = await fetch('/api/installer/register', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          fullName:    rFullName,
          email:       rEmail,
          phone:       rPhone,
          companyName: rCompany,
          role:        rRole,
        }),
      });
      const json = await res.json();
      if (!res.ok || json.error) throw new Error(json.error ?? `HTTP ${res.status}`);
      router.push('/pipeline');
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      className="min-h-screen flex items-center justify-center p-4"
      style={{ backgroundColor: 'var(--color-background)' }}
    >
      <div className="w-full max-w-md space-y-8">

        {/* Wordmark */}
        <div className="text-center space-y-1">
          <h1
            className="font-display-md italic"
            style={{ fontSize: 32, color: 'var(--color-primary)' }}
          >
            Cadence
          </h1>
          <p className="font-label-caps text-outline" style={{ fontSize: 10 }}>BY REONIC</p>
        </div>

        {/* Card */}
        <div
          className="rounded-2xl p-8 space-y-6"
          style={{ backgroundColor: 'var(--color-surface)', border: '1px solid var(--color-outline-variant)' }}
        >
          {/* Tabs */}
          <div className="flex" style={{ borderBottom: '1px solid var(--color-outline-variant)' }}>
            {(['signin', 'register'] as Tab[]).map(t => (
              <button
                key={t}
                onClick={() => { setTab(t); setError(null); }}
                className="flex-1 py-2.5 font-body-strong transition-colors"
                style={{
                  fontSize:     13,
                  color:        tab === t ? 'var(--color-primary)' : 'var(--color-on-surface-variant)',
                  borderBottom: tab === t ? '2px solid var(--color-primary)' : '2px solid transparent',
                  marginBottom: -1,
                }}
              >
                {t === 'signin' ? 'Sign In' : 'Create Account'}
              </button>
            ))}
          </div>

          {/* Error banner */}
          {error && (
            <div
              className="px-4 py-3 rounded-lg"
              style={{ backgroundColor: 'var(--color-error-container)', color: 'var(--color-on-error-container)', fontSize: 13 }}
            >
              {error}
            </div>
          )}

          {/* ── Sign In ────────────────────────────────────────────── */}
          {tab === 'signin' && (
            <form onSubmit={handleSignIn} className="space-y-4">
              <p className="text-on-surface-variant" style={{ fontSize: 13 }}>
                Enter the email and phone number linked to your installer account.
              </p>

              <Field
                label="Email address"
                type="email"
                value={siEmail}
                onChange={setSiEmail}
                placeholder="you@company.com"
                required
              />
              <Field
                label="Phone number"
                type="tel"
                value={siPhone}
                onChange={setSiPhone}
                placeholder="+1 555 000 0000"
                required
              />

              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 font-body-strong rounded-xl flex items-center justify-center gap-2 hover:opacity-90 active:scale-95 transition-all disabled:opacity-50"
                style={{ backgroundColor: 'var(--color-primary)', color: 'white', fontSize: 14 }}
              >
                {loading ? (
                  <span className="w-4 h-4 rounded-full border-2 border-white border-t-transparent animate-spin" />
                ) : (
                  <>
                    Sign in
                    <span className="material-symbols-outlined" style={{ fontSize: 16 }}>arrow_forward</span>
                  </>
                )}
              </button>

              <p className="text-center text-on-surface-variant" style={{ fontSize: 12 }}>
                No account yet?{' '}
                <button
                  type="button"
                  onClick={() => { setTab('register'); setError(null); }}
                  className="underline"
                  style={{ color: 'var(--color-primary)' }}
                >
                  Create one
                </button>
              </p>
            </form>
          )}

          {/* ── Register ───────────────────────────────────────────── */}
          {tab === 'register' && (
            <form onSubmit={handleRegister} className="space-y-4">
              <Field
                label="Full name"
                type="text"
                value={rFullName}
                onChange={setRFullName}
                placeholder="Alex Johnson"
                required
              />
              <Field
                label="Email address"
                type="email"
                value={rEmail}
                onChange={setREmail}
                placeholder="alex@solarco.com"
                required
              />
              <Field
                label="Phone number"
                type="tel"
                value={rPhone}
                onChange={setRPhone}
                placeholder="+1 555 000 0000"
                required
              />
              <Field
                label="Company name"
                type="text"
                value={rCompany}
                onChange={setRCompany}
                placeholder="SolarCo GmbH"
                required
              />

              {/* Role select */}
              <div>
                <label className="font-label-caps text-outline block mb-1.5" style={{ fontSize: 9 }}>
                  YOUR ROLE
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {Object.entries(ROLE_LABELS).map(([val, label]) => (
                    <button
                      key={val}
                      type="button"
                      onClick={() => setRRole(val)}
                      className="py-2 px-3 rounded-lg font-body-strong text-center transition-all"
                      style={{
                        fontSize:        12,
                        border:          rRole === val
                          ? '1.5px solid var(--color-primary)'
                          : '1.5px solid var(--color-outline-variant)',
                        color:           rRole === val ? 'var(--color-primary)' : 'var(--color-on-surface-variant)',
                        backgroundColor: rRole === val ? 'rgba(20,69,55,0.08)' : 'transparent',
                      }}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 font-body-strong rounded-xl flex items-center justify-center gap-2 hover:opacity-90 active:scale-95 transition-all disabled:opacity-50"
                style={{ backgroundColor: 'var(--color-primary)', color: 'white', fontSize: 14 }}
              >
                {loading ? (
                  <span className="w-4 h-4 rounded-full border-2 border-white border-t-transparent animate-spin" />
                ) : (
                  <>
                    Create account
                    <span className="material-symbols-outlined" style={{ fontSize: 16 }}>arrow_forward</span>
                  </>
                )}
              </button>
            </form>
          )}
        </div>

        <p className="text-center text-outline" style={{ fontSize: 11 }}>
          Installer portal · Solar sales platform
        </p>
      </div>
    </div>
  );
}

// ── Shared input component ────────────────────────────────────────────────────

function Field({
  label, type, value, onChange, placeholder, required,
}: {
  label: string;
  type: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  required?: boolean;
}) {
  return (
    <div>
      <label className="font-label-caps text-outline block mb-1.5" style={{ fontSize: 9 }}>
        {label.toUpperCase()}
      </label>
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        required={required}
        className="w-full rounded-xl px-4 py-3 text-on-surface transition-all"
        style={{
          border:          '1px solid var(--color-outline-variant)',
          fontSize:        14,
          outline:         'none',
          backgroundColor: 'var(--color-surface-container)',
          fontFamily:      'inherit',
        }}
        onFocus={e  => { e.currentTarget.style.borderColor = 'var(--color-primary)'; }}
        onBlur={e   => { e.currentTarget.style.borderColor = 'var(--color-outline-variant)'; }}
      />
    </div>
  );
}
