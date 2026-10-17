import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { repoRoot } from '../../../../../src/modules/plugins/application/discoverPlugins.js';

test('outage and chat owner To go through tuucho-mail-spy, not env inboxes', () => {
  const root = repoRoot();
  const outage = readFileSync(join(root, 'kernel/back/src/warmOutageSpy.ts'), 'utf8');
  assert.match(outage, /liveOrCachedOutageSpyTo/);
  assert.doesNotMatch(outage, /orderSpyRecipientEmail|EMAIL_ORDER_SPY_RECIPIENT unset/);

  const chat = readFileSync(
    join(root, 'plugins/tuucho/messaging/contact/tuucho-contact/back/src/application/chat.ts'),
    'utf8',
  );
  assert.match(chat, /spyTo\('contact\.chat'\)/);
  assert.doesNotMatch(chat, /chatSmtp\.recipientEmail/);
  assert.doesNotMatch(chat, /dev@localhost/);

  const register = readFileSync(
    join(root, 'plugins/tuucho/messaging/contact/tuucho-contact/back/register.ts'),
    'utf8',
  );
  assert.match(register, /id: 'contact\.chat'/);

  const seed = readFileSync(
    join(root, 'plugins/tuucho/messaging/mail-spy/tuucho-mail-spy/back/src/application/spyStore.ts'),
    'utf8',
  );
  assert.match(seed, /contact\.chat/);
  assert.match(seed, /chatSmtp\.recipientEmail/);

  const dispatch = readFileSync(
    join(root, 'kernel/back/src/modules/messaging/application/emailDispatch.ts'),
    'utf8',
  );
  assert.doesNotMatch(dispatch, /EMAIL_CHAT_RECIPIENT required/);
});
