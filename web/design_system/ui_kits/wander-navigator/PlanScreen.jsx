// Wander Navigator — Plan screen
const { OutingToggle, Input, Button, Card, Badge } = window.WanderStructuredFluidityDS_140bd8;

function PlanScreen({ outing, setOuting, outingColor, onFind }) {
  const recents = [
    { icon: "coffee", name: "Maple Café", meta: "Riverside · 12 min" },
    { icon: "leaf",   name: "Botanical Garden", meta: "North loop · 22 min" },
    { icon: "pin",    name: "Old Town Gate", meta: "Historic · 18 min" },
  ];
  return (
    <div style={{ position: "absolute", inset: 0 }}>
      <MapCanvas outingColor={outingColor} dim />

      {/* Top floating greeting + outing selector */}
      <div style={{ position: "absolute", top: 64, left: 16, right: 16 }}>
        <Card variant="glass" style={{ padding: 18 }}>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, letterSpacing: "0.18em",
            textTransform: "uppercase", color: "var(--text-muted)" }}>Good evening, Mara</div>
          <div style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 26,
            color: "var(--text-strong)", margin: "4px 0 16px", letterSpacing: "-0.01em" }}>
            Plan your wander
          </div>
          <OutingToggle value={outing} onChange={setOuting} style={{ width: "100%", display: "flex" }} />
        </Card>
      </div>

      {/* Bottom sheet — destination + recents */}
      <div style={{ position: "absolute", left: 0, right: 0, bottom: 0 }}>
        <Card variant="sheet" style={{ padding: "20px 18px 30px" }}>
          <div style={{ width: 44, height: 5, borderRadius: 999, background: "var(--border-muted)",
            margin: "0 auto 18px" }} />
          <Input placeholder="Where to?" leadingIcon={<Icon name="search" size={20} />} />

          <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, letterSpacing: "0.16em",
            textTransform: "uppercase", color: "var(--text-muted)", margin: "22px 4px 12px" }}>
            Saved for {outing} outings
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {recents.map((r) => (
              <button key={r.name} onClick={onFind} style={{
                display: "flex", alignItems: "center", gap: 14, padding: "12px 14px", border: "none",
                borderRadius: "var(--radius-md)", background: "var(--surface-raised)", cursor: "pointer",
                textAlign: "left", width: "100%" }}>
                <span style={{ width: 40, height: 40, borderRadius: 999, flexShrink: 0,
                  background: "var(--cobalt-100)", color: "var(--cobalt-600)",
                  display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <Icon name={r.icon} size={20} />
                </span>
                <span style={{ flex: 1 }}>
                  <span style={{ display: "block", fontFamily: "var(--font-display)", fontWeight: 500,
                    fontSize: 16, color: "var(--text-strong)" }}>{r.name}</span>
                  <span style={{ display: "block", fontFamily: "var(--font-mono)", fontSize: 11,
                    letterSpacing: "0.08em", color: "var(--text-muted)", marginTop: 2 }}>{r.meta}</span>
                </span>
                <Icon name="chevron" size={18} color="var(--text-muted)" />
              </button>
            ))}
          </div>

          <div style={{ marginTop: 18 }}>
            <Button variant="glow" full leadingIcon={<Icon name="nav" size={20} />} onClick={onFind}>
              Find routes
            </Button>
          </div>
        </Card>
      </div>
    </div>
  );
}
window.PlanScreen = PlanScreen;
