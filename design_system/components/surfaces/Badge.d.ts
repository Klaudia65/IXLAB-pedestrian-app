import * as React from "react";

/** Compact uppercase pill label for statuses and route tags. */
export interface BadgeProps {
  children?: React.ReactNode;
  /** @default "neutral" */
  tone?: "neutral" | "accent" | "mint" | "lime" | "liliac" | "orchid";
  /** Filled instead of soft-tint. @default false */
  solid?: boolean;
  icon?: React.ReactNode;
  style?: React.CSSProperties;
}

export function Badge(props: BadgeProps): JSX.Element;
