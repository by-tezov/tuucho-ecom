import { z } from 'zod';
import type { Request } from 'express';

/** Capability-token path param shared by giver/receiver gift routes. */
const giftTokenParamsSchema = z.object({
  token: z.string().trim().min(1),
});

export const giftPinBodySchema = z.object({
  pin: z.unknown(),
});

export const giftAdminOffersQuerySchema = z.object({
  page: z.coerce.number().int().optional(),
  pageSize: z.coerce.number().int().optional(),
});

export const giftAdminEnterParamsSchema = z.object({
  id: z.string().uuid(),
});

export const giftAdminEnterBodySchema = z.object({
  role: z.enum(['giver', 'receiver']),
});

export const giftCreateOfferBodySchema = z.record(z.string(), z.unknown());

export const giftReceiverItemBodySchema = z.object({
  productId: z.unknown(),
  quantity: z.unknown().optional(),
  shapeKey: z.unknown().optional(),
  lengthKey: z.unknown().optional(),
  size: z.unknown().optional(),
  packKey: z.unknown().optional(),
});

export const giftReceiverDestinationBodySchema = z.record(z.string(), z.unknown());

export const giftReceiverConfirmBodySchema = z.object({
  email: z.string().trim().min(1).max(254),
});

export const giftShareCardPatchBodySchema = z.object({
  receiverName: z.unknown(),
  giverComment: z.unknown(),
  shareCardStyle: z.unknown(),
});

export const giftShareCardFormatQuerySchema = z.object({
  format: z.string().optional(),
});

export function parseGiftSchema<T>(schema: z.ZodType<T>, value: unknown): T | undefined {
  const result = schema.safeParse(value);
  return result.success ? result.data : undefined;
}

export function giftPathToken(req: Request): string | undefined {
  const parsed = parseGiftSchema(giftTokenParamsSchema, req.params);
  return parsed?.token;
}
