import React from "react";

/**
 * Wander · POIChip
 * A location point on the map: uppercase monospace label centered inside a
 * soft capsule. When selected it expands into a distinct outlined box
 * (square-ish radius + Cobalt stroke). Use `alert` for specialized/Orchid POIs.
 */
export function POIChip({
  label,
  meta = null,            // optional secondary line (distance, side…)
  selected = false,
  alert = false,
  icon = null,
  onClick = () => {},
  style = {},
}) {
  const accent = alert ? "var(--orchid)" : "var(--cobalt)";

  const box = {
    display: "inline-flex",
    flexDirection: meta && selected ? "column" : "row",
    alignItems: meta && selected ? "flex-start" : "center",
    gap: selected ? "2px" : "var(--space-2)",
    padding: selected ? "10px 16px" : "8px 14px",
    borderRadius: selected ? "var(--radius-sm)" : "var(--radius-pill)",
    background: selected ? "var(--surface-card)" : "var(--surface-glass)",
    backdropFilter: "blur(var(--blur-soft))",
    WebkitBackdropFilter: "blur(var(--blur-soft))",
    border: selected ? `2px solid ${accent}` : "1px solid var(--border-hairline)",
    boxShadow: selected
      ? alert
        ? "var(--glow-orchid)"
        : "var(--glow-cobalt)"
      : "var(--shadow-card)",
    cursor: "pointer",
    transition:
      "border-radius var(--dur-base) var(--ease-fluid), padding var(--dur-base) var(--ease-fluid), box-shadow var(--dur-base) var(--ease-glow), background var(--dur-base) var(--ease-fluid)",
    ...style,
  };

  const labelStyle = {
    fontFamily: "var(--font-mono)",
    fontSize: "var(--mono-poi)",
    fontWeight: "var(--weight-bold)",
    letterSpacing: "var(--track-poi)",
    textTransform: "uppercase",
    color: selected ? accent : "var(--text-strong)",
    whiteSpace: "nowrap",
    display: "inline-flex",
    alignItems: "center",
    gap: "var(--space-2)",
  };

  return (
    <button style={box} onClick={onClick} aria-pressed={selected}>
      <span style={labelStyle}>
        {icon}
        {alert && !icon && (
          <span style={{ width: 7, height: 7, borderRadius: 999, background: "var(--orchid)" }} />
        )}
        {label}
      </span>
      {meta && selected && (
        <span
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: "var(--mono-label)",
            letterSpacing: "var(--track-label)",
            textTransform: "uppercase",
            color: "var(--text-muted)",
          }}
        >
          {meta}
        </span>
      )}
    </button>
  );
}
