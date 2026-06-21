import Database from 'better-sqlite3';
import { nanoid } from 'nanoid';
import path from 'path';

const db = new Database(path.join(process.cwd(), 'data', 'sunpath.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

const now = Math.floor(Date.now() / 1000);

// ── 12 customers: 4 German (de), 4 US (en), 4 Spanish (es)
// Archetype distribution:
//   3 × Family-heavy (0.6+), 3 × Investor-heavy (0.6+),
//   2 × Environmentalist-heavy (0.6+), 2 × Skeptic-heavy (0.6+),
//   2 × true blends (no archetype above 0.4)

const customers = [
  // ── German (de) ──────────────────────────────────────────────────────────────
  {
    // Family-heavy
    fname: 'Maria', lname: 'Müller', language: 'de',
    email: 'maria.mueller@gmail.com', phone: '+49 89 2134 5678',
    address: 'Rosenheimer Str. 47', postal_code: '81669',
    price_quote: 24800, whatsapp_enabled: 1,
    archetype_family: 0.65, archetype_investor: 0.10,
    archetype_environmentalist: 0.10, archetype_skeptic: 0.15,
    about: 'Maria asked about warranty length three times during the first call. Has two kids and is worried about unexpected costs down the line. Husband is the decision maker but he is cautious about long-term commitments. Mentioned they just refinanced their house last spring.',
    status: 'quoted', consent_marketing: 1, consent_voice_cloning: 1,
  },
  {
    // Investor-heavy
    fname: 'Klaus', lname: 'Becker', language: 'de',
    email: 'k.becker@becker-gmbh.de', phone: '+49 30 5512 9900',
    address: 'Kurfürstendamm 218', postal_code: '10719',
    price_quote: 38500, whatsapp_enabled: 1,
    archetype_family: 0.05, archetype_investor: 0.72,
    archetype_environmentalist: 0.13, archetype_skeptic: 0.10,
    about: 'Klaus runs a mid-size logistics firm and approached this entirely as a capital allocation decision. Wants a 10-year ROI table and asked how solar compares to ETF returns at 7% CAGR. Checks his phone constantly during meetings. Will sign quickly if the numbers hold up — has budget approved already.',
    status: 'engaged', consent_marketing: 1, consent_voice_cloning: 0,
  },
  {
    // Environmentalist-heavy
    fname: 'Hannah', lname: 'Schreiber', language: 'de',
    email: 'h.schreiber@web.de', phone: '+49 40 8821 3344',
    address: 'Eppendorfer Weg 112', postal_code: '20259',
    price_quote: 19200, whatsapp_enabled: 0,
    archetype_family: 0.10, archetype_investor: 0.05,
    archetype_environmentalist: 0.70, archetype_skeptic: 0.15,
    about: 'Hannah volunteers with a local climate-action group and brought a printed carbon-footprint worksheet to the first meeting. She cares far more about CO₂ offset than payback period. Slightly suspicious of greenwashing — wants documentation on panel manufacturing standards and supply-chain origin.',
    status: 'quoted', consent_marketing: 1, consent_voice_cloning: 1,
  },
  {
    // Skeptic-heavy
    fname: 'Thomas', lname: 'Fischer', language: 'de',
    email: 'thomas.fischer@t-online.de', phone: '+49 711 3345 6780',
    address: 'Silberburgstr. 89', postal_code: '70176',
    price_quote: 21600, whatsapp_enabled: 0,
    archetype_family: 0.10, archetype_investor: 0.15,
    archetype_environmentalist: 0.05, archetype_skeptic: 0.70,
    about: 'Thomas is a retired electrical engineer and cross-examines every technical claim. Showed up to the second meeting with a competitor spec sheet and highlighted discrepancies in our inverter efficiency figures. Asked about degradation curves, hail ratings, and inverter MTBF. Will need a detailed technical document before he considers signing.',
    status: 'quoted', consent_marketing: 0, consent_voice_cloning: 0,
  },

  // ── US (en) ──────────────────────────────────────────────────────────────────
  {
    // Family-heavy
    fname: 'James', lname: 'Miller', language: 'en',
    email: 'jamesmiller@outlook.com', phone: '+1 602 555 0142',
    address: '4821 E Camelback Rd', postal_code: '85018',
    price_quote: 31500, whatsapp_enabled: 1,
    archetype_family: 0.68, archetype_investor: 0.12,
    archetype_environmentalist: 0.08, archetype_skeptic: 0.12,
    about: 'James has three kids under 10 and his primary concern is locking in a predictable energy bill before the kids hit their teenager power-usage years. His wife sat in on the second call and asked most of the sharp questions. They are pre-approved for a home equity loan and seem ready to move once the warranty question is settled.',
    status: 'quoted', consent_marketing: 1, consent_voice_cloning: 0,
  },
  {
    // Investor-heavy
    fname: 'Sarah', lname: 'Chen', language: 'en',
    email: 'sarah.chen@financemail.com', phone: '+1 415 555 0391',
    address: '1290 Noe St', postal_code: '94114',
    price_quote: 44500, whatsapp_enabled: 1,
    archetype_family: 0.05, archetype_investor: 0.78,
    archetype_environmentalist: 0.10, archetype_skeptic: 0.07,
    about: 'Sarah is a finance director and immediately asked for a 25-year cash-flow model in a spreadsheet she could edit herself. Mentioned she is tracking NEM 3.0 rate changes closely and factored them into her own model. Not emotional about this at all — purely portfolio optimization. Very fast to respond once she has the numbers.',
    status: 'engaged', consent_marketing: 1, consent_voice_cloning: 1,
  },
  {
    // Skeptic-heavy
    fname: 'Robert', lname: 'Johnson', language: 'en',
    email: 'rjohnson1962@yahoo.com', phone: '+1 512 555 0874',
    address: '7703 Windcliff Dr', postal_code: '78759',
    price_quote: 17800, whatsapp_enabled: 0,
    archetype_family: 0.10, archetype_investor: 0.10,
    archetype_environmentalist: 0.08, archetype_skeptic: 0.72,
    about: 'Robert has watched two neighbors go through solar installs with mixed results and is not in a rush. Skeptical of long-term contracts and wary of sales pressure. Prefers email communication — no calls. Said he will take his time and wants verified customer references before making any decision.',
    status: 'quoted', consent_marketing: 0, consent_voice_cloning: 0,
  },
  {
    // True blend
    fname: 'Emily', lname: 'Davis', language: 'en',
    email: 'emily.davis@gmail.com', phone: '+1 303 555 0217',
    address: '2240 Pearl St', postal_code: '80302',
    price_quote: 26900, whatsapp_enabled: 1,
    archetype_family: 0.28, archetype_investor: 0.32,
    archetype_environmentalist: 0.22, archetype_skeptic: 0.18,
    about: 'Emily is hard to pin down — she ran her own IRR calculation before the first call but also mentioned grid resilience for her 4-year-old during outages. Engaged and curious with good questions across the board. Likely needs one more focused touchpoint to reach a decision — find her dominant driver and lean in.',
    status: 'engaged', consent_marketing: 1, consent_voice_cloning: 1,
  },

  // ── Spanish (es) ─────────────────────────────────────────────────────────────
  {
    // Investor-heavy
    fname: 'Carlos', lname: 'García', language: 'es',
    email: 'carlos.garcia@empresasol.es', phone: '+34 93 421 8800',
    address: 'Carrer de Provença 312', postal_code: '08037',
    price_quote: 42000, whatsapp_enabled: 1,
    archetype_family: 0.08, archetype_investor: 0.68,
    archetype_environmentalist: 0.14, archetype_skeptic: 0.10,
    about: 'Carlos owns a small chain of restaurants and wants to cut energy costs across two properties. Responds almost exclusively on WhatsApp and prefers voice notes over text. Already installed panels on a warehouse in 2019 and doubled down once he saw the returns. Decisive when the ROI story is clear.',
    status: 'engaged', consent_marketing: 1, consent_voice_cloning: 1,
  },
  {
    // Family-heavy
    fname: 'Ana', lname: 'Martínez', language: 'es',
    email: 'ana.martinez@hotmail.com', phone: '+34 91 567 2340',
    address: 'Calle de Alcalá 78, 3°B', postal_code: '28009',
    price_quote: 16400, whatsapp_enabled: 1,
    archetype_family: 0.62, archetype_investor: 0.12,
    archetype_environmentalist: 0.16, archetype_skeptic: 0.10,
    about: 'Ana is a primary school teacher focused entirely on what the panels mean for her family day-to-day. She returned repeatedly to reliability questions — what happens in a blackout, what if a panel breaks. Her elderly mother lives with the family so energy independence is an emotional topic. A reassuring warranty story will close this.',
    status: 'quoted', consent_marketing: 1, consent_voice_cloning: 0,
  },
  {
    // Environmentalist-heavy
    fname: 'Sofía', lname: 'López', language: 'es',
    email: 'sofia.lopez@upm.es', phone: '+34 96 382 5511',
    address: 'Av. de Blasco Ibáñez 44', postal_code: '46021',
    price_quote: 14600, whatsapp_enabled: 1,
    archetype_family: 0.12, archetype_investor: 0.08,
    archetype_environmentalist: 0.65, archetype_skeptic: 0.15,
    about: 'Sofía is an environmental science lecturer who asked detailed questions about panel supply-chain origin and recycling end-of-life policies before we even got to pricing. Wants to know if we are listed on any carbon registry. Not price-sensitive — she would pay a premium for provably cleaner manufacturing.',
    status: 'quoted', consent_marketing: 1, consent_voice_cloning: 0,
  },
  {
    // True blend
    fname: 'Miguel', lname: 'Torres', language: 'es',
    email: 'miguel.torres@gmail.com', phone: '+34 95 244 7901',
    address: 'Calle Sierpes 29, 1°', postal_code: '41004',
    price_quote: 22300, whatsapp_enabled: 0,
    archetype_family: 0.25, archetype_investor: 0.35,
    archetype_environmentalist: 0.22, archetype_skeptic: 0.18,
    about: 'Miguel is a freelance architect who mixes pragmatic cost thinking with genuine sustainability interest. He designed his own home and had detailed questions about panel placement and aesthetic integration with his roof line. No strong emotional driver — he will decide methodically and is probably comparing two or three providers.',
    status: 'quoted', consent_marketing: 0, consent_voice_cloning: 0,
  },
];

// ── Run ───────────────────────────────────────────────────────────────────────

const insert = db.prepare(`
  INSERT INTO customers (
    id, fname, lname, email, phone, whatsapp_enabled,
    address, postal_code, price_quote,
    archetype_family, archetype_investor, archetype_environmentalist, archetype_skeptic,
    about, status, language,
    consent_data_processing, consent_marketing, consent_voice_cloning,
    created_at, updated_at
  ) VALUES (
    ?, ?, ?, ?, ?, ?,
    ?, ?, ?,
    ?, ?, ?, ?,
    ?, ?, ?,
    1, ?, ?,
    ?, ?
  )
`);

const run = db.transaction(() => {
  db.prepare('DELETE FROM customers').run();
  for (const c of customers) {
    insert.run(
      nanoid(), c.fname, c.lname, c.email, c.phone, c.whatsapp_enabled,
      c.address, c.postal_code, c.price_quote,
      c.archetype_family, c.archetype_investor,
      c.archetype_environmentalist, c.archetype_skeptic,
      c.about, c.status, c.language,
      c.consent_marketing, c.consent_voice_cloning,
      now, now,
    );
  }
});

run();
db.close();

console.log(`Seeded ${customers.length} customers`);
