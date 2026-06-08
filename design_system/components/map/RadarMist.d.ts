import * as React from "react";

/**
 * Soft radial-mesh blur field — an ambient area-of-interest behind the map
 * grid, color-coded by preference weight. Decorative; position absolutely.
 */
export interface RadarMistProps {
  /** Token name ("mint"), CSS var, or any CSS color. @default "var(--mint)" */
  color?: string;
  /** Diameter in px. @default 360 */
  size?: number;
  /** Peak opacity 0..1. @default 0.55 */
  intensity?: number;
  /** CSS blur value. @default "var(--blur-mist-lg)" */
  blur?: string;
  /** Slow breathing animation. @default true */
  breathe?: boolean;
  style?: React.CSSProperties;
}

export function RadarMist(props: RadarMistProps): JSX.Element;
