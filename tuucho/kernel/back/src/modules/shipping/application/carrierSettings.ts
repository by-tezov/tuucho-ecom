import { getCachedPluginSecret, getCachedPluginSettings } from '../../plugins/application/pluginStore.js';
import { parseDurationMs } from '../../../utils/duration.js';

const CARRIER_PLUGIN = 'tuucho-shipping-mondial-relay';

function str(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function duration(value: unknown, fallback: string): number {
  const raw = str(value) ?? fallback;
  return parseDurationMs(raw) ?? parseDurationMs(fallback) ?? 0;
}

/** Public settings + secrets for the Mondial Relay shipping plugin. Kernel
 * label/tracking shells read this instead of kernel JSON. */
export function carrierLabelSettings() {
  const settings = getCachedPluginSettings(CARRIER_PLUGIN);
  const secret = (key: string) => getCachedPluginSecret(CARRIER_PLUGIN, key);
  return {
    api2Url: str(settings.api2Url),
    api2Enseigne: secret('api2Enseigne'),
    api2Login: secret('api2Login'),
    api2Password: secret('api2Password'),
    pointCourierCode: str(settings.pointCourierCode) ?? 'mondial-relay-point',
    pointNetworkCode: str(settings.pointNetworkCode) ?? 'mondial-relay-point',
    pointDeliveryMode: str(settings.pointDeliveryMode) ?? '24R',
    homeCourierCode: str(settings.homeCourierCode) ?? 'mondial-relay-home',
    homeNetworkCode: str(settings.homeNetworkCode) ?? 'home',
    homeDeliveryMode: str(settings.homeDeliveryMode) ?? 'HOM',
    homeCollectionMode: str(settings.homeCollectionMode) ?? 'REL',
    collectionMode: str(settings.collectionMode) ?? 'REL',
    senderName: str(settings.senderName),
    senderLine1: str(settings.senderLine1),
    senderPostalCode: str(settings.senderPostalCode),
    senderCity: str(settings.senderCity),
    senderCountryCode: str(settings.senderCountryCode),
    senderPhone: str(settings.senderPhone),
    senderEmail: str(settings.senderEmail),
    api1Url: str(settings.api1Url),
    api1Enseigne: secret('api1Enseigne'),
    api1PrivateKey: secret('api1PrivateKey'),
    publicTrackingUrl: str(settings.publicTrackingUrl),
    trackingThrottleMs: duration(settings.trackingThrottle, '1.5s'),
    trackingTimeoutMs: duration(settings.trackingTimeout, '30s'),
    brand: str(settings.brand) ?? 'BDTEST13',
  };
}
