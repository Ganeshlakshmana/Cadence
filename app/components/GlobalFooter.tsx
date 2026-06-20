export default function GlobalFooter() {
  return (
    <footer
      className="w-full py-10 text-center mt-10 no-print"
      style={{ borderTop: '1px solid var(--color-outline-variant)' }}
    >
      <div className="max-w-7xl mx-auto px-10 flex justify-end">
        <p className="font-data-mono text-outline uppercase tracking-widest" style={{ fontSize: 10 }}>
          CADENCE BY REONIC · EU-RESIDENT · AI ACT ART. 50
        </p>
      </div>
    </footer>
  );
}
