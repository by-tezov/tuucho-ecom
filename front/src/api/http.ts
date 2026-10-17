import { shopConfig } from '../config/env';
import { checkBackendHealth, getBackendStatus, isSuspiciousBackendHttpStatus } from './session/backendHealth';

/** Thrown when a real API call fails and /healthz confirms the backend is
 * down — Layout swaps to the disrupted page; callers must not surface a
 * generic action error on top. */
export class BackendUnavailableError extends Error {
  constructor() {
    super('backend_unavailable');
    this.name = 'BackendUnavailableError';
  }
}

class ApiRequestTimeoutError extends Error {
  constructor() {
    super('api_request_timeout');
    this.name = 'ApiRequestTimeoutError';
  }
}

export function isBackendUnavailableError(error: unknown): boolean {
  return error instanceof BackendUnavailableError;
}

export function isApiRequestTimeoutError(error: unknown): boolean {
  return error instanceof ApiRequestTimeoutError;
}

/** Single fetch entry-point for pamsurin-back. On network failure or a
 * suspicious HTTP status, awaits /healthz; if the backend is confirmed
 * down, throws BackendUnavailableError so the site-wide notice owns UX. */
export async function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  const url = `${shopConfig.apiBaseUrl}${path}`;
  const controller = new AbortController();
  let timedOut = false;
  const timeout = window.setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, 30_000);
  const forwardAbort = () => controller.abort();
  if (init?.signal) {
    if (init.signal.aborted) controller.abort();
    else init.signal.addEventListener('abort', forwardAbort, { once: true });
  }
  let response: Response;
  try {
    response = await fetch(url, { ...init, signal: controller.signal });
  } catch (error) {
    const status = await checkBackendHealth();
    if (status === 'down' || getBackendStatus() === 'down') {
      throw new BackendUnavailableError();
    }
    if (timedOut) throw new ApiRequestTimeoutError();
    throw error;
  } finally {
    window.clearTimeout(timeout);
    init?.signal?.removeEventListener('abort', forwardAbort);
  }

  if (isSuspiciousBackendHttpStatus(response.status)) {
    const status = await checkBackendHealth();
    if (status === 'down' || getBackendStatus() === 'down') {
      throw new BackendUnavailableError();
    }
  }

  return response;
}

/** Multipart POST with upload progress (XHR). Callers parse JSON / map errors. */
export function apiUploadFormData(
  path: string,
  form: FormData,
  options?: {
    headers?: Record<string, string>;
    onProgress?: (ratio: number) => void;
    timeoutMs?: number;
  },
): Promise<{ status: number; body: unknown }> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${shopConfig.apiBaseUrl}${path}`);
    if (options?.headers) {
      for (const [key, value] of Object.entries(options.headers)) {
        xhr.setRequestHeader(key, value);
      }
    }
    xhr.upload.onprogress = (event) => {
      if (!options?.onProgress || !event.lengthComputable || event.total <= 0) return;
      options.onProgress(Math.min(1, event.loaded / event.total));
    };
    xhr.onload = () => {
      let body: unknown;
      try {
        body = xhr.responseText ? JSON.parse(xhr.responseText) : undefined;
      } catch {
        body = undefined;
      }
      options?.onProgress?.(1);
      resolve({ status: xhr.status, body });
    };
    xhr.onerror = () => {
      void (async () => {
        const status = await checkBackendHealth();
        if (status === 'down' || getBackendStatus() === 'down') {
          reject(new BackendUnavailableError());
          return;
        }
        reject(new TypeError('NetworkError'));
      })();
    };
    xhr.ontimeout = () => {
      reject(new ApiRequestTimeoutError());
    };
    xhr.timeout = options?.timeoutMs ?? 60_000;
    xhr.send(form);
  });
}
