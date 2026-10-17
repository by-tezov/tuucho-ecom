import { test, expect } from 'patchright/test';
import { apiJson, registerUser } from '../../support/api.js';

test.describe('API account profile', () => {
  test('set name and phone: require fields on later edit path', async ({ request }) => {
    const { accessToken } = await registerUser(request);

    const { body: updated } = await apiJson(request, 'PATCH', '/account/profile', {
      token: accessToken,
      data: { firstName: 'Ada', lastName: 'Lovelace', phone: '+33601020304' },
      expectedStatus: 200,
    });
    const user = (updated as { user: { firstName: string; lastName: string; phone: string } }).user;
    expect(user.firstName).toBe('Ada');
    expect(user.lastName).toBe('Lovelace');
    expect(user.phone).toBeTruthy();

    const { body: profile } = await apiJson(request, 'GET', '/account/profile', {
      token: accessToken,
      expectedStatus: 200,
    });
    expect((profile as { user: { firstName: string } }).user.firstName).toBe('Ada');
  });

  test('password change: it requires an unlock', async ({ request }) => {
    const { accessToken, password } = await registerUser(request);
    const { body: unlock } = await apiJson<{ unlockToken?: string }>(request, 'POST', '/account/unlock', {
      token: accessToken,
      data: { action: 'password', currentPassword: password },
      expectedStatus: 200,
    });
    const unlockToken = unlock.unlockToken;
    expect(unlockToken).toBeTruthy();
    const newPassword = 'E2eChanged2!';
    await apiJson(request, 'POST', '/account/change-password', {
      token: accessToken,
      data: { unlockToken, newPassword },
      expectedStatus: 200,
    });
  });
});
