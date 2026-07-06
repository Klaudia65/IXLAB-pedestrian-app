import React from "react";

/**
 * Wander · RadarMist
 * A large, soft radial-mesh blur that sits behind the map grid as an
 * ambient "area of interest" field, color-coded by preference weight.
 * Pure decoration — render one or several, position absolutely.
 */
export function RadarMist({
  color = "var(--mint)",
  size = 360,
  intensity = 0.55,      // 0..1 peak opacity
  blur = "var(--blur-mist-lg)",
  breathe = true,
  style = {},
}) {
  const resolved =
    color.startsWith("var") || color.startsWith("#") || color.startsWith("rgb")
      ? color
      : `var(--${color})`;

  const box = {
    position: "absolute",
    width: size,
    height: size,
    borderRadius: "999px",
    pointerEvents: "none",
    background: `radial-gradient(closest-side, ${cssAlpha(resolved, intensity)}, ${cssAlpha(
      resolved,
      intensity * 0.45
    )} 45%, transparent 72%)`,
    filter: `blur(${blur})`,
    animation: breathe
      ? "wander-mist-breathe var(--dur-pulse) var(--ease-glow) infinite"
      : "none",
    ...style,
  };
  return <div aria-hidden="true" style={box} />;
}

function cssAlpha(color, a) {
  // color-mix keeps token references intact while applying transparency
  return `color-mix(in srgb, ${color} ${Math.round(a * 100)}%, transparent)`;
}
