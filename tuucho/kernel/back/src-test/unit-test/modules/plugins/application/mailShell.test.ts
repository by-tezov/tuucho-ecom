import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createPluginRegisterApi,
  resetMailSender,
  setMailSender,
} from '@tuucho/plugin-sdk';

test('plugin mail API throws until the kernel binds the sender', async () => {
  resetMailSender();
  const api = createPluginRegisterApi('demo-mail', {
    id: 'demo-mail',
    name: 'Demo',
    version: '1.0.0',
    kinds: ['generic'],
    description: 'demo',
  });
  await assert.rejects(
    () => api.sendMail({ to: 'a@b.c', subject: 's', text: 't' }),
    /mail_shell_unbound/,
  );
});

test('plugin mail API sends through the kernel sealer', async () => {
  const sent: unknown[] = [];
  setMailSender({
    sendMail: async (message) => {
      sent.push(message);
    },
    sendTemplatedMail: async () => undefined,
    enqueueMailJob: async () => 'job-1',
  });
  const api = createPluginRegisterApi('demo-mail', {
    id: 'demo-mail',
    name: 'Demo',
    version: '1.0.0',
    kinds: ['generic'],
    description: 'demo',
  });
  await api.sendMail({ to: 'a@b.c', subject: 'Hello', text: 'Body' });
  assert.equal((sent[0] as { to: string }).to, 'a@b.c');
  assert.equal(await api.enqueueMailJob('contact.form', { email: 'a@b.c' }), 'job-1');
  resetMailSender();
});
