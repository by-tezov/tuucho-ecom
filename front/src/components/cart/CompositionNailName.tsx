import { useRef } from 'react';
import { useFitTitle } from '../../hooks/useFitOneLineTitle';
import compositionStyles from './CompositionCartBlock.module.css';

/** A nail's name on one line: shrinks within the cart titles' range before
 * it ever falls back to an ellipsis. */
export function CompositionNailName({ title }: { title: string }) {
  const ref = useRef<HTMLParagraphElement | null>(null);
  useFitTitle(ref, title, { minFont: 10, maxFont: 13 });
  return (
    <p ref={ref} className={compositionStyles.compositionNailName}>
      {title}
    </p>
  );
}
