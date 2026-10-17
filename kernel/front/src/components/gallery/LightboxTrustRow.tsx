import { useLang } from '../../assets/i18n';
import { ReassuranceStrip } from '../trust/ReassuranceStrip';
import styles from './PhotoLightbox.module.css';

/** The reassurance strip under the zoom modal's add button, centered in the
 * modal's own spacing. */
export function LightboxTrustRow() {
  const { t } = useLang();
  return <ReassuranceStrip t={t} className={styles.trustRow} />;
}
