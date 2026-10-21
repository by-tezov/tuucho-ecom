let loadPromise: Promise<void> | null = null;

declare global {
  interface Window {
    fbAsyncInit?: () => void;
    FB?: {
      init: (options: { appId: string; cookie?: boolean; xfbml?: boolean; version: string }) => void;
      login: (
        callback: (response: {
          authResponse?: { accessToken?: string; userID?: string };
          status?: string;
        }) => void,
        options?: {
          scope?: string;
          return_scopes?: boolean;
          fallback_redirect_uri?: string;
        },
      ) => void;
    };
  }
}

/** Loads the Facebook JS SDK once per tab and initializes with appId. */
export function loadFacebookSdk(appId: string): Promise<void> {
  if (window.FB) return Promise.resolve();
  if (loadPromise) return loadPromise;

  loadPromise = new Promise((resolve, reject) => {
    window.fbAsyncInit = () => {
      try {
        window.FB!.init({
          appId,
          cookie: false,
          xfbml: false,
          version: 'v26.0',
        });
        resolve();
      } catch (error) {
        reject(error instanceof Error ? error : new Error('facebook_sdk_init_failed'));
      }
    };

    const existing = document.getElementById('facebook-jssdk');
    if (existing) return;

    const script = document.createElement('script');
    script.id = 'facebook-jssdk';
    script.async = true;
    script.defer = true;
    script.crossOrigin = 'anonymous';
    script.src = 'https://connect.facebook.net/en_US/sdk.js';
    script.onerror = () => reject(new Error('facebook_sdk_load_failed'));
    document.head.appendChild(script);
  });

  return loadPromise;
}
