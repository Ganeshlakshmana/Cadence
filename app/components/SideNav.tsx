'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

const NAV_ITEMS = [
  { href: '/pipeline',  label: 'Pipeline',  icon: 'lan',          key: 'pipeline'  },
  { href: '/sequences', label: 'Sequences', icon: 'account_tree', key: 'sequences' },
];

const USER = { name: 'Ganesh Lakshmana', role: 'Sales Manager', initials: 'GL' };
const STORAGE_KEY = 'cadence_user_photo';

export default function SideNav() {
  const pathname   = usePathname();
  const fileRef    = useRef<HTMLInputElement>(null);
  const [photo, setPhoto] = useState<string | null>(null);

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) setPhoto(stored);
  }, []);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const data = ev.target?.result as string;
      setPhoto(data);
      localStorage.setItem(STORAGE_KEY, data);
    };
    reader.readAsDataURL(file);
  }

  const isActive = (href: string) => pathname.startsWith(href);

  return (
    <nav
      className="h-screen w-64 fixed left-0 top-0 flex flex-col py-6 z-50 no-print"
      style={{ backgroundColor: 'var(--color-surface-container-lowest)', borderRight: '1px solid var(--color-outline-variant)' }}
    >
      {/* Wordmark */}
      <div className="px-6 mb-10">
        <div className="flex items-baseline gap-1">
          <span className="font-wordmark italic text-primary" style={{ fontSize: 22 }}>Cadence</span>
          <span className="font-data-mono text-outline uppercase tracking-widest" style={{ fontSize: 9 }}>BY REONIC</span>
        </div>
        <p className="font-label-caps text-outline mt-1 uppercase" style={{ fontSize: 10 }}>Infrastructure Report</p>
      </div>

      {/* Nav links */}
      <div className="flex-1" style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
        {NAV_ITEMS.map(({ href, label, icon, key }) => {
          const active = isActive(href);
          return (
            <Link
              key={key}
              href={href}
              className="flex items-center gap-4 px-6 py-3 transition-colors"
              style={{
                borderLeft: active ? '2px solid var(--color-primary)' : '2px solid transparent',
                color: active ? 'var(--color-primary)' : 'var(--color-on-surface-variant)',
                fontWeight: active ? 600 : 400,
                backgroundColor: active ? 'rgba(46,93,78,0.04)' : 'transparent',
              }}
            >
              <span className="material-symbols-outlined">{icon}</span>
              <span className="font-body-main">{label}</span>
            </Link>
          );
        })}
      </div>

      {/* User profile */}
      <div className="mx-4 mb-4 rounded-xl p-3" style={{ backgroundColor: 'var(--color-surface-container-low)', border: '1px solid var(--color-outline-variant)' }}>
        <div className="flex items-center gap-3">
          {/* Avatar */}
          <button
            onClick={() => fileRef.current?.click()}
            className="relative flex-shrink-0 group"
            title="Click to change photo"
          >
            {photo ? (
              <img src={photo} alt="Profile" className="w-10 h-10 rounded-full object-cover" style={{ border: '2px solid var(--color-primary)' }} />
            ) : (
              <div className="w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm"
                style={{ backgroundColor: 'var(--color-primary)', color: 'white', letterSpacing: '0.02em' }}>
                {USER.initials}
              </div>
            )}
            <div className="absolute inset-0 rounded-full bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
              <span className="material-symbols-outlined text-white" style={{ fontSize: 14 }}>photo_camera</span>
            </div>
          </button>
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleFileChange} />

          {/* Info */}
          <div className="min-w-0">
            <p className="font-body-strong text-on-surface truncate" style={{ fontSize: 12 }}>{USER.name}</p>
            <p className="font-data-mono text-outline truncate" style={{ fontSize: 10 }}>{USER.role}</p>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div
        className="px-6 pt-4 flex items-center gap-2"
        style={{ borderTop: '1px solid var(--color-outline-variant)' }}
      >
        <span className="material-symbols-outlined text-outline" style={{ fontSize: 14 }}>copyright</span>
        <span className="font-label-caps text-outline uppercase tracking-widest" style={{ fontSize: 10 }}>
          Cadence by Reonic
        </span>
      </div>
    </nav>
  );
}
