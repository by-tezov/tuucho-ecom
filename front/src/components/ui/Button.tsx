import type { AnchorHTMLAttributes, ButtonHTMLAttributes, ReactNode } from 'react';
import { Link, type LinkProps } from 'react-router-dom';
import styles from './Button.module.css';

type Variant = 'primary' | 'ghost' | 'ghostDanger' | 'ghostOnDark';

interface CommonProps {
  variant?: Variant | undefined;
  children: ReactNode;
  className?: string | undefined;
}

type ButtonAsButton = CommonProps &
  Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'className'> & {
    to?: undefined;
    href?: undefined;
  };
type ButtonAsLink = CommonProps & Omit<LinkProps, 'className'> & { href?: undefined };
type ButtonAsAnchor = CommonProps &
  Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'className'> & {
    to?: undefined;
  };

export type ButtonProps = ButtonAsButton | ButtonAsLink | ButtonAsAnchor;

export function Button({ variant = 'primary', children, className, ...props }: ButtonProps) {
  const cls = [styles.base, styles[variant], className].filter(Boolean).join(' ');

  if ('to' in props && props.to !== undefined) {
    return (
      <Link className={cls} {...(props as LinkProps)}>
        {children}
      </Link>
    );
  }

  if ('href' in props && props.href !== undefined) {
    return (
      <a className={cls} {...(props as AnchorHTMLAttributes<HTMLAnchorElement>)}>
        {children}
      </a>
    );
  }

  return (
    <button type="button" className={cls} {...(props as ButtonHTMLAttributes<HTMLButtonElement>)}>
      {children}
    </button>
  );
}
