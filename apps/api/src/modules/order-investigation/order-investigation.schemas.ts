import { z } from "zod";
import { operationMetadataShape } from "@sokoni-digital/validation/admin-mutation";

export const orderParams = z.object({ orderId: z.uuid() }).strict();
export const notificationParams = orderParams.extend({ notificationId: z.uuid() });
export const contactParams = orderParams.extend({ target: z.enum(["consumer", "rider"]) });
export const noteInput = z
  .object({ ...operationMetadataShape, note: z.string().trim().min(3).max(2000) })
  .strict();
export const reasonInput = z.object(operationMetadataShape).strict();
export const escalationInput = reasonInput.extend({
  expectedDeliveryVersion: z.number().int().positive(),
});
