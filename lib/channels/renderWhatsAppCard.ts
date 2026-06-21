// Uses sharp (already bundled with Next.js) to render SVG → PNG.
// The `canvas` npm package requires native binaries; sharp's librsvg handles
// SVG text and paths server-side without extra deps.
import sharp from 'sharp';
import { mkdir } from 'fs/promises';
import path from 'path';
import type { customers, touchpoints } from '@/db/schema';

type Customer  = typeof customers.$inferSelect;
type Touchpoint = typeof touchpoints.$inferSelect;

// ── Helpers ───────────────────────────────────────────────────────────────────

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function fmtEur(val: number): string {
  return `€${Math.round(val).toLocaleString('en-US')}`;
}

export interface CardOverrides {
  subtitle?: string;
  statLine?: string;
  badge?: string;
  customCaption?: string;
}

// ── SVG card builder ──────────────────────────────────────────────────────────

function buildSvg(customer: Customer, touchpoint: Touchpoint, overrides?: CardOverrides): string {
  const name     = esc(`${customer.fname} ${customer.lname}`);
  const price    = customer.priceQuote ? fmtEur(customer.priceQuote) : 'Quote pending';
  const savings  = customer.priceQuote ? fmtEur(customer.priceQuote * 0.085) : null;
  const statLine = esc(overrides?.statLine ?? (savings ? `${price} system  ·  ${savings}/yr savings` : price));
  const subtitle = esc(
    (overrides?.subtitle ?? touchpoint.contentSubject ?? 'Personalized Solar Proposal').slice(0, 70),
  );
  const badge         = esc(overrides?.badge ?? 'Solar Proposal');
  const customCaption = overrides?.customCaption ? esc(overrides.customCaption.slice(0, 80)) : null;

  // Sun icon centred at (710, 100) — 8 radiating rays
  const sunCx = 710, sunCy = 100;
  const rays = Array.from({ length: 8 }, (_, i) => {
    const a  = (i * 45 * Math.PI) / 180;
    const cos = Math.cos(a), sin = Math.sin(a);
    return `<line x1="${(sunCx + 65 * cos).toFixed(1)}" y1="${(sunCy + 65 * sin).toFixed(1)}"
                  x2="${(sunCx + 92 * cos).toFixed(1)}" y2="${(sunCy + 92 * sin).toFixed(1)}"
                  stroke="#f59e0b" stroke-width="5" stroke-linecap="round" opacity="0.65"/>`;
  }).join('\n    ');

  // Mini solar-panel grid (50×36 px)
  const panel = `
    <g transform="translate(50,285)" opacity="0.45">
      <rect width="78" height="54" rx="3" fill="none" stroke="#475569" stroke-width="1.5"/>
      <line x1="0" y1="18" x2="78" y2="18" stroke="#475569" stroke-width="1"/>
      <line x1="0" y1="36" x2="78" y2="36" stroke="#475569" stroke-width="1"/>
      <line x1="26" y1="0" x2="26" y2="54" stroke="#475569" stroke-width="1"/>
      <line x1="52" y1="0" x2="52" y2="54" stroke="#475569" stroke-width="1"/>
    </g>`;

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="800" height="450">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0.6" y2="1">
      <stop offset="0%" stop-color="#1a1a2e"/>
      <stop offset="100%" stop-color="#16213e"/>
    </linearGradient>
  </defs>

  <!-- Background -->
  <rect width="800" height="450" fill="url(#bg)"/>
  <!-- Bottom bar -->
  <rect x="0" y="390" width="800" height="60" fill="#0b0b18"/>
  <!-- Left accent bar -->
  <rect x="0" y="0" width="5" height="390" fill="#f59e0b"/>

  <!-- Sun rays -->
  ${rays}
  <!-- Sun body -->
  <circle cx="${sunCx}" cy="${sunCy}" r="52" fill="#f59e0b"/>
  <circle cx="${sunCx}" cy="${sunCy}" r="40" fill="#fbbf24"/>
  <!-- Shine highlight -->
  <circle cx="${sunCx - 14}" cy="${sunCy - 14}" r="10" fill="white" opacity="0.18"/>

  <!-- Customer name -->
  <text x="38" y="108"
        font-family="sans-serif" font-size="46" font-weight="700"
        fill="white" letter-spacing="-0.5">${name}</text>

  <!-- Price / savings stat -->
  <text x="38" y="160"
        font-family="sans-serif" font-size="23"
        fill="#f59e0b">${statLine}</text>

  <!-- Separator -->
  <line x1="38" y1="186" x2="762" y2="186" stroke="#2d3a52" stroke-width="1"/>

  <!-- Touch subject / subtitle -->
  <text x="38" y="232"
        font-family="sans-serif" font-size="20"
        fill="#94a3b8">${subtitle}</text>

  <!-- Solar panel decorative icon -->
  ${panel}

  <!-- Badge -->
  <rect x="148" y="282" width="176" height="36" rx="6" fill="#1e3a5f"/>
  <text x="236" y="306"
        font-family="sans-serif" font-size="14"
        fill="#60a5fa" text-anchor="middle">${badge}</text>

  ${customCaption ? `<!-- Custom caption from installer -->
  <text x="38" y="355"
        font-family="sans-serif" font-size="15" font-style="italic"
        fill="#94a3b8">${customCaption}</text>` : ''}

  <!-- Bottom: company name -->
  <text x="38" y="426"
        font-family="sans-serif" font-size="16" font-weight="700"
        fill="#f59e0b">Cadence Solar</text>
  <text x="168" y="426"
        font-family="sans-serif" font-size="16"
        fill="#475569"> · by Reonic</text>

  <!-- Bottom: domain -->
  <text x="762" y="426"
        font-family="sans-serif" font-size="13"
        fill="#334155" text-anchor="end">reonic.com</text>
</svg>`;
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Render a solar proposal PNG card for a customer + touchpoint.
 * Saves to /public/cards/{customerId}-{timestamp}.png
 * Returns the public URL path.
 */
export async function generateImageCard(
  customer:   Customer,
  touchpoint: Touchpoint,
  overrides?: CardOverrides,
): Promise<string> {
  const svg      = buildSvg(customer, touchpoint, overrides);
  const cardsDir = path.join(process.cwd(), 'public', 'cards');

  await mkdir(cardsDir, { recursive: true });

  const filename = `${customer.id}-${Date.now()}.png`;
  const filePath = path.join(cardsDir, filename);

  await sharp(Buffer.from(svg)).png().toFile(filePath);

  return `/cards/${filename}`;
}
