/* @ds-bundle: {"format":3,"namespace":"WanderStructuredFluidityDS_140bd8","components":[{"name":"Button","sourcePath":"components/forms/Button.jsx"},{"name":"Input","sourcePath":"components/forms/Input.jsx"},{"name":"OutingToggle","sourcePath":"components/forms/OutingToggle.jsx"},{"name":"MapRoute","sourcePath":"components/map/MapRoute.jsx"},{"name":"POIChip","sourcePath":"components/map/POIChip.jsx"},{"name":"RadarMist","sourcePath":"components/map/RadarMist.jsx"},{"name":"Badge","sourcePath":"components/surfaces/Badge.jsx"},{"name":"Card","sourcePath":"components/surfaces/Card.jsx"}],"sourceHashes":{"components/forms/Button.jsx":"5d12121180f5","components/forms/Input.jsx":"5225e456a446","components/forms/OutingToggle.jsx":"65c361965b06","components/map/MapRoute.jsx":"17a35955c320","components/map/POIChip.jsx":"c767a1384e9f","components/map/RadarMist.jsx":"209ae852d812","components/surfaces/Badge.jsx":"56ee7b987b54","components/surfaces/Card.jsx":"b5dd1f7ac7c3","ui_kits/wander-navigator/Icons.jsx":"83af7a21b7ba","ui_kits/wander-navigator/MapCanvas.jsx":"6368df1c0282","ui_kits/wander-navigator/NavigateScreen.jsx":"c926c8dca801","ui_kits/wander-navigator/PhoneShell.jsx":"e8773056d1d1","ui_kits/wander-navigator/PlanScreen.jsx":"524e2fa76f3c","ui_kits/wander-navigator/RoutesScreen.jsx":"b05aaf7665cc"},"inlinedExternals":[],"unexposedExports":[]} */

(() => {

const __ds_ns = (window.WanderStructuredFluidityDS_140bd8 = window.WanderStructuredFluidityDS_140bd8 || {});

const __ds_scope = {};

(__ds_ns.__errors = __ds_ns.__errors || []);

// components/forms/Button.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/**
 * Wander · Button
 * Pill-shaped control, 56px standard height. Outline variant animates
 * its stroke to solid Cobalt on hover/active — the "crisp geometric"
 * half of Structured Fluidity.
 */
function Button({
  children,
  variant = "primary",
  // primary | outline | ghost | glow
  size = "md",
  // md (56) | sm (44)
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
      border: "2px solid var(--accent)"
    },
    outline: {
      background: "transparent",
      color: "var(--accent)",
      border: "2px solid var(--cobalt-200)"
    },
    ghost: {
      background: "transparent",
      color: "var(--text-strong)",
      border: "2px solid transparent"
    },
    glow: {
      background: "var(--accent)",
      color: "var(--text-on-accent)",
      border: "2px solid var(--accent)",
      boxShadow: "var(--glow-cobalt)"
    }
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
    transition: "background var(--dur-base) var(--ease-crisp), border-color var(--dur-base) var(--ease-crisp), transform var(--dur-fast) var(--ease-crisp), box-shadow var(--dur-base) var(--ease-glow)",
    WebkitTapHighlightColor: "transparent",
    ...palette,
    ...style
  };
  const onEnter = e => {
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
  const onLeave = e => {
    if (disabled) return;
    e.currentTarget.style.background = palette.background;
    e.currentTarget.style.color = palette.color;
    e.currentTarget.style.borderColor = (palette.border || "").split(" ").pop();
  };
  const onDown = e => {
    if (disabled) return;
    e.currentTarget.style.transform = "scale(0.97)";
  };
  const onUp = e => {
    if (disabled) return;
    e.currentTarget.style.transform = "scale(1)";
  };
  return /*#__PURE__*/React.createElement("button", _extends({
    type: "button",
    disabled: disabled,
    style: base,
    onMouseEnter: onEnter,
    onMouseLeave: onLeave,
    onMouseDown: onDown,
    onMouseUp: onUp
  }, rest), leadingIcon, children, trailingIcon);
}
Object.assign(__ds_scope, { Button });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/forms/Button.jsx", error: String((e && e.message) || e) }); }

// components/forms/Input.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/**
 * Wander · Input
 * 56px pill field. Resting state shows a hairline stroke; on focus the
 * outline animates to a solid 2px Cobalt ring.
 */
function Input({
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
    transition: "border-color var(--dur-base) var(--ease-crisp), box-shadow var(--dur-base) var(--ease-glow)",
    opacity: disabled ? 0.5 : 1,
    ...style
  };
  const field = {
    flex: 1,
    minWidth: 0,
    border: "none",
    outline: "none",
    background: "transparent",
    fontFamily: "var(--font-ui)",
    fontSize: "var(--text-base)",
    color: "var(--text-strong)"
  };
  return /*#__PURE__*/React.createElement("div", {
    style: wrap
  }, leadingIcon && /*#__PURE__*/React.createElement("span", {
    style: {
      display: "flex",
      color: "var(--text-muted)"
    }
  }, leadingIcon), /*#__PURE__*/React.createElement("input", _extends({
    style: field,
    value: value,
    onChange: onChange,
    placeholder: placeholder,
    disabled: disabled,
    onFocus: () => setFocused(true),
    onBlur: () => setFocused(false)
  }, rest)), trailingIcon && /*#__PURE__*/React.createElement("span", {
    style: {
      display: "flex",
      color: "var(--text-muted)"
    }
  }, trailingIcon));
}
Object.assign(__ds_scope, { Input });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/forms/Input.jsx", error: String((e && e.message) || e) }); }

// components/forms/OutingToggle.jsx
try { (() => {
/**
 * Wander · OutingToggle
 * Segmented pill control for choosing the outing personality — Solo,
 * Couple or Friends. The selected segment fills with that outing's accent
 * and casts a soft matching glow. Drives the app's accent theme.
 */
const OUTINGS = [{
  id: "solo",
  label: "Solo",
  color: "var(--outing-solo)"
}, {
  id: "couple",
  label: "Couple",
  color: "var(--outing-couple)"
}, {
  id: "friends",
  label: "Friends",
  color: "var(--outing-friends)"
}];
function OutingToggle({
  value = "solo",
  onChange = () => {},
  options = OUTINGS,
  style = {}
}) {
  const track = {
    display: "inline-flex",
    padding: "5px",
    gap: "4px",
    borderRadius: "var(--radius-pill)",
    background: "var(--surface-card)",
    boxShadow: "inset 0 0 0 1px var(--border-hairline)",
    ...style
  };
  return /*#__PURE__*/React.createElement("div", {
    style: track,
    role: "tablist"
  }, options.map(o => {
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
      WebkitTapHighlightColor: "transparent"
    };
    return /*#__PURE__*/React.createElement("button", {
      key: o.id,
      role: "tab",
      "aria-selected": active,
      style: seg,
      onClick: () => onChange(o.id)
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        width: 9,
        height: 9,
        borderRadius: 999,
        background: active ? "var(--text-on-accent)" : o.color,
        opacity: active ? 0.9 : 1
      }
    }), o.label);
  }));
}
Object.assign(__ds_scope, { OutingToggle });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/forms/OutingToggle.jsx", error: String((e && e.message) || e) }); }

// components/map/MapRoute.jsx
try { (() => {
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
function MapRoute({
  points = [],
  variant = "primary",
  active = false,
  viewBox = "0 0 100 100",
  dashed = false,
  style = {}
}) {
  const spec = {
    primary: {
      stroke: "var(--mint)",
      width: "var(--path-w-primary)",
      glow: "var(--glow-mint)",
      opacity: 1
    },
    preference: {
      stroke: "var(--lime)",
      width: "var(--path-w-primary)",
      glow: "var(--glow-lime)",
      opacity: 1
    },
    alternate: {
      stroke: "var(--liliac)",
      width: "var(--path-w-alternate)",
      glow: "none",
      opacity: 0.55
    }
  }[variant];
  const d = points.map((p, i) => `${i === 0 ? "M" : "L"} ${p[0]} ${p[1]}`).join(" ");
  const filter = spec.glow === "none" ? "none" : active ? "drop-shadow(0 0 4px rgba(201,255,70,0.9))" : undefined;
  const svg = {
    position: "absolute",
    inset: 0,
    width: "100%",
    height: "100%",
    overflow: "visible",
    pointerEvents: "none",
    ...style
  };
  return /*#__PURE__*/React.createElement("svg", {
    viewBox: viewBox,
    preserveAspectRatio: "none",
    style: svg,
    "aria-hidden": "true"
  }, /*#__PURE__*/React.createElement("path", {
    d: d,
    fill: "none",
    stroke: spec.stroke,
    strokeWidth: spec.width,
    strokeLinecap: "round",
    strokeLinejoin: "round",
    strokeDasharray: dashed ? "0.1 6" : undefined,
    opacity: spec.opacity,
    style: {
      filter,
      boxShadow: !active ? spec.glow : undefined,
      animation: active && variant !== "alternate" ? "wander-path-pulse var(--dur-pulse) var(--ease-glow) infinite" : "none",
      transition: "all var(--dur-base) var(--ease-glow)"
    },
    vectorEffect: "non-scaling-stroke"
  }));
}
Object.assign(__ds_scope, { MapRoute });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/map/MapRoute.jsx", error: String((e && e.message) || e) }); }

// components/map/POIChip.jsx
try { (() => {
/**
 * Wander · POIChip
 * A location point on the map: uppercase monospace label centered inside a
 * soft capsule. When selected it expands into a distinct outlined box
 * (square-ish radius + Cobalt stroke). Use `alert` for specialized/Orchid POIs.
 */
function POIChip({
  label,
  meta = null,
  // optional secondary line (distance, side…)
  selected = false,
  alert = false,
  icon = null,
  onClick = () => {},
  style = {}
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
    boxShadow: selected ? alert ? "var(--glow-orchid)" : "var(--glow-cobalt)" : "var(--shadow-card)",
    cursor: "pointer",
    transition: "border-radius var(--dur-base) var(--ease-fluid), padding var(--dur-base) var(--ease-fluid), box-shadow var(--dur-base) var(--ease-glow), background var(--dur-base) var(--ease-fluid)",
    ...style
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
    gap: "var(--space-2)"
  };
  return /*#__PURE__*/React.createElement("button", {
    style: box,
    onClick: onClick,
    "aria-pressed": selected
  }, /*#__PURE__*/React.createElement("span", {
    style: labelStyle
  }, icon, alert && !icon && /*#__PURE__*/React.createElement("span", {
    style: {
      width: 7,
      height: 7,
      borderRadius: 999,
      background: "var(--orchid)"
    }
  }), label), meta && selected && /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: "var(--font-mono)",
      fontSize: "var(--mono-label)",
      letterSpacing: "var(--track-label)",
      textTransform: "uppercase",
      color: "var(--text-muted)"
    }
  }, meta));
}
Object.assign(__ds_scope, { POIChip });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/map/POIChip.jsx", error: String((e && e.message) || e) }); }

// components/map/RadarMist.jsx
try { (() => {
/**
 * Wander · RadarMist
 * A large, soft radial-mesh blur that sits behind the map grid as an
 * ambient "area of interest" field, color-coded by preference weight.
 * Pure decoration — render one or several, position absolutely.
 */
function RadarMist({
  color = "var(--mint)",
  size = 360,
  intensity = 0.55,
  // 0..1 peak opacity
  blur = "var(--blur-mist-lg)",
  breathe = true,
  style = {}
}) {
  const resolved = color.startsWith("var") || color.startsWith("#") || color.startsWith("rgb") ? color : `var(--${color})`;
  const box = {
    position: "absolute",
    width: size,
    height: size,
    borderRadius: "999px",
    pointerEvents: "none",
    background: `radial-gradient(closest-side, ${cssAlpha(resolved, intensity)}, ${cssAlpha(resolved, intensity * 0.45)} 45%, transparent 72%)`,
    filter: `blur(${blur})`,
    animation: breathe ? "wander-mist-breathe var(--dur-pulse) var(--ease-glow) infinite" : "none",
    ...style
  };
  return /*#__PURE__*/React.createElement("div", {
    "aria-hidden": "true",
    style: box
  });
}
function cssAlpha(color, a) {
  // color-mix keeps token references intact while applying transparency
  return `color-mix(in srgb, ${color} ${Math.round(a * 100)}%, transparent)`;
}
Object.assign(__ds_scope, { RadarMist });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/map/RadarMist.jsx", error: String((e && e.message) || e) }); }

// components/surfaces/Badge.jsx
try { (() => {
/**
 * Wander · Badge
 * Compact pill label for statuses and route tags. Tone maps to brand hues.
 */
function Badge({
  children,
  tone = "neutral",
  solid = false,
  icon = null,
  style = {}
}) {
  const tones = {
    neutral: {
      c: "var(--seaweed-500)",
      bg: "var(--seaweed-100)"
    },
    accent: {
      c: "var(--cobalt-700)",
      bg: "var(--cobalt-100)"
    },
    mint: {
      c: "var(--seaweed-700)",
      bg: "var(--mint)"
    },
    lime: {
      c: "var(--seaweed-900)",
      bg: "var(--lime)"
    },
    liliac: {
      c: "var(--cobalt-700)",
      bg: "var(--outing-solo-soft)"
    },
    orchid: {
      c: "#FFFFFF",
      bg: "var(--orchid)"
    }
  }[tone] || {
    c: "var(--seaweed-500)",
    bg: "var(--seaweed-100)"
  };
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
    ...style
  };
  return /*#__PURE__*/React.createElement("span", {
    style: s
  }, icon, children);
}
Object.assign(__ds_scope, { Badge });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/surfaces/Badge.jsx", error: String((e && e.message) || e) }); }

// components/surfaces/Card.jsx
try { (() => {
/**
 * Wander · Card
 * Soft ivory surface container. "glass" floats over the map with a frosted
 * blur; "sheet" is the bottom drawer with a large top radius.
 */
function Card({
  children,
  variant = "raised",
  style = {}
}) {
  const variants = {
    raised: {
      background: "var(--surface-card)",
      borderRadius: "var(--radius-md)",
      boxShadow: "var(--shadow-card)",
      border: "1px solid var(--border-hairline)"
    },
    glass: {
      background: "var(--surface-overlay)",
      backdropFilter: "blur(var(--blur-glass))",
      WebkitBackdropFilter: "blur(var(--blur-glass))",
      borderRadius: "var(--radius-lg)",
      boxShadow: "var(--shadow-raised)",
      border: "1px solid rgba(255,255,255,0.5)"
    },
    sheet: {
      background: "var(--surface-card)",
      borderRadius: "var(--radius-lg) var(--radius-lg) 0 0",
      boxShadow: "var(--shadow-sheet)"
    },
    flat: {
      background: "var(--surface-raised)",
      borderRadius: "var(--radius-md)",
      border: "1px solid var(--border-hairline)"
    }
  }[variant];
  return /*#__PURE__*/React.createElement("div", {
    style: {
      padding: "var(--space-5)",
      ...variants,
      ...style
    }
  }, children);
}
Object.assign(__ds_scope, { Card });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/surfaces/Card.jsx", error: String((e && e.message) || e) }); }

// ui_kits/wander-navigator/Icons.jsx
try { (() => {
// Wander — custom thin-stroke icon set (1.75px, round caps).
// Production note: substitute with Lucide for full coverage; these mirror its weight.
function Icon({
  name,
  size = 22,
  color = "currentColor",
  style = {}
}) {
  const p = {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: color,
    strokeWidth: 1.75,
    strokeLinecap: "round",
    strokeLinejoin: "round",
    style: {
      display: "block",
      ...style
    }
  };
  const paths = {
    search: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("circle", {
      cx: "11",
      cy: "11",
      r: "7"
    }), /*#__PURE__*/React.createElement("path", {
      d: "M20 20l-3.5-3.5"
    })),
    nav: /*#__PURE__*/React.createElement("path", {
      d: "M3 11l18-8-8 18-2-8-8-2z"
    }),
    walk: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("circle", {
      cx: "13",
      cy: "4.5",
      r: "1.6"
    }), /*#__PURE__*/React.createElement("path", {
      d: "M11 21l1.5-6-2.5-2 1-5 3 2 2.5 1.5M9 21l1.5-4"
    })),
    heart: /*#__PURE__*/React.createElement("path", {
      d: "M12 20s-7-4.6-7-9.4A3.6 3.6 0 0 1 12 8a3.6 3.6 0 0 1 7-1.4C19 11.4 12 20 12 20z"
    }),
    user: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("circle", {
      cx: "12",
      cy: "8",
      r: "3.4"
    }), /*#__PURE__*/React.createElement("path", {
      d: "M5.5 20a6.5 6.5 0 0 1 13 0"
    })),
    users: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("circle", {
      cx: "9",
      cy: "8",
      r: "3"
    }), /*#__PURE__*/React.createElement("path", {
      d: "M3 20a6 6 0 0 1 12 0M16 5.2a3 3 0 0 1 0 5.6M21 20a6 6 0 0 0-4-5.6"
    })),
    pin: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("path", {
      d: "M12 21s7-5.5 7-11a7 7 0 0 0-14 0c0 5.5 7 11 7 11z"
    }), /*#__PURE__*/React.createElement("circle", {
      cx: "12",
      cy: "10",
      r: "2.5"
    })),
    clock: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("circle", {
      cx: "12",
      cy: "12",
      r: "8.5"
    }), /*#__PURE__*/React.createElement("path", {
      d: "M12 7.5V12l3 2"
    })),
    chevron: /*#__PURE__*/React.createElement("path", {
      d: "M9 6l6 6-6 6"
    }),
    close: /*#__PURE__*/React.createElement("path", {
      d: "M6 6l12 12M18 6L6 18"
    }),
    layers: /*#__PURE__*/React.createElement("path", {
      d: "M12 4l8 4-8 4-8-4 8-4zM4 12l8 4 8-4M4 16l8 4 8-4"
    }),
    sun: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("circle", {
      cx: "12",
      cy: "12",
      r: "4"
    }), /*#__PURE__*/React.createElement("path", {
      d: "M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5L19 19M19 5l-1.5 1.5M6.5 17.5L5 19"
    })),
    leaf: /*#__PURE__*/React.createElement("path", {
      d: "M5 19c8 1 14-5 14-14-9 0-15 6-14 14zM5 19c2-5 5-8 10-10"
    }),
    bolt: /*#__PURE__*/React.createElement("path", {
      d: "M13 3L5 13h5l-1 8 8-10h-5l1-8z"
    }),
    bookmark: /*#__PURE__*/React.createElement("path", {
      d: "M6 4h12v17l-6-4-6 4V4z"
    }),
    plus: /*#__PURE__*/React.createElement("path", {
      d: "M12 5v14M5 12h14"
    }),
    coffee: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("path", {
      d: "M5 9h12v4a5 5 0 0 1-5 5H10a5 5 0 0 1-5-5V9z"
    }), /*#__PURE__*/React.createElement("path", {
      d: "M17 10h2a2 2 0 0 1 0 4h-2M8 3v2M11 3v2"
    }))
  };
  return /*#__PURE__*/React.createElement("svg", p, paths[name] || null);
}
window.Icon = Icon;
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/wander-navigator/Icons.jsx", error: String((e && e.message) || e) }); }

// ui_kits/wander-navigator/MapCanvas.jsx
try { (() => {
// Wander Navigator — shared map canvas (grid + radar mist + routes)
const {
  RadarMist,
  MapRoute
} = window.WanderStructuredFluidityDS_140bd8;
function MapCanvas({
  outingColor,
  routes = [],
  children,
  dim = false
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      position: "absolute",
      inset: 0,
      overflow: "hidden",
      background: "linear-gradient(rgba(37,90,75,0.06) 1px, transparent 1px) 0 0 / 34px 34px," + "linear-gradient(90deg, rgba(37,90,75,0.06) 1px, transparent 1px) 0 0 / 34px 34px," + "var(--bg-canvas)"
    }
  }, /*#__PURE__*/React.createElement(RadarMist, {
    color: "mint",
    size: 300,
    intensity: 0.5,
    style: {
      top: -60,
      left: -50
    }
  }), /*#__PURE__*/React.createElement(RadarMist, {
    color: "lime",
    size: 220,
    intensity: 0.45,
    style: {
      top: 180,
      right: -50
    }
  }), /*#__PURE__*/React.createElement(RadarMist, {
    color: outingColor,
    size: 200,
    intensity: 0.3,
    style: {
      bottom: 120,
      left: -40
    }
  }), /*#__PURE__*/React.createElement(RadarMist, {
    color: "orchid",
    size: 150,
    intensity: 0.35,
    style: {
      top: 380,
      left: 120
    }
  }), /*#__PURE__*/React.createElement(Blocks, null), routes.map((r, i) => /*#__PURE__*/React.createElement(MapRoute, {
    key: i,
    variant: r.variant,
    points: r.points,
    active: r.active,
    dashed: r.dashed
  })), dim && /*#__PURE__*/React.createElement("div", {
    style: {
      position: "absolute",
      inset: 0,
      background: "rgba(254,255,227,0.35)"
    }
  }), children);
}
function Blocks() {
  const rects = [[12, 30, 22, 16], [42, 22, 18, 14], [66, 40, 24, 18], [18, 60, 20, 22], [58, 70, 26, 16], [30, 84, 22, 12]];
  return /*#__PURE__*/React.createElement("svg", {
    viewBox: "0 0 100 130",
    preserveAspectRatio: "none",
    style: {
      position: "absolute",
      inset: 0,
      width: "100%",
      height: "100%",
      opacity: 0.5
    },
    "aria-hidden": "true"
  }, rects.map((r, i) => /*#__PURE__*/React.createElement("rect", {
    key: i,
    x: r[0],
    y: r[1],
    width: r[2],
    height: r[3],
    rx: "2.5",
    fill: "rgba(37,90,75,0.045)",
    stroke: "rgba(37,90,75,0.08)",
    strokeWidth: "0.3"
  })));
}
window.MapCanvas = MapCanvas;
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/wander-navigator/MapCanvas.jsx", error: String((e && e.message) || e) }); }

// ui_kits/wander-navigator/NavigateScreen.jsx
try { (() => {
// Wander Navigator — Live navigation screen
const {
  Button: NBtn,
  Card: NCard,
  Badge: NBadge,
  POIChip: NPOI
} = window.WanderStructuredFluidityDS_140bd8;
function NavigateScreen({
  outingColor,
  onStop
}) {
  const route = {
    variant: "preference",
    points: [[12, 96], [24, 68], [50, 58], [68, 36], [88, 18]],
    active: true
  };
  return /*#__PURE__*/React.createElement("div", {
    style: {
      position: "absolute",
      inset: 0
    }
  }, /*#__PURE__*/React.createElement(MapCanvas, {
    outingColor: outingColor,
    routes: [route]
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      position: "absolute",
      left: "10%",
      bottom: "12%"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: 22,
      height: 22,
      borderRadius: 999,
      background: "var(--cobalt)",
      boxShadow: "var(--glow-cobalt)",
      border: "3px solid var(--ivory-pure)"
    }
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      position: "absolute",
      left: 130,
      top: 340
    }
  }, /*#__PURE__*/React.createElement(NPOI, {
    label: "Maple Caf\xE9",
    meta: "DESTINATION \xB7 180 m",
    selected: true
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      position: "absolute",
      right: 40,
      top: 250
    }
  }, /*#__PURE__*/React.createElement(NPOI, {
    label: "Riverside Park"
  }))), /*#__PURE__*/React.createElement("div", {
    style: {
      position: "absolute",
      top: 62,
      left: 16,
      right: 16
    }
  }, /*#__PURE__*/React.createElement(NCard, {
    variant: "glass",
    style: {
      padding: 18,
      display: "flex",
      alignItems: "center",
      gap: 16
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: 56,
      height: 56,
      borderRadius: 999,
      flexShrink: 0,
      background: "var(--cobalt)",
      color: "var(--ivory-pure)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      boxShadow: "var(--glow-cobalt)"
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "nav",
    size: 26,
    style: {
      transform: "rotate(-30deg)"
    }
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: "var(--font-display)",
      fontWeight: 700,
      fontSize: 30,
      color: "var(--text-strong)",
      lineHeight: 1
    }
  }, "120 m"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: "var(--font-ui)",
      fontSize: 15,
      color: "var(--text-body)",
      marginTop: 4
    }
  }, "Turn left onto ", /*#__PURE__*/React.createElement("b", {
    style: {
      color: "var(--text-strong)"
    }
  }, "Linden Walk"))))), /*#__PURE__*/React.createElement("div", {
    style: {
      position: "absolute",
      left: 16,
      right: 16,
      bottom: 26
    }
  }, /*#__PURE__*/React.createElement(NCard, {
    variant: "glass",
    style: {
      padding: "16px 18px",
      display: "flex",
      alignItems: "center",
      gap: 14
    }
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: "var(--font-display)",
      fontWeight: 700,
      fontSize: 26,
      color: "var(--text-strong)",
      lineHeight: 1
    }
  }, "14 min"), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: 6,
      marginTop: 8
    }
  }, /*#__PURE__*/React.createElement(NBadge, {
    tone: "mint"
  }, "0.9 km"), /*#__PURE__*/React.createElement(NBadge, {
    tone: "lime"
  }, "Quiet"))), /*#__PURE__*/React.createElement("div", {
    style: {
      marginLeft: "auto"
    }
  }, /*#__PURE__*/React.createElement(NBtn, {
    variant: "outline",
    size: "sm",
    onClick: onStop,
    leadingIcon: /*#__PURE__*/React.createElement(Icon, {
      name: "close",
      size: 18
    })
  }, "End")))));
}
window.NavigateScreen = NavigateScreen;
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/wander-navigator/NavigateScreen.jsx", error: String((e && e.message) || e) }); }

// ui_kits/wander-navigator/PhoneShell.jsx
try { (() => {
// Wander Navigator — phone shell + status bar
function PhoneShell({
  children
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      width: 390,
      height: 844,
      borderRadius: 54,
      position: "relative",
      background: "var(--bg-canvas)",
      overflow: "hidden",
      boxShadow: "0 40px 120px rgba(37,90,75,0.28), inset 0 0 0 10px #1b1f1d, inset 0 0 0 13px #2c322f"
    }
  }, /*#__PURE__*/React.createElement(StatusBar, null), /*#__PURE__*/React.createElement("div", {
    style: {
      position: "absolute",
      inset: 0,
      paddingTop: 0
    }
  }, children), /*#__PURE__*/React.createElement("div", {
    style: {
      position: "absolute",
      bottom: 9,
      left: "50%",
      transform: "translateX(-50%)",
      width: 130,
      height: 5,
      borderRadius: 999,
      background: "rgba(37,90,75,0.5)",
      zIndex: 50
    }
  }));
}
function StatusBar() {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      position: "absolute",
      top: 0,
      left: 0,
      right: 0,
      height: 54,
      zIndex: 40,
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      padding: "0 34px",
      fontFamily: "var(--font-mono)",
      fontSize: 13,
      fontWeight: 700,
      color: "var(--text-strong)",
      letterSpacing: "0.02em"
    }
  }, /*#__PURE__*/React.createElement("span", null, "9:41"), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: 6,
      alignItems: "center",
      opacity: 0.85
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 11
    }
  }, "\u25CF\u25CF\u25CF"), /*#__PURE__*/React.createElement("svg", {
    width: "18",
    height: "12",
    viewBox: "0 0 18 12",
    fill: "none"
  }, /*#__PURE__*/React.createElement("path", {
    d: "M9 11C5.5 7 2 6 1 6.5 4 2.5 14 2.5 17 6.5 16 6 12.5 7 9 11Z",
    stroke: "currentColor",
    strokeWidth: "1.2"
  })), /*#__PURE__*/React.createElement("svg", {
    width: "24",
    height: "12",
    viewBox: "0 0 24 12",
    fill: "none"
  }, /*#__PURE__*/React.createElement("rect", {
    x: "0.5",
    y: "1",
    width: "20",
    height: "10",
    rx: "3",
    stroke: "currentColor",
    strokeWidth: "1.2"
  }), /*#__PURE__*/React.createElement("rect", {
    x: "2.5",
    y: "3",
    width: "14",
    height: "6",
    rx: "1.5",
    fill: "currentColor"
  }), /*#__PURE__*/React.createElement("rect", {
    x: "21.5",
    y: "4",
    width: "2",
    height: "4",
    rx: "1",
    fill: "currentColor"
  }))));
}
window.PhoneShell = PhoneShell;
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/wander-navigator/PhoneShell.jsx", error: String((e && e.message) || e) }); }

// ui_kits/wander-navigator/PlanScreen.jsx
try { (() => {
// Wander Navigator — Plan screen
const {
  OutingToggle,
  Input,
  Button,
  Card,
  Badge
} = window.WanderStructuredFluidityDS_140bd8;
function PlanScreen({
  outing,
  setOuting,
  outingColor,
  onFind
}) {
  const recents = [{
    icon: "coffee",
    name: "Maple Café",
    meta: "Riverside · 12 min"
  }, {
    icon: "leaf",
    name: "Botanical Garden",
    meta: "North loop · 22 min"
  }, {
    icon: "pin",
    name: "Old Town Gate",
    meta: "Historic · 18 min"
  }];
  return /*#__PURE__*/React.createElement("div", {
    style: {
      position: "absolute",
      inset: 0
    }
  }, /*#__PURE__*/React.createElement(MapCanvas, {
    outingColor: outingColor,
    dim: true
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      position: "absolute",
      top: 64,
      left: 16,
      right: 16
    }
  }, /*#__PURE__*/React.createElement(Card, {
    variant: "glass",
    style: {
      padding: 18
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: "var(--font-mono)",
      fontSize: 11,
      letterSpacing: "0.18em",
      textTransform: "uppercase",
      color: "var(--text-muted)"
    }
  }, "Good evening, Mara"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: "var(--font-display)",
      fontWeight: 700,
      fontSize: 26,
      color: "var(--text-strong)",
      margin: "4px 0 16px",
      letterSpacing: "-0.01em"
    }
  }, "Plan your wander"), /*#__PURE__*/React.createElement(OutingToggle, {
    value: outing,
    onChange: setOuting,
    style: {
      width: "100%",
      display: "flex"
    }
  }))), /*#__PURE__*/React.createElement("div", {
    style: {
      position: "absolute",
      left: 0,
      right: 0,
      bottom: 0
    }
  }, /*#__PURE__*/React.createElement(Card, {
    variant: "sheet",
    style: {
      padding: "20px 18px 30px"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: 44,
      height: 5,
      borderRadius: 999,
      background: "var(--border-muted)",
      margin: "0 auto 18px"
    }
  }), /*#__PURE__*/React.createElement(Input, {
    placeholder: "Where to?",
    leadingIcon: /*#__PURE__*/React.createElement(Icon, {
      name: "search",
      size: 20
    })
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: "var(--font-mono)",
      fontSize: 11,
      letterSpacing: "0.16em",
      textTransform: "uppercase",
      color: "var(--text-muted)",
      margin: "22px 4px 12px"
    }
  }, "Saved for ", outing, " outings"), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      flexDirection: "column",
      gap: 8
    }
  }, recents.map(r => /*#__PURE__*/React.createElement("button", {
    key: r.name,
    onClick: onFind,
    style: {
      display: "flex",
      alignItems: "center",
      gap: 14,
      padding: "12px 14px",
      border: "none",
      borderRadius: "var(--radius-md)",
      background: "var(--surface-raised)",
      cursor: "pointer",
      textAlign: "left",
      width: "100%"
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      width: 40,
      height: 40,
      borderRadius: 999,
      flexShrink: 0,
      background: "var(--cobalt-100)",
      color: "var(--cobalt-600)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center"
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: r.icon,
    size: 20
  })), /*#__PURE__*/React.createElement("span", {
    style: {
      flex: 1
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      display: "block",
      fontFamily: "var(--font-display)",
      fontWeight: 500,
      fontSize: 16,
      color: "var(--text-strong)"
    }
  }, r.name), /*#__PURE__*/React.createElement("span", {
    style: {
      display: "block",
      fontFamily: "var(--font-mono)",
      fontSize: 11,
      letterSpacing: "0.08em",
      color: "var(--text-muted)",
      marginTop: 2
    }
  }, r.meta)), /*#__PURE__*/React.createElement(Icon, {
    name: "chevron",
    size: 18,
    color: "var(--text-muted)"
  })))), /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 18
    }
  }, /*#__PURE__*/React.createElement(Button, {
    variant: "glow",
    full: true,
    leadingIcon: /*#__PURE__*/React.createElement(Icon, {
      name: "nav",
      size: 20
    }),
    onClick: onFind
  }, "Find routes")))));
}
window.PlanScreen = PlanScreen;
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/wander-navigator/PlanScreen.jsx", error: String((e && e.message) || e) }); }

// ui_kits/wander-navigator/RoutesScreen.jsx
try { (() => {
// Wander Navigator — Routes comparison screen
const {
  Button: RBtn,
  Card: RCard,
  Badge: RBadge,
  POIChip
} = window.WanderStructuredFluidityDS_140bd8;
function RoutesScreen({
  outingColor,
  onBack,
  onStart
}) {
  const [picked, setPicked] = React.useState("calm");
  const routes = {
    calm: {
      variant: "preference",
      points: [[12, 92], [26, 62], [52, 54], [72, 30], [90, 16]],
      active: true
    },
    direct: {
      variant: "alternate",
      points: [[12, 92], [44, 80], [78, 34], [90, 16]]
    }
  };
  const options = [{
    id: "calm",
    title: "Calm & green",
    time: "16 min",
    dist: "1.1 km",
    tags: [["mint", "Quiet route"], ["lime", "Preference match"]]
  }, {
    id: "direct",
    title: "Most direct",
    time: "12 min",
    dist: "0.9 km",
    tags: [["liliac", "Busier"], ["neutral", "Step-free"]]
  }];
  return /*#__PURE__*/React.createElement("div", {
    style: {
      position: "absolute",
      inset: 0
    }
  }, /*#__PURE__*/React.createElement(MapCanvas, {
    outingColor: outingColor,
    routes: [routes.direct, picked === "calm" ? routes.calm : {
      ...routes.calm,
      active: false
    }]
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      position: "absolute",
      left: 22,
      bottom: 250
    }
  }, /*#__PURE__*/React.createElement(POIChip, {
    label: "Start \xB7 You"
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      position: "absolute",
      left: 150,
      top: 300
    }
  }, /*#__PURE__*/React.createElement(POIChip, {
    label: "Maple Caf\xE9",
    meta: "180 m \xB7 on route",
    selected: true
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      position: "absolute",
      right: 26,
      top: 150
    }
  }, /*#__PURE__*/React.createElement(POIChip, {
    label: "Riverside Park"
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      position: "absolute",
      right: 70,
      top: 250
    }
  }, /*#__PURE__*/React.createElement(POIChip, {
    label: "Late Pharmacy",
    alert: true
  }))), /*#__PURE__*/React.createElement("button", {
    onClick: onBack,
    style: {
      position: "absolute",
      top: 66,
      left: 16,
      width: 48,
      height: 48,
      borderRadius: 999,
      border: "none",
      background: "var(--surface-overlay)",
      backdropFilter: "blur(14px)",
      boxShadow: "var(--shadow-card)",
      cursor: "pointer",
      display: "flex",
      alignItems: "center",
      justifyContent: "center"
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "chevron",
    size: 22,
    style: {
      transform: "scaleX(-1)"
    },
    color: "var(--text-strong)"
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      position: "absolute",
      left: 0,
      right: 0,
      bottom: 0
    }
  }, /*#__PURE__*/React.createElement(RCard, {
    variant: "sheet",
    style: {
      padding: "20px 18px 30px"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: 44,
      height: 5,
      borderRadius: 999,
      background: "var(--border-muted)",
      margin: "0 auto 16px"
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: "var(--font-display)",
      fontWeight: 700,
      fontSize: 22,
      color: "var(--text-strong)",
      margin: "0 4px 14px"
    }
  }, "2 routes to Maple Caf\xE9"), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      flexDirection: "column",
      gap: 10
    }
  }, options.map(o => {
    const on = picked === o.id;
    return /*#__PURE__*/React.createElement("button", {
      key: o.id,
      onClick: () => setPicked(o.id),
      style: {
        display: "block",
        width: "100%",
        textAlign: "left",
        cursor: "pointer",
        padding: "16px 16px",
        borderRadius: "var(--radius-md)",
        background: "var(--surface-card)",
        border: on ? "2px solid var(--cobalt)" : "2px solid var(--border-hairline)",
        boxShadow: on ? "var(--glow-cobalt)" : "none",
        transition: "border-color .24s, box-shadow .24s"
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        display: "flex",
        alignItems: "baseline",
        justifyContent: "space-between"
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        fontFamily: "var(--font-display)",
        fontWeight: 600,
        fontSize: 17,
        color: "var(--text-strong)"
      }
    }, o.title), /*#__PURE__*/React.createElement("span", {
      style: {
        fontFamily: "var(--font-display)",
        fontWeight: 700,
        fontSize: 20,
        color: on ? "var(--cobalt-600)" : "var(--text-strong)"
      }
    }, o.time)), /*#__PURE__*/React.createElement("div", {
      style: {
        display: "flex",
        alignItems: "center",
        gap: 8,
        marginTop: 10,
        flexWrap: "wrap"
      }
    }, o.tags.map((t, i) => /*#__PURE__*/React.createElement(RBadge, {
      key: i,
      tone: t[0]
    }, t[1])), /*#__PURE__*/React.createElement("span", {
      style: {
        marginLeft: "auto",
        fontFamily: "var(--font-mono)",
        fontSize: 11,
        letterSpacing: "0.08em",
        color: "var(--text-muted)"
      }
    }, o.dist)));
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 18
    }
  }, /*#__PURE__*/React.createElement(RBtn, {
    variant: "glow",
    full: true,
    leadingIcon: /*#__PURE__*/React.createElement(Icon, {
      name: "walk",
      size: 20
    }),
    onClick: onStart
  }, "Start navigation")))));
}
window.RoutesScreen = RoutesScreen;
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/wander-navigator/RoutesScreen.jsx", error: String((e && e.message) || e) }); }

__ds_ns.Button = __ds_scope.Button;

__ds_ns.Input = __ds_scope.Input;

__ds_ns.OutingToggle = __ds_scope.OutingToggle;

__ds_ns.MapRoute = __ds_scope.MapRoute;

__ds_ns.POIChip = __ds_scope.POIChip;

__ds_ns.RadarMist = __ds_scope.RadarMist;

__ds_ns.Badge = __ds_scope.Badge;

__ds_ns.Card = __ds_scope.Card;

})();
