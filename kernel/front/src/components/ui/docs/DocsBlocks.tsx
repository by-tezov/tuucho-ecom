import type { DocsBlock } from './docsTypes';
import { DocsCallout } from './DocsCallout';
import { DocsCards } from './DocsCards';
import { DocsCode } from './DocsCode';
import { DocsDefList } from './DocsDefList';
import { DocsSteps } from './DocsSteps';
import { DocsTable } from './DocsTable';
import styles from './DocsBlocks.module.css';

interface DocsBlocksProps {
  blocks: DocsBlock[];
}

function DocsBlockView({ block }: { block: DocsBlock }) {
  switch (block.type) {
    case 'p':
      return <p className={styles.paragraph}>{block.text}</p>;
    case 'callout':
      return (
        <DocsCallout tone={block.tone} title={block.title}>
          {block.text}
        </DocsCallout>
      );
    case 'cards':
      return <DocsCards items={block.items} />;
    case 'steps':
      return <DocsSteps items={block.items} />;
    case 'list':
      return block.ordered ? (
        <ol className={styles.list}>
          {block.items.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ol>
      ) : (
        <ul className={styles.list}>
          {block.items.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      );
    case 'table':
      return <DocsTable columns={block.columns} rows={block.rows} />;
    case 'defs':
      return <DocsDefList items={block.items} />;
    case 'code':
      return <DocsCode code={block.code} language={block.language} caption={block.caption} />;
    default:
      return null;
  }
}

export function DocsBlocks({ blocks }: DocsBlocksProps) {
  if (blocks.length === 0) return null;
  return (
    <div className={styles.stack}>
      {blocks.map((block, index) => (
        <DocsBlockView key={`${block.type}:${index}`} block={block} />
      ))}
    </div>
  );
}
