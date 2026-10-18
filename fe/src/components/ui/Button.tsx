import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import clsx from 'clsx';
import { Icon, type IconName } from '../icons/Icon';
import { Tooltip } from './Tooltip';
import styles from './ui.module.css';

type Variant = 'primary' | 'white' | 'outline' | 'tinted' | 'text' | 'dark';
type Size = 'sm' | 'md' | 'lg';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  icon?: IconName;
  children?: ReactNode;
}

/** Pill buttons: green "primary", white "Explore Premium", outlined "Follow"… */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', size = 'md', icon, className, children, type = 'button', ...rest },
  ref,
) {
  return (
    <button ref={ref} type={type} className={clsx(styles.button, styles[variant], styles[size], className)} {...rest}>
      {icon && <Icon name={icon} size={size === 'sm' ? 14 : 16} />}
      {children}
    </button>
  );
});

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  icon: IconName;
  label: string;
  size?: number;
  /** Green + dot underneath, like Spotify's active Lyrics/Queue buttons. */
  active?: boolean;
  dot?: boolean;
  tooltip?: boolean;
  tooltipSide?: 'top' | 'bottom' | 'left' | 'right';
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { icon, label, size = 16, active, dot, tooltip = true, tooltipSide, className, type = 'button', ...rest },
  ref,
) {
  const button = (
    <button
      ref={ref}
      type={type}
      aria-label={label}
      aria-pressed={active === undefined ? undefined : active}
      className={clsx(styles.iconButton, active && styles.active, dot && styles.dot, className)}
      {...rest}
    >
      <Icon name={icon} size={size} />
    </button>
  );
  return tooltip ? <Tooltip label={label} side={tooltipSide}>{button}</Tooltip> : button;
});
