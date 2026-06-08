// Wander Navigator — Routes comparison screen
const { Button: RBtn, Card: RCard, Badge: RBadge, POIChip } = window.WanderStructuredFluidityDS_140bd8;

function RoutesScreen({ outingColor, onBack, onStart }) {
  const [picked, setPicked] = React.useState("calm");

  const routes = {
    calm: { variant: "preference", points: [[12,92],[26,62],[52,54],[72,30],[90,16]], active: true },
    direct: { variant: "alternate", points: [[12,92],[44,80],[78,34],[90,16]] },
  };

  const options = [
    { id: "calm", title: "Calm & green", time: "16 min", dist: "1.1 km",
      tags: [["mint","Quiet route"],["lime","Preference match"]] },
    { id: "direct", title: "Most direct", time: "12 min", dist: "0.9 km",
      tags: [["liliac","Busier"],["neutral","Step-free"]] },
  ];

  return (
    <div style={{ position: "absolute", inset: 0 }}>
      <MapCanvas outingColor={outingColor}
        routes={[routes.direct, picked === "calm" ? routes.calm : { ...routes.calm, active: false }]}>
        <div style={{ position: "absolute", left: 22, bottom: 250 }}><POIChip label="Start · You" /></div>
        <div style={{ position: "absolute", left: 150, top: 300 }}>
          <POIChip label="Maple Café" meta="180 m · on route" selected />
        </div>
        <div style={{ position: "absolute", right: 26, top: 150 }}><POIChip label="Riverside Park" /></div>
        <div style={{ position: "absolute", right: 70, top: 250 }}><POIChip label="Late Pharmacy" alert /></div>
      </MapCanvas>

      {/* Back control */}
      <button onClick={onBack} style={{ position: "absolute", top: 66, left: 16, width: 48, height: 48,
        borderRadius: 999, border: "none", background: "var(--surface-overlay)", backdropFilter: "blur(14px)",
        boxShadow: "var(--shadow-card)", cursor: "pointer", display: "flex", alignItems: "center",
        justifyContent: "center" }}>
        <Icon name="chevron" size={22} style={{ transform: "scaleX(-1)" }} color="var(--text-strong)" />
      </button>

      {/* Bottom sheet — route options */}
      <div style={{ position: "absolute", left: 0, right: 0, bottom: 0 }}>
        <RCard variant="sheet" style={{ padding: "20px 18px 30px" }}>
          <div style={{ width: 44, height: 5, borderRadius: 999, background: "var(--border-muted)",
            margin: "0 auto 16px" }} />
          <div style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 22,
            color: "var(--text-strong)", margin: "0 4px 14px" }}>2 routes to Maple Café</div>

          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {options.map((o) => {
              const on = picked === o.id;
              return (
                <button key={o.id} onClick={() => setPicked(o.id)} style={{
                  display: "block", width: "100%", textAlign: "left", cursor: "pointer",
                  padding: "16px 16px", borderRadius: "var(--radius-md)", background: "var(--surface-card)",
                  border: on ? "2px solid var(--cobalt)" : "2px solid var(--border-hairline)",
                  boxShadow: on ? "var(--glow-cobalt)" : "none",
                  transition: "border-color .24s, box-shadow .24s" }}>
                  <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
                    <span style={{ fontFamily: "var(--font-display)", fontWeight: 600, fontSize: 17,
                      color: "var(--text-strong)" }}>{o.title}</span>
                    <span style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 20,
                      color: on ? "var(--cobalt-600)" : "var(--text-strong)" }}>{o.time}</span>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
                    {o.tags.map((t, i) => <RBadge key={i} tone={t[0]}>{t[1]}</RBadge>)}
                    <span style={{ marginLeft: "auto", fontFamily: "var(--font-mono)", fontSize: 11,
                      letterSpacing: "0.08em", color: "var(--text-muted)" }}>{o.dist}</span>
                  </div>
                </button>
              );
            })}
          </div>

          <div style={{ marginTop: 18 }}>
            <RBtn variant="glow" full leadingIcon={<Icon name="walk" size={20} />} onClick={onStart}>
              Start navigation
            </RBtn>
          </div>
        </RCard>
      </div>
    </div>
  );
}
window.RoutesScreen = RoutesScreen;
