import { useRef, type ReactNode } from 'react';
import { Button } from '../ui/Button';
import {
  CONTACT_IMAGE_MAX_COUNT,
  ImageAttachField,
  type ImageAttachFieldHandle,
} from '../contact/ImageAttachField';
import { useLang } from '../../assets/i18n';
import styles from './AdminThread.module.css';

interface AdminThreadComposerProps {
  draft: string;
  setDraft: (value: string) => void;
  images: File[];
  setImages: (files: File[]) => void;
  attachError: string | null;
  setAttachError: (value: string | null) => void;
  acting: boolean;
  onSend: () => void;
  /** Extra content rendered under the message row — e.g. Chats' "don't
   * e-mail me" checkbox, which has no equivalent on Unconnected-contacts. */
  footer?: ReactNode;
}

function SendIcon() {
  return (
    <svg
      className={styles.sendIcon}
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M14 2 2 7.2l4.6 1.7L8.3 14 14 2Z"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}

function AttachIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
      <path
        d="M9.6 3.3 4.9 8a1.7 1.7 0 0 0 2.4 2.4l4.3-4.3a2.9 2.9 0 0 0-4.1-4.1L3.2 6.3a4.1 4.1 0 0 0 5.7 5.9"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Reply composer (image attach + textarea + send) shared by Chats and
 * Unconnected-contacts — byte-identical between the two pages before this
 * extraction. */
export function AdminThreadComposer({
  draft,
  setDraft,
  images,
  setImages,
  attachError,
  setAttachError,
  acting,
  onSend,
  footer,
}: AdminThreadComposerProps) {
  const { t } = useLang();
  const attachFieldRef = useRef<ImageAttachFieldHandle>(null);
  return (
    <form
      className={styles.composer}
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        onSend();
      }}
    >
      <ImageAttachField
        ref={attachFieldRef}
        rowClassName={styles.pickerRow}
        label={t.contact.attachImagesLabel}
        hint={t.contact.attachImagesHint}
        removeAria={t.contact.attachRemoveAria}
        files={images}
        onChange={setImages}
        disabled={acting}
        error={attachError}
        onError={setAttachError}
        errorTooMany={t.contact.errorImageTooMany}
        errorInvalidType={t.contact.errorImageInvalidType}
        errorTooLarge={t.contact.errorImageTooLarge}
      />
      <div className={styles.composerRow}>
        <div className={styles.composerFieldWrap}>
          <textarea
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder={t.contact.chatPlaceholder}
            rows={4}
            disabled={acting}
          />
        </div>
        <div className={styles.composerButtons}>
          <button
            type="button"
            className={styles.attachButton}
            disabled={acting || images.length >= CONTACT_IMAGE_MAX_COUNT}
            aria-label={t.contact.attachImagesLabel}
            onClick={() => attachFieldRef.current?.openPicker()}
          >
            <AttachIcon />
          </button>
          <Button type="submit" disabled={!draft.trim() || acting}>
            <span className={styles.sendLabel}>{acting ? t.contact.chatSending : t.contact.chatSend}</span>
            <SendIcon />
          </Button>
        </div>
      </div>
      {footer}
    </form>
  );
}
