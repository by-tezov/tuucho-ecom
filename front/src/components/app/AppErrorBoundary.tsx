import { Component, type ErrorInfo, type ReactNode } from 'react';
import { useLang } from '../../assets/i18n';
import type { AppErrorStrings } from '../../assets/i18n/types';
import { reportClientError } from '../../observability/clientError';
import styles from './AppErrorBoundary.module.css';

interface BoundaryProps {
  copy: AppErrorStrings;
  children: ReactNode;
}

interface BoundaryState {
  failed: boolean;
}

class Boundary extends Component<BoundaryProps, BoundaryState> {
  state: BoundaryState = { failed: false };

  static getDerivedStateFromError(): BoundaryState {
    return { failed: true };
  }

  componentDidCatch(_error: Error, _info: ErrorInfo): void {
    reportClientError('render');
  }

  retry = (): void => {
    this.setState({ failed: false });
  };

  render(): ReactNode {
    if (!this.state.failed) return this.props.children;
    return (
      <main className={styles.root} aria-labelledby="app-error-title">
        <section className={styles.card} role="alert">
          <h1 id="app-error-title">{this.props.copy.title}</h1>
          <p>{this.props.copy.message}</p>
          <button className={styles.retry} type="button" onClick={this.retry}>
            {this.props.copy.retry}
          </button>
        </section>
      </main>
    );
  }
}

/** Keeps recovery copy inside the existing language provider. */
export function AppErrorBoundary({ children }: { children: ReactNode }) {
  const { t } = useLang();
  return <Boundary copy={t.appError}>{children}</Boundary>;
}
