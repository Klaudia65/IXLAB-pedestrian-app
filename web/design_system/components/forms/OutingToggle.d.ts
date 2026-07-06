import * as React from "react";

/**
 * Segmented pill control for choosing the outing personality. The selected
 * segment fills with that outing's accent and glows — drives app theming.
 *
 * @startingPoint section="Controls" subtitle="Solo / Couple / Friends selector" viewport="700x120"
 */
export interface OutingOption {
  id: string;
  label: string;
  /** CSS color (token reference) for the active fill + glow */
  color: string;
}

export interface OutingToggleProps {
  /** Selected outing id. @default "solo" */
  value?: "solo" | "couple" | "friends" | string;
  onChange?: (id: string) => void;
  /** Override the default three outings */
  options?: OutingOption[];
}

export function OutingToggle(props: OutingToggleProps): JSX.Element;
