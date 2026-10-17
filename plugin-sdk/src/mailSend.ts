/** Kernel binds these at plugin load. Plugins send through the shell; they
 * never own SMTP. Unbound (tests without a host) throws `mail_shell_unbound`. */

export type PluginMailMessage = {
  to: string;
  subject: string;
  text: string;
  html?: string;
  replyTo?: string;
  cc?: string | string[];
  bcc?: string | string[];
  kind?: string;
  attachments?: Array<{
    filename: string;
    path: string;
    cid?: string;
    contentType?: string;
    contentDisposition?: 'inline' | 'attachment';
  }>;
  headers?: Record<string, string>;
};

export type PluginTemplatedMail = {
  template: string;
  to: string;
  data?: Record<string, unknown>;
  language?: string;
  bccStaff?: boolean;
};

export type PluginMailSender = {
  sendMail: (message: PluginMailMessage) => Promise<void>;
  sendTemplatedMail: (input: PluginTemplatedMail) => Promise<void>;
  enqueueMailJob: (kind: string, payload: Record<string, unknown>) => Promise<string>;
};

let sender: PluginMailSender | null = null;

export function setMailSender(next: PluginMailSender): void {
  sender = next;
}

export function resetMailSender(): void {
  sender = null;
}

function bound(): PluginMailSender {
  if (!sender) throw new Error('mail_shell_unbound');
  return sender;
}

export async function sendPluginMail(message: PluginMailMessage): Promise<void> {
  await bound().sendMail(message);
}

export async function sendPluginTemplatedMail(input: PluginTemplatedMail): Promise<void> {
  await bound().sendTemplatedMail(input);
}

export async function enqueuePluginMailJob(kind: string, payload: Record<string, unknown>): Promise<string> {
  return bound().enqueueMailJob(kind, payload);
}
