import * as React from "react";

/**
 * Soft ivory surface. `glass` floats frosted over the map; `sheet` is the
 * bottom drawer with a large top radius.
 *
 * @startingPoint section="Surfaces" subtitle="Card / glass overlay / sheet" viewport="700x260"
 */
export interface CardProps {
  children?: React.ReactNode;
  /** @default "raised" */
  variant?: "raised" | "glass" | "sheet" | "flat";
  style?: React.CSSProperties;
}

export function Card(props: CardProps): JSX.Element;
