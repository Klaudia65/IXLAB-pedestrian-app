import React from "react";

/**
 * Wander · Badge
 * Compact pill label for statuses and route tags. Tone maps to brand hues.
 */
export function Badge({ children, tone = "neutral", solid = false, icon = null, style = {} }) {
  const tones = {
    neutral: { c: "var(--seaweed-500)", bg: "var(--seaweed-100)" },
    accent:  { c: "var(--cobalt-700)",  bg: "var(--cobalt-100)" },
    mint:    { c: "var(--seaweed-700)", bg: "var(--mint)" },
    lime:    { c: "var(--seaweed-900)", bg: "var(--lime)" },
    liliac:  { c: "var(--cobalt-700)",  bg: "var(--outing-solo-soft)" },
    orchid:  { c: "#FFFFFF",            bg: "var(--orchid)" },
  }[tone] || { c: "var(--seaweed-500)", bg: "var(--seaweed-100)" };

  const s = {
    display: "inline-flex",
    alignItems: "center",
    gap: "var(--space-1)",
    height: 26,
    padding: "0 12px",
    borderRadius: "var(--radius-pill)",
    fontFamily: "var(--font-mono)",
    fontSize: "var(--mono-label)",
    fontWeight: "var(--weight-bold)",
    letterSpacing: "var(--track-poi)",
    textTransform: "uppercase",
    color: solid ? "var(--ivory-pure)" : tones.c,
    background: solid ? tones.c : tones.bg,
    ...style,
  };
  return <span style={s}>{icon}{children}</span>;
}
