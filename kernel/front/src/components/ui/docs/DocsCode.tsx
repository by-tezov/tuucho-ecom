import { KERNEL_UI } from '../../../ui/names';
import { withKernelUi } from '../../../ui/registry';
import { highlightCode } from './highlight';
import styles from './DocsCode.module.css';

interface DocsCodeProps {
  code: string;
  language: string;
  caption?: string | undefined;
}

function DocsCodeRoot({ code, language, caption }: DocsCodeProps) {
  const tokens = highlightCode(code, language);
  return (
    <figure className={styles.figure}>
      <div className={styles.bar}>
        <p className={styles.lang}>{language}</p>
        {caption ? <p className={styles.caption}>{caption}</p> : null}
      </div>
      <pre className={styles.pre}>
        <code className={styles.code}>
          {tokens.map((token, index) => (
            <span key={`${index}:${token.kind}`} className={styles[token.kind]}>
              {token.text}
            </span>
          ))}
        </code>
      </pre>
    </figure>
  );
}

export const DocsCode = withKernelUi(KERNEL_UI.DocsCode, DocsCodeRoot);
