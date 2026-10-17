export type SignInPrefKey = 'signInGoogleEnabled' | 'signInAppleEnabled' | 'signInFacebookEnabled';

export type SignInVerbosePrefKey =
  | 'signInGoogleVerboseEnabled'
  | 'signInAppleVerboseEnabled'
  | 'signInFacebookVerboseEnabled';

export const SIGN_IN_ROWS: {
  key: SignInPrefKey;
  verboseKey: SignInVerbosePrefKey;
  title: string;
}[] = [
  {
    key: 'signInGoogleEnabled',
    verboseKey: 'signInGoogleVerboseEnabled',
    title: 'Google',
  },
  {
    key: 'signInAppleEnabled',
    verboseKey: 'signInAppleVerboseEnabled',
    title: 'Apple',
  },
  {
    key: 'signInFacebookEnabled',
    verboseKey: 'signInFacebookVerboseEnabled',
    title: 'Facebook',
  },
];
