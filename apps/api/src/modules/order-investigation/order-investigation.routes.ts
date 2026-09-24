import { Router } from "express";
import { authenticate } from "../../middleware/authenticate.js";
import { createAdminWorkflowRoute } from "../admin/workflows/index.js";
import {
  SupabaseOrderInvestigationRepository,
  type OrderInvestigationWriter,
} from "./order-investigation.repository.js";
import { OrderInvestigationService } from "./order-investigation.service.js";
import {
  contactParams,
  escalationInput,
  noteInput,
  notificationParams,
  orderParams,
  reasonInput,
} from "./order-investigation.schemas.js";

export function createOrderInvestigationRouter(
  repository: OrderInvestigationWriter = new SupabaseOrderInvestigationRepository(),
) {
  const router = Router();
  const service = new OrderInvestigationService(repository);
  router.use(authenticate);
  router.use((_request, response, next) => {
    response.setHeader("Cache-Control", "no-store");
    next();
  });
  router.post(
    "/orders/:orderId/notes",
    ...createAdminWorkflowRoute({
      operation: "orders.notes.add",
      permission: "orders.support",
      paramsSchema: orderParams,
      bodySchema: noteInput,
      execute: (command) => service.execute("notes", command),
    }),
  );
  router.post(
    "/orders/:orderId/contact/:target/reveal",
    ...createAdminWorkflowRoute({
      operation: "orders.contact.reveal",
      permission: "orders.support",
      paramsSchema: contactParams,
      bodySchema: reasonInput,
      execute: (command) =>
        service.execute("reveal-contact", command, { target: command.params.target }),
    }),
  );
  router.post(
    "/orders/:orderId/notifications/:notificationId/resend",
    ...createAdminWorkflowRoute({
      operation: "orders.notification.resend",
      permission: "notifications.manage",
      paramsSchema: notificationParams,
      bodySchema: reasonInput,
      execute: (command) =>
        service.execute("resend-notification", command, {
          notificationId: command.params.notificationId,
        }),
    }),
  );
  router.post(
    "/orders/:orderId/escalate-dispatch",
    ...createAdminWorkflowRoute({
      operation: "orders.dispatch.escalate",
      permission: "orders.support",
      paramsSchema: orderParams,
      bodySchema: escalationInput,
      execute: (command) => service.execute("escalate-dispatch", command),
    }),
  );
  router.post(
    "/orders/:orderId/cancel",
    ...createAdminWorkflowRoute({
      operation: "orders.cancel",
      permission: "orders.support",
      paramsSchema: orderParams,
      bodySchema: reasonInput,
      execute: (command) => service.execute("cancel", command),
    }),
  );
  return router;
}
