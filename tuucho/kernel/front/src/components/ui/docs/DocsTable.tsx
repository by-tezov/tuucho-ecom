import { KERNEL_UI } from '../../../ui/names';
import { withKernelUi } from '../../../ui/registry';
import styles from './DocsTable.module.css';

interface DocsTableProps {
  columns: string[];
  rows: string[][];
}

function DocsTableRoot({ columns, rows }: DocsTableProps) {
  return (
    <div className={styles.wrap}>
      <table className={styles.table}>
        <thead>
          <tr>
            {columns.map((column) => (
              <th key={column} className={styles.th} scope="col">
                {column}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.join('|')} className={styles.tr}>
              {row.map((cell, index) => (
                <td key={`${columns[index] ?? index}:${cell}`} className={styles.td}>
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export const DocsTable = withKernelUi(KERNEL_UI.DocsTable, DocsTableRoot);
