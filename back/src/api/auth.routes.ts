import { Router } from 'express';
import { authAppleRouter } from '../modules/auth/http/authApple.router.js';
import { authCredentialsRouter } from '../modules/auth/http/authCredentials.router.js';
import { authFacebookRouter } from '../modules/auth/http/authFacebook.router.js';
import { authGoogleRouter } from '../modules/auth/http/authGoogle.router.js';
import { authOtpRouter } from '../modules/auth/http/authOtp.router.js';
import { authRecoveryRouter } from '../modules/auth/http/authRecovery.router.js';
import { authSessionRouter } from '../modules/auth/http/authSession.router.js';
import { authSocialLinkRouter } from '../modules/auth/http/authSocialLink.router.js';

export const authRouter = Router();

authRouter.use(authCredentialsRouter);
authRouter.use(authOtpRouter);
authRouter.use(authSessionRouter);
authRouter.use(authRecoveryRouter);
authRouter.use(authGoogleRouter);
authRouter.use(authFacebookRouter);
authRouter.use(authAppleRouter);
authRouter.use(authSocialLinkRouter);
