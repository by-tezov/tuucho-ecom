import { useCallback, useEffect, useRef, useState } from 'react';
import { acquireGalleryImage } from '../utils/galleryImageGate';

const AUTO_ATTEMPTS = 3;

export type GatedGalleryImageStatus = 'queued' | 'loading' | 'loaded' | 'unavailable';

interface ImageRequest {
  identity: string;
  attempt: number;
  generation: number;
}

function retrySource(source: string, token: string): string {
  const url = new URL(source, window.location.href);
  url.searchParams.set('__gallery_retry', token);
  return url.toString();
}

function sourceForAttempt(
  primaryUrl: string,
  fallbackUrl: string | undefined,
  attempt: number,
  generation: number,
): string {
  // First use the immutable thumbnail URL as provided. A transient failure
  // gets one cache-bypassing retry, then the independently served modal file
  // is the last automatic fallback. The modal is larger, so it is never the
  // eager/default request.
  const source = attempt >= 2 && fallbackUrl ? fallbackUrl : primaryUrl;
  if (attempt === 0 && generation === 0) return source;
  return retrySource(source, `${generation}-${attempt}`);
}

/**
 * Acquires a gallery download slot and keeps failed thumbnails recoverable.
 * Nothing broken is ever left painted: callers show their loading surface
 * until `loaded`, while a real error retries the small image once and then
 * falls back to the modal image. After the bounded automatic attempts, the
 * returned `retry` starts a fresh cache-bypassing cycle.
 *
 * A gate timeout is local recovery, not a global outage verdict: it advances
 * this card to its next source while freeing capacity for the queue.
 */
export function useGatedGalleryImage(
  primaryUrl: string | undefined,
  fallbackUrl?: string | undefined,
): {
  src: string | undefined;
  status: GatedGalleryImageStatus;
  onLoad: () => void;
  onError: () => void;
  retry: () => void;
} {
  const identity = `${primaryUrl ?? ''}\u0000${fallbackUrl ?? ''}`;
  const [request, setRequest] = useState<ImageRequest>(() => ({
    identity,
    attempt: 0,
    generation: 0,
  }));
  const [src, setSrc] = useState<string | undefined>(undefined);
  const [status, setStatus] = useState<GatedGalleryImageStatus>('queued');
  const settleRef = useRef<{ load: () => void; error: () => void } | null>(null);
  const identityRef = useRef(identity);
  identityRef.current = identity;

  useEffect(() => {
    if (request.identity !== identity) {
      settleRef.current = null;
      setSrc(undefined);
      setStatus(primaryUrl ? 'queued' : 'unavailable');
      setRequest({ identity, attempt: 0, generation: 0 });
      return;
    }
    if (!primaryUrl) {
      settleRef.current = null;
      setSrc(undefined);
      setStatus('unavailable');
      return;
    }

    const controller = new AbortController();
    let release: (() => void) | null = null;
    let active = true;
    let recoverTimedOutRequest: () => void = () => undefined;
    const candidate = sourceForAttempt(primaryUrl, fallbackUrl, request.attempt, request.generation);

    settleRef.current = null;
    setSrc(undefined);
    setStatus('queued');

    void acquireGalleryImage(candidate, {
      signal: controller.signal,
      onTimeout: () => recoverTimedOutRequest(),
    })
      .then((lease) => {
        if (!active || controller.signal.aborted) {
          lease.release();
          return;
        }

        release = lease.release;
        let settled = false;
        const settle = (result: 'load' | 'error') => {
          if (settled || !active) return;
          settled = true;
          release?.();
          release = null;

          if (result === 'load') {
            setStatus('loaded');
            return;
          }

          setSrc(undefined);
          if (request.attempt + 1 < AUTO_ATTEMPTS) {
            setStatus('queued');
            setRequest((current) =>
              current.identity === identity &&
              current.attempt === request.attempt &&
              current.generation === request.generation
                ? { ...current, attempt: current.attempt + 1 }
                : current,
            );
          } else {
            setStatus('unavailable');
          }
        };

        settleRef.current = {
          load: () => settle('load'),
          error: () => settle('error'),
        };
        recoverTimedOutRequest = () => settle('error');
        setStatus('loading');
        setSrc(lease.src);
      })
      .catch(() => {
        // Aborting a queued request is normal when virtualization recycles a
        // row or a visitor changes shape/photo before its slot is granted.
      });

    return () => {
      active = false;
      controller.abort();
      release?.();
      release = null;
      recoverTimedOutRequest = () => undefined;
      settleRef.current = null;
    };
  }, [fallbackUrl, identity, primaryUrl, request]);

  const onLoad = useCallback(() => settleRef.current?.load(), []);
  const onError = useCallback(() => settleRef.current?.error(), []);
  const retry = useCallback(() => {
    const currentIdentity = identityRef.current;
    setSrc(undefined);
    setStatus('queued');
    setRequest((current) => ({
      identity: currentIdentity,
      attempt: 0,
      generation: current.identity === currentIdentity ? current.generation + 1 : 1,
    }));
  }, []);

  return { src, status, onLoad, onError, retry };
}
