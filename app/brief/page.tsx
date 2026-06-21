'use client';

import { useEffect, useRef, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { Suspense } from 'react';
import SideNav from '@/app/components/SideNav';

// ── Types ─────────────────────────────────────────────────────────────────────

interface OnePager {
  dealHeader:            string;
  myRead:                string;
  myPlan:                string;
  risksAndMitigations:   { risk: string; mitigation: string }[];
  whereIneedHelp:        string;
  closeTargetDate:       string;
  expectedOutcome:       string;
}

interface Metadata {
  sequenceId:     string;
  customerId:     string;
  generatedAt:    string;
  installerName:  string;
  customer:       { firstName: string; lastName: string };
  priceQuote:     number | null;
  archetypeBlend: { family: number; investor: number; environmentalist: number; skeptic: number };
  scores:         { ghostRisk: number; closeReadiness: number };
  touchSummary:   { dayOffset: number; channel: string; reasoning: string | null }[];
  channelStats:   { channel: string; scheduled: number; sent: number; replies: number }[];
}

type Phase = 'idle' | 'streaming' | 'complete' | 'error';

// ── Helpers ───────────────────────────────────────────────────────────────────

function TOUCH_ICON(channel: string): string {
  const map: Record<string, string> = {
    email: 'mail', call: 'call', sms: 'sms', whatsapp_text: 'chat',
    whatsapp_voice: 'phone_in_talk', linkedin: 'link', video: 'videocam',
    microsite: 'article', in_person: 'handshake', postcard: 'mail_outline',
  };
  return map[channel] ?? 'notifications';
}

function fmtPrice(amount: number | null): string {
  if (amount == null) return '—';
  return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR', minimumFractionDigits: 0 }).format(amount);
}

// Parse partial JSON text to extract completed and in-progress string fields
function parseStreamingFields(text: string): {
  completed: Partial<Record<string, string>>;
  currentField: string | null;
  currentText:  string;
} {
  const completed: Record<string, string> = {};
  let currentField: string | null = null;
  let currentText = '';
  const fieldNames = ['dealHeader', 'myRead', 'myPlan', 'whereIneedHelp', 'closeTargetDate', 'expectedOutcome'];

  for (const field of fieldNames) {
    const keyStr = `"${field}"`;
    const keyIdx = text.indexOf(keyStr);
    if (keyIdx === -1) continue;

    // Find opening quote after colon
    let i = keyIdx + keyStr.length;
    while (i < text.length && (text[i] === ' ' || text[i] === ':' || text[i] === '\t' || text[i] === '\n')) i++;
    if (i >= text.length || text[i] !== '"') continue;
    i++; // skip opening quote

    let value = '';
    let complete = false;
    while (i < text.length) {
      const ch = text[i];
      if (ch === '\\' && i + 1 < text.length) {
        const nx = text[i + 1];
        if (nx === 'n') value += '\n';
        else if (nx === 't') value += '\t';
        else if (nx === '"') value += '"';
        else if (nx === '\\') value += '\\';
        else value += nx;
        i += 2;
      } else if (ch === '"') {
        complete = true;
        i++;
        break;
      } else {
        value += ch;
        i++;
      }
    }

    if (complete) {
      completed[field] = value;
    } else if (value.length > 0 && !currentField) {
      currentField = field;
      currentText  = value;
    }
  }

  return { completed, currentField, currentText };
}

// ── SVG Chart Components ───────────────────────────────────────────────────────

function ArchetypeDonut({
  blend,
  animated,
}: {
  blend: Metadata['archetypeBlend'];
  animated: boolean;
}) {
  const SIZE = 130, R = 48, STROKE = 15;
  const cx = SIZE / 2, cy = SIZE / 2;
  const circ = 2 * Math.PI * R;

  const raw = [
    { key: 'family',           label: 'Family',   color: '#226a50' },
    { key: 'investor',         label: 'Investor',  color: '#144537' },
    { key: 'environmentalist', label: 'Eco',       color: '#3d9e72' },
    { key: 'skeptic',          label: 'Skeptic',   color: '#a05050' },
  ].map(s => ({ ...s, value: blend[s.key as keyof typeof blend] ?? 0 }))
   .filter(s => s.value > 0.01);

  const total = raw.reduce((a, b) => a + b.value, 0) || 1;
  const segs  = raw.map(s => ({ ...s, frac: s.value / total }));

  let rotation = -90;
  const arcs = segs.map(s => {
    const dash = s.frac * circ;
    const gap  = circ - dash;
    const rot  = rotation;
    rotation += s.frac * 360;
    return { ...s, dash, gap, rot };
  });

  const dominant = [...segs].sort((a, b) => b.value - a.value)[0];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
      <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`}>
        <circle cx={cx} cy={cy} r={R} fill="none" stroke="#e8e8e3" strokeWidth={STROKE} />
        {arcs.map((arc, i) => (
          <circle
            key={i}
            cx={cx} cy={cy} r={R}
            fill="none"
            stroke={arc.color}
            strokeWidth={STROKE}
            strokeLinecap="butt"
            style={{
              strokeDasharray:  animated ? `${arc.dash} ${arc.gap}` : `0 ${circ}`,
              transition:       `stroke-dasharray ${0.9 + i * 0.2}s cubic-bezier(0.4,0,0.2,1) ${i * 0.18}s`,
              transform:        `rotate(${arc.rot}deg)`,
              transformOrigin:  `${cx}px ${cy}px`,
            }}
          />
        ))}
        <text x={cx} y={cy - 6} textAnchor="middle"
          style={{ fontSize: 8, fill: '#aaa', fontFamily: 'JetBrains Mono', letterSpacing: '0.08em' }}>
          ARCHETYPE
        </text>
        <text x={cx} y={cy + 11} textAnchor="middle"
          style={{ fontSize: 13, fill: dominant?.color ?? '#144537', fontFamily: 'Inter', fontWeight: 700 }}>
          {dominant?.label ?? '—'}
        </text>
      </svg>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, width: '100%' }}>
        {arcs.map(arc => (
          <div key={arc.key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <div style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: arc.color, flexShrink: 0 }} />
              <span style={{ fontSize: 9, color: '#717975', fontFamily: 'JetBrains Mono', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                {arc.label}
              </span>
            </div>
            <span style={{ fontSize: 9, color: '#404945', fontFamily: 'JetBrains Mono', fontWeight: 600 }}>
              {Math.round(arc.value * 100)}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function ScoreGauge({
  value,
  label,
  danger = false,
  animated,
}: {
  value: number;
  label: string;
  danger?: boolean;
  animated: boolean;
}) {
  const W = 110, H = 70, R = 40;
  const cx = W / 2, cy = H - 8;
  const halfCirc = Math.PI * R;
  const valueDash = animated ? Math.min(value, 0.9999) * halfCirc : 0;
  const trackPath = `M ${cx - R} ${cy} A ${R} ${R} 0 0 1 ${cx + R} ${cy}`;
  const color = danger
    ? value > 0.66 ? '#ba1a1a' : value > 0.4 ? '#d97706' : '#226a50'
    : value > 0.55 ? '#144537' : '#3d9e72';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`}>
        <path d={trackPath} fill="none" stroke="#e8e8e3" strokeWidth={9} strokeLinecap="round" />
        <path
          d={trackPath}
          fill="none"
          stroke={color}
          strokeWidth={9}
          strokeLinecap="round"
          style={{
            strokeDasharray: `${valueDash} ${halfCirc}`,
            transition:      'stroke-dasharray 1.1s cubic-bezier(0.4,0,0.2,1) 0.3s',
          }}
        />
        <text x={cx} y={cy - 7} textAnchor="middle"
          style={{ fontSize: 16, fill: color, fontFamily: 'Inter', fontWeight: 700 }}>
          {Math.round(value * 100)}%
        </text>
      </svg>
      <p style={{ fontSize: 9, color: '#717975', fontFamily: 'JetBrains Mono', textTransform: 'uppercase',
        letterSpacing: '0.05em', textAlign: 'center', marginTop: -2 }}>
        {label}
      </p>
    </div>
  );
}

// ── Skeleton loader ────────────────────────────────────────────────────────────

function SkeletonLines({ lines = 3 }: { lines?: number }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {Array.from({ length: lines }).map((_, i) => (
        <div
          key={i}
          style={{
            height: 10, borderRadius: 4, backgroundColor: '#efefed',
            width: i === lines - 1 ? '65%' : i % 2 === 0 ? '100%' : '88%',
            animation: `pulse 1.8s ease-in-out infinite ${i * 0.15}s`,
          }}
        />
      ))}
    </div>
  );
}

// ── Text field with streaming cursor ──────────────────────────────────────────

function StreamText({
  field,
  completed,
  currentField,
  currentText,
  finalValue,
  className,
  style,
  skeletonLines = 3,
  phase,
}: {
  field: string;
  completed:    Partial<Record<string, string>>;
  currentField: string | null;
  currentText:  string;
  finalValue:   string | undefined;
  className?:   string;
  style?:       React.CSSProperties;
  skeletonLines?: number;
  phase: Phase;
}) {
  const text = finalValue ?? completed[field];
  const inProgress = !text && currentField === field;

  if (text) return <p className={className} style={style}>{text}</p>;

  if (inProgress) {
    return (
      <p className={className} style={style}>
        {currentText}
        <span style={{
          display: 'inline-block', width: 2, height: 13, backgroundColor: 'var(--color-primary)',
          marginLeft: 2, verticalAlign: 'text-bottom', borderRadius: 1,
          animation: 'pulse 0.9s ease-in-out infinite',
        }} />
      </p>
    );
  }

  if (phase === 'streaming') return <SkeletonLines lines={skeletonLines} />;
  return <p className={className} style={style}>—</p>;
}

// ── Share modal (unchanged from original) ─────────────────────────────────────

function buildBriefHtml(meta: Metadata, op: OnePager): string {
  const name  = `${meta.customer.firstName} ${meta.customer.lastName}`;
  const price = fmtPrice(meta.priceQuote);
  const risks = op.risksAndMitigations
    .map(r => `<p style="margin:6px 0"><strong>${r.risk}</strong><br><span style="color:#666">${r.mitigation}</span></p>`)
    .join('');
  return [
    `<div style="font-family:Arial,sans-serif;max-width:640px;margin:0 auto;color:#1a1a1a">`,
    `<h1 style="font-size:22px;margin-bottom:4px">${name} — Deal Brief</h1>`,
    `<p style="color:#666;margin-top:0">${price}</p>`,
    `<p style="font-style:italic;color:#444">${op.dealHeader}</p>`,
    `<hr style="border:none;border-top:1px solid #e0e0e0;margin:20px 0">`,
    `<h2 style="font-size:12px;text-transform:uppercase;color:#888">My Read</h2><p>${op.myRead}</p>`,
    `<h2 style="font-size:12px;text-transform:uppercase;color:#888">My Plan</h2><p>${op.myPlan}</p>`,
    `<h2 style="font-size:12px;text-transform:uppercase;color:#888">Where I Need Help</h2>`,
    `<p style="background:#f5f5f5;padding:12px;border-left:3px solid #2e5d4e;font-style:italic">&ldquo;${op.whereIneedHelp}&rdquo;</p>`,
    risks ? `<h2 style="font-size:12px;text-transform:uppercase;color:#888">Risks &amp; Mitigations</h2>${risks}` : '',
    `<hr style="border:none;border-top:1px solid #e0e0e0;margin:20px 0">`,
    `<p style="font-size:11px;color:#aaa">Generated by Cadence · EU AI Act Art. 50 · ${meta.generatedAt.slice(0, 10)}</p>`,
    `</div>`,
  ].join('');
}

function ShareModal({ meta, onePager, onClose }: { meta: Metadata; onePager: OnePager; onClose: () => void }) {
  const fullName = `${meta.customer.firstName} ${meta.customer.lastName}`;
  const [email,   setEmail]   = useState('');
  const [copied,  setCopied]  = useState(false);
  const [sending, setSending] = useState(false);
  const [sent,    setSent]    = useState(false);
  const [error,   setError]   = useState<string | null>(null);

  function copyLink() {
    navigator.clipboard.writeText(window.location.href);
    setCopied(true); setTimeout(() => setCopied(false), 2000);
  }

  async function sendToManager() {
    if (!email.trim()) return;
    setSending(true); setError(null);
    try {
      const res = await fetch('/api/channels/gmail/send', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to_email: email.trim(), subject: `Deal brief: ${fullName}`, html_body: buildBriefHtml(meta, onePager) }),
      });
      const j = await res.json();
      if (j.error) throw new Error(j.error as string);
      setSent(true);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally { setSending(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ backgroundColor: 'rgba(5,26,16,0.6)', backdropFilter: 'blur(4px)' }}
      onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl p-8 w-full max-w-md flex flex-col gap-6"
        style={{ border: '1px solid var(--color-outline-variant)' }}
        onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 className="font-body-strong text-on-surface" style={{ fontSize: 16 }}>Share deal brief</h2>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full hover:opacity-70 transition-opacity"
            style={{ backgroundColor: 'var(--color-surface-container)' }}>
            <span className="material-symbols-outlined" style={{ fontSize: 18 }}>close</span>
          </button>
        </div>
        <div className="flex flex-col gap-2">
          <p className="font-label-caps text-on-surface-variant uppercase" style={{ fontSize: 10 }}>Share via link</p>
          <button onClick={copyLink} className="flex items-center gap-2 px-4 py-2.5 font-body-strong rounded-sm hover:opacity-90 transition-all"
            style={{ border: '1px solid var(--color-outline-variant)', color: copied ? '#166534' : 'var(--color-on-surface)', backgroundColor: copied ? '#f0fdf4' : 'white', fontSize: 13 }}>
            <span className="material-symbols-outlined" style={{ fontSize: 16 }}>{copied ? 'check' : 'link'}</span>
            {copied ? 'Link copied!' : 'Copy link'}
          </button>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex-1 h-px" style={{ backgroundColor: 'var(--color-outline-variant)' }} />
          <span className="font-label-caps text-outline uppercase" style={{ fontSize: 9 }}>or</span>
          <div className="flex-1 h-px" style={{ backgroundColor: 'var(--color-outline-variant)' }} />
        </div>
        <div className="flex flex-col gap-3">
          <p className="font-label-caps text-on-surface-variant uppercase" style={{ fontSize: 10 }}>Email to manager</p>
          {sent ? (
            <div className="flex items-center gap-2 px-4 py-3 rounded-lg"
              style={{ backgroundColor: '#f0fdf4', border: '1px solid #86efac' }}>
              <span className="material-symbols-outlined" style={{ fontSize: 16, color: '#166534' }}>check_circle</span>
              <span className="font-body-main" style={{ fontSize: 13, color: '#166534' }}>Brief sent to {email}</span>
            </div>
          ) : (
            <>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="manager@company.com"
                className="w-full px-3 py-2 rounded-sm font-body-main text-on-surface"
                style={{ fontSize: 13, border: '1px solid var(--color-outline-variant)', outline: 'none', backgroundColor: 'white' }}
                onKeyDown={e => e.key === 'Enter' && sendToManager()} />
              <button onClick={sendToManager} disabled={sending || !email.trim()}
                className="flex items-center justify-center gap-2 px-4 py-2.5 font-body-strong rounded-sm hover:opacity-90 transition-all"
                style={{ backgroundColor: 'var(--color-primary)', color: 'white', fontSize: 13, opacity: sending || !email.trim() ? 0.6 : 1 }}>
                {sending && <span className="material-symbols-outlined" style={{ fontSize: 14, animation: 'spin 1s linear infinite' }}>progress_activity</span>}
                <span className="material-symbols-outlined" style={{ fontSize: 16 }}>send</span>
                {sending ? 'Sending…' : 'Send brief'}
              </button>
              {error && <p className="font-body-main" style={{ fontSize: 12, color: 'var(--color-error)' }}>{error}</p>}
            </>
          )}
          <p className="font-label-caps text-outline" style={{ fontSize: 9 }}>
            ⚠ Only send to internal team members — this brief contains deal intelligence.
          </p>
        </div>
      </div>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

function BriefInner() {
  const router       = useRouter();
  const searchParams = useSearchParams();
  const sequenceId   = searchParams.get('sequenceId');

  const [phase,       setPhase]       = useState<Phase>('idle');
  const [metadata,    setMetadata]    = useState<Metadata | null>(null);
  const [accumulated, setAccumulated] = useState('');
  const [onePager,    setOnePager]    = useState<OnePager | null>(null);
  const [error,       setError]       = useState<string | null>(null);
  const [animated,    setAnimated]    = useState(false);
  const [shareOpen,   setShareOpen]   = useState(false);
  const [managerPhoto, setManagerPhoto] = useState<string | null>(null);
  const esRef = useRef<EventSource | null>(null);

  useEffect(() => {
    setManagerPhoto(localStorage.getItem('cadence_user_photo'));
  }, []);

  useEffect(() => {
    if (metadata && !animated) {
      const t = setTimeout(() => setAnimated(true), 80);
      return () => clearTimeout(t);
    }
  }, [metadata, animated]);

  useEffect(() => {
    if (!sequenceId) return;
    setPhase('streaming');
    setAccumulated('');
    setOnePager(null);
    setError(null);
    setAnimated(false);
    setMetadata(null);

    const es = new EventSource(`/api/export/manager-pdf/stream?sequenceId=${encodeURIComponent(sequenceId)}`);
    esRef.current = es;

    es.addEventListener('metadata', (e: MessageEvent) => {
      setMetadata(JSON.parse(e.data) as Metadata);
    });
    es.addEventListener('delta', (e: MessageEvent) => {
      const { text } = JSON.parse(e.data) as { text: string };
      setAccumulated(prev => prev + text);
    });
    es.addEventListener('complete', (e: MessageEvent) => {
      const { onePager: op } = JSON.parse(e.data) as { onePager: OnePager };
      setOnePager(op);
      setPhase('complete');
      es.close();
    });
    es.addEventListener('gen_error', (e: MessageEvent) => {
      const { message } = JSON.parse(e.data) as { message: string };
      setError(message);
      setPhase('error');
      es.close();
    });
    es.onerror = () => {
      if (phase !== 'complete') {
        setError('Connection lost. Please try again.');
        setPhase('error');
      }
      es.close();
    };

    return () => { es.close(); esRef.current = null; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sequenceId]);

  // Derived
  const today    = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }).toUpperCase();
  const fullName = metadata ? `${metadata.customer.firstName} ${metadata.customer.lastName}` : '—';
  const refCode  = metadata
    ? `SP-${metadata.sequenceId.slice(-4).toUpperCase()}-${(metadata.customer.lastName ?? '').toUpperCase().slice(0, 6)}`
    : '—';
  const price = fmtPrice(metadata?.priceQuote ?? null);

  // Archetype chips
  const chips: { label: string; bg: string; text: string }[] = [];
  if (metadata) {
    const b = metadata.archetypeBlend;
    if (b.family > 0.2)           chips.push({ label: 'Family',    bg: 'rgba(20,69,55,0.12)',  text: '#144537' });
    if (b.investor > 0.2)         chips.push({ label: 'Investor',  bg: 'rgba(34,106,80,0.15)', text: '#226a50' });
    if (b.environmentalist > 0.2) chips.push({ label: 'Eco-focus', bg: 'rgba(61,158,114,0.15)',text: '#226a50' });
    if (b.skeptic > 0.15)         chips.push({ label: 'Skeptic',   bg: 'rgba(160,80,80,0.12)', text: '#7a3030' });
  }

  // Streaming field parsing
  const { completed, currentField, currentText } = parseStreamingFields(accumulated);
  const streamProps = { completed, currentField, currentText, phase };

  const isDoc = phase === 'streaming' || phase === 'complete';

  return (
    <div className="flex min-h-screen" style={{
      background: 'linear-gradient(135deg, #051a10 0%, #0c2816 35%, #0f3220 65%, #0a1e12 100%)',
    }}>
      <SideNav />

      {shareOpen && metadata && onePager && (
        <ShareModal meta={metadata} onePager={onePager} onClose={() => setShareOpen(false)} />
      )}

      <main className="ml-64 flex-1 p-10 flex flex-col items-center">
        {/* ── Controls bar ── */}
        <div className="w-full max-w-[210mm] flex justify-between items-end mb-8 no-print">
          <div>
            <h2 style={{ fontSize: 22, fontWeight: 700, color: 'white', fontFamily: 'Inter' }}>Preview Deal Brief</h2>
            <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.55)', marginTop: 4, fontFamily: 'Inter' }}>
              Review the generated summary before exporting to PDF.
            </p>
          </div>
          <div className="flex gap-3">
            <button onClick={() => router.back()}
              className="px-4 py-2 rounded-sm font-body-strong hover:opacity-90 active:scale-95 transition-all"
              style={{ border: '1px solid rgba(255,255,255,0.2)', color: 'rgba(255,255,255,0.8)', backgroundColor: 'rgba(255,255,255,0.06)', fontSize: 13 }}>
              Edit before sending
            </button>
            <button onClick={() => setShareOpen(true)} disabled={!onePager}
              className="px-4 py-2 rounded-sm font-body-strong flex items-center gap-2 hover:opacity-90 active:scale-95 transition-all"
              style={{ border: '1px solid rgba(255,255,255,0.2)', color: onePager ? '#9fd1be' : 'rgba(255,255,255,0.3)', backgroundColor: 'rgba(255,255,255,0.06)', fontSize: 13 }}>
              <span className="material-symbols-outlined" style={{ fontSize: 16 }}>share</span>
              Share brief
            </button>
            <button className="px-4 py-2 rounded-sm font-body-strong flex items-center gap-2 hover:opacity-90 active:scale-95 transition-all"
              style={{ backgroundColor: 'var(--color-primary)', color: 'white', fontSize: 13 }}
              onClick={() => window.print()}>
              <span className="material-symbols-outlined" style={{ fontSize: 16 }}>download</span>
              Download PDF
            </button>
          </div>
        </div>

        {/* ── States ── */}
        {phase === 'idle' && (
          <div className="w-full max-w-[210mm] p-8 rounded-xl text-center"
            style={{ border: '1px dashed rgba(255,255,255,0.15)', color: 'rgba(255,255,255,0.4)', fontSize: 14 }}>
            No sequence selected. Go to Sequence Planner and generate a strategy first.
          </div>
        )}

        {phase === 'error' && (
          <div className="w-full max-w-[210mm] p-8 rounded-xl text-center"
            style={{ backgroundColor: 'rgba(186,26,26,0.12)', border: '1px solid rgba(186,26,26,0.3)' }}>
            <p style={{ color: '#fca5a5', fontSize: 14 }}>{error}</p>
            <p style={{ color: 'rgba(252,165,165,0.6)', fontSize: 12, marginTop: 6 }}>
              Make sure a strategy has been generated for this customer first.
            </p>
          </div>
        )}

        {/* ── A4 Document ── */}
        {isDoc && (
          <article className="a4-container bg-white flex flex-col relative overflow-hidden"
            style={{ boxShadow: '0 8px 40px rgba(0,0,0,0.5)', border: 'none', padding: '3.5rem' }}>

            {/* Document header */}
            <header className="flex justify-between items-start pb-7 mb-8"
              style={{ borderBottom: '1px solid #E8E8E3' }}>
              <span className="font-wordmark italic text-primary leading-none" style={{ fontSize: 28 }}>Cadence</span>
              <div className="text-right">
                <span className="font-label-caps text-outline block mb-1" style={{ fontSize: 10 }}>
                  DEAL BRIEF · {today}
                </span>
                <span className="font-data-mono text-outline-variant" style={{ fontSize: 9 }}>REF: {refCode}</span>
              </div>
            </header>

            {/* Customer hero */}
            <section className="mb-8">
              <div className="flex justify-between items-start">
                <div style={{ flex: 1 }}>
                  <h1 className="font-display-lg italic text-primary" style={{ fontSize: 38, lineHeight: 1.1, marginBottom: 8 }}>
                    {fullName}
                  </h1>
                  <div className="flex items-center gap-3 font-data-mono text-on-surface-variant uppercase tracking-wider" style={{ fontSize: 11 }}>
                    <span>{price}</span>
                    {metadata?.scores?.closeReadiness != null && (
                      <>
                        <span style={{ width: 3, height: 3, borderRadius: '50%', backgroundColor: '#c0c8c3', display: 'inline-block' }} />
                        <span>CLOSE TARGET {metadata.scores.closeReadiness > 0.6 ? 'HIGH CONFIDENCE' : 'BUILDING'}</span>
                      </>
                    )}
                  </div>
                  {/* Streaming deal header */}
                  <div style={{ marginTop: 10 }}>
                    <StreamText field="dealHeader" finalValue={onePager?.dealHeader}
                      className="font-body-main text-on-surface-variant italic" style={{ fontSize: 13 }}
                      skeletonLines={1} {...streamProps} />
                  </div>
                </div>
                {/* Chips */}
                <div className="flex gap-1.5 flex-wrap justify-end ml-4" style={{ maxWidth: 160 }}>
                  {chips.map(chip => (
                    <span key={chip.label} className="archetype-chip"
                      style={{ backgroundColor: chip.bg, color: chip.text, border: `1px solid ${chip.bg}`, fontSize: 10, padding: '3px 8px', borderRadius: 4, fontFamily: 'JetBrains Mono', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                      {chip.label}
                    </span>
                  ))}
                </div>
              </div>
              <div className="mt-6 h-px w-full" style={{ backgroundColor: '#E8E8E3' }} />
            </section>

            {/* ── Charts band ── */}
            {metadata && (
              <section className="mb-8 pb-8" style={{ borderBottom: '1px solid #E8E8E3' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 24, alignItems: 'start' }}>

                  {/* Archetype donut */}
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
                    <p className="font-label-caps text-outline uppercase" style={{ fontSize: 9, marginBottom: 4 }}>Buyer Profile</p>
                    <ArchetypeDonut blend={metadata.archetypeBlend} animated={animated} />
                  </div>

                  {/* Ghost risk gauge */}
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
                    <p className="font-label-caps text-outline uppercase" style={{ fontSize: 9, marginBottom: 4 }}>Ghost Risk</p>
                    <ScoreGauge value={metadata.scores.ghostRisk} label="chance of going dark" danger animated={animated} />
                    <div style={{ marginTop: 4, display: 'flex', flexDirection: 'column', gap: 3, width: '100%', maxWidth: 110 }}>
                      {metadata.channelStats.slice(0, 4).map(s => (
                        <div key={s.channel} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <div style={{
                            height: 4, borderRadius: 2,
                            width: `${metadata.channelStats.length > 0 ? (s.scheduled / Math.max(...metadata.channelStats.map(x => x.scheduled))) * 100 : 0}%`,
                            minWidth: 4,
                            backgroundColor: s.sent > 0 ? '#144537' : '#c0c8c3',
                            transition: animated ? 'width 0.8s cubic-bezier(0.4,0,0.2,1) 0.5s' : 'none',
                            maxWidth: 70,
                          }} />
                          <span style={{ fontSize: 8, color: '#717975', fontFamily: 'JetBrains Mono', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>
                            {s.channel.replace(/_/g, ' ')}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Close readiness gauge */}
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
                    <p className="font-label-caps text-outline uppercase" style={{ fontSize: 9, marginBottom: 4 }}>Close Readiness</p>
                    <ScoreGauge value={metadata.scores.closeReadiness} label="readiness to close" animated={animated} />
                    {/* Touch timeline */}
                    {metadata.touchSummary.length > 0 && (
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, marginTop: 6, position: 'relative', width: '100%', maxWidth: 110 }}>
                        <div style={{ position: 'absolute', top: '50%', left: 0, right: 0, height: 1, backgroundColor: '#E8E8E3', zIndex: 0 }} />
                        {metadata.touchSummary.slice(0, 6).map((t, idx) => (
                          <div key={idx} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, zIndex: 1, backgroundColor: 'white', padding: '0 2px' }}>
                            <span className="material-symbols-outlined" style={{
                              fontSize: 12,
                              color: idx < Math.ceil(metadata.touchSummary.length / 2) ? 'var(--color-primary)' : '#c0c8c3',
                            }}>
                              {TOUCH_ICON(t.channel)}
                            </span>
                            <span style={{ fontSize: 7, color: '#c0c8c3', fontFamily: 'JetBrains Mono' }}>D{t.dayOffset}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </section>
            )}

            {/* ── Body text ── */}
            <div className="grid gap-10 flex-grow" style={{ gridTemplateColumns: '7fr 5fr' }}>
              {/* Left column */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
                <section>
                  <h3 className="font-label-caps text-outline uppercase mb-3" style={{ fontSize: 10 }}>My Read</h3>
                  <StreamText field="myRead" finalValue={onePager?.myRead}
                    className="font-body-main text-on-surface-variant leading-relaxed" style={{ fontSize: 13 }}
                    skeletonLines={4} {...streamProps} />
                </section>

                <section className="pl-5 py-4"
                  style={{ backgroundColor: 'rgba(20,69,55,0.05)', borderLeft: '2px solid var(--color-primary-container)' }}>
                  <h3 className="font-label-caps text-primary uppercase mb-2" style={{ fontSize: 10 }}>Where I need help</h3>
                  {(onePager?.whereIneedHelp || completed['whereIneedHelp'] || currentField === 'whereIneedHelp') ? (
                    <StreamText field="whereIneedHelp" finalValue={onePager?.whereIneedHelp}
                      className="font-body-main text-on-surface-variant italic" style={{ fontSize: 13 }}
                      skeletonLines={2} {...streamProps} />
                  ) : phase === 'streaming' ? (
                    <SkeletonLines lines={2} />
                  ) : (
                    <p className="font-body-main text-on-surface-variant italic" style={{ fontSize: 13 }}>—</p>
                  )}
                </section>
              </div>

              {/* Right column */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
                <section>
                  <h3 className="font-label-caps text-outline uppercase mb-3" style={{ fontSize: 10 }}>My Plan</h3>
                  <StreamText field="myPlan" finalValue={onePager?.myPlan}
                    className="font-body-main text-on-surface-variant leading-relaxed" style={{ fontSize: 12 }}
                    skeletonLines={4} {...streamProps} />
                </section>

                <section>
                  <h3 className="font-label-caps text-outline uppercase mb-3" style={{ fontSize: 10 }}>Risks &amp; Mitigations</h3>
                  {onePager?.risksAndMitigations?.length ? (
                    <ul style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                      {onePager.risksAndMitigations.map((r, i) => (
                        <li key={i} style={{ display: 'flex', gap: 10 }}>
                          <span className="material-symbols-outlined text-error" style={{ fontSize: 14, marginTop: 1, flexShrink: 0 }}>warning</span>
                          <div>
                            <p className="font-body-strong text-on-surface" style={{ fontSize: 12 }}>{r.risk}</p>
                            <p className="text-on-surface-variant leading-tight" style={{ fontSize: 11 }}>{r.mitigation}</p>
                          </div>
                        </li>
                      ))}
                    </ul>
                  ) : phase === 'streaming' ? (
                    <SkeletonLines lines={3} />
                  ) : (
                    <p className="font-body-main text-on-surface-variant italic" style={{ fontSize: 12 }}>No risks identified.</p>
                  )}
                </section>

                {(onePager?.expectedOutcome || completed['expectedOutcome'] || currentField === 'expectedOutcome') && (
                  <section className="pl-4 py-3"
                    style={{ backgroundColor: 'rgba(34,106,80,0.05)', borderLeft: '2px solid var(--color-secondary-container)' }}>
                    <h3 className="font-label-caps text-outline uppercase mb-2" style={{ fontSize: 10 }}>Expected Outcome</h3>
                    <StreamText field="expectedOutcome" finalValue={onePager?.expectedOutcome}
                      className="font-body-main text-on-surface-variant leading-relaxed" style={{ fontSize: 12 }}
                      skeletonLines={2} {...streamProps} />
                  </section>
                )}
              </div>
            </div>

            {/* ── Channel stats ── */}
            {metadata?.channelStats && metadata.channelStats.length > 0 && (
              <section className="mt-8 pt-7" style={{ borderTop: '1px solid #E8E8E3' }}>
                <h3 className="font-label-caps text-outline uppercase mb-4" style={{ fontSize: 10 }}>Live Channel Status</h3>
                <table className="w-full text-left border-collapse" style={{ fontSize: 11 }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid #E8E8E3' }}>
                      {['Channel', 'Scheduled', 'Sent', 'Customer replies'].map(h => (
                        <th key={h} className="pb-2 font-label-caps text-outline uppercase" style={{ fontSize: 9, paddingRight: 16 }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {metadata.channelStats.map((row, i) => (
                      <tr key={row.channel} style={{ borderBottom: i < metadata.channelStats.length - 1 ? '1px solid #F3F3F1' : 'none' }}>
                        <td className="py-2 font-body-main text-on-surface capitalize" style={{ paddingRight: 16 }}>
                          <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <span className="material-symbols-outlined text-outline" style={{ fontSize: 12 }}>{TOUCH_ICON(row.channel)}</span>
                            {row.channel.replace(/_/g, ' ')}
                          </span>
                        </td>
                        <td className="py-2 font-data-mono text-on-surface-variant" style={{ paddingRight: 16 }}>{row.scheduled}</td>
                        <td className="py-2 font-data-mono" style={{ paddingRight: 16, color: row.sent > 0 ? '#166534' : 'var(--color-outline)' }}>{row.sent}</td>
                        <td className="py-2 font-data-mono" style={{ color: row.replies > 0 ? 'var(--color-primary)' : 'var(--color-outline)' }}>{row.replies}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>
            )}

            {/* ── Footer: Manager card + EU disclaimer ── */}
            <footer className="mt-8 pt-7 flex justify-between items-center"
              style={{ borderTop: '1px solid #E8E8E3' }}>
              {/* Manager card */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                {managerPhoto ? (
                  <img src={managerPhoto} alt="Manager"
                    style={{ width: 72, height: 72, borderRadius: '50%', objectFit: 'cover',
                      border: '3px solid var(--color-primary)', flexShrink: 0 }} />
                ) : (
                  <div style={{ width: 72, height: 72, borderRadius: '50%', backgroundColor: 'var(--color-primary)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: 'white', fontSize: 22, fontWeight: 700, fontFamily: 'Inter', flexShrink: 0 }}>
                    GL
                  </div>
                )}
                <div>
                  <p style={{ fontSize: 15, fontWeight: 700, color: '#1a1c1b', fontFamily: 'Inter', marginBottom: 2 }}>
                    {metadata?.installerName ?? 'Ganesh Lakshmana'}
                  </p>
                  <p style={{ fontSize: 10, color: '#717975', fontFamily: 'JetBrains Mono', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                    Sales Manager
                  </p>
                  <p style={{ fontSize: 10, color: '#9fd1be', fontFamily: 'JetBrains Mono', textTransform: 'uppercase', letterSpacing: '0.04em', marginTop: 2 }}>
                    Cadence by Reonic
                  </p>
                </div>
              </div>

              {/* EU disclaimer */}
              <div className="text-right font-label-caps text-outline uppercase tracking-widest" style={{ fontSize: 9 }}>
                <div className="font-data-mono mb-1">Generated {metadata?.generatedAt?.slice(0, 10) ?? today}</div>
                <div>EU-RESIDENT · AI ACT ART. 50</div>
                <div className="mt-1">Page 01/01</div>
              </div>
            </footer>

            {/* Grain overlay */}
            <div className="pointer-events-none absolute inset-0 overflow-hidden" style={{ opacity: 0.025, mixBlendMode: 'multiply' }}>
              <svg viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg" width="100%" height="100%">
                <filter id="noiseFilter">
                  <feTurbulence type="fractalNoise" baseFrequency="0.65" numOctaves="3" stitchTiles="stitch" />
                </filter>
                <rect width="100%" height="100%" filter="url(#noiseFilter)" />
              </svg>
            </div>
          </article>
        )}

        {/* ── Global footer ── */}
        <div className="w-full py-8 text-center mt-8 no-print">
          <p style={{ fontSize: 10, color: 'rgba(255,255,255,0.2)', fontFamily: 'JetBrains Mono', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
            CADENCE BY REONIC · EU-RESIDENT · AI ACT ART. 50
          </p>
        </div>
      </main>
    </div>
  );
}

export default function BriefPage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center min-h-screen"
        style={{ background: 'linear-gradient(135deg, #051a10, #0c2816)' }}>
        <p style={{ color: 'rgba(255,255,255,0.4)', fontFamily: 'Inter', fontSize: 14 }}>Loading brief…</p>
      </div>
    }>
      <BriefInner />
    </Suspense>
  );
}
