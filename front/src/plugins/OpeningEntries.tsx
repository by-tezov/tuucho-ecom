import { Link } from 'react-router-dom';
import type { CoreOpeningEntry } from './types';

/** Renders plugin contributions into a core opening (preferences, profile,
 * sign-in, notifications). Empty list renders nothing. */
export function OpeningEntries({
  entries,
  className,
}: {
  entries: CoreOpeningEntry[] | undefined;
  className?: string | undefined;
}) {
  if (!entries?.length) return null;
  return (
    <div className={className}>
      {entries.map((entry) => (
        <article key={entry.id}>
          <h3>{entry.title}</h3>
          {entry.description ? <p>{entry.description}</p> : null}
          {entry.href ? <Link to={entry.href}>{entry.title}</Link> : null}
        </article>
      ))}
    </div>
  );
}
