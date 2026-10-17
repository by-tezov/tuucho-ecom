import { config } from '../../../../config/env.js';
import type { PickupPointMap } from '../application/addresses.js';
import { boundedPrintable } from '../../../../utils/fieldLimits.js';

/** Transport-level array parsing shared by saved and guest addresses. */
export function stringArrayField(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === 'string' && entry.length > 0)
    : [];
}

/** Parse the network-keyed pickup-point payload produced by the delivery UI. */
export function pickupPointsField(value: unknown, networkCodes: string[]): PickupPointMap | undefined {
  if (value === undefined) return undefined;
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;

  const pickupPoints: PickupPointMap = {};
  for (const [networkCode, point] of Object.entries(value)) {
    if (!networkCodes.includes(networkCode) || !point || typeof point !== 'object' || Array.isArray(point)) {
      return undefined;
    }
    const candidate = point as Record<string, unknown>;
    const pointId = boundedPrintable(candidate.id, config.fieldLimits.pickupPointIdMax);
    if (!pointId) return undefined;

    const name =
      candidate.name === undefined || candidate.name === null
        ? undefined
        : boundedPrintable(candidate.name, config.fieldLimits.addressLineMax);
    if (candidate.name !== undefined && candidate.name !== null && !name) return undefined;

    let metadata: Record<string, string> | undefined;
    if (candidate.metadata !== undefined) {
      if (
        !candidate.metadata ||
        typeof candidate.metadata !== 'object' ||
        Array.isArray(candidate.metadata)
      ) {
        return undefined;
      }
      const entries = Object.entries(candidate.metadata);
      if (entries.length > config.fieldLimits.pickupMetadataKeysMax) return undefined;
      metadata = {};
      for (const [key, metadataValue] of entries) {
        const metadataKey = boundedPrintable(key, config.fieldLimits.pickupMetadataKeyMax);
        const boundedValue = boundedPrintable(metadataValue, config.fieldLimits.pickupMetadataValueMax);
        if (!metadataKey || !boundedValue) return undefined;
        metadata[metadataKey] = boundedValue;
      }
    }
    pickupPoints[networkCode] = {
      id: pointId,
      ...(name ? { name } : {}),
      ...(metadata ? { metadata } : {}),
    };
  }
  return pickupPoints;
}
