// Wander Navigator — Live navigation screen
const { Button: NBtn, Card: NCard, Badge: NBadge, POIChip: NPOI } = window.WanderStructuredFluidityDS_140bd8;

function NavigateScreen({ outingColor, onStop }) {
  const route = { variant: "preference",
    points: [[12,96],[24,68],[50,58],[68,36],[88,18]], active: true };

  return (
    <div style={{ position: "absolute", inset: 0 }}>
      <MapCanvas outingColor={outingColor} routes={[route]}>
        {/* current position */}
        <div style={{ position: "absolute", left: "10%", bottom: "12%" }}>
          <div style={{ width: 22, height: 22, borderRadius: 999, background: "var(--cobalt)",
            boxShadow: "var(--glow-cobalt)", border: "3px solid var(--ivory-pure)" }} />
        </div>
        <div style={{ position: "absolute", left: 130, top: 340 }}>
          <NPOI label="Maple Café" meta="DESTINATION · 180 m" selected />
        </div>
        <div style={{ position: "absolute", right: 40, top: 250 }}><NPOI label="Riverside Park" /></div>
      </MapCanvas>

      {/* Top turn instruction */}
      <div style={{ position: "absolute", top: 62, left: 16, right: 16 }}>
        <NCard variant="glass" style={{ padding: 18, display: "flex", alignItems: "center", gap: 16 }}>
          <div style={{ width: 56, height: 56, borderRadius: 999, flexShrink: 0, background: "var(--cobalt)",
            color: "var(--ivory-pure)", display: "flex", alignItems: "center", justifyContent: "center",
            boxShadow: "var(--glow-cobalt)" }}>
            <Icon name="nav" size={26} style={{ transform: "rotate(-30deg)" }} />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 30,
              color: "var(--text-strong)", lineHeight: 1 }}>120 m</div>
            <div style={{ fontFamily: "var(--font-ui)", fontSize: 15, color: "var(--text-body)",
              marginTop: 4 }}>Turn left onto <b style={{ color: "var(--text-strong)" }}>Linden Walk</b></div>
          </div>
        </NCard>
      </div>

      {/* Bottom trip bar */}
      <div style={{ position: "absolute", left: 16, right: 16, bottom: 26 }}>
        <NCard variant="glass" style={{ padding: "16px 18px", display: "flex", alignItems: "center", gap: 14 }}>
          <div>
            <div style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 26,
              color: "var(--text-strong)", lineHeight: 1 }}>14 min</div>
            <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
              <NBadge tone="mint">0.9 km</NBadge>
              <NBadge tone="lime">Quiet</NBadge>
            </div>
          </div>
          <div style={{ marginLeft: "auto" }}>
            <NBtn variant="outline" size="sm" onClick={onStop}
              leadingIcon={<Icon name="close" size={18} />}>End</NBtn>
          </div>
        </NCard>
      </div>
    </div>
  );
}
window.NavigateScreen = NavigateScreen;
