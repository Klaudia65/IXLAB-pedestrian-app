import * as React from "react";

/**
 * Map location point: uppercase mono label in a soft capsule that expands
 * into an outlined box when selected. Use `alert` for Orchid specialized POIs.
 *
 * @startingPoint section="Map" subtitle="Selectable POI capsule" viewport="700x140"
 */
export interface POIChipProps {
  /** Uppercase-rendered label, e.g. "Maple Café" */
  label: string;
  /** Secondary mono line shown when selected (distance, side…) */
  meta?: React.ReactNode;
  /** Expanded outlined-box state. @default false */
  selected?: boolean;
  /** Specialized/alert POI — uses Orchid accent + glow. @default false */
  alert?: boolean;
  icon?: React.ReactNode;
  onClick?: () => void;
  style?: React.CSSProperties;
}

export function POIChip(props: POIChipProps): JSX.Element;
