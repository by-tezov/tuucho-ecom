import { Router } from 'express';
import { accountAppleIdentityRouter } from './accountAppleIdentity.router.js';
import { accountFacebookIdentityRouter } from './accountFacebookIdentity.router.js';
import { accountGoogleIdentityRouter } from './accountGoogleIdentity.router.js';

export const accountSocialIdentityRouter = Router();

accountSocialIdentityRouter.use(accountGoogleIdentityRouter);
accountSocialIdentityRouter.use(accountAppleIdentityRouter);
accountSocialIdentityRouter.use(accountFacebookIdentityRouter);
