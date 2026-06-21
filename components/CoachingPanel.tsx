'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useConversation } from '@11labs/react';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface CoachingPanelProps {
  open: boolean;
  onClose: () => void;
  preselectedCustomerId?: string;
}

type Outcome   = 'accepted' | 'declined' | 'callback' | 'needs_follow_up';
type VoiceSt   = 'idle' | 'connecting' | 'connected' | 'error';
type PanelMode = 'voice' | 'chat';

interface CustomerData {
  id: string;
  fname: string;
  lname: string;
  status: string | null;
  price_quote: number | null;
  about: string | null;
  language: string | null;
  whatsapp_enabled: number;
  phone: string | null;
  archetypes: {
    family: number | null;
    investor: number | null;
    environmentalist: number | null;
    skeptic: number | null;
  };
  sequence: {
    ghost_risk_score: number | null;
    close_readiness_score: number | null;
    current_day: number | null;
    total_days: number | null;
  } | null;
  recentResponse: {
    text: string | null;
    sentiment: string | null;
    action_taken: string | null;
  } | null;
}

interface Message { role: 'user' | 'assistant'; content: string; }

const OUTCOMES: { key: Outcome; label: string }[] = [
  { key: 'accepted',        label: '✅ They accepted' },
  { key: 'callback',        label: '🔄 Want callback' },
  { key: 'declined',        label: '❌ They declined' },
  { key: 'needs_follow_up', label: '📋 Needs follow-up' },
];

const QUICK_ACTIONS = [
  { label: '📋 All leads',       msg: 'List all customers with lead status' },
  { label: '🔥 High ghost risk', msg: 'Which customers have the highest ghost risk?' },
  { label: '🎯 Ready to close',  msg: 'Which customers are closest to closing?' },
];

const CHAT_GREETING = `Hey! I'm Max, your AI sales coach. I have your full customer database loaded.\n\nWhat do you need?\n• A pre-call coaching brief on someone\n• A list of customers by status or risk\n• Pitch advice or objection handling\n\nJust ask.`;

const STATUS_COLORS: Record<string, string> = {
  lead:        '#6b7280',
  quoted:      '#2563eb',
  engaged:     '#7c3aed',
  negotiating: '#d97706',
  closed_won:  '#16a34a',
  closed_lost: '#dc2626',
};

// ── Sub-components ────────────────────────────────────────────────────────────

function ArchBar({ archetypes }: { archetypes: CustomerData['archetypes'] }) {
  const { family: f, investor: i, environmentalist: e, skeptic: s } = archetypes;
  const total = (f ?? 0) + (i ?? 0) + (e ?? 0) + (s ?? 0) || 1;
  const pct = (v: number | null) => Math.round((v ?? 0) / total * 100);
  const segments = [
    { label: 'Family',   val: f, color: '#8ca6c0' },
    { label: 'Investor', val: i, color: '#2e5d4e' },
    { label: 'Eco',      val: e, color: '#a6b599' },
    { label: 'Skeptic',  val: s, color: '#c0a1a1' },
  ].filter(a => (a.val ?? 0) > 0.02);

  return (
    <div>
      <div className="flex gap-0.5 h-2 rounded-full overflow-hidden mb-1">
        {segments.map(a => (
          <div key={a.label} style={{ width: `${pct(a.val)}%`, backgroundColor: a.color }} />
        ))}
      </div>
      <div className="flex gap-3">
        {segments.map(a => (
          <span key={a.label} style={{ fontSize: 9, color: a.color, fontWeight: 600 }}>
            {a.label} {pct(a.val)}%
          </span>
        ))}
      </div>
    </div>
  );
}

function CustomerCard({ customer, onClear }: { customer: CustomerData; onClear: () => void }) {
  const ghost = customer.sequence ? Math.round((customer.sequence.ghost_risk_score ?? 0) * 100) : null;
  const ready = customer.sequence ? Math.round((customer.sequence.close_readiness_score ?? 0) * 100) : null;

  return (
    <div className="rounded-xl p-3" style={{ backgroundColor: '#f0fdfa', border: '1px solid #5eead4' }}>
      {/* Name + status row */}
      <div className="flex items-start justify-between mb-2">
        <div>
          <p className="font-bold text-gray-900" style={{ fontSize: 15 }}>
            {customer.fname} {customer.lname}
          </p>
          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
            <span className="px-2 py-0.5 rounded-full font-semibold uppercase" style={{
              fontSize: 9,
              backgroundColor: STATUS_COLORS[customer.status ?? 'lead'] + '20',
              color: STATUS_COLORS[customer.status ?? 'lead'],
              border: `1px solid ${STATUS_COLORS[customer.status ?? 'lead']}40`,
            }}>
              {customer.status ?? 'lead'}
            </span>
            {customer.price_quote != null && (
              <span className="text-gray-500 font-mono" style={{ fontSize: 11 }}>
                €{Math.round(customer.price_quote).toLocaleString()}
              </span>
            )}
            {customer.sequence && (
              <span className="text-gray-400" style={{ fontSize: 10 }}>
                Day {customer.sequence.current_day ?? 0}/{customer.sequence.total_days ?? 30}
              </span>
            )}
            {customer.phone && (
              <span className="text-gray-400 font-mono" style={{ fontSize: 10 }}>{customer.phone}</span>
            )}
          </div>
        </div>
        <button onClick={onClear} className="p-1 rounded hover:bg-teal-100 flex-shrink-0" title="Clear">
          <span className="material-symbols-outlined text-gray-400" style={{ fontSize: 14 }}>close</span>
        </button>
      </div>

      {/* Score pills */}
      {(ghost !== null || ready !== null) && (
        <div className="flex gap-2 mb-2">
          {ghost !== null && (
            <div className="px-2.5 py-1 rounded-lg flex items-center gap-1.5" style={{
              backgroundColor: ghost > 40 ? '#fee2e2' : 'white',
              border: `1px solid ${ghost > 40 ? '#fca5a5' : '#e5e7eb'}`,
            }}>
              <span className="material-symbols-outlined" style={{ fontSize: 12, color: ghost > 40 ? '#ef4444' : '#9ca3af' }}>
                {ghost > 40 ? 'warning' : 'check_circle'}
              </span>
              <span style={{ fontSize: 11, color: ghost > 40 ? '#ef4444' : '#6b7280', fontWeight: 600 }}>
                Ghost {ghost}%
              </span>
            </div>
          )}
          {ready !== null && (
            <div className="px-2.5 py-1 rounded-lg flex items-center gap-1.5" style={{
              backgroundColor: ready > 75 ? '#dcfce7' : 'white',
              border: `1px solid ${ready > 75 ? '#86efac' : '#e5e7eb'}`,
            }}>
              <span className="material-symbols-outlined" style={{ fontSize: 12, color: ready > 75 ? '#16a34a' : '#9ca3af' }}>
                {ready > 75 ? 'trending_up' : 'trending_flat'}
              </span>
              <span style={{ fontSize: 11, color: ready > 75 ? '#16a34a' : '#6b7280', fontWeight: 600 }}>
                Ready {ready}%
              </span>
            </div>
          )}
        </div>
      )}

      {/* Archetype bar */}
      <div className="mb-2">
        <p className="text-gray-400 uppercase mb-1" style={{ fontSize: 9, letterSpacing: '0.05em' }}>Archetype Mix</p>
        <ArchBar archetypes={customer.archetypes} />
      </div>

      {/* About notes */}
      {customer.about && (
        <div className="mt-2 p-2 rounded-lg" style={{ backgroundColor: 'white', border: '1px solid #e5e7eb' }}>
          <p className="text-gray-400 uppercase mb-0.5" style={{ fontSize: 9 }}>Notes</p>
          <p className="text-gray-600 leading-snug" style={{ fontSize: 11 }}>
            {customer.about.slice(0, 120)}{customer.about.length > 120 ? '…' : ''}
          </p>
        </div>
      )}

      {/* Last response */}
      {customer.recentResponse?.text && (
        <div className="mt-1.5 p-2 rounded-lg" style={{ backgroundColor: 'white', border: '1px solid #e5e7eb' }}>
          <div className="flex items-center gap-1.5 mb-0.5">
            <p className="text-gray-400 uppercase" style={{ fontSize: 9 }}>Last Response</p>
            {customer.recentResponse.sentiment && (
              <span className="px-1.5 py-0.5 rounded-full" style={{
                fontSize: 8,
                backgroundColor:
                  customer.recentResponse.sentiment === 'positive' ? '#dcfce7' :
                  customer.recentResponse.sentiment === 'negative' ? '#fee2e2' : '#f3f4f6',
                color:
                  customer.recentResponse.sentiment === 'positive' ? '#16a34a' :
                  customer.recentResponse.sentiment === 'negative' ? '#dc2626' : '#6b7280',
              }}>
                {customer.recentResponse.sentiment}
              </span>
            )}
          </div>
          <p className="text-gray-600 leading-snug" style={{ fontSize: 11 }}>
            {customer.recentResponse.text.slice(0, 100)}{customer.recentResponse.text.length > 100 ? '…' : ''}
          </p>
        </div>
      )}
    </div>
  );
}

function CustomerSearch({
  customers,
  onSelect,
}: {
  customers: CustomerData[];
  onSelect: (c: CustomerData) => void;
}) {
  const [query,   setQuery]   = useState('');
  const [focused, setFocused] = useState(false);

  const filtered = query.length >= 1
    ? customers.filter(c =>
        `${c.fname} ${c.lname}`.toLowerCase().includes(query.toLowerCase())
      ).slice(0, 6)
    : [];

  return (
    <div className="relative">
      <div className="flex items-center gap-2 px-3 py-2 rounded-xl"
        style={{ border: `1px solid ${focused ? '#0d9488' : '#e5e7eb'}`, backgroundColor: 'white', transition: 'border-color .15s' }}>
        <span className="material-symbols-outlined text-gray-400" style={{ fontSize: 16 }}>person_search</span>
        <input
          type="text"
          placeholder="Pull up a customer by name…"
          value={query}
          onChange={e => setQuery(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setTimeout(() => setFocused(false), 200)}
          className="flex-1 outline-none bg-transparent"
          style={{ fontSize: 13 }}
        />
        {query && (
          <button onClick={() => setQuery('')}>
            <span className="material-symbols-outlined text-gray-300" style={{ fontSize: 14 }}>close</span>
          </button>
        )}
      </div>

      {focused && filtered.length > 0 && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-white rounded-xl shadow-xl z-20"
          style={{ border: '1px solid #e5e7eb' }}>
          {filtered.map((c, i) => {
            const ghost = c.sequence ? Math.round((c.sequence.ghost_risk_score ?? 0) * 100) : null;
            const ready = c.sequence ? Math.round((c.sequence.close_readiness_score ?? 0) * 100) : null;
            return (
              <button
                key={c.id}
                onClick={() => { onSelect(c); setQuery(''); setFocused(false); }}
                className="w-full px-3 py-2.5 text-left hover:bg-gray-50 flex items-center justify-between"
                style={{
                  borderBottom: i < filtered.length - 1 ? '1px solid #f3f4f6' : 'none',
                  borderRadius: i === 0 ? '12px 12px 0 0' : i === filtered.length - 1 ? '0 0 12px 12px' : 0,
                }}
              >
                <div>
                  <p className="font-semibold text-gray-800" style={{ fontSize: 13 }}>
                    {c.fname} {c.lname}
                  </p>
                  <p style={{ fontSize: 10, color: STATUS_COLORS[c.status ?? 'lead'] }}>
                    {c.status ?? 'lead'}{c.price_quote ? ` · €${Math.round(c.price_quote).toLocaleString()}` : ''}
                  </p>
                </div>
                {ghost !== null && (
                  <div className="flex gap-1.5 text-right">
                    <span style={{ fontSize: 10, color: ghost > 40 ? '#ef4444' : '#9ca3af' }}>G{ghost}%</span>
                    {ready !== null && <span style={{ fontSize: 10, color: ready > 75 ? '#16a34a' : '#9ca3af' }}>R{ready}%</span>}
                  </div>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function CoachingPanel({ open, onClose, preselectedCustomerId }: CoachingPanelProps) {

  // ─ mode
  const [mode, setMode] = useState<PanelMode>('voice');

  // ─ customer list + selected card
  const [allCustomers,      setAllCustomers]      = useState<CustomerData[]>([]);
  const [selectedCustomer,  setSelectedCustomer]  = useState<CustomerData | null>(null);
  const [loadingCustomers,  setLoadingCustomers]  = useState(false);

  // ─ voice
  const [voiceSt,   setVoiceSt]   = useState<VoiceSt>('idle');
  const [voiceErr,  setVoiceErr]  = useState<string | null>(null);
  const [callEnded, setCallEnded] = useState(false);

  // ─ chat
  const [messages,    setMessages]    = useState<Message[]>([]);
  const [input,       setInput]       = useState('');
  const [chatLoading, setChatLoading] = useState(false);

  // ─ outcome
  const [showOutcome, setShowOutcome] = useState(false);
  const [outcome,     setOutcome]     = useState<Outcome | null>(null);
  const [whatWorked,  setWhatWorked]  = useState('');
  const [whatNext,    setWhatNext]    = useState('');
  const [saving,      setSaving]      = useState(false);
  const [saveDone,    setSaveDone]    = useState(false);

  const bottomRef           = useRef<HTMLDivElement>(null);
  const inputRef            = useRef<HTMLInputElement>(null);
  const initRef             = useRef(false);
  const didConnectRef       = useRef(false);
  const startingRef         = useRef(false);
  const allCustomersRef     = useRef<CustomerData[]>([]);
  const selectedCustomerRef = useRef<CustomerData | null>(null);

  // Keep refs current so onMessage closure always reads latest state
  useEffect(() => { allCustomersRef.current = allCustomers; }, [allCustomers]);
  useEffect(() => { selectedCustomerRef.current = selectedCustomer; }, [selectedCustomer]);

  // Detect a customer name in spoken text (user or AI) and switch the card
  const detectAndSelectCustomer = useCallback((text: string) => {
    const lower = text.toLowerCase();
    const list  = allCustomersRef.current;
    if (!list.length) return;
    // Full name wins; fall back to first name if > 3 chars
    const found =
      list.find(c => lower.includes(`${c.fname} ${c.lname}`.toLowerCase())) ??
      list.find(c => c.fname.length > 3 && lower.includes(c.fname.toLowerCase()));
    if (found && found.id !== selectedCustomerRef.current?.id) {
      setSelectedCustomer(found);
    }
  }, []);

  // ── ElevenLabs ─────────────────────────────────────────────────────────────
  const conversation = useConversation({
    onConnect: () => {
      didConnectRef.current = true;
      setVoiceSt('connected');
    },
    onDisconnect: () => {
      setVoiceSt('idle');
      if (didConnectRef.current) {
        didConnectRef.current = false;
        setCallEnded(true);
      }
    },
    onError: (err) => {
      setVoiceSt('error');
      setVoiceErr(String(err) || 'WebSocket connection failed');
    },
    onMessage: ({ message, source }: { message: string; source: string }) => {
      // Auto-switch card when installer OR Max mentions a customer name
      detectAndSelectCustomer(message);
    },
  });

  const isSpeaking  = conversation.isSpeaking;
  const isConnected = voiceSt === 'connected';

  // ── Fetch all customers ─────────────────────────────────────────────────────
  const fetchCustomers = useCallback(async () => {
    setLoadingCustomers(true);
    try {
      const res  = await fetch('/api/coaching/customers');
      const data = await res.json() as CustomerData[];
      if (Array.isArray(data)) {
        setAllCustomers(data);
        if (preselectedCustomerId) {
          const found = data.find(c => c.id === preselectedCustomerId);
          if (found) setSelectedCustomer(found);
        }
      }
    } catch (err) {
      console.error('Failed to load customers:', err);
    } finally {
      setLoadingCustomers(false);
    }
  }, [preselectedCustomerId]);

  // ── Start voice ─────────────────────────────────────────────────────────────
  const startVoice = useCallback(async () => {
    if (startingRef.current) return;
    startingRef.current  = true;
    didConnectRef.current = false;
    setVoiceSt('connecting');
    setVoiceErr(null);
    setCallEnded(false);
    try {
      const res  = await fetch('/api/coaching/session', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ customer_id: preselectedCustomerId }),
      });
      const data = await res.json() as { agentId?: string; customersList?: unknown[]; uiNote?: string; error?: string };
      if (data.error)    throw new Error(data.error);
      if (!data.agentId) throw new Error('ELEVENLABS_COACHING_AGENT_ID is not set in .env.local');

      await conversation.startSession({
        agentId: data.agentId,
        dynamicVariables: {
          // Append UI context so Max knows the panel shows customer cards
          customers_list: JSON.stringify(data.customersList ?? []) + (data.uiNote ?? ''),
        },
      });
    } catch (err) {
      setVoiceSt('error');
      setVoiceErr(err instanceof Error ? err.message : String(err));
    } finally {
      setTimeout(() => { startingRef.current = false; }, 2000);
    }
  }, [preselectedCustomerId, conversation]);

  // ── End voice ───────────────────────────────────────────────────────────────
  function endVoice() {
    conversation.endSession();
  }

  // ── Chat send ───────────────────────────────────────────────────────────────
  const doSend = useCallback(async (text: string, currentMsgs: Message[]) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    const updated: Message[] = [...currentMsgs, { role: 'user', content: trimmed }];
    setMessages(updated);
    setInput('');
    setChatLoading(true);
    try {
      const res  = await fetch('/api/coaching/chat', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          message:    trimmed,
          history:    updated.slice(0, -1).slice(-12),
          customerId: selectedCustomer?.id ?? preselectedCustomerId,
        }),
      });
      const data = await res.json() as { reply?: string; error?: string };
      if (data.error) throw new Error(data.error);
      setMessages(prev => [...prev, { role: 'assistant', content: data.reply! }]);
    } catch (err) {
      setMessages(prev => [...prev, { role: 'assistant', content: `Error: ${err instanceof Error ? err.message : String(err)}` }]);
    } finally {
      setChatLoading(false);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [selectedCustomer, preselectedCustomerId]);

  // ── Save outcome ────────────────────────────────────────────────────────────
  async function handleSaveOutcome() {
    if (!outcome) return;
    const custId = selectedCustomer?.id ?? preselectedCustomerId;
    setSaving(true);
    try {
      await fetch('/api/coaching/outcome', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customer_id:          custId,
          outcome,
          what_worked:          whatWorked,
          what_to_try_next:     whatNext,
          suggested_next_touch: { channel: 'email', timing: '+2 days' },
        }),
      });
      setSaveDone(true);
      setTimeout(onClose, 2000);
    } finally {
      setSaving(false);
    }
  }

  // ── Lifecycle ────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (open && !initRef.current) {
      initRef.current       = true;
      startingRef.current   = false;
      didConnectRef.current = false;
      setMode('voice');
      setVoiceSt('idle');
      setVoiceErr(null);
      setCallEnded(false);
      setShowOutcome(false);
      setOutcome(null);
      setWhatWorked('');
      setWhatNext('');
      setSaveDone(false);
      setSelectedCustomer(null);
      setMessages([{ role: 'assistant', content: CHAT_GREETING }]);
      fetchCustomers();
    }
    if (!open) {
      initRef.current = false;
      conversation.endSession();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // When mode switches to chat, optionally auto-brief selected customer
  useEffect(() => {
    if (mode === 'chat') {
      const greeting: Message = { role: 'assistant', content: CHAT_GREETING };
      setMessages([greeting]);
      const cust = selectedCustomer;
      if (cust) {
        setTimeout(() => doSend(`Give me a full coaching brief for ${cust.fname} ${cust.lname}`, [greeting]), 200);
      }
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  // Auto-scroll chat
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, chatLoading]);

  if (!open) return null;

  const showLogOutcome = (callEnded || (mode === 'chat' && messages.length > 1)) && !showOutcome;

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <>
      <style>{`
        @keyframes waveBar  { 0%,100%{height:3px} 50%{height:24px} }
        @keyframes micPulse { 0%,100%{box-shadow:0 0 0 0 rgba(13,148,136,.3)} 60%{box-shadow:0 0 0 16px rgba(13,148,136,0)} }
        @keyframes chatDot  { 0%,80%,100%{transform:scale(.6);opacity:.4} 40%{transform:scale(1);opacity:1} }
      `}</style>

      <div className="fixed inset-0 z-50 bg-black/30" onClick={onClose} aria-hidden />

      <div className="fixed right-0 top-0 z-50 flex flex-col bg-white shadow-2xl"
        style={{ width: 460, height: '100vh' }} role="dialog">

        {/* ── Header ── */}
        <div className="flex items-center justify-between px-5 py-3 flex-shrink-0"
          style={{ borderBottom: '1px solid #f0f0eb' }}>
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full flex items-center justify-center"
              style={{ background: 'linear-gradient(135deg,#0d9488,#3b82f6)' }}>
              <span className="material-symbols-outlined text-white" style={{ fontSize: 16 }}>psychology</span>
            </div>
            <div>
              <p className="font-bold text-gray-900" style={{ fontSize: 14 }}>Max — AI Sales Coach</p>
              <p className="text-gray-400" style={{ fontSize: 10 }}>Cadence Solar</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {showLogOutcome && (
              <button onClick={() => setShowOutcome(true)}
                className="px-2.5 py-1 rounded text-xs font-medium"
                style={{ border: '1px solid #0d9488', color: '#0d9488' }}>
                Log outcome
              </button>
            )}
            <button onClick={onClose} className="p-1 rounded hover:bg-gray-100">
              <span className="material-symbols-outlined text-gray-400" style={{ fontSize: 18 }}>close</span>
            </button>
          </div>
        </div>

        {/* ── Tabs ── */}
        <div className="flex flex-shrink-0" style={{ borderBottom: '1px solid #f0f0eb' }}>
          {(['voice', 'chat'] as PanelMode[]).map(m => (
            <button key={m} onClick={() => setMode(m)}
              className="flex-1 py-2.5 text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors"
              style={{
                borderBottom: mode === m ? '2px solid #0d9488' : '2px solid transparent',
                color: mode === m ? '#0d9488' : '#9ca3af',
              }}>
              <span className="material-symbols-outlined" style={{ fontSize: 14 }}>
                {m === 'voice' ? 'mic' : 'chat'}
              </span>
              {m === 'voice' ? 'Voice' : 'Chat'}
            </button>
          ))}
        </div>

        {/* ══════════════════════════════════════════
            VOICE TAB
        ══════════════════════════════════════════ */}
        {mode === 'voice' && (
          <div className="flex-1 flex flex-col overflow-hidden" style={{ minHeight: 0 }}>

            {/* Scrollable top: customer card + search */}
            <div className="flex-shrink-0 px-4 pt-4 pb-3 overflow-y-auto" style={{ maxHeight: '55%' }}>

              {/* Customer card */}
              {selectedCustomer ? (
                <div className="mb-3">
                  <CustomerCard customer={selectedCustomer} onClear={() => setSelectedCustomer(null)} />
                </div>
              ) : loadingCustomers ? (
                <div className="mb-3 rounded-xl p-4 flex items-center gap-2" style={{ backgroundColor: '#f9fafb', border: '1px dashed #e5e7eb' }}>
                  <span className="material-symbols-outlined text-gray-300 animate-spin" style={{ fontSize: 16 }}>progress_activity</span>
                  <span className="text-gray-400" style={{ fontSize: 12 }}>Loading customers…</span>
                </div>
              ) : (
                <div className="mb-3 rounded-xl p-3 text-center" style={{ backgroundColor: '#f9fafb', border: '1px dashed #e5e7eb' }}>
                  <span className="material-symbols-outlined text-gray-300" style={{ fontSize: 24 }}>person</span>
                  <p className="text-gray-400 mt-1" style={{ fontSize: 12 }}>No customer selected</p>
                  <p className="text-gray-300" style={{ fontSize: 10 }}>Search below to pull up their data</p>
                </div>
              )}

              {/* Search */}
              {allCustomers.length > 0 && (
                <CustomerSearch
                  customers={allCustomers}
                  onSelect={(c) => setSelectedCustomer(c)}
                />
              )}
            </div>

            {/* Mic section — grows to fill remaining space */}
            <div className="flex-1 flex flex-col items-center justify-center gap-4 px-6 py-4" style={{ minHeight: 0 }}>

              {/* Status dot */}
              <div className="flex items-center gap-1.5">
                <div className={`w-2 h-2 rounded-full ${
                  voiceSt === 'connected'  ? 'bg-green-500 animate-pulse' :
                  voiceSt === 'connecting' ? 'bg-yellow-400 animate-pulse' :
                  voiceSt === 'error'      ? 'bg-red-500' : 'bg-gray-300'
                }`} />
                <span className="text-gray-400" style={{ fontSize: 11 }}>
                  {voiceSt === 'connected'  ? 'Live' :
                   voiceSt === 'connecting' ? 'Connecting…' :
                   voiceSt === 'error'      ? 'Error' : 'Ready'}
                </span>
              </div>

              {!callEnded ? (
                <>
                  {/* Idle: tap to start */}
                  {voiceSt === 'idle' && (
                    <button onClick={startVoice}
                      className="w-20 h-20 rounded-full flex flex-col items-center justify-center gap-0.5 transition-transform hover:scale-105 active:scale-95"
                      style={{ background: 'linear-gradient(135deg,#0d9488,#3b82f6)' }}>
                      <span className="material-symbols-outlined text-white" style={{ fontSize: 30 }}>mic</span>
                      <span className="text-white font-semibold uppercase" style={{ fontSize: 8, letterSpacing: '0.06em' }}>Start</span>
                    </button>
                  )}

                  {/* Connecting: spinner */}
                  {voiceSt === 'connecting' && (
                    <div className="w-20 h-20 rounded-full flex items-center justify-center"
                      style={{ background: 'linear-gradient(135deg,#0d9488,#3b82f6)' }}>
                      <span className="material-symbols-outlined text-white animate-spin" style={{ fontSize: 30 }}>progress_activity</span>
                    </div>
                  )}

                  {/* Connected: pulse mic + hang-up */}
                  {voiceSt === 'connected' && (
                    <div className="flex flex-col items-center gap-3">
                      <div className="w-20 h-20 rounded-full flex items-center justify-center"
                        style={{
                          background: 'linear-gradient(135deg,#0d9488,#3b82f6)',
                          animation: !isSpeaking ? 'micPulse 2s ease-in-out infinite' : undefined,
                        }}>
                        <span className="material-symbols-outlined text-white" style={{ fontSize: 30 }}>mic</span>
                      </div>
                      <button onClick={endVoice}
                        className="flex items-center gap-1.5 px-5 py-1.5 rounded-full text-xs font-semibold text-white hover:scale-105 active:scale-95 transition-transform"
                        style={{ backgroundColor: '#ef4444' }}>
                        <span className="material-symbols-outlined text-white" style={{ fontSize: 14 }}>call_end</span>
                        End call
                      </button>
                    </div>
                  )}

                  {/* Label */}
                  <p className="text-gray-400 text-sm text-center">
                    {voiceSt === 'connecting' ? 'Connecting to Max…' :
                     isSpeaking              ? 'Max is speaking…' :
                     isConnected             ? 'Listening — talk naturally' :
                     voiceSt === 'error'     ? '' :
                     'Tap to start talking to Max'}
                  </p>

                  {/* Waveform */}
                  {isSpeaking && (
                    <div className="flex items-center gap-1" style={{ height: 32 }}>
                      {[0, .1, .2, .1, 0].map((d, i) => (
                        <div key={i} className="w-1.5 rounded-full bg-teal-500"
                          style={{ height: 3, animation: `waveBar .7s ${d}s ease-in-out infinite alternate` }} />
                      ))}
                    </div>
                  )}

                  {/* Error */}
                  {voiceSt === 'error' && voiceErr && (
                    <div className="w-full rounded-xl p-3 text-center" style={{ backgroundColor: '#fef2f2', border: '1px solid #fecaca' }}>
                      <p className="text-red-500 text-xs mb-2" style={{ wordBreak: 'break-all' }}>{voiceErr}</p>
                      <div className="flex gap-2 justify-center">
                        <button onClick={startVoice}
                          className="px-3 py-1 rounded-lg text-xs font-medium text-white"
                          style={{ backgroundColor: '#0d9488' }}>Retry</button>
                        <button onClick={() => setMode('chat')}
                          className="px-3 py-1 rounded-lg text-xs font-medium"
                          style={{ border: '1px solid #0d9488', color: '#0d9488' }}>Use Chat</button>
                      </div>
                    </div>
                  )}
                </>
              ) : (
                /* Post-call */
                <div className="text-center space-y-2">
                  <div className="w-14 h-14 rounded-full flex items-center justify-center mx-auto"
                    style={{ backgroundColor: '#f0fdfa' }}>
                    <span className="material-symbols-outlined text-teal-600" style={{ fontSize: 28 }}>check_circle</span>
                  </div>
                  <p className="font-semibold text-gray-800">Call ended</p>
                  <p className="text-gray-400" style={{ fontSize: 12 }}>Log the outcome or start a new session.</p>
                  <button onClick={startVoice}
                    className="px-5 py-1.5 rounded-lg text-sm font-medium text-white"
                    style={{ backgroundColor: '#0d9488' }}>New session</button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ══════════════════════════════════════════
            CHAT TAB
        ══════════════════════════════════════════ */}
        {mode === 'chat' && (
          <>
            {/* Customer card strip in chat mode */}
            {selectedCustomer && (
              <div className="px-4 pt-3 flex-shrink-0">
                <CustomerCard customer={selectedCustomer} onClear={() => setSelectedCustomer(null)} />
              </div>
            )}
            {!selectedCustomer && allCustomers.length > 0 && (
              <div className="px-4 pt-3 flex-shrink-0">
                <CustomerSearch customers={allCustomers} onSelect={c => {
                  setSelectedCustomer(c);
                  doSend(`Give me a full coaching brief for ${c.fname} ${c.lname}`, messages);
                }} />
              </div>
            )}

            <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3" style={{ minHeight: 0 }}>
              {messages.length <= 1 && !chatLoading && (
                <div className="flex flex-wrap gap-2 pb-1">
                  {QUICK_ACTIONS.map(a => (
                    <button key={a.label} onClick={() => doSend(a.msg, messages)}
                      className="px-3 py-1.5 rounded-full text-xs hover:opacity-80"
                      style={{ border: '1px solid #0d9488', color: '#0d9488', backgroundColor: '#f0fdfa' }}>
                      {a.label}
                    </button>
                  ))}
                </div>
              )}

              {messages.map((msg, i) => (
                <div key={i} className={`flex items-end gap-2 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  {msg.role === 'assistant' && (
                    <div className="w-6 h-6 rounded-full flex-shrink-0 flex items-center justify-center mb-0.5"
                      style={{ background: 'linear-gradient(135deg,#0d9488,#3b82f6)', minWidth: 24 }}>
                      <span className="material-symbols-outlined text-white" style={{ fontSize: 12 }}>psychology</span>
                    </div>
                  )}
                  <div className="max-w-[78%] px-4 py-2.5"
                    style={{
                      backgroundColor: msg.role === 'user' ? '#0d9488' : '#f3f4f6',
                      color:           msg.role === 'user' ? 'white'   : '#111827',
                      borderRadius:    msg.role === 'user' ? '18px 18px 4px 18px' : '4px 18px 18px 18px',
                      fontSize: 13, lineHeight: 1.55, whiteSpace: 'pre-wrap',
                    }}>
                    {msg.content}
                  </div>
                </div>
              ))}

              {chatLoading && (
                <div className="flex items-end gap-2">
                  <div className="w-6 h-6 rounded-full flex-shrink-0 flex items-center justify-center"
                    style={{ background: 'linear-gradient(135deg,#0d9488,#3b82f6)', minWidth: 24 }}>
                    <span className="material-symbols-outlined text-white" style={{ fontSize: 12 }}>psychology</span>
                  </div>
                  <div className="px-4 py-3 flex gap-1" style={{ backgroundColor: '#f3f4f6', borderRadius: '4px 18px 18px 18px' }}>
                    {[0, .15, .3].map((d, i) => (
                      <div key={i} className="w-2 h-2 rounded-full bg-gray-400"
                        style={{ animation: `chatDot 1.2s ${d}s infinite` }} />
                    ))}
                  </div>
                </div>
              )}
              <div ref={bottomRef} />
            </div>

            <div className="flex-shrink-0 px-4 py-3" style={{ borderTop: '1px solid #f0f0eb' }}>
              <div className="flex gap-2">
                <input ref={inputRef} type="text" value={input}
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); doSend(input, messages); } }}
                  placeholder="Ask Max anything…" disabled={chatLoading}
                  className="flex-1 px-4 py-2.5 rounded-full disabled:opacity-50"
                  style={{ border: '1px solid #e5e7eb', outline: 'none', fontSize: 13 }} />
                <button onClick={() => doSend(input, messages)}
                  disabled={!input.trim() || chatLoading}
                  className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 disabled:opacity-40"
                  style={{ backgroundColor: '#0d9488' }}>
                  <span className="material-symbols-outlined text-white" style={{ fontSize: 18 }}>send</span>
                </button>
              </div>
            </div>
          </>
        )}

        {/* ── Outcome form ── */}
        {showOutcome && (
          <div className="flex-shrink-0 px-4 py-3" style={{ borderTop: '1px solid #f0f0eb', backgroundColor: '#fafafa' }}>
            {saveDone ? (
              <p className="text-center text-green-600 text-sm py-2 font-medium">
                ✓ Outcome saved — next touch scheduled if needed
              </p>
            ) : (
              <>
                <p className="text-xs font-semibold text-gray-700 mb-2">How did the call go?</p>
                <div className="grid grid-cols-2 gap-1.5 mb-2">
                  {OUTCOMES.map(({ key, label }) => (
                    <button key={key} onClick={() => setOutcome(key)}
                      className="px-2 py-1.5 rounded-lg text-left transition-colors"
                      style={{
                        fontSize: 11,
                        border:          outcome === key ? '2px solid #0d9488' : '1px solid #e5e7eb',
                        backgroundColor: outcome === key ? '#f0fdfa' : 'white',
                        color:           outcome === key ? '#0f766e' : '#4b5563',
                      }}>
                      {label}
                    </button>
                  ))}
                </div>
                <input type="text" placeholder="What worked?" value={whatWorked}
                  onChange={e => setWhatWorked(e.target.value)}
                  className="w-full px-3 py-1.5 rounded-lg mb-1.5"
                  style={{ fontSize: 12, border: '1px solid #e5e7eb', outline: 'none' }} />
                <input type="text" placeholder="What to try next?" value={whatNext}
                  onChange={e => setWhatNext(e.target.value)}
                  className="w-full px-3 py-1.5 rounded-lg mb-2"
                  style={{ fontSize: 12, border: '1px solid #e5e7eb', outline: 'none' }} />
                <button onClick={handleSaveOutcome} disabled={!outcome || saving}
                  className="w-full py-1.5 rounded-lg text-xs font-medium text-white disabled:opacity-50"
                  style={{ backgroundColor: '#0d9488' }}>
                  {saving ? 'Saving…' : 'Save outcome'}
                </button>
              </>
            )}
          </div>
        )}

        {/* ── Footer ── */}
        <div className="flex-shrink-0 flex items-center gap-1.5 px-4 py-2" style={{ borderTop: '1px solid #f0f0eb' }}>
          <span className="material-symbols-outlined text-green-500" style={{ fontSize: 12 }}>verified_user</span>
          <p className="text-gray-400" style={{ fontSize: 10 }}>
            Max only coaches you — he never contacts the customer directly
          </p>
        </div>
      </div>
    </>
  );
}
