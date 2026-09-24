import type { AdminWorkflowCommand } from "../admin/workflows/index.js";
import type { OrderInvestigationWriter } from "./order-investigation.repository.js";

export class OrderInvestigationService {
  constructor(private readonly repository: OrderInvestigationWriter) {}
  execute<TParams extends { orderId: string }, TInput extends { operationId: string }>(
    action: "notes" | "reveal-contact" | "resend-notification" | "escalate-dispatch" | "cancel",
    command: AdminWorkflowCommand<TParams, TInput>,
    extra: Record<string, unknown> = {},
  ) {
    return this.repository.command(
      command.params.orderId,
      command.actor.userId,
      action,
      {
        ...command.input,
        ...extra,
      },
      command.auditContext,
    );
  }
}
