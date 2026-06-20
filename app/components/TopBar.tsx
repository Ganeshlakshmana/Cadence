'use client';

import { useRouter } from 'next/navigation';

interface TopBarProps {
  title: string;
  showAdjust?: boolean;
  onAdjustClick?: () => void;
  strategyId?: string;
}

export default function TopBar({ title, showAdjust = true, onAdjustClick, strategyId }: TopBarProps) {
  const router = useRouter();

  const handleExport = () => {
    if (strategyId) {
      router.push(`/brief?strategyId=${strategyId}`);
    } else {
      router.push('/brief');
    }
  };

  return (
    <header
      className="sticky top-0 w-full z-40 flex justify-between items-center px-6 py-4 no-print"
      style={{
        backgroundColor: 'var(--color-surface)',
        borderBottom: '1px solid var(--color-outline-variant)',
      }}
    >
      <div className="flex items-center gap-4">
        <h1 className="font-display-md text-2xl italic text-primary">{title}</h1>
      </div>
      <div className="flex items-center gap-6">
        {showAdjust && (
          <button
            onClick={onAdjustClick || (() => router.push('/adjust'))}
            className="font-body-strong flex items-center gap-1 active:scale-95 transition-all hover:opacity-80"
            style={{ color: 'var(--color-on-surface-variant)' }}
          >
            <span className="material-symbols-outlined">replay</span>
            <span>Adjust Sequence</span>
          </button>
        )}
        <button
          onClick={handleExport}
          className="font-body-strong px-6 py-2 transition-transform active:scale-95 rounded-sm"
          style={{ backgroundColor: 'var(--color-primary)', color: 'var(--color-on-primary)' }}
        >
          Export brief
        </button>
        <div
          className="w-8 h-8 rounded-full flex items-center justify-center cursor-pointer hover:opacity-80"
          style={{
            backgroundColor: 'var(--color-surface-container-highest)',
            border: '1px solid var(--color-outline-variant)',
          }}
        >
          <span className="material-symbols-outlined text-outline">person</span>
        </div>
      </div>
    </header>
  );
}
