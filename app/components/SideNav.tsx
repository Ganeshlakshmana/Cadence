'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';

const NAV_ITEMS = [
  { href: '/pipeline', label: 'Pipeline',   icon: 'lan',          key: 'pipeline'  },
  { href: '/sequences', label: 'Sequences', icon: 'account_tree', key: 'sequences' },
];

export default function SideNav() {
  const pathname = usePathname();
  const router = useRouter();

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

      {/* New Project CTA */}
      <button
        onClick={() => router.push('/intake')}
        className="mx-6 mb-8 py-3 px-6 flex items-center justify-center gap-2 font-body-strong transition-all active:scale-95 hover:opacity-90"
        style={{
          backgroundColor: 'var(--color-primary-container)',
          color: 'var(--color-on-primary)',
          border: '1px solid var(--color-primary-container)',
        }}
      >
        <span className="material-symbols-outlined" style={{ fontSize: 18 }}>add</span>
        <span>New Project</span>
      </button>

      {/* Footer */}
      <div
        className="px-6 pt-6 flex items-center gap-2"
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
