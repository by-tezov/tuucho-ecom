import { test, expect } from '../../dev/support/fixtures.js';
import { uniqueEmail } from '../../dev/support/api.js';
import { testPassword } from '../../dev/support/env.js';
import { AuthPages } from '../../dev/support/pages/auth.pages.js';
import { tid } from '../../dev/support/selectors.js';
import { waitForMail } from '../../dev/support/mail.js';
import { clickVisible, fillVisible, reveal } from '../../dev/support/interact.js';
import { findOpenChatSessionFor, replyToChatViaCli } from '../../dev/support/ops.js';
import { shopPath } from '../../dev/support/shopPath.js';
import { MOBILE } from '../support/criticalPath.js';

test.describe('Preprod mobile contact', () => {
  test('mobile guest contact form: submits and dumps mail', async ({ page }) => {
    await page.setViewportSize(MOBILE);
    const sinceMs = Date.now() - 500;
    const email = uniqueEmail('preprod-contact');
    await page.goto(shopPath('/contact'));
    await reveal(page.getByTestId(tid.contact.form));
    await fillVisible(page.getByTestId(tid.contact.email), email);
    await fillVisible(page.getByTestId(tid.contact.identity), 'Preprod Contact');
    await fillVisible(page.getByTestId(tid.contact.message), 'Bonjour Pam, test preprod.');
    await clickVisible(page.getByTestId(tid.contact.submit));
    await expect(page.getByTestId(tid.contact.success)).toBeVisible();
    const mail = await waitForMail({
      kind: 'user',
      subjectIncludes: 'message de contact',
      sinceMs,
      timeoutMs: 15_000,
    });
    expect(mail.html).toContain(email);
  });

  test('mobile connected Contact: the account chat is used', async ({ page }) => {
    await page.setViewportSize(MOBILE);
    const email = uniqueEmail('preprod-chat');
    const auth = new AuthPages(page);
    await auth.registerFromMobileOrders(email, testPassword);
    await page.goto(shopPath('/contact'));
    const chat = page.getByTestId('account-contact-chat');
    const customerMessage = `Message connecté preprod ${Date.now()}.`;
    const ownerReply = `Réponse opérateur preprod ${Date.now()}.`;
    await expect(chat).toBeVisible();
    await fillVisible(chat.getByPlaceholder(/écris ton message/i), customerMessage);
    await clickVisible(chat.locator('button[type="submit"]'));
    await expect(chat.getByRole('log').getByText(customerMessage, { exact: true })).toHaveCount(1);

    const sessionId = await findOpenChatSessionFor(email);
    await replyToChatViaCli(sessionId, ownerReply);
    await expect(chat.getByRole('log').getByText(ownerReply, { exact: true })).toBeVisible({
      timeout: 15_000,
    });
  });
});
