import type { ApplicationAction } from "@sokoni-digital/domain";
import type { z } from "zod";
import type { AdminWorkflowCommand } from "../admin/workflows/index.js";
import type { ApplicationReviewRepository } from "./applications.repository.js";
import type { reviewInput } from "./applications.schemas.js";

export class ApplicationReviewService {
  constructor(private readonly repository: ApplicationReviewRepository) {}
  get(id: string) {
    return this.repository.get(id);
  }
  execute(
    action: ApplicationAction,
    command: AdminWorkflowCommand<{ applicationId: string }, z.output<typeof reviewInput>>,
  ) {
    return this.repository.review(
      command.params.applicationId,
      command.actor.userId,
      action,
      command.input,
      command.auditContext,
    );
  }
}
