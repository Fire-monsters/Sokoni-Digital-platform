import type { RequestHandler } from "express";
import type { OperationsPublicAction } from "@sokoni-digital/domain";
import { sendError } from "../../http/responses.js";
import { requirePublicAction } from "./public-workspace-allowlist.js";
import { StaffAuthorizationRepository, type StaffAuthorizationReader } from "../staff/staff-authorization.repository.js";

const routes: [string, RegExp, OperationsPublicAction][] = [
  ["GET", /^\/applications(?:\/[^/]+)?$/, "application.review"],
  ["POST", /^\/applications\/[^/]+\/(start-review|approve|reject|request-changes|notes)$/, "application.review"],
  ["GET", /^\/listings(?:\/[^/]+)?$/, "catalogue.approve"],
  ["POST", /^\/listings\/[^/]+\/(approve|request-changes|notes)$/, "catalogue.approve"],
  ["GET", /^\/listings\/[^/]+\/notes$/, "catalogue.approve"],
  ["GET", /^\/price-requests(?:\/[^/]+\/notes)?$/, "price.review"],
  ["POST", /^\/price-requests\/[^/]+\/(approve|reject|notes)$/, "price.review"],
  ["GET", /^\/(deliveries(?:\/[^/]+(?:\/evidence)?)?|delivery-riders)$/, "delivery.assign"],
  ["POST", /^\/deliveries\/[^/]+\/(assign-rider|reassign-rider|actions|notes)$/, "delivery.assign"],
  ["GET", /^\/deliveries\/[^/]+\/notes$/, "delivery.assign"],
  ["POST", /^\/delivery-issues\/[^/]+\/resolve$/, "delivery.assign"],
  ["GET", /^\/orders(?:\/[^/]+(?:\/investigations)?)?$/, "order.investigate"],
  ["POST", /^\/orders\/[^/]+\/(notes|investigations(?:\/(?:notes|resolve))?)$/, "order.investigate"],
  ["GET", /^\/payments(?:\/reconciliation|\/[^/]+(?:\/records)?)$/, "payment.record"],
  ["POST", /^\/payments\/[^/]+\/(flag-investigation|records)$/, "payment.record"],
  ["GET", /^\/refunds$/, "refund.request"],
  ["POST", /^\/payments\/[^/]+\/request-refund$/, "refund.request"],
  ["GET", /^\/audit-events(?:\/[^/]+)?$/, "order.investigate"],
];
export const operationsRouteAllowlist: RequestHandler = (request, response, next) => {
  if (/\/reconcile$|\/reconciliation\/run$|\/notifications\/.*\/resend$|\/execute$|\/nearby-riders$/.test(request.path)) {
    response.status(503).json({ success: false, error: { code: "UNAVAILABLE", message: "External execution is not enabled.", requestId: request.requestId, retryable: false } });
    return;
  }
  const body: unknown = request.body;
  const action = body && typeof body === "object" && "action" in body ? body.action : undefined;
  if (request.method === "POST" && /^\/deliveries\/[^/]+\/actions$/.test(request.path) && (typeof action !== "string" || !["CANCEL_ASSIGNMENT", "MARK_CUSTOMER_UNAVAILABLE"].includes(action))) {
    sendError(request, response, 403, "ACTION_NOT_AVAILABLE", "This delivery action is not available in the Operations workspace."); return;
  }
  const route = routes.find(([method, path]) => method === request.method && path.test(request.path));
  if (!route) { sendError(request, response, 403, "ACTION_NOT_AVAILABLE", "This action is not available in the Operations workspace."); return; }
  requirePublicAction(route[2])(request, response, next);
};
/** Only mounted below requirePublicWorkspace; never replaces staff authentication elsewhere. */
export function operationsStaff(reader: StaffAuthorizationReader = new StaffAuthorizationRepository()): RequestHandler {
  return async (request, response, next) => {
    try {
      const context = request.publicWorkspace;
      if (context?.kind !== "operations") { sendError(request, response, 403, "FORBIDDEN", "Operations context required."); return; }
      const staff = await reader.findByUserId(context.actorId);
      if (staff?.status !== "active") { sendError(request, response, 503, "PUBLIC_WORKSPACE_MISCONFIGURED", "Operations actor is unavailable."); return; }
      request.auth = { userId: staff.userId, roles: [], staff };
      next();
    } catch (error) { next(error); }
  };
}
