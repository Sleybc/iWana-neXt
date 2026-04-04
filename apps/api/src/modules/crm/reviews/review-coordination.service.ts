import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { runInTenantSchema, TenantContext } from '@iwana/db';
import { AuditAction } from '@iwana/shared';
import { AuditService } from '../../audit/audit.service';
import { ExecutionPolicyReadPort } from '../ports/execution-policy-read.port';
import { ExpansionRequestPort } from '../ports/expansion-request.port';
import { ProspectCase } from '../prospects/entities/prospect-case.entity';
import { ProspectCaseStatus } from '../enums/prospect-case-status.enum';
import { SendToReviewDto } from '../prospects/dto/send-to-review.dto';
import { ReviewDecisionDto } from './dto/review-decision.dto';
import { ReviewResponseDto } from './dto/review-response.dto';

@Injectable()
export class ReviewCoordinationService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly expansionRequestPort: ExpansionRequestPort,
    private readonly executionPolicyReadPort: ExecutionPolicyReadPort,
    private readonly auditService: AuditService,
  ) {}

  async sendToReview(prospectId: string, dto: SendToReviewDto): Promise<ReviewResponseDto> {
    const { tenantId, schemaName } = TenantContext.getOrThrow();

    return runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      const prospect = await qr.manager.findOne(ProspectCase, { where: { id: prospectId } });
      if (!prospect) {
        throw new NotFoundException(`Prospecto ${prospectId} no encontrado.`);
      }

      const policy = await this.executionPolicyReadPort.resolvePolicy(tenantId, schemaName);
      const expansion = await this.expansionRequestPort.createRequest({
        tenantId,
        schemaName,
        prospectId,
        cause: dto.cause,
        ticketId: prospect.ticketId ?? 'pending-ticket',
        workOrderId: prospect.workOrderId ?? 'pending-work-order',
      });

      prospect.status = ProspectCaseStatus.IN_REVIEW;
      prospect.expansionRequestId = expansion.expansionRequestId;
      prospect.executionPolicyRef = policy.ref;
      const saved = await qr.manager.save(ProspectCase, prospect);

      await this.auditService.log({
        action: AuditAction.UPDATE,
        entityType: 'ProspectCase',
        entityId: saved.id,
        newValue: {
          status: saved.status,
          expansionRequestId: saved.expansionRequestId,
          executionPolicyRef: saved.executionPolicyRef,
        },
      });

      return {
        id: saved.id,
        status: saved.status,
        expansionRequestId: saved.expansionRequestId,
        executionPolicyRef: saved.executionPolicyRef,
      };
    });
  }

  async applyReviewDecision(reviewId: string, dto: ReviewDecisionDto): Promise<ReviewResponseDto> {
    const { tenantId, schemaName } = TenantContext.getOrThrow();

    return runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      const prospect = await qr.manager.findOne(ProspectCase, { where: { id: reviewId } });
      if (!prospect) {
        throw new NotFoundException(`Revision ${reviewId} no encontrada.`);
      }

      const policy = await this.executionPolicyReadPort.resolvePolicy(tenantId, schemaName);
      prospect.status = dto.approved
        ? ProspectCaseStatus.INSTALLATION_SCHEDULED
        : ProspectCaseStatus.NOT_VIABLE;
      prospect.executionPolicyRef = policy.ref;
      const saved = await qr.manager.save(ProspectCase, prospect);

      await this.auditService.log({
        action: AuditAction.UPDATE,
        entityType: 'ProspectCase',
        entityId: saved.id,
        newValue: {
          status: saved.status,
          executionPolicyRef: saved.executionPolicyRef,
          reviewNotes: dto.notes,
        },
      });

      return {
        id: saved.id,
        status: saved.status,
        expansionRequestId: saved.expansionRequestId,
        executionPolicyRef: saved.executionPolicyRef,
      };
    });
  }
}
