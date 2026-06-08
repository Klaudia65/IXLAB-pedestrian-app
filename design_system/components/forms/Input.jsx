import React from "react";

/**
 * Wander · Input
 * 56px pill field. Resting state shows a hairline stroke; on focus the
 * outline animates to a solid 2px Cobalt ring.
 */
export function Input({
  value,
  onChange,
  placeholder = "",
  leadingIcon = null,
  trailingIcon = null,
  size = "md",
  disabled = false,
  full = true,
  style = {},
  ...rest
}) {
  const [focused, setFocused] = React.useState(false);
  const h = size === "sm" ? "var(--control-h-sm)" : "var(--control-h)";

  const wrap = {
    display: "inline-flex",
    alignItems: "center",
    gap: "var(--space-2)",
    height: h,
    width: full ? "100%" : "auto",
    padding: "0 var(--control-pad-x)",
    borderRadius: "var(--radius-pill)",
    background: "var(--surface-card)",
    border: focused ? "2px solid var(--cobalt)" : "2px solid transparent",
    boxShadow: focused ? "var(--glow-cobalt)" : "inset 0 0 0 1px var(--border-hairline)",
    transition:
      "border-color var(--dur-base) var(--ease-crisp), box-shadow var(--dur-base) var(--ease-glow)",
    opacity: disabled ? 0.5 : 1,
    ...style,
  };

  const field = {
    flex: 1,
    minWidth: 0,
    border: "none",
    outline: "none",
    background: "transparent",
    fontFamily: "var(--font-ui)",
    fontSize: "var(--text-base)",
    color: "var(--text-strong)",
  };

  return (
    <div style={wrap}>
      {leadingIcon && <span style={{ display: "flex", color: "var(--text-muted)" }}>{leadingIcon}</span>}
      <input
        style={field}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        disabled={disabled}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        {...rest}
      />
      {trailingIcon && <span style={{ display: "flex", color: "var(--text-muted)" }}>{trailingIcon}</span>}
    </div>
  );
}
