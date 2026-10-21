import type { CSSProperties, InputHTMLAttributes, ReactNode, TableHTMLAttributes } from 'react';
import { Button } from '../components/ui/Button';

export { Button };

const fieldStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 6,
};

const inputStyle: CSSProperties = {
  font: 'inherit',
  padding: '10px 12px',
  borderRadius: 'var(--radius-md, 10px)',
  border: '1px solid var(--border-soft)',
  background: 'var(--color-bg-card)',
  color: 'var(--color-ink)',
};

const cardStyle: CSSProperties = {
  background: 'var(--color-bg-card)',
  border: '1px solid var(--border-soft)',
  borderRadius: 'var(--radius-xl, 16px)',
  padding: 16,
};

const tableStyle: CSSProperties = {
  width: '100%',
  borderCollapse: 'collapse',
};

const headerStyle: CSSProperties = {
  margin: 0,
  fontSize: 'clamp(1.4rem, 3vw, 2rem)',
  color: 'var(--color-ink)',
};

export function Field({
  label,
  hint,
  error,
  children,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { label: string; hint?: string; error?: string; children?: ReactNode }) {
  return (
    <label style={fieldStyle}>
      <span>{label}</span>
      {children ?? <input {...props} style={inputStyle} />}
      {hint ? <span style={{ color: 'var(--color-muted)', fontSize: '0.85rem' }}>{hint}</span> : null}
      {error ? <span style={{ color: 'var(--color-danger)', fontSize: '0.85rem' }}>{error}</span> : null}
    </label>
  );
}

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <section className={className} style={cardStyle}>
      {children}
    </section>
  );
}

export function Table({ children, ...props }: TableHTMLAttributes<HTMLTableElement>) {
  return (
    <table {...props} style={{ ...tableStyle, ...props.style }}>
      {children}
    </table>
  );
}

export function PageHeader({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <header style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <h1 style={headerStyle}>{title}</h1>
      {children}
    </header>
  );
}
