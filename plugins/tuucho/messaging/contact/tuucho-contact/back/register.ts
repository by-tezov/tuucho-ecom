import type { PluginRegisterFn, SpyChannelDeclaration } from '@tuucho/plugin-sdk';
import { appendSpyChannel, CORE_OPENING_FILTERS } from '@tuucho/plugin-sdk';
import { config } from '@kernel/back/config/env';
import { contactFormRouter } from './src/http/contactForm.router.js';
import { accountChatRouter } from './src/http/accountChat.router.js';
import { adminChatsRouter } from './src/http/adminChats.router.js';
import { adminContactsRouter } from './src/http/adminContacts.router.js';
import { chatOpsRouter } from './src/http/chatOps.router.js';
import * as unconnectedContact from './src/application/unconnectedContact.js';
import * as chat from './src/application/chat.js';
import * as chatSse from './src/application/chatSse.js';
import { listAdminUnconnectedContactsPage } from './src/application/adminContactList.js';
import { listAdminSessionsPage } from './src/application/adminChatList.js';
import './src/application/contactMailJob.js';

const register: PluginRegisterFn = async (api) => {
  api.registerPluginService(api.pluginId, {
    ...unconnectedContact,
    ...chat,
    ...chatSse,
    listAdminUnconnectedContactsPage,
    listAdminSessionsPage,
  });
  api.registerHttpMount({ scope: 'public', path: '/contact', router: contactFormRouter });
  api.registerHttpMount({ scope: 'account', path: '/chat', router: accountChatRouter });
  api.registerHttpMount({ scope: 'admin', path: '/', router: adminChatsRouter });
  api.registerHttpMount({ scope: 'admin', path: '/', router: adminContactsRouter });
  api.registerHttpMount({ scope: 'operation', path: '/chat', router: chatOpsRouter });
  api.addFilter(CORE_OPENING_FILTERS.mailSpyChannels, (channels: SpyChannelDeclaration[]) => {
    const withInbound = appendSpyChannel(channels, {
      id: 'contact.inbound',
      pluginId: api.pluginId,
      title: 'Contact inbound',
      description: 'Owner copy of a guest or contact-form message.',
      filters: ['role', 'email'],
    });
    return appendSpyChannel(withInbound, {
      id: 'contact.chat',
      pluginId: api.pluginId,
      title: 'Chat owner notify',
      description: 'Staff copy of signed-in chat messages.',
      filters: ['role', 'email'],
    });
  });
  api.addFilter(CORE_OPENING_FILTERS.seoSitemap, (entries: Array<{ loc?: string; source?: string }>) => {
    const origin = config.frontendBaseUrl.replace(/\/+$/, '');
    return [...entries, { loc: `${origin}/contact`, source: api.pluginId }];
  });
};

export { register };
export default register;
