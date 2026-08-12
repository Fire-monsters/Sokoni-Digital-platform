import { z } from "zod";
import {
  deliveryIssueReasons,
  deliveryIssueResolutionCodes,
  deliveryProofImageContract,
  dispatcherDeliveryActions,
} from "@sokoni-digital/domain";

export const riderAvailabilityUpdateSchema = z.object({
  availability: z.enum(["offline", "available"]),
  operationId: z.uuid(),
});

export const riderLocationUpdateSchema = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  accuracyMeters: z.number().positive().max(500),
  capturedAt: z.iso.datetime({ offset: true }),
  operationId: z.uuid(),
});

export const deliveryOfferParamsSchema = z.object({ offerId: z.uuid() });

export const deliveryOfferAcceptanceSchema = z.object({
  expectedDeliveryVersion: z.number().int().positive(),
  operationId: z.uuid(),
});

export const deliveryOfferRejectionSchema = z.object({ operationId: z.uuid() });

export const riderDeliveryParamsSchema = z.object({ deliveryId: z.uuid() });
export const deliveryProofImageParamsSchema = z.object({
  deliveryId: z.uuid(),
  imageId: z.uuid(),
});
export const deliveryIssueParamsSchema = z.object({ issueId: z.uuid() });
export const riderPickupParamsSchema = z.object({
  deliveryId: z.uuid(),
  sellerOrderId: z.uuid(),
});
export const deliveryOperationSchema = z.object({ operationId: z.uuid() });
export const riderDeliveryTransitionSchema = z.object({
  toStatus: z.enum(["arrived_at_market", "picked_up", "in_transit", "arrived_at_customer"]),
  expectedVersion: z.number().int().positive(),
  operationId: z.uuid(),
});

export const deliveryPinConfirmationSchema = z.object({
  pin: z.string().regex(/^[0-9]{6}$/, "Enter the 6-digit delivery PIN."),
  operationId: z.uuid(),
});

const optionalProofLocationSchema = z
  .object({
    latitude: z.number().min(-90).max(90),
    longitude: z.number().min(-180).max(180),
    accuracyMeters: z.number().positive().max(500),
  })
  .nullable()
  .optional();

export const deliveryProofUploadIntentSchema = z.object({
  operationId: z.uuid(),
  mimeType: z.literal(deliveryProofImageContract.mimeType),
  byteSize: z.number().int().positive().max(deliveryProofImageContract.maximumBytes),
  width: z.number().int().positive().max(deliveryProofImageContract.maximumLongEdgePixels),
  height: z.number().int().positive().max(deliveryProofImageContract.maximumLongEdgePixels),
  capturedAt: z.iso.datetime({ offset: true }),
  location: optionalProofLocationSchema,
});

export const deliveryProofUploadCompletionSchema = z.object({
  mimeType: z.literal(deliveryProofImageContract.mimeType),
  byteSize: z.number().int().positive().max(deliveryProofImageContract.maximumBytes),
  width: z.number().int().positive().max(deliveryProofImageContract.maximumLongEdgePixels),
  height: z.number().int().positive().max(deliveryProofImageContract.maximumLongEdgePixels),
});

export const deliveryCompletionSchema = z.object({
  expectedVersion: z.number().int().positive(),
  operationId: z.uuid(),
});

export const deliveryIssueReportSchema = z.object({
  reason: z.enum(deliveryIssueReasons),
  note: z.string().trim().max(500).default(""),
  expectedVersion: z.number().int().positive(),
  operationId: z.uuid(),
});

export const dispatcherAssignmentSchema = z.object({
  transporterId: z.uuid(),
  reason: z.string().trim().min(3).max(500),
  expectedVersion: z.number().int().positive(),
  operationId: z.uuid(),
});

export const deliveryIssueResolutionSchema = z.object({
  resolutionCode: z.enum(deliveryIssueResolutionCodes),
  resolutionNote: z.string().trim().min(3).max(500),
  operationId: z.uuid(),
});

export const dispatcherDeliveryActionSchema = z.object({
  action: z.enum(dispatcherDeliveryActions),
  reason: z.string().trim().min(3).max(500),
  expectedVersion: z.number().int().positive(),
  operationId: z.uuid(),
});

export const dispatcherNearbyRidersQuerySchema = z.object({
  radiusKm: z.coerce.number().positive().max(50).default(10),
});

export type RiderAvailabilityUpdateInput = z.infer<typeof riderAvailabilityUpdateSchema>;
export type RiderLocationUpdateInput = z.infer<typeof riderLocationUpdateSchema>;
export type DeliveryOfferAcceptanceInput = z.infer<typeof deliveryOfferAcceptanceSchema>;
export type RiderDeliveryTransitionInput = z.infer<typeof riderDeliveryTransitionSchema>;
