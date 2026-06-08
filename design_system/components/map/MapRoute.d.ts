import * as React from "react";

/**
 * SVG route stroke with fully-rounded pill caps. Primary = Mint, preference =
 * Lime (both glow), alternate = thin semi-transparent Liliac. `active`
 * intensifies the glow (e.g. crossing a Radar Mist zone).
 */
export interface MapRouteProps {
  /** [x, y] points in viewBox space */
  points: [number, number][];
  /** @default "primary" */
  variant?: "primary" | "preference" | "alternate";
  /** Intensify glow / pulse. @default false */
  active?: boolean;
  /** SVG viewBox. @default "0 0 100 100" */
  viewBox?: string;
  /** Dotted styling (e.g. unwalked segment). @default false */
  dashed?: boolean;
  style?: React.CSSProperties;
}

export function MapRoute(props: MapRouteProps): JSX.Element;
