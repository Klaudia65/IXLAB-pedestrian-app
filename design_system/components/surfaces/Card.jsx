import React from "react";

/**
 * Wander · Card
 * Soft ivory surface container. "glass" floats over the map with a frosted
 * blur; "sheet" is the bottom drawer with a large top radius.
 */
export function Card({ children, variant = "raised", style = {} }) {
  const variants = {
    raised: {
      background: "var(--surface-card)",
      borderRadius: "var(--radius-md)",
      boxShadow: "var(--shadow-card)",
      border: "1px solid var(--border-hairline)",
    },
    glass: {
      background: "var(--surface-overlay)",
      backdropFilter: "blur(var(--blur-glass))",
      WebkitBackdropFilter: "blur(var(--blur-glass))",
      borderRadius: "var(--radius-lg)",
      boxShadow: "var(--shadow-raised)",
      border: "1px solid rgba(255,255,255,0.5)",
    },
    sheet: {
      background: "var(--surface-card)",
      borderRadius: "var(--radius-lg) var(--radius-lg) 0 0",
      boxShadow: "var(--shadow-sheet)",
    },
    flat: {
      background: "var(--surface-raised)",
      borderRadius: "var(--radius-md)",
      border: "1px solid var(--border-hairline)",
    },
  }[variant];

  return <div style={{ padding: "var(--space-5)", ...variants, ...style }}>{children}</div>;
}
