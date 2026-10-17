/**
 * The gift module's public contract for sending gift mail.
 *
 * The mail-job worker in `messaging` drains a durable outbox and has to send
 * these, but a module may not reach into another module's `infrastructure/`.
 * The message construction and its template stay private to gift; what other
 * modules may trigger is stated here.
 */
export {
  sendGiftCancelledMail,
  sendGiftReminderMail,
  sendGiverPromiseMail,
  sendGiverShareCardMail,
} from '../infrastructure/giftMail.js';
