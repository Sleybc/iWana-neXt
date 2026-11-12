import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { runInTenantSchema, TenantContext } from '@iwana/db';
import {
  AuditAction,
  BillingFirstChargeResultSchema,
  type BillingFirstChargeResult,
  type BillingGenerationSummary,
} from '@iwana/shared';
import { DataSource } from 'typeorm';
import { AuditService } from '../../audit/audit.service';
import { SettingsPriorityTenantReadPort } from '../../tenant/ports/settings-priority-tenant-read.port';
import { BillingContractFirstChargePort } from '../ports/billing-contract-first-charge.port';
import { BillingContractReadPort } from '../ports/billing-contract-read.port';
import { BillingGenerationService, localDateFor } from './billing-generation.service';

function addSummary(target: BillingGenerationSummary, source: BillingGenerationSummary): void {
  for (const key of Object.keys(target) as Array<keyof BillingGenerationSummary>) {
    target[key] += source[key] ?? 0;
  }
}

function emptySummary(): BillingGenerationSummary {
  return {
    generated: 0,
    failed: 0,
    notDue: 0,
    existing: 0,
    omittedImpersonation: 0,
    omittedTermination: 0,
    blocked: 0,
    withoutCycle: 0,
    unbilledAdditionalDocuments: 0,
  };
}

/**
 * «Generar primer cobro» de un contrato ACTIVE sin periodos (spec 2026-11-11 R3-R5, R7, R8).
 *
 * 1. Ancla: fecha civil de activación que entrega CRM por su puerto (evento de activación,
 *    `start_date` o `status_changed_at`, en ese orden).
 * 2. R4 y R7: mientras el contrato no tenga documentos fuera de BORRADOR, CRM congela antes el
 *    `installation_fee` vigente del plan si es NULL y los datos fiscales que falten.
 * 3. Primer cobro por la ruta `firstChargeFrom` de ADR-109 (con la línea de instalación).
 * 4. Puesta al día: genera cada periodo posterior cuya generación ya llegó, hasta el vigente.
 * 5. Con periodos previos, regulariza sus borradores: desbloquea SIN_DATOS_FISCALES (R7) y
 *    corrige vencimientos pasados (R8), sin tocar documentos emitidos.
 *
 * Idempotente: el primer cobro devuelve `existing` si ya hay periodos, la puesta al día no
 * regenera periodos existentes y los congelamientos no tocan valores presentes. No toca
 * `automatic_generation` (R6).
 */
@Injectable()
export class BillingFirstChargeService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly contracts: BillingContractReadPort,
    private readonly firstChargePort: BillingContractFirstChargePort,
    private readonly generation: BillingGenerationService,
    private readonly tenantSettings: SettingsPriorityTenantReadPort,
    private readonly audit: AuditService,
  ) {}

  async generateFirstCharge(input: {
    contractId: string;
    actorId: string;
    /** Fecha civil del tenant para pruebas; en la API siempre es hoy en la zona del tenant. */
    date?: string;
  }): Promise<BillingFirstChargeResult> {
    const { contractId, actorId } = input;
    const { tenantId, schemaName } = TenantContext.getOrThrow();
    const anchor = await this.firstChargePort.findActivationAnchor(contractId);
    if (!anchor) {
      throw new NotFoundException({
        code: 'CONTRACT_NOT_FOUND',
        message: 'No se encontró el contrato.',
      });
    }
    if (anchor.status !== 'ACTIVE') {
      throw new ConflictException({
        code: 'CONTRACT_NOT_ACTIVE',
        message: 'Solo se genera el primer cobro de un contrato activo.',
      });
    }
    const localDate =
      input.date ??
      localDateFor(new Date(), (await this.tenantSettings.getSnapshot({ tenantId })).timezone);

    const summary = emptySummary();
    let installationFee: BillingFirstChargeResult['installationFee'] = {
      outcome: 'NOT_APPLICABLE',
      amount: null,
    };
    let fiscalData: BillingFirstChargeResult['fiscalData'] = {
      outcome: 'NOT_APPLICABLE',
      frozenFields: [],
      missingFields: [],
    };
    let anchorDate: string | null = null;
    let anchorSource: BillingFirstChargeResult['anchorSource'] = null;

    const hadPeriods = await this.generation.hasAnyPeriod(contractId);
    if (!hadPeriods && (!anchor.date || !anchor.source)) {
      throw new UnprocessableEntityException({
        code: 'ACTIVATION_DATE_UNKNOWN',
        message: 'No se pudo determinar la fecha de activación del contrato.',
      });
    }
    // R4/R7 antes de generar; con periodos previos solo si nada salió aún de BORRADOR.
    if (!hadPeriods || (await this.generation.onlyDraftDocuments(contractId))) {
      installationFee = await this.firstChargePort.freezeInstallationFeeIfMissing(
        contractId,
        actorId,
      );
      fiscalData = await this.firstChargePort.freezeFiscalDataIfMissing(contractId, actorId);
    }

    if (hadPeriods) {
      summary.existing += 1;
    } else if (anchor.date && anchor.source) {
      anchorDate = anchor.date;
      anchorSource = anchor.source;
      addSummary(
        summary,
        await this.generation.generate({
          contractId,
          date: localDate,
          firstChargeFrom: anchor.date,
          actorId,
        }),
      );
    }

    const cycle = await this.contracts.findBillingCycleByContractId(contractId);
    if (cycle?.cycleDay) {
      const pending = await this.generation.pendingCatchUpPeriods(
        contractId,
        cycle.cycleDay,
        localDate,
      );
      for (const periodStart of pending) {
        const partial = await this.generation.generate({
          contractId,
          date: localDate,
          targetPeriodStart: periodStart,
          actorId,
        });
        addSummary(summary, partial);
        // Un periodo fallido corta la puesta al día: repetir la acción continúa desde ahí.
        if (partial.failed > 0) break;
      }
    }

    const regularizedDrafts = hadPeriods
      ? await this.generation.regularizeDrafts(contractId, actorId)
      : { unblocked: 0, rescheduled: 0 };

    const result = BillingFirstChargeResultSchema.parse({
      contractId,
      anchorDate,
      anchorSource,
      installationFee,
      fiscalData,
      summary,
      regularizedDrafts,
    });
    await runInTenantSchema(this.dataSource, schemaName, (qr) =>
      this.audit.logWithin(
        {
          action: AuditAction.CREATE,
          entityType: 'BillingFirstCharge',
          entityId: contractId,
          userId: actorId,
          newValue: {
            anchorDate,
            anchorSource,
            installationFee: installationFee.outcome,
            fiscalFieldsFrozen: fiscalData.frozenFields,
            summary,
            regularizedDrafts,
          },
        },
        qr.manager,
      ),
    );
    return result;
  }
}
