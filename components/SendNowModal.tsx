'use client';

import { useState } from 'react';

export interface SendNowTouch {
  id?: string;
  channel: string;
  contentSubject: string | null;
  contentBody: string | null;
  contentAudioUrl?: string | null;
  contentImageUrl?: string | null;
}

export interface SendNowCustomer {
  id: string;
  fname: string;
  lname: string;
  email: string | null;
  phone: string | null;
  whatsappEnabled: boolean;
  consentMarketing: boolean;
}

type SendChannel = 'email' | 'whatsapp_text' | 'whatsapp_audio' | 'sms';
type Step = 'channel' | 'review' | 'draft' | 'sending' | 'done' | 'error';

const CHANNEL_CFG: Record<SendChannel, { label: string; icon: string; color: string; desc: string }> = {
  email:          { label: 'Email',         icon: 'mail',  color: '#2E5D4E', desc: 'Send via Gmail'         },
  whatsapp_text:  { label: 'WhatsApp',      icon: 'chat',  color: '#25D366', desc: 'WhatsApp text message'  },
  whatsapp_audio: { label: 'WA Voice Note', icon: 'mic',   color: '#25D366', desc: 'Send the AI voice note' },
  sms:            { label: 'SMS',           icon: 'sms',   color: '#5b7db1', desc: 'Plain text message'     },
};

interface MaxMessage { role: 'installer' | 'max'; text: string }

interface Props {
  open: boolean;
  onClose: () => void;
  touch: SendNowTouch | null;
  customer: SendNowCustomer | null;
}

export function SendNowModal({ open, onClose, touch, customer }: Props) {
  const [step, setStep]               = useState<Step>('channel');
  const [channel, setChannel]         = useState<SendChannel | null>(null);
  const [subject, setSubject]         = useState('');
  const [body, setBody]               = useState('');
  const [errorMsg, setErrorMsg]       = useState('');

  // Image review state
  const [imageUrl, setImageUrl]       = useState<string | null>(touch?.contentImageUrl ?? null);
  const [overrides, setOverrides]     = useState<Record<string, string>>({});
  const [chatInput, setChatInput]     = useState('');
  const [chatLog, setChatLog]         = useState<MaxMessage[]>([]);
  const [chatLoading, setChatLoading] = useState(false);

  if (!open || !touch || !customer) return null;

  const isVoice    = touch.channel === 'whatsapp_voice' || touch.channel === 'voice_note';
  const canEmail   = !!customer.email  && !!customer.consentMarketing;
  const canWA      = !!customer.phone  && !!customer.whatsappEnabled && !!customer.consentMarketing;
  const canSms     = !!customer.phone  && !!customer.consentMarketing;
  const hasAudio   = !!touch.contentAudioUrl;

  const available: SendChannel[] = [
    ...(canEmail          ? ['email']          : []),
    ...(canWA             ? ['whatsapp_text']  : []),
    ...(canWA && hasAudio ? ['whatsapp_audio'] : []),
    ...(canSms            ? ['sms']            : []),
  ] as SendChannel[];

  function selectChannel(ch: SendChannel) {
    setChannel(ch);
    setSubject(touch!.contentSubject ?? 'Following up on your solar quote');
    setBody(touch!.contentBody ?? '');
    setImageUrl(touch!.contentImageUrl ?? null);
    // Voice channels go to image review first
    if ((ch === 'whatsapp_audio') && (touch!.contentImageUrl || touch!.contentAudioUrl)) {
      setStep('review');
    } else {
      setStep('draft');
    }
  }

  async function askMax() {
    if (!chatInput.trim() || !touch?.id || chatLoading) return;
    const request = chatInput.trim();
    const touchId = touch.id;
    setChatInput('');
    setChatLog(l => [...l, { role: 'installer', text: request }]);
    setChatLoading(true);
    try {
      const r = await fetch(`/api/touch/${touchId}/regenerate-image`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ request, currentOverrides: overrides }),
      });
      const data = await r.json();
      if (!r.ok || data.error) throw new Error(data.error ?? `HTTP ${r.status}`);
      setImageUrl(data.data.image_url);
      setOverrides(data.data.overrides ?? {});
      setChatLog(l => [...l, { role: 'max', text: `Done! I've updated the card. ${describeChange(request)}` }]);
    } catch (e: unknown) {
      setChatLog(l => [...l, { role: 'max', text: `Sorry, I couldn't make that change: ${e instanceof Error ? e.message : String(e)}` }]);
    } finally {
      setChatLoading(false);
    }
  }

  function describeChange(req: string): string {
    if (/subtitle|heading|title/i.test(req)) return 'The subtitle has been updated.';
    if (/price|cost|quote/i.test(req)) return 'The price line has been updated.';
    if (/badge|label/i.test(req)) return 'The badge has been updated.';
    if (/caption|note|add/i.test(req)) return 'A custom caption has been added.';
    return 'Take a look at the updated card above.';
  }

  async function send() {
    if (!channel || !customer || !touch) return;
    setStep('sending');
    setErrorMsg('');
    try {
      let res: Response;
      if (channel === 'email') {
        res = await fetch('/api/channels/gmail/send', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ touchpoint_id: touch.id, customer_id: customer.id, to_email: customer.email, subject, html_body: body.split('\n').map(l => `<p>${l}</p>`).join('') }),
        });
      } else if (channel === 'whatsapp_text') {
        res = await fetch('/api/channels/whatsapp/send', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ touchpoint_id: touch.id, customer_id: customer.id, message_type: 'text', content_body: body }),
        });
      } else if (channel === 'whatsapp_audio') {
        res = await fetch('/api/channels/whatsapp/send', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ touchpoint_id: touch.id, customer_id: customer.id, message_type: 'audio', content_body: body, content_audio_url: touch.contentAudioUrl }),
        });
      } else {
        res = await fetch('/api/channels/sms/send', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ touchpoint_id: touch.id, customer_id: customer.id, body }),
        });
      }
      const json = await res.json();
      if (!res.ok || json.error) throw new Error(json.error ?? `HTTP ${res.status}`);
      setStep('done');
    } catch (e: unknown) {
      setErrorMsg(e instanceof Error ? e.message : String(e));
      setStep('error');
    }
  }

  function close() {
    setStep('channel'); setChannel(null); setSubject(''); setBody('');
    setErrorMsg(''); setChatLog([]); setChatInput(''); setOverrides({});
    setImageUrl(touch?.contentImageUrl ?? null);
    onClose();
  }

  const cfg      = channel ? CHANNEL_CFG[channel] : null;
  const custName = `${customer.fname} ${customer.lname}`;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center sm:items-center"
      style={{ backgroundColor: 'rgba(0,0,0,0.45)' }}
      onClick={e => { if (e.target === e.currentTarget) close(); }}
    >
      <div
        className="w-full sm:w-[560px] rounded-t-2xl sm:rounded-2xl p-6 space-y-5"
        style={{ backgroundColor: 'var(--color-surface)', border: '1px solid var(--color-outline-variant)', maxHeight: '92vh', overflowY: 'auto' }}
      >
        {/* Header */}
        <div className="flex justify-between items-start">
          <div>
            <h3 className="font-display-md text-xl italic text-on-surface">
              {step === 'channel' && `Contact ${custName}`}
              {step === 'review'  && 'Review voice card'}
              {step === 'draft'   && `Draft · ${cfg?.label}`}
              {step === 'sending' && 'Sending…'}
              {step === 'done'    && 'Sent!'}
              {step === 'error'   && 'Send failed'}
            </h3>
            {step === 'channel' && <p className="text-on-surface-variant mt-0.5" style={{ fontSize: 13 }}>How would you like to reach out?</p>}
            {step === 'review'  && <p className="text-on-surface-variant mt-0.5" style={{ fontSize: 12 }}>Check the card, ask Max to make edits, then send.</p>}
            {step === 'draft' && cfg && (
              <p className="text-on-surface-variant mt-0.5 flex items-center gap-1" style={{ fontSize: 12 }}>
                <span className="material-symbols-outlined" style={{ fontSize: 13, color: cfg.color }}>{cfg.icon}</span>
                {cfg.desc}
              </p>
            )}
          </div>
          <button onClick={close} className="text-on-surface-variant hover:opacity-70 active:scale-95">
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        {/* ── Step 1: Channel picker ────────────────────────────────── */}
        {step === 'channel' && (
          available.length === 0 ? (
            <p className="text-on-surface-variant py-4 text-center" style={{ fontSize: 13 }}>
              No channels available — check customer consent and contact details.
            </p>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              {available.map(ch => {
                const c = CHANNEL_CFG[ch];
                return (
                  <button
                    key={ch}
                    onClick={() => selectChannel(ch)}
                    className="flex items-center gap-3 p-4 rounded-xl text-left hover:opacity-90 active:scale-95 transition-all"
                    style={{ border: `1.5px solid ${c.color}`, color: c.color, backgroundColor: `${c.color}10` }}
                  >
                    <span className="material-symbols-outlined" style={{ fontSize: 22 }}>{c.icon}</span>
                    <div>
                      <p className="font-body-strong" style={{ fontSize: 14 }}>{c.label}</p>
                      <p className="text-on-surface-variant" style={{ fontSize: 11 }}>{c.desc}</p>
                    </div>
                  </button>
                );
              })}
            </div>
          )
        )}

        {/* ── Step 2: Image review + Max chatbot ───────────────────── */}
        {step === 'review' && (
          <div className="space-y-4">
            {/* Image preview */}
            {imageUrl ? (
              <img
                src={imageUrl}
                alt="Personalized solar proposal card"
                className="w-full rounded-xl"
                style={{ aspectRatio: '16/9', objectFit: 'cover', border: '1px solid var(--color-outline-variant)' }}
              />
            ) : (
              <div className="w-full rounded-xl flex items-center justify-center" style={{ aspectRatio: '16/9', backgroundColor: 'var(--color-surface-container)', border: '1px dashed var(--color-outline-variant)' }}>
                <p className="font-label-caps text-outline" style={{ fontSize: 9 }}>NO IMAGE GENERATED YET</p>
              </div>
            )}

            {/* Audio preview */}
            {touch.contentAudioUrl && (
              <div>
                <p className="font-label-caps text-outline mb-1" style={{ fontSize: 9 }}>VOICE NOTE</p>
                <audio controls src={touch.contentAudioUrl} className="w-full" style={{ height: 36 }} />
              </div>
            )}

            {/* Max chat log */}
            {chatLog.length > 0 && (
              <div className="space-y-2 max-h-40 overflow-y-auto">
                {chatLog.map((msg, i) => (
                  <div
                    key={i}
                    className="flex gap-2 items-start"
                    style={{ flexDirection: msg.role === 'installer' ? 'row-reverse' : 'row' }}
                  >
                    <div
                      className="px-3 py-2 rounded-xl max-w-[85%]"
                      style={{
                        fontSize: 12,
                        backgroundColor: msg.role === 'installer' ? '#25D366' : 'var(--color-surface-container)',
                        color: msg.role === 'installer' ? 'white' : 'var(--color-on-surface)',
                      }}
                    >
                      {msg.role === 'max' && (
                        <span className="font-label-caps block mb-0.5" style={{ fontSize: 8, color: 'var(--color-primary)' }}>MAX</span>
                      )}
                      {msg.text}
                    </div>
                  </div>
                ))}
                {chatLoading && (
                  <div className="flex gap-2 items-center">
                    <div className="w-3 h-3 rounded-full border-2 border-t-transparent animate-spin" style={{ borderColor: 'var(--color-primary)' }} />
                    <span className="font-label-caps text-outline" style={{ fontSize: 9 }}>MAX IS UPDATING THE CARD…</span>
                  </div>
                )}
              </div>
            )}

            {/* Max input */}
            <div>
              <p className="font-label-caps text-outline mb-1" style={{ fontSize: 9 }}>ASK MAX TO EDIT THE CARD</p>
              <div className="flex gap-2">
                <input
                  value={chatInput}
                  onChange={e => setChatInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); askMax(); } }}
                  placeholder={`e.g. "Change the subtitle to Special Offer - this week only"`}
                  className="flex-1 rounded-lg px-3 py-2 text-on-surface"
                  style={{ border: '1px solid var(--color-outline-variant)', fontSize: 12, outline: 'none', backgroundColor: 'var(--color-surface-container)', fontFamily: 'inherit' }}
                  disabled={chatLoading}
                />
                <button
                  onClick={askMax}
                  disabled={!chatInput.trim() || chatLoading}
                  className="px-3 py-2 rounded-lg font-body-strong hover:opacity-90 active:scale-95 disabled:opacity-40 transition-all"
                  style={{ backgroundColor: 'var(--color-primary)', color: 'white', fontSize: 13 }}
                >
                  <span className="material-symbols-outlined" style={{ fontSize: 16 }}>send</span>
                </button>
              </div>
            </div>

            <div className="flex justify-between items-center pt-1">
              <button
                onClick={() => setStep('channel')}
                className="flex items-center gap-1 text-on-surface-variant hover:opacity-70"
                style={{ fontSize: 13 }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: 16 }}>arrow_back</span>
                Back
              </button>
              <button
                onClick={() => setStep('draft')}
                className="px-5 py-2.5 font-body-strong rounded-lg flex items-center gap-2 hover:opacity-90 active:scale-95 transition-all"
                style={{ backgroundColor: '#25D366', color: 'white', fontSize: 14 }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: 16 }}>check</span>
                Looks good — send
              </button>
            </div>
          </div>
        )}

        {/* ── Step 3: Draft review ──────────────────────────────────── */}
        {step === 'draft' && (
          <div className="space-y-4">
            {channel === 'email' && (
              <div>
                <label className="font-label-caps text-outline block mb-1" style={{ fontSize: 9 }}>SUBJECT</label>
                <input
                  value={subject}
                  onChange={e => setSubject(e.target.value)}
                  className="w-full rounded-lg px-3 py-2 text-on-surface"
                  style={{ border: '1px solid var(--color-outline-variant)', fontSize: 13, outline: 'none', backgroundColor: 'var(--color-surface-container)', fontFamily: 'inherit' }}
                />
              </div>
            )}

            {channel === 'whatsapp_audio' && (imageUrl || touch.contentAudioUrl) && (
              <div className="space-y-2 p-3 rounded-xl" style={{ backgroundColor: 'var(--color-surface-container)', border: '1px solid var(--color-outline-variant)' }}>
                <p className="font-label-caps text-outline" style={{ fontSize: 9 }}>VOICE CARD — READY TO SEND</p>
                {imageUrl && (
                  <img src={imageUrl} alt="Proposal card" className="w-full rounded-lg" style={{ aspectRatio: '16/9', objectFit: 'cover' }} />
                )}
                {touch.contentAudioUrl && (
                  <audio controls src={touch.contentAudioUrl} className="w-full" style={{ height: 36 }} />
                )}
                <button
                  onClick={() => setStep('review')}
                  className="font-label-caps text-outline underline hover:opacity-70"
                  style={{ fontSize: 9 }}
                >
                  ← EDIT WITH MAX
                </button>
              </div>
            )}

            {channel !== 'whatsapp_audio' && (
              <div>
                <label className="font-label-caps text-outline block mb-1" style={{ fontSize: 9 }}>MESSAGE</label>
                <textarea
                  value={body}
                  onChange={e => setBody(e.target.value)}
                  className="w-full rounded-lg px-3 py-2 text-on-surface resize-none"
                  style={{ border: '1px solid var(--color-outline-variant)', fontSize: 12, outline: 'none', backgroundColor: 'var(--color-surface-container)', minHeight: 180, fontFamily: 'inherit', lineHeight: 1.6 }}
                />
              </div>
            )}

            <div className="flex justify-between items-center pt-1">
              <button
                onClick={() => setStep(channel === 'whatsapp_audio' ? 'review' : 'channel')}
                className="flex items-center gap-1 text-on-surface-variant hover:opacity-70"
                style={{ fontSize: 13 }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: 16 }}>arrow_back</span>
                Back
              </button>
              <button
                onClick={send}
                disabled={channel !== 'whatsapp_audio' && !body.trim()}
                className="px-5 py-2.5 font-body-strong rounded-lg flex items-center gap-2 hover:opacity-90 active:scale-95 transition-all disabled:opacity-40"
                style={{ backgroundColor: cfg?.color ?? 'var(--color-primary)', color: 'white', fontSize: 14 }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: 16 }}>send</span>
                Send from here
              </button>
            </div>
          </div>
        )}

        {/* ── Sending ───────────────────────────────────────────────── */}
        {step === 'sending' && (
          <div className="flex items-center justify-center gap-3 py-10">
            <div className="w-5 h-5 rounded-full border-2 border-t-transparent animate-spin" style={{ borderColor: cfg?.color ?? 'var(--color-primary)' }} />
            <p className="text-on-surface-variant" style={{ fontSize: 14 }}>Sending via {cfg?.label}…</p>
          </div>
        )}

        {/* ── Done ─────────────────────────────────────────────────── */}
        {step === 'done' && (
          <div className="text-center py-8 space-y-4">
            <span className="material-symbols-outlined" style={{ fontSize: 48, color: cfg?.color ?? 'var(--color-primary)' }}>check_circle</span>
            <p className="font-body-main text-on-surface" style={{ fontSize: 15 }}>Sent via {cfg?.label} to {custName}</p>
            <button
              onClick={close}
              className="px-6 py-2.5 font-body-strong rounded-lg hover:opacity-90 active:scale-95 transition-all"
              style={{ backgroundColor: cfg?.color ?? 'var(--color-primary)', color: 'white', fontSize: 13 }}
            >
              Done
            </button>
          </div>
        )}

        {/* ── Error ────────────────────────────────────────────────── */}
        {step === 'error' && (
          <div className="space-y-4">
            <div className="p-4 rounded-lg" style={{ backgroundColor: 'var(--color-error-container)' }}>
              <p className="text-on-error-container" style={{ fontSize: 13 }}>{errorMsg}</p>
            </div>
            <div className="flex justify-between">
              <button onClick={() => setStep('draft')} className="flex items-center gap-1 text-on-surface-variant hover:opacity-70" style={{ fontSize: 13 }}>
                <span className="material-symbols-outlined" style={{ fontSize: 16 }}>arrow_back</span>
                Back to draft
              </button>
              <button onClick={close} className="text-on-surface-variant hover:opacity-70" style={{ fontSize: 13 }}>Cancel</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
