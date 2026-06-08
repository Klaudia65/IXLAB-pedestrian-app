import React from "react";

/**
 * Wander · OutingToggle
 * Segmented pill control for choosing the outing personality — Solo,
 * Couple or Friends. The selected segment fills with that outing's accent
 * and casts a soft matching glow. Drives the app's accent theme.
 */
const OUTINGS = [
  { id: "solo",    label: "Solo",    color: "var(--outing-solo)" },
  { id: "couple",  label: "Couple",  color: "var(--outing-couple)" },
  { id: "friends", label: "Friends", color: "var(--outing-friends)" },
];

export function OutingToggle({ value = "solo", onChange = () => {}, options = OUTINGS, style = {} }) {
  const track = {
    display: "inline-flex",
    padding: "5px",
    gap: "4px",
    borderRadius: "var(--radius-pill)",
    background: "var(--surface-card)",
    boxShadow: "inset 0 0 0 1px var(--border-hairline)",
    ...style,
  };

  return (
    <div style={track} role="tablist">
      {options.map((o) => {
        const active = o.id === value;
        const seg = {
          display: "inline-flex",
          alignItems: "center",
          gap: "var(--space-2)",
          height: "44px",
          padding: "0 22px",
          borderRadius: "var(--radius-pill)",
          border: "none",
          cursor: "pointer",
          fontFamily: "var(--font-ui)",
          fontSize: "var(--text-base)",
          fontWeight: "var(--weight-medium)",
          color: active ? "var(--text-on-accent)" : "var(--text-body)",
          background: active ? o.color : "transparent",
          boxShadow: active ? `0 0 20px ${"color-mix(in srgb, " + o.color + " 55%, transparent)"}` : "none",
          transition: "background var(--dur-base) var(--ease-fluid), color var(--dur-base) var(--ease-fluid), box-shadow var(--dur-base) var(--ease-glow)",
          WebkitTapHighlightColor: "transparent",
        };
        return (
          <button key={o.id} role="tab" aria-selected={active} style={seg} onClick={() => onChange(o.id)}>
            <span
              style={{
                width: 9,
                height: 9,
                borderRadius: 999,
                background: active ? "var(--text-on-accent)" : o.color,
                opacity: active ? 0.9 : 1,
              }}
            />
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
