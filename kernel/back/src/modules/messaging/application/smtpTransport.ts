import nodemailer, { type Transporter } from 'nodemailer';
import { config } from '../../../config/env.js';

let transporter: Transporter | undefined;

/** Lazy so a folder-routing checkout (SMTP_HOST blank, see env.ts) never
 * tries to open a connection at all — email.ts's sendMail writes under DEV_DIR
 * instead. */
export function getTransporter(): Transporter | undefined {
  if (!config.smtp.host) return undefined;
  if (!transporter) {
    // Pooled: each send used to open its own TCP + TLS + AUTH session, paid
    // inside the request that sent it. A few kept connections are reused;
    // nodemailer reopens one the server has closed.
    transporter = nodemailer.createTransport({
      pool: true,
      maxConnections: 3,
      host: config.smtp.host,
      port: config.smtp.port,
      secure: config.smtp.port === 465,
      auth: config.smtp.user ? { user: config.smtp.user, pass: config.smtp.password } : undefined,
    });
  }
  return transporter;
}

let chatTransporter: Transporter | undefined;

export function getChatTransporter(): Transporter | undefined {
  if (!config.chatSmtp.host) return undefined;
  if (!chatTransporter) {
    chatTransporter = nodemailer.createTransport({
      pool: true,
      maxConnections: 2,
      host: config.chatSmtp.host,
      port: config.chatSmtp.port,
      secure: config.chatSmtp.port === 465,
      auth: config.chatSmtp.user ? { user: config.chatSmtp.user, pass: config.chatSmtp.password } : undefined,
    });
  }
  return chatTransporter;
}
