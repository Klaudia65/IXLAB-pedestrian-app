// Wander Navigator — phone shell + status bar
function PhoneShell({ children }) {
  return (
    <div style={{
      width: 390, height: 844, borderRadius: 54, position: "relative",
      background: "var(--bg-canvas)", overflow: "hidden",
      boxShadow: "0 40px 120px rgba(37,90,75,0.28), inset 0 0 0 10px #1b1f1d, inset 0 0 0 13px #2c322f",
    }}>
      <StatusBar />
      <div style={{ position: "absolute", inset: 0, paddingTop: 0 }}>{children}</div>
      {/* home indicator */}
      <div style={{ position: "absolute", bottom: 9, left: "50%", transform: "translateX(-50%)",
        width: 130, height: 5, borderRadius: 999, background: "rgba(37,90,75,0.5)", zIndex: 50 }} />
    </div>
  );
}

function StatusBar() {
  return (
    <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 54, zIndex: 40,
      display: "flex", alignItems: "center", justifyContent: "space-between",
      padding: "0 34px", fontFamily: "var(--font-mono)", fontSize: 13, fontWeight: 700,
      color: "var(--text-strong)", letterSpacing: "0.02em" }}>
      <span>9:41</span>
      <div style={{ display: "flex", gap: 6, alignItems: "center", opacity: 0.85 }}>
        <span style={{ fontSize: 11 }}>●●●</span>
        <svg width="18" height="12" viewBox="0 0 18 12" fill="none"><path d="M9 11C5.5 7 2 6 1 6.5 4 2.5 14 2.5 17 6.5 16 6 12.5 7 9 11Z" stroke="currentColor" strokeWidth="1.2"/></svg>
        <svg width="24" height="12" viewBox="0 0 24 12" fill="none"><rect x="0.5" y="1" width="20" height="10" rx="3" stroke="currentColor" strokeWidth="1.2"/><rect x="2.5" y="3" width="14" height="6" rx="1.5" fill="currentColor"/><rect x="21.5" y="4" width="2" height="4" rx="1" fill="currentColor"/></svg>
      </div>
    </div>
  );
}

window.PhoneShell = PhoneShell;
