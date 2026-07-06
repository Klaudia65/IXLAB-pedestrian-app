import React from "react";

/**
 * Wander · Button
 * Pill-shaped control, 56px standard height. Outline variant animates
 * its stroke to solid Cobalt on hover/active — the "crisp geometric"
 * half of Structured Fluidity.
 */
export function Button({
  children,
  variant = "primary",   // primary | outline | ghost | glow
  size = "md",           // md (56) | sm (44)
  leadingIcon = null,
  trailingIcon = null,
  disabled = false,
  full = false,
  style = {},
  ...rest
}) {
  const h = size === "sm" ? "var(--control-h-sm)" : "var(--control-h)";

  const palette = {
    primary: {
      background: "var(--accent)",
      color: "var(--text-on-accent)",
      border: "2px solid var(--accent)",
    },
    outline: {
      background: "transparent",
      color: "var(--accent)",
      border: "2px solid var(--cobalt-200)",
    },
    ghost: {
      background: "transparent",
      color: "var(--text-strong)",
      border: "2px solid transparent",
    },
    glow: {
      background: "var(--accent)",
      color: "var(--text-on-accent)",
      border: "2px solid var(--accent)",
      boxShadow: "var(--glow-cobalt)",
    },
  }[variant];

  const base = {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: "var(--space-2)",
    height: h,
    minWidth: h,
    padding: `0 var(--control-pad-x)`,
    borderRadius: "var(--radius-pill)",
    fontFamily: "var(--font-ui)",
    fontSize: "var(--text-base)",
    fontWeight: "var(--weight-medium)",
    letterSpacing: "0.01em",
    cursor: disabled ? "not-allowed" : "pointer",
    opacity: disabled ? 0.45 : 1,
    width: full ? "100%" : "auto",
    transition:
      "background var(--dur-base) var(--ease-crisp), border-color var(--dur-base) var(--ease-crisp), transform var(--dur-fast) var(--ease-crisp), box-shadow var(--dur-base) var(--ease-glow)",
    WebkitTapHighlightColor: "transparent",
    ...palette,
    ...style,
  };

  const onEnter = (e) => {
    if (disabled) return;
    if (variant === "outline") {
      e.currentTarget.style.background = "var(--accent)";
      e.currentTarget.style.color = "var(--text-on-accent)";
      e.currentTarget.style.borderColor = "var(--accent)";
    } else if (variant === "ghost") {
      e.currentTarget.style.background = "var(--accent-soft)";
    } else {
      e.currentTarget.style.background = "var(--accent-hover)";
      e.currentTarget.style.borderColor = "var(--accent-hover)";
    }
  };
  const onLeave = (e) => {
    if (disabled) return;
    e.currentTarget.style.background = palette.background;
    e.currentTarget.style.color = palette.color;
    e.currentTarget.style.borderColor = (palette.border || "").split(" ").pop();
  };
  const onDown = (e) => {
    if (disabled) return;
    e.currentTarget.style.transform = "scale(0.97)";
  };
  const onUp = (e) => {
    if (disabled) return;
    e.currentTarget.style.transform = "scale(1)";
  };

  return (
    <button
      type="button"
      disabled={disabled}
      style={base}
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
      onMouseDown={onDown}
      onMouseUp={onUp}
      {...rest}
    >
      {leadingIcon}
      {children}
      {trailingIcon}
    </button>
  );
}
