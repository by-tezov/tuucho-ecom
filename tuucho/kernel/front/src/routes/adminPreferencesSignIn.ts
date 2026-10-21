export type SignInPrefKey = 'signInGoogleEnabled' | 'signInAppleEnabled' | 'signInFacebookEnabled';

export type SignInVerbosePrefKey =
  | 'signInGoogleVerboseEnabled'
  | 'signInAppleVerboseEnabled'
  | 'signInFacebookVerboseEnabled';

export const SIGN_IN_ROWS: {
  key: SignInPrefKey;
  verboseKey: SignInVerbosePrefKey;
  title: string;
  pluginId: string;
}[] = [
  {
    key: 'signInGoogleEnabled',
    verboseKey: 'signInGoogleVerboseEnabled',
    title: 'Google',
    pluginId: 'tuucho-signin-google',
  },
  {
    key: 'signInAppleEnabled',
    verboseKey: 'signInAppleVerboseEnabled',
    title: 'Apple',
    pluginId: 'tuucho-signin-apple',
  },
  {
    key: 'signInFacebookEnabled',
    verboseKey: 'signInFacebookVerboseEnabled',
    title: 'Facebook',
    pluginId: 'tuucho-signin-facebook',
  },
];
