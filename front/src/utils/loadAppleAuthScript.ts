let loadPromise: Promise<void> | null = null;

declare global {
  interface Window {
    AppleID?: {
      auth: {
        init: (config: {
          clientId: string;
          scope: string;
          redirectURI: string;
          state?: string;
          nonce?: string;
          usePopup?: boolean;
        }) => void;
        signIn: (config?: {
          clientId?: string;
          scope?: string;
          redirectURI?: string;
          state?: string;
          nonce?: string;
          usePopup?: boolean;
        }) => Promise<{
          authorization: {
            code: string;
            id_token: string;
            state?: string;
          };
          user?: {
            email?: string;
            name?: {
              firstName?: string;
              lastName?: string;
            };
          };
        }>;
      };
    };
  }
}

/** Loads Apple's Sign in with Apple JS SDK once per tab. */
export function loadAppleAuthScript(): Promise<void> {
  if (window.AppleID?.auth) return Promise.resolve();
  if (loadPromise) return loadPromise;
  loadPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://appleid.cdn-apple.com/appleauth/static/jsapi/appleid/1/en_US/appleid.auth.js';
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('apple_auth_load_failed'));
    document.head.appendChild(script);
  });
  return loadPromise;
}
