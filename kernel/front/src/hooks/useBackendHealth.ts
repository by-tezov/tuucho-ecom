import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import {
  checkBackendHealth,
  getBackendStatus,
  subscribeBackendStatus,
  type BackendStatus,
} from '../api/session/backendHealth';

export type { BackendStatus };

/** Backend liveness for Layout gating. Probes /healthz on every pathname
 * change (including first paint). Real API helpers go through `apiFetch`,
 * which awaits /healthz after network/5xx and publishes `down` when
 * confirmed. While down, a recovery timer polls /healthz until the
 * backend returns; idle `up` browsing does not poll. */
export function useBackendHealth(): BackendStatus {
  const location = useLocation();
  const [status, setStatus] = useState<BackendStatus>(getBackendStatus);

  useEffect(() => subscribeBackendStatus(setStatus), []);

  useEffect(() => {
    void checkBackendHealth();
  }, [location.pathname]);

  return status;
}
