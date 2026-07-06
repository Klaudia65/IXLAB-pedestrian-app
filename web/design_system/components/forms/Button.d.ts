import * as React from "react";

/**
 * Pill-shaped button, 56px standard height. Outline variant animates its
 * stroke to solid Cobalt on hover/active.
 *
 * @startingPoint section="Controls" subtitle="Pill button, 56px, Cobalt" viewport="700x140"
 */
export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  /** Visual style. @default "primary" */
  variant?: "primary" | "outline" | "ghost" | "glow";
  /** md = 56px, sm = 44px. @default "md" */
  size?: "md" | "sm";
  /** Icon node rendered before the label */
  leadingIcon?: React.ReactNode;
  /** Icon node rendered after the label */
  trailingIcon?: React.ReactNode;
  /** Stretch to fill container width */
  full?: boolean;
  disabled?: boolean;
  children?: React.ReactNode;
}

export function Button(props: ButtonProps): JSX.Element;
