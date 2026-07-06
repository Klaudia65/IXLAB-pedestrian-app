// Wander Navigator — shared map canvas (grid + radar mist + routes)
const { RadarMist, MapRoute } = window.WanderStructuredFluidityDS_140bd8;

function MapCanvas({ outingColor, routes = [], children, dim = false }) {
  return (
    <div style={{ position: "absolute", inset: 0, overflow: "hidden",
      background:
        "linear-gradient(rgba(37,90,75,0.06) 1px, transparent 1px) 0 0 / 34px 34px," +
        "linear-gradient(90deg, rgba(37,90,75,0.06) 1px, transparent 1px) 0 0 / 34px 34px," +
        "var(--bg-canvas)" }}>

      {/* Ambient radar mist — areas of interest weighted to preferences */}
      <RadarMist color="mint"   size={300} intensity={0.5}  style={{ top: -60, left: -50 }} />
      <RadarMist color="lime"   size={220} intensity={0.45} style={{ top: 180, right: -50 }} />
      <RadarMist color={outingColor} size={200} intensity={0.3} style={{ bottom: 120, left: -40 }} />
      <RadarMist color="orchid" size={150} intensity={0.35} style={{ top: 380, left: 120 }} />

      {/* faux block shapes for city texture */}
      <Blocks />

      {routes.map((r, i) => (
        <MapRoute key={i} variant={r.variant} points={r.points} active={r.active} dashed={r.dashed} />
      ))}

      {dim && <div style={{ position: "absolute", inset: 0, background: "rgba(254,255,227,0.35)" }} />}
      {children}
    </div>
  );
}

function Blocks() {
  const rects = [
    [12, 30, 22, 16], [42, 22, 18, 14], [66, 40, 24, 18],
    [18, 60, 20, 22], [58, 70, 26, 16], [30, 84, 22, 12],
  ];
  return (
    <svg viewBox="0 0 100 130" preserveAspectRatio="none"
      style={{ position: "absolute", inset: 0, width: "100%", height: "100%", opacity: 0.5 }} aria-hidden="true">
      {rects.map((r, i) => (
        <rect key={i} x={r[0]} y={r[1]} width={r[2]} height={r[3]} rx="2.5"
          fill="rgba(37,90,75,0.045)" stroke="rgba(37,90,75,0.08)" strokeWidth="0.3" />
      ))}
    </svg>
  );
}

window.MapCanvas = MapCanvas;
