import { z } from "zod";

export const orderParams = z.object({ orderId: z.uuid() }).strict();
export const notificationParams = orderParams.extend({ notificationId: z.uuid() });
export const contactParams = orderParams.extend({ target: z.enum(["consumer", "rider"]) });
const operationId = z.uuid();
const reason = z.string().trim().min(3).max(500);
export const noteInput = z
  .object({ operationId, note: z.string().trim().min(3).max(2000) })
  .strict();
export const reasonInput = z.object({ operationId, reason }).strict();
export const escalationInput = reasonInput.extend({
  expectedDeliveryVersion: z.number().int().positive(),
});
