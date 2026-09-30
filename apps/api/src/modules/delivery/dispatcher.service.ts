import type {
  DeliveryIssueResult,
  DispatcherAssignmentResult,
  DispatcherDeliveryAction,
  DispatcherDeliveryActionResult,
  DispatcherDeliveryBoard,
  DispatcherDeliveryDetail,
  DispatcherRider,
} from "@sokoni-digital/domain";

import type { AdminWorkflowCommand } from "../admin/workflows/index.js";
import {
  SupabaseDeliveryOperationsRepository,
  type DeliveryOperationsRepository,
} from "./delivery-operations.repository.js";
import { DeliveryProofService } from "./delivery-proof.service.js";

interface DeliveryParams {
  deliveryId: string;
}

interface IssueParams {
  issueId: string;
}

interface AssignmentInput {
  transporterId: string;
  reason: string;
  expectedVersion: number;
  operationId: string;
}

interface IssueResolutionInput {
  resolutionCode: string;
  resolutionNote: string;
  reason: string;
  expectedVersion: number;
  operationId: string;
}

interface DeliveryActionInput {
  action: DispatcherDeliveryAction;
  reason: string;
  expectedVersion: number;
  operationId: string;
}

export interface DeliveryEvidenceReader {
  getEvidence(
    userId: string,
    access: "staff",
    deliveryId: string,
  ): Promise<DispatcherDeliveryDetail["evidence"]>;
}

export class DispatcherService {
  constructor(
    private readonly repository: DeliveryOperationsRepository = new SupabaseDeliveryOperationsRepository(),
    private readonly evidenceReader: DeliveryEvidenceReader = new DeliveryProofService(),
  ) {}

  getBoard(): Promise<DispatcherDeliveryBoard> {
    return this.repository.getBoard();
  }

  async getDelivery(staffUserId: string, deliveryId: string): Promise<DispatcherDeliveryDetail> {
    const [detail, evidence] = await Promise.all([
      this.repository.getDelivery(deliveryId),
      this.evidenceReader.getEvidence(staffUserId, "staff", deliveryId),
    ]);
    return { ...detail, evidence };
  }

  getEvidence(staffUserId: string, deliveryId: string) {
    return this.evidenceReader.getEvidence(staffUserId, "staff", deliveryId);
  }

  getRiders(): Promise<DispatcherRider[]> {
    return this.repository.getRiders();
  }

  getNearbyRiders(deliveryId: string, radiusKm: number): Promise<DispatcherRider[]> {
    return this.repository.getNearbyRiders(deliveryId, radiusKm);
  }

  assign(
    reassign: boolean,
    command: AdminWorkflowCommand<DeliveryParams, AssignmentInput>,
  ): Promise<DispatcherAssignmentResult> {
    return this.repository.assign(
      command.actor.userId,
      command.params.deliveryId,
      reassign,
      command.input,
      command.auditContext,
    );
  }

  resolveIssue(
    command: AdminWorkflowCommand<IssueParams, IssueResolutionInput>,
  ): Promise<DeliveryIssueResult> {
    return this.repository.resolveIssue(
      command.actor.userId,
      command.params.issueId,
      command.input,
      command.auditContext,
    );
  }

  performAction(
    command: AdminWorkflowCommand<DeliveryParams, DeliveryActionInput>,
  ): Promise<DispatcherDeliveryActionResult> {
    return this.repository.performAction(
      command.actor.userId,
      command.params.deliveryId,
      command.input,
      command.auditContext,
    );
  }
}
