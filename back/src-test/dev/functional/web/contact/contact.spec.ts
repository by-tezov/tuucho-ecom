import { test, expect } from '../../../support/fixtures.js';
import { uniqueEmail } from '../../../support/api.js';
import { testPassword } from '../../../support/env.js';
import { AuthPages } from '../../../support/pages/auth.pages.js';
import { tid } from '../../../support/selectors.js';
import { waitForMail } from '../../../support/mail.js';
import { clickVisible, fillVisible, reveal } from '../../../support/interact.js';
import { findOpenChatSessionFor, replyToChatViaCli } from '../../../support/ops.js';
import { shopPath } from '../../../support/shopPath.js';

test.describe('Functional contact', () => {
  test('anonymous contact form: submits and dumps mail', async ({ page }) => {
    const sinceMs = Date.now() - 500;
    await page.goto(shopPath('/contact'));
    await reveal(page.getByTestId(tid.contact.form));
    await fillVisible(page.getByTestId(tid.contact.email), `contact-ui+${Date.now()}@pamsurin.test`);
    await fillVisible(page.getByTestId(tid.contact.identity), 'E2E Contact');
    await fillVisible(page.getByTestId(tid.contact.message), 'Bonjour Pam, test Patchright.');
    await clickVisible(page.getByTestId(tid.contact.submit));
    await expect(page.getByTestId(tid.contact.success)).toBeVisible();
    await waitForMail({ kind: 'user', sinceMs, timeoutMs: 15_000 });
  });

  test('authenticated Contact: the account chat is used', async ({ page }) => {
    const email = uniqueEmail('ui-contact');
    const auth = new AuthPages(page);
    await auth.registerFromDesktopAccountModal(email, testPassword);
    await page.goto(shopPath('/contact'));
    const chat = page.getByTestId('account-contact-chat');
    const customerMessage = `Message connecté Patchright ${Date.now()}.`;
    const ownerReply = `Réponse opérateur Patchright ${Date.now()}.`;
    await expect(chat).toBeVisible();
    await fillVisible(chat.getByPlaceholder(/écris ton message/i), customerMessage);
    await clickVisible(chat.locator('button[type="submit"]'));
    await expect(chat.getByRole('log').getByText(customerMessage, { exact: true })).toHaveCount(1);

    const sessionId = await findOpenChatSessionFor(email);
    await replyToChatViaCli(sessionId, ownerReply);
    await expect(chat.getByRole('log').getByText(ownerReply, { exact: true })).toBeVisible({
      timeout: 15_000,
    });
    await expect(chat.getByText(/conversation terminée|discussion terminée|lecture seule/i)).toBeVisible({
      timeout: 15_000,
    });
  });
});
