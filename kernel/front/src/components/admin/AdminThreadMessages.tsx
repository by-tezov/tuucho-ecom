import { useEffect, useState } from 'react';
import styles from './AdminThread.module.css';

export interface AdminThreadMessageAttachment {
  id: number;
  fileName: string;
}

export interface AdminThreadMessageVM {
  id: number;
  body: string;
  fromAdmin: boolean;
  attachments: AdminThreadMessageAttachment[];
}

interface ThreadAttachmentProps {
  attachment: AdminThreadMessageAttachment;
  fetchAttachment: (attachmentId: number) => Promise<Blob>;
}

function ThreadAttachment({ attachment, fetchAttachment }: ThreadAttachmentProps) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let objectUrl: string | null = null;
    let cancelled = false;
    void fetchAttachment(attachment.id)
      .then((blob) => {
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setUrl(objectUrl);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [attachment.id, fetchAttachment]);
  return url ? (
    <img loading="lazy" decoding="async" className={styles.attachment} src={url} alt={attachment.fileName} />
  ) : (
    <span>{attachment.fileName}</span>
  );
}

interface AdminThreadMessagesProps {
  messages: AdminThreadMessageVM[];
  fetchAttachment: (attachmentId: number) => Promise<Blob>;
}

/** Message bubble thread (client left / admin right) with lazily fetched
 * image attachments — identical between Chats and Unconnected-contacts,
 * only the message source (live SSE chat vs. static contact thread) and the
 * admin-side field name differ, both handled by the caller before mapping
 * into AdminThreadMessageVM. */
export function AdminThreadMessages({ messages, fetchAttachment }: AdminThreadMessagesProps) {
  return (
    <div className={styles.messages}>
      {messages.map((message) => (
        <div key={message.id} className={message.fromAdmin ? styles.admin : styles.client}>
          <p>{message.body}</p>
          {message.attachments.length > 0 && (
            <div className={styles.attachments}>
              {message.attachments.map((attachment) => (
                <ThreadAttachment
                  key={attachment.id}
                  attachment={attachment}
                  fetchAttachment={fetchAttachment}
                />
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
