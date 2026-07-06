// Wander — custom thin-stroke icon set (1.75px, round caps).
// Production note: substitute with Lucide for full coverage; these mirror its weight.
function Icon({ name, size = 22, color = "currentColor", style = {} }) {
  const p = {
    width: size, height: size, viewBox: "0 0 24 24", fill: "none",
    stroke: color, strokeWidth: 1.75, strokeLinecap: "round", strokeLinejoin: "round",
    style: { display: "block", ...style },
  };
  const paths = {
    search: <><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></>,
    nav: <path d="M3 11l18-8-8 18-2-8-8-2z"/>,
    walk: <><circle cx="13" cy="4.5" r="1.6"/><path d="M11 21l1.5-6-2.5-2 1-5 3 2 2.5 1.5M9 21l1.5-4"/></>,
    heart: <path d="M12 20s-7-4.6-7-9.4A3.6 3.6 0 0 1 12 8a3.6 3.6 0 0 1 7-1.4C19 11.4 12 20 12 20z"/>,
    user: <><circle cx="12" cy="8" r="3.4"/><path d="M5.5 20a6.5 6.5 0 0 1 13 0"/></>,
    users: <><circle cx="9" cy="8" r="3"/><path d="M3 20a6 6 0 0 1 12 0M16 5.2a3 3 0 0 1 0 5.6M21 20a6 6 0 0 0-4-5.6"/></>,
    pin: <><path d="M12 21s7-5.5 7-11a7 7 0 0 0-14 0c0 5.5 7 11 7 11z"/><circle cx="12" cy="10" r="2.5"/></>,
    clock: <><circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/></>,
    chevron: <path d="M9 6l6 6-6 6"/>,
    close: <path d="M6 6l12 12M18 6L6 18"/>,
    layers: <path d="M12 4l8 4-8 4-8-4 8-4zM4 12l8 4 8-4M4 16l8 4 8-4"/>,
    sun: <><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5L19 19M19 5l-1.5 1.5M6.5 17.5L5 19"/></>,
    leaf: <path d="M5 19c8 1 14-5 14-14-9 0-15 6-14 14zM5 19c2-5 5-8 10-10"/>,
    bolt: <path d="M13 3L5 13h5l-1 8 8-10h-5l1-8z"/>,
    bookmark: <path d="M6 4h12v17l-6-4-6 4V4z"/>,
    plus: <path d="M12 5v14M5 12h14"/>,
    coffee: <><path d="M5 9h12v4a5 5 0 0 1-5 5H10a5 5 0 0 1-5-5V9z"/><path d="M17 10h2a2 2 0 0 1 0 4h-2M8 3v2M11 3v2"/></>,
  };
  return <svg {...p}>{paths[name] || null}</svg>;
}
window.Icon = Icon;
