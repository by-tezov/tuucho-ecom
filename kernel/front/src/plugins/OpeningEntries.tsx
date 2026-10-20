import { Button } from '../components/ui/Button';
import type { CoreOpeningEntry } from './types';

/** Renders plugin contributions into a core opening (preferences, profile,
 * sign-in, notifications). Empty list renders nothing. */
export function OpeningEntries({
  entries,
  className,
  actionLabel,
}: {
  entries: CoreOpeningEntry[] | undefined;
  className?: string | undefined;
  actionLabel?: string | undefined;
}) {
  if (!entries?.length) return null;
  const unique = entries.filter((entry, index) => entries.findIndex((item) => item.id === entry.id) === index);
  return (
    <div className={className}>
      {unique.map((entry) => (
        <article key={entry.id}>
          <h3>{entry.title}</h3>
          {entry.description ? <p>{entry.description}</p> : null}
          {entry.href ? (
            <Button to={entry.href} variant="secondary">
              {actionLabel ?? entry.title}
            </Button>
          ) : null}
        </article>
      ))}
    </div>
  );
}
