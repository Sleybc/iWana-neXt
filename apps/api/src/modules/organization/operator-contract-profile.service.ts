import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { TenantContext, runInTenantSchema } from '@iwana/db';
import {
  AuditAction,
  OperatorContractProfileSchema,
  missingOperatorContractFields,
  type OperatorContractProfile,
  type OperatorContractRequiredField,
  type UpdateOperatorContractProfileInput,
} from '@iwana/shared';
import { DataSource, QueryRunner } from 'typeorm';
import { AuditService } from '../audit/audit.service';
import { OperatorIdentityReadPort } from './ports/operator-identity-read.port';
import type {
  OperatorContractProfileReadPort,
  OperatorContractProfileView,
} from './ports/operator-contract-profile-read.port';

export interface OperatorContractProfileAuditContext {
  userId: string;
  ipAddress?: string | null;
  userAgent?: string | null;
  requestId?: string | null;
}

interface ProfileRow {
  quality_and_coverage_url: string | null;
  customer_service_channels: OperatorContractProfile['customerServiceChannels'];
  reconnection_fee: string | null;
  annual_increase_cap_percent: string | null;
  equipment_incident_report_channel: string | null;
  other_conditions: string | null;
  updated_at: Date | null;
}

type EditableProfile = Omit<OperatorContractProfile, 'legalName' | 'nit' | 'updatedAt'>;

const EMPTY_EDITABLE: EditableProfile = {
  qualityAndCoverageUrl: null,
  customerServiceChannels: [],
  reconnectionFee: null,
  annualIncreaseCapPercent: null,
  equipmentIncidentReportChannel: null,
  otherConditions: null,
};

/**
 * Datos del operador para el contrato (cierre de venta A0, CA-11). Una fila por empresa
 * en `operator_contract_profile`; razón social y NIT vienen del tenant (no se duplican).
 */
@Injectable()
export class OperatorContractProfileService implements OperatorContractProfileReadPort {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly auditService: AuditService,
    private readonly operatorIdentity: OperatorIdentityReadPort,
  ) {}

  async get(): Promise<OperatorContractProfileView> {
    const ctx = TenantContext.getOrThrow();
    const row = await runInTenantSchema(this.dataSource, ctx.schemaName, (qr) =>
      this.readRow(qr, ctx.tenantId),
    );
    return this.toView(ctx.tenantId, row);
  }

  async update(
    input: UpdateOperatorContractProfileInput,
    audit: OperatorContractProfileAuditContext,
  ): Promise<OperatorContractProfileView> {
    const ctx = TenantContext.getOrThrow();
    const { previous, current } = await runInTenantSchema(
      this.dataSource,
      ctx.schemaName,
      async (qr) => {
        const before = await this.readRow(qr, ctx.tenantId, true);
        await qr.query(
          `INSERT INTO operator_contract_profile
             (tenant_id, quality_and_coverage_url, customer_service_channels, reconnection_fee,
              annual_increase_cap_percent, equipment_incident_report_channel, other_conditions,
              updated_at, updated_by)
           VALUES ($1, $2, $3::jsonb, $4, $5, $6, $7, now(), $8)
           ON CONFLICT (tenant_id) DO UPDATE SET
             quality_and_coverage_url = EXCLUDED.quality_and_coverage_url,
             customer_service_channels = EXCLUDED.customer_service_channels,
             reconnection_fee = EXCLUDED.reconnection_fee,
             annual_increase_cap_percent = EXCLUDED.annual_increase_cap_percent,
             equipment_incident_report_channel = EXCLUDED.equipment_incident_report_channel,
             other_conditions = EXCLUDED.other_conditions,
             updated_at = now(),
             updated_by = EXCLUDED.updated_by`,
          [
            ctx.tenantId,
            input.qualityAndCoverageUrl,
            JSON.stringify(input.customerServiceChannels),
            input.reconnectionFee,
            input.annualIncreaseCapPercent,
            input.equipmentIncidentReportChannel,
            input.otherConditions,
            audit.userId,
          ],
        );
        const after = await this.readRow(qr, ctx.tenantId);
        return { previous: before, current: after };
      },
    );

    await this.auditService.log({
      tenantId: ctx.tenantId,
      schemaName: ctx.schemaName,
      userId: audit.userId,
      action: previous ? AuditAction.UPDATE : AuditAction.CREATE,
      entityType: 'operator_contract_profile',
      entityId: ctx.tenantId,
      oldValue: previous ? { ...this.toEditable(previous) } : null,
      newValue: { ...this.toEditable(current) },
      ipAddress: audit.ipAddress ?? null,
      userAgent: audit.userAgent ?? null,
      requestId: audit.requestId ?? null,
    });

    return this.toView(ctx.tenantId, current);
  }

  /** Lectura por tenant explícito para otros módulos (generación del contrato). */
  async getForTenant(tenantId: string, schemaName: string): Promise<OperatorContractProfileView> {
    const row = await runInTenantSchema(this.dataSource, schemaName, (qr) =>
      this.readRow(qr, tenantId),
    );
    return this.toView(tenantId, row);
  }

  private async readRow(
    qr: QueryRunner,
    tenantId: string,
    forUpdate = false,
  ): Promise<ProfileRow | null> {
    const rows = (await qr.query(
      `SELECT quality_and_coverage_url, customer_service_channels, reconnection_fee,
              annual_increase_cap_percent, equipment_incident_report_channel, other_conditions,
              updated_at
         FROM operator_contract_profile WHERE tenant_id = $1${forUpdate ? ' FOR UPDATE' : ''}`,
      [tenantId],
    )) as ProfileRow[];
    return rows[0] ?? null;
  }

  private toEditable(row: ProfileRow | null): EditableProfile {
    if (!row) return { ...EMPTY_EDITABLE };
    return {
      qualityAndCoverageUrl: row.quality_and_coverage_url,
      customerServiceChannels: row.customer_service_channels ?? [],
      reconnectionFee: row.reconnection_fee === null ? null : Number(row.reconnection_fee),
      annualIncreaseCapPercent:
        row.annual_increase_cap_percent === null ? null : Number(row.annual_increase_cap_percent),
      equipmentIncidentReportChannel: row.equipment_incident_report_channel,
      otherConditions: row.other_conditions,
    };
  }

  private async toView(
    tenantId: string,
    row: ProfileRow | null,
  ): Promise<OperatorContractProfileView> {
    const identity = await this.operatorIdentity.getOperatorIdentity(tenantId);
    const profile: OperatorContractProfile = OperatorContractProfileSchema.parse({
      legalName: identity.legalName,
      nit: identity.nit,
      ...this.toEditable(row),
      updatedAt: row?.updated_at ? new Date(row.updated_at).toISOString() : null,
    });
    const missingFields: OperatorContractRequiredField[] = missingOperatorContractFields(profile);
    return { profile, missingFields };
  }
}
