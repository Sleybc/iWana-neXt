import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager } from 'typeorm';
import { TenantContext, runInTenantSchema } from '@iwana/db';
import {
  AuditAction,
  type ContractPermanence,
  type CustomerSegment,
  type PlanPermanenceOffer,
} from '@iwana/shared';
import { AuditService } from '../../audit/audit.service';
import { PlanPermanenceOfferReadPort } from '../../commercial/ports/plan-permanence-offer-read.port';
import { ContractStatus } from '../enums/contract-status.enum';
import { Subscriber } from '../subscribers/entities/subscriber.entity';
import { Contract } from './entities/contract.entity';
import { ContractPermanenceRecord } from './entities/contract-permanence.entity';
import {
  NO_PERMANENCE,
  computePermanenceEndDate,
  computePermanenceSchedule,
  shiftPermanenceEndDate,
} from './utils/permanence-schedule.util';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;

/** Vista de lectura: permanencia del contrato y oferta vigente del plan. */
export interface ContractPermanenceView {
  /**
   * Forma de ContractPermanence. Con la permanencia aceptada y el contrato aún sin activar,
   * startDate y endDate van en null hasta la activación.
   */
  permanence: ContractPermanence;
  /**
   * Oferta actual del plan del contrato para su segmento; null si el plan no está en el catálogo.
   * `installationFee` es el congelado en el contrato si lo tiene; si no, el vigente.
   */
  planOffer: PlanPermanenceOffer | null;
}

export function toContractPermanence(record: ContractPermanenceRecord | null): ContractPermanence {
  if (!record || !record.accepted) return { ...NO_PERMANENCE, schedule: [] };
  const amount = record.discountedAmount === null ? null : Number(record.discountedAmount);
  return {
    accepted: true,
    months: record.months,
    connectionFee: record.connectionFee === null ? null : Number(record.connectionFee),
    discountedOrDeferredAmount: amount,
    startDate: record.startDate,
    endDate: record.endDate,
    schedule:
      record.months !== null && amount !== null
        ? computePermanenceSchedule(amount, record.months)
        : [],
  };
}

function summarize(permanence: ContractPermanence): Record<string, unknown> {
  return {
    accepted: permanence.accepted,
    months: permanence.months,
    connectionFee: permanence.connectionFee,
    discountedOrDeferredAmount: permanence.discountedOrDeferredAmount,
    startDate: permanence.startDate,
    endDate: permanence.endDate,
  };
}

/**
 * Permanencia mínima del contrato (cierre de venta, bloque H; CA-13).
 * - Editable solo con el contrato en DRAFT; rechazarla (accepted=false) siempre es posible.
 * - Meses y valor salen de la oferta del plan (MOD06, por puerto), nunca del cliente.
 * - El cargo es el `installation_fee` congelado en el contrato (fase 2, D1/CA-6); en contratos
 *   heredados sin él, el vigente del plan y segmento. El valor descontado no lo supera.
 * - Inicio = fecha de activación (`applyActivationDate`); el fin se corre con la suspensión
 *   voluntaria (`shiftForVoluntarySuspension`). Se exponen para el flujo de activación y el
 *   ciclo de vida, que las cablean en su bloque.
 */
@Injectable()
export class ContractPermanenceService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly planOfferPort: PlanPermanenceOfferReadPort,
    private readonly auditService: AuditService,
  ) {}

  async get(contractId: string): Promise<ContractPermanenceView> {
    const { schemaName, tenantId } = TenantContext.getOrThrow();
    return runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      const contract = await this.findContract(qr.manager, tenantId, contractId, false);
      const record = await qr.manager.findOne(ContractPermanenceRecord, {
        where: { contractId, tenantId },
      });
      const planOffer = await this.readOffer(contract, qr.manager);
      return { permanence: toContractPermanence(record), planOffer };
    });
  }

  async set(
    contractId: string,
    accepted: boolean,
    actorId: string,
  ): Promise<ContractPermanenceView> {
    const { schemaName, tenantId } = TenantContext.getOrThrow();
    return runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      const manager = qr.manager;
      const contract = await this.findContract(manager, tenantId, contractId, true);
      if (contract.status !== ContractStatus.DRAFT) {
        throw new ConflictException({
          code: 'CONTRACT_NOT_DRAFT',
          message: 'La permanencia solo se edita mientras el contrato está en borrador.',
        });
      }
      const planOffer = await this.readOffer(contract, manager);
      if (accepted && (!planOffer || !planOffer.offersPermanence)) {
        throw new ConflictException({
          code: 'PLAN_WITHOUT_PERMANENCE',
          message: 'El plan del contrato no ofrece permanencia.',
        });
      }
      if (accepted && planOffer) {
        if (planOffer.installationFee === null) {
          throw new ConflictException({
            code: 'CONTRACT_INSTALLATION_FEE_REQUIRED',
            message: 'El contrato no tiene un cargo de instalación para aplicar la permanencia.',
          });
        }
        if ((planOffer.discountedOrDeferredAmount ?? 0) > planOffer.installationFee) {
          throw new ConflictException({
            code: 'PERMANENCE_EXCEEDS_INSTALLATION_FEE',
            message: 'El valor descontado supera el cargo de instalación del contrato.',
          });
        }
      }

      const existing = await manager.findOne(ContractPermanenceRecord, {
        where: { contractId, tenantId },
      });
      const offer = accepted ? planOffer : null;
      const record = manager.create(ContractPermanenceRecord, {
        contractId,
        tenantId,
        accepted,
        months: offer?.months ?? null,
        connectionFee: offer?.installationFee != null ? offer.installationFee.toFixed(2) : null,
        discountedAmount:
          offer?.discountedOrDeferredAmount != null
            ? offer.discountedOrDeferredAmount.toFixed(2)
            : null,
        startDate: null,
        endDate: null,
        voluntarySuspensionDays: 0,
        createdBy: existing?.createdBy ?? actorId,
        updatedBy: actorId,
      });
      const saved = await manager.save(ContractPermanenceRecord, record);
      const permanence = toContractPermanence(saved);

      await this.auditService.logWithin(
        {
          action: existing ? AuditAction.UPDATE : AuditAction.CREATE,
          entityType: 'ContractPermanence',
          entityId: contractId,
          userId: actorId,
          oldValue: existing ? summarize(toContractPermanence(existing)) : null,
          newValue: summarize(permanence),
        },
        manager,
      );
      return { permanence, planOffer };
    });
  }

  /**
   * Fija inicio (= fecha de activación) y fin (inicio + N meses) dentro de la transacción de
   * activación. Sin permanencia aceptada o ya fijada, no cambia nada.
   */
  async applyActivationDate(
    manager: EntityManager,
    contractId: string,
    activationDate: string,
  ): Promise<ContractPermanence> {
    const { tenantId } = TenantContext.getOrThrow();
    const record = await manager.findOne(ContractPermanenceRecord, {
      where: { contractId, tenantId },
      lock: { mode: 'pessimistic_write' },
    });
    if (!record || !record.accepted || record.months === null || record.startDate !== null) {
      return toContractPermanence(record);
    }
    record.startDate = activationDate;
    record.endDate = computePermanenceEndDate(activationDate, record.months);
    return toContractPermanence(await manager.save(ContractPermanenceRecord, record));
  }

  /** Corre el fin por `suspendedDays` de suspensión voluntaria. Sin fin fijado, no cambia nada. */
  async shiftForVoluntarySuspension(
    manager: EntityManager,
    contractId: string,
    suspendedDays: number,
  ): Promise<ContractPermanence> {
    const { tenantId } = TenantContext.getOrThrow();
    const record = await manager.findOne(ContractPermanenceRecord, {
      where: { contractId, tenantId },
      lock: { mode: 'pessimistic_write' },
    });
    if (!record || !record.accepted || record.endDate === null || suspendedDays === 0) {
      return toContractPermanence(record);
    }
    record.endDate = shiftPermanenceEndDate(record.endDate, suspendedDays);
    record.voluntarySuspensionDays += suspendedDays;
    return toContractPermanence(await manager.save(ContractPermanenceRecord, record));
  }

  private async findContract(
    manager: EntityManager,
    tenantId: string,
    contractId: string,
    lock: boolean,
  ): Promise<ContractForPermanence> {
    const contract = await manager.findOne(Contract, {
      where: { id: contractId, tenantId },
      select: {
        id: true,
        status: true,
        planId: true,
        subscriberId: true,
        customerSegment: true,
        installationFee: true,
      },
      ...(lock ? { lock: { mode: 'pessimistic_write' as const } } : {}),
    });
    if (!contract) throw new NotFoundException(`Contrato ${contractId} no encontrado`);
    return contract;
  }

  private async readOffer(
    contract: ContractForPermanence,
    manager: EntityManager,
  ): Promise<PlanPermanenceOffer | null> {
    if (!UUID_PATTERN.test(contract.planId)) return null;
    const segment = contract.customerSegment ?? (await this.subscriberSegment(manager, contract));
    const offer = await this.planOfferPort.getOffer(contract.planId, { manager, segment });
    if (!offer || contract.installationFee === null) return offer;
    return { ...offer, installationFee: contract.installationFee };
  }

  private async subscriberSegment(
    manager: EntityManager,
    contract: ContractForPermanence,
  ): Promise<CustomerSegment | null> {
    const subscriber = await manager.findOne(Subscriber, {
      where: { id: contract.subscriberId },
      select: { id: true, customerSegment: true },
    });
    return subscriber?.customerSegment ?? null;
  }
}

type ContractForPermanence = Pick<
  Contract,
  'id' | 'status' | 'planId' | 'subscriberId' | 'customerSegment' | 'installationFee'
>;
