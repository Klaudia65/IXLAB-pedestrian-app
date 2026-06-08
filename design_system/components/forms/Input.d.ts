import * as React from "react";

/**
 * 56px pill text field. Outline animates to a solid 2px Cobalt ring on focus.
 */
export interface InputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "size"> {
  value?: string;
  onChange?: React.ChangeEventHandler<HTMLInputElement>;
  placeholder?: string;
  leadingIcon?: React.ReactNode;
  trailingIcon?: React.ReactNode;
  /** md = 56px, sm = 44px. @default "md" */
  size?: "md" | "sm";
  /** Fill container width. @default true */
  full?: boolean;
  disabled?: boolean;
}

export function Input(props: InputProps): JSX.Element;
