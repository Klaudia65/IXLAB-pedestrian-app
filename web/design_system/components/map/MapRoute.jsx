import React from "react";

/**
 * Wander · MapRoute
 * An SVG route stroke drawn with fully-rounded (pill) caps and joins.
 * - "primary"    : bold Mint, soft glow (the recommended safe path)
 * - "preference" : bold Lime, stronger glow (matches user preferences)
 * - "alternate"  : thin, semi-transparent Liliac
 * Set `active` to intensify the glow (e.g. while crossing a Radar Mist zone).
 *
 * Points are [x, y] pairs in the SVG viewBox space (default 0..100).
 */
export function MapRoute({
  points = [],
  variant = "primary",
  active = false,
  viewBox = "0 0 100 100",
  dashed = false,
  style = {},
}) {
  const spec = {
    primary:    { stroke: "var(--mint)",   width: "var(--path-w-primary)",   glow: "var(--glow-mint)",   opacity: 1 },
    preference: { stroke: "var(--lime)",   width: "var(--path-w-primary)",   glow: "var(--glow-lime)",   opacity: 1 },
    alternate:  { stroke: "var(--liliac)", width: "var(--path-w-alternate)", glow: "none",               opacity: 0.55 },
  }[variant];

  const d = points
    .map((p, i) => `${i === 0 ? "M" : "L"} ${p[0]} ${p[1]}`)
    .join(" ");

  const filter =
    spec.glow === "none"
      ? "none"
      : active
      ? "drop-shadow(0 0 4px rgba(201,255,70,0.9))"
      : undefined;

  const svg = {
    position: "absolute",
    inset: 0,
    width: "100%",
    height: "100%",
    overflow: "visible",
    pointerEvents: "none",
    ...style,
  };

  return (
    <svg viewBox={viewBox} preserveAspectRatio="none" style={svg} aria-hidden="true">
      <path
        d={d}
        fill="none"
        stroke={spec.stroke}
        strokeWidth={spec.width}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeDasharray={dashed ? "0.1 6" : undefined}
        opacity={spec.opacity}
        style={{
          filter,
          boxShadow: !active ? spec.glow : undefined,
          animation: active && variant !== "alternate"
            ? "wander-path-pulse var(--dur-pulse) var(--ease-glow) infinite"
            : "none",
          transition: "all var(--dur-base) var(--ease-glow)",
        }}
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}
