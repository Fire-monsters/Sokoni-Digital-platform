import { z } from "zod";

export const operationReasonSchema = z
  .string()
  .trim()
  .min(5, "Explain the operational reason in at least 5 characters.")
  .max(500, "The operational reason must be 500 characters or fewer.");

export const operationMetadataShape = {
  reason: operationReasonSchema,
  expectedVersion: z.number().int().min(0),
  operationId: z.uuid(),
} as const;

/**
 * Shared control metadata for every sensitive administrative mutation.
 * Parse this independently at the HTTP boundary, then compose the shape into
 * operation-specific schemas when their inferred TypeScript type needs it.
 */
export const controlledMutationSchema = z.object(operationMetadataShape);

export type ControlledMutationInput = z.infer<typeof controlledMutationSchema>;
