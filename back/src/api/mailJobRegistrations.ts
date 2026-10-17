/**
 * Wires every feature's mail deliverer into the queue.
 *
 * `messaging` owns the queue and deliberately knows no feature, so nothing
 * would be registered unless something imports the feature-side modules. This
 * is that something, and it is the only file allowed to reach upward: it is
 * composition, not messaging logic, which is why it names each registration
 * explicitly rather than scanning a directory. A queued kind with no deliverer
 * fails as `unknown_mail_kind`, so a feature omitted here is loud, not silent.
 *
 * It lives in `src/api/` because that is the composition layer: reaching up
 * into feature modules is exactly what composition is for, and doing it from
 * inside `messaging` would put the edge back.
 *
 * Import it once, before the worker drains (see src/app.ts).
 */
import '../modules/gift/application/giftMailJob.js';
import '../modules/orders/application/orderMailJob.js';
import '../modules/contact/application/contactMailJob.js';
