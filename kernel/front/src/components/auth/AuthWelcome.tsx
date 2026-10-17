import type { ReactNode } from 'react';

/** Emphasize the shop name when it appears in a welcome sentence. */
function withBrandEmphasis(text: string): ReactNode {
  const parts = text.split(/(Shop)/g);
  if (parts.length === 1) return text;
  return parts.map((part, i) => (part === 'Shop' ? <strong key={i}>{part}</strong> : part));
}

/** Muted paragraphs under a connect title.
 * Connect passes four lines (last right-aligned). */
export function AuthWelcome({
  sentences,
  className,
  lastClassName,
}: {
  sentences: readonly string[];
  className: string;
  lastClassName?: string;
}) {
  const lastIndex = sentences.length - 1;
  return (
    <div className={className}>
      {sentences.map((sentence, i) => (
        <p key={i} className={i === lastIndex ? lastClassName : undefined}>
          {withBrandEmphasis(sentence)}
        </p>
      ))}
    </div>
  );
}
