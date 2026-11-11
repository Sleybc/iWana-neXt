import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
  UnprocessableEntityException,
  Inject,
  Optional,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager, FindOptionsSelect, In, QueryRunner } from 'typeorm';
import { MediaUsage, TenantContext, runInTenantSchema } from '@iwana/db';
import {
  AuditAction,
  PersonType,
  SubscriberStatus,
  ServiceUsage,
  computeCutoffDate,
  computeNextCutoffDate,
  type InternetVatResult,
  type ListResponse,
  type BillingCycle,
  type BillingCycleOption,
  type ActivateContractInput,
  type ContractActivationSource,
  type ContractPlanChangeInput,
  type ContractPlanTaxSnapshot,
  type CustomerSegment,
  type CutoffAgendaQuery,
  type CutoffAgendaResponse,
  type CutoffAgendaItem,
  type SubscriberListItem,
  type PrivacyMark,
  type LifecycleAction,
  type LifecyclePreviewRequest,
  type LifecyclePreviewResponse,
  type LifecycleReactivateCommand,
  type LifecycleSuspendCommand,
  type LifecycleTerminateCommand,
  type ContractAutoCreationIssue,
  type ContractAutoCreationMissingField,
  CONTRACT_AUTO_CREATION_MISSING_FIELDS,
} from '@iwana/shared';
import { buildPageMeta, clampLimit } from '../../../common/pagination';
import { clampPage } from '../../../common/pagination/clamp-page';
import { Contract } from './entities/contract.entity';
import { ContractPermanenceRecord } from './entities/contract-permanence.entity';
import { titularAnonymizedConflict } from '../subscribers/guards/titular-anonymized-conflict';
import { projectSubscriberForList } from '../subscribers/subscriber-projection';
import { ContractsTenantSettingsReadPort } from './ports/contracts-tenant-settings-read.port';
import { BillingAccountReadPort } from '../../billing/ports/billing-account-read.port';
import { getTenantLocalDate } from './billing-cycle-date.util';
import { appendContractActivatedEvent } from './contract-activation-events';
import { CreateContractDto } from './dto/create-contract.dto';
import { UpdateContractDto } from './dto/update-contract.dto';
import { CreateContractFromExpedienteDto } from './dto/create-contract-from-expediente.dto';
import { UpdateServicePointDto } from './dto/update-service-point.dto';
import {
  CONTRACT_PLAN_ID_MAX_LENGTH,
  normalizeContractPlanId,
} from './utils/contract-plan-id.util';
import { ContractStatus } from '../enums/contract-status.enum';
import { ExpedienteRecord } from '../expedientes/entities/expediente-record.entity';
import { Subscriber } from '../subscribers/entities/subscriber.entity';
import { IInternetVatResolverPort } from '../../taxation/ports/internet-vat-resolver.port';
import {
  CommercialCatalogReadPort,
  type CommercialItemSnapshot,
} from '../../commercial/ports/commercial-catalog-read.port';
import { AuditService } from '../../audit/audit.service';
import type { AuditEntryInput } from '../../audit/interfaces/audit-entry.interface';
import { MediaService } from '../../media/media.service';
import { IPrivacyAuthorizationReadPort } from '../../privacy/ports/privacy-authorization-read.port';
import { IPrivacyMarksReadPort } from '../../privacy/ports/privacy-marks-read.port';
import { SubscriberFiscalCompletenessService } from '../subscribers/subscriber-fiscal-completeness.service';
import { SubscriberLifecycleService } from '../subscribers/subscriber-lifecycle.service';
import type { LifecycleCommandResponse } from '../subscribers/subscriber-lifecycle.service';
import {
  createFiscalDocumentCrypto,
  hydrateFiscalDocument,
  prepareFiscalDocumentForSave,
  setFiscalDocumentStorage,
  type FiscalDocumentCrypto,
} from '../../../common/crypto/fiscal-document.util';
import {
  hydrateContractFiscalDocuments,
  projectContractsForRead,
} from './contract-read-projection';

/** Transiciones de estado permitidas según máquina de estados del spec. */
interface ActivationOptions {
  /** Origen del evento crm.contract.activated si la transición sale de DRAFT. */
  activationSource?: ContractActivationSource;
  /** 409 CONTRACT_NOT_DRAFT si el contrato no está en DRAFT. */
  requireDraft?: boolean;
  /** Fecha de inicio (start_date) y de inicio de cobro. */
  startDate?: string;
  manualReason?: string;
  within?: (manager: EntityManager, contract: Contract) => Promise<void>;
}

const ALLOWED_TRANSITIONS: Record<ContractStatus, ContractStatus[]> = {
  [ContractStatus.DRAFT]: [ContractStatus.ACTIVE],
  [ContractStatus.ACTIVE]: [ContractStatus.SUSPENDED, ContractStatus.TERMINATED],
  [ContractStatus.SUSPENDED]: [
    ContractStatus.ACTIVE,
    ContractStatus.TERMINATED,
    ContractStatus.ARCHIVED,
  ],
  [ContractStatus.TERMINATED]: [ContractStatus.ARCHIVED],
  [ContractStatus.ARCHIVED]: [],
};

const AUDITABLE_CONTRACT_UPDATE_FIELDS = new Set([
  'alias',
  'quoteId',
  'installationAddress',
  'installationCity',
  'installationDepartment',
  'installationPostalCode',
  'customerSegment',
  'serviceUsage',
  'installationStratum',
  'additionalProductIds',
  'additionalServiceIds',
  'paymentMethod',
  'billingCycle',
  'billingCycleDay',
  'fiscalName',
  'fiscalDocument',
  'fiscalAddress',
  'startDate',
  'endDate',
  'planSnapshotJson',
]);

const CONTRACT_PLAN_UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;

export type ContractAutoCreationOutcome =
  | { outcome: 'CREATED'; contract: Contract }
  | { outcome: 'EXISTING'; contract: null }
  | { outcome: 'MISSING_DATA'; contract: null; issue: ContractAutoCreationIssue };

/**
 * Uso del servicio derivado (ADR-093, misma regla que el backfill de la migración 144):
 * RESIDENTIAL solo si la persona es NATURAL y el segmento RESIDENTIAL; NON_RESIDENTIAL en otro
 * caso. Sin tipo de persona o sin segmento no se deriva (null).
 */
export function deriveServiceUsage(
  personType: PersonType | null | undefined,
  segment: CustomerSegment | null | undefined,
): ServiceUsage | null {
  if (!personType || !segment) return null;
  return personType === PersonType.NATURAL && segment === ('RESIDENTIAL' as CustomerSegment)
    ? ServiceUsage.RESIDENTIAL
    : ServiceUsage.NON_RESIDENTIAL;
}

function sortMissingFields(
  missing: ContractAutoCreationMissingField[],
): ContractAutoCreationMissingField[] {
  const unique = new Set(missing);
  return CONTRACT_AUTO_CREATION_MISSING_FIELDS.filter((field) => unique.has(field));
}

function isUniqueViolation(error: unknown): boolean {
  const candidate = error as { code?: string; driverError?: { code?: string } };
  return candidate?.code === '23505' || candidate?.driverError?.code === '23505';
}

function round2Money(value: number): number {
  return Math.round(value * 100) / 100;
}

@Injectable()
export class ContractsService {
  private readonly logger = new Logger(ContractsService.name);
  private readonly fiscalDocumentCrypto: FiscalDocumentCrypto;

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly commercialCatalogPort: CommercialCatalogReadPort,
    private readonly internetVatResolver: IInternetVatResolverPort,
    private readonly auditService: AuditService,
    private readonly mediaService: MediaService,
    private readonly configService: ConfigService,
    private readonly subscriberFiscalCompletenessService: SubscriberFiscalCompletenessService,
    private readonly subscriberLifecycleService: SubscriberLifecycleService,
    @Optional()
    @Inject(IPrivacyAuthorizationReadPort)
    private readonly privacyAuthorizationReadPort?: IPrivacyAuthorizationReadPort,
    @Optional()
    @Inject(IPrivacyMarksReadPort)
    private readonly privacyMarksReadPort?: IPrivacyMarksReadPort,
    @Optional()
    @Inject(ContractsTenantSettingsReadPort)
    private readonly tenantSettingsReadPort?: ContractsTenantSettingsReadPort,
    @Optional()
    @Inject(BillingAccountReadPort)
    private readonly billingAccountReadPort?: BillingAccountReadPort,
  ) {
    this.fiscalDocumentCrypto = createFiscalDocumentCrypto(this.configService);
  }

  // ── Creación ────────────────────────────────────────────────────────────────

  async create(dto: CreateContractDto, actorId?: string): Promise<Contract> {
    const { schemaName, tenantId } = TenantContext.getOrThrow();
    const planId = this._requirePlanId(
      dto.planId,
      `El plan del contrato debe tener entre 1 y ${CONTRACT_PLAN_ID_MAX_LENGTH} caracteres.`,
    );

    const created = await runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      const subscriber = await this.lockSubscriberForContractCreation(
        qr,
        dto.subscriberId,
        tenantId,
        {
          id: true,
          tenantId: true,
          status: true,
          personType: true,
          partyId: true,
          anonymizedAt: true,
          vatResponsibility: true,
          rutResponsibilities: true,
          nit: true,
          nitVerificationDigit: true,
          legalRepresentativePartyId: true,
          customerSegment: true,
        },
      );
      await this.assertSubscriberNotBlocked(
        subscriber.partyId,
        subscriber.anonymizedAt,
        qr.manager,
      );
      if (dto.billingCycleDay !== undefined) {
        await this.assertActiveBillingCycle(qr, dto.billingCycleDay);
      }
      if (subscriber.status === SubscriberStatus.CANCELLED) {
        throw this.cancelledSubscriberConflict();
      }
      await this.requireContractualAuthorization(subscriber.partyId, qr.manager);
      this.subscriberFiscalCompletenessService.assertComplete(subscriber);

      const installationStratum = dto.installationStratum ?? null;
      const serviceUsage = dto.serviceUsage ?? null;
      if (serviceUsage === ServiceUsage.RESIDENTIAL) {
        this._validateServicePoint(serviceUsage, installationStratum, subscriber.personType);
      }

      const alias =
        dto.alias?.trim() || this._buildAlias(dto.installationCity, dto.installationAddress);

      const entity = qr.manager.create(Contract, {
        tenantId,
        quoteId: dto.quoteId ?? null,
        subscriberId: dto.subscriberId,
        planId,
        planSnapshotJson: dto.planSnapshotJson,
        status: ContractStatus.DRAFT,
        alias,
        installationAddress: dto.installationAddress ?? null,
        installationCity: dto.installationCity ?? null,
        installationDepartment: dto.installationDepartment ?? null,
        installationPostalCode: dto.installationPostalCode ?? null,
        installationNotes: dto.installationNotes ?? null,
        customerSegment: dto.customerSegment ?? null,
        serviceUsage,
        installationStratum,
        stratumEvidenceMediaId: null,
        vatSnapshot: null,
        additionalProductIds: dto.additionalProductIds ?? [],
        additionalServiceIds: dto.additionalServiceIds ?? [],
        paymentMethod: dto.paymentMethod ?? null,
        billingCycle: dto.billingCycle ?? null,
        billingCycleDay: dto.billingCycleDay ?? null,
        installationFee: await this.resolveInstallationFee(
          qr.manager,
          planId,
          dto.customerSegment ?? subscriber.customerSegment ?? null,
        ),
        fiscalName: dto.fiscalName ?? null,
        fiscalDocument: null,
        fiscalAddress: dto.fiscalAddress ?? null,
        startDate: dto.startDate ?? null,
        endDate: dto.endDate ?? null,
      });
      setFiscalDocumentStorage(entity, dto.fiscalDocument, this.fiscalDocumentCrypto);

      this.advanceContractVersion(entity);
      const saved = await qr.manager.save(Contract, entity);
      await this.clearAutoCreationIssue(qr, dto.subscriberId, tenantId);
      return this.projectContractForMutation(saved, qr.manager);
    });
    await this.auditService.log({
      action: AuditAction.CREATE,
      entityType: 'Contract',
      entityId: created.id,
      userId: actorId ?? null,
      newValue: {
        subscriberId: created.subscriberId,
        planId: created.planId,
        status: created.status,
        billingCycleDay: created.billingCycleDay,
      },
    });
    return created;
  }

  /**
   * Crea un contrato en estado DRAFT a partir del interés comercial registrado
   * en el expediente de origen del subscriber.
   */
  async createFromExpediente(
    subscriberId: string,
    dto: CreateContractFromExpedienteDto,
    actorId?: string,
  ): Promise<Contract> {
    const result = await this.createFromExpedienteInternal(subscriberId, dto, actorId, null);
    if (result.outcome !== 'CREATED') {
      // Sin modo automático la creación manual nunca se omite: o crea o lanza.
      throw new ConflictException('No se pudo crear el contrato desde el expediente.');
    }
    return result.contract;
  }

  /**
   * Contrato automático al pasar la oportunidad a «lista para instalación» (fase 2, bloque A;
   * D3, CA-1 a CA-3). Reutiliza la creación desde el expediente con estas diferencias:
   * - Idempotente por expediente: si el suscriptor ya tiene un contrato vivo (automático o creado
   *   a mano) no crea otro; el índice único `uq_contracts_source_expediente` cubre la carrera.
   * - El ciclo sale de la oportunidad (`billing_cycle` con un día activo); si no lo tiene, el
   *   borrador se crea sin ciclo (`billingCycleMissing`) y la firma lo exige.
   * - Si falta otro dato obligatorio, no crea: guarda el aviso en el suscriptor y lo devuelve.
   */
  async createAutomaticFromExpediente(
    subscriberId: string,
    expedienteId: string,
    actorId: string,
  ): Promise<ContractAutoCreationOutcome> {
    try {
      return await this.createFromExpedienteInternal(subscriberId, { expedienteId }, actorId, {
        expedienteId,
      });
    } catch (error) {
      if (isUniqueViolation(error)) return { outcome: 'EXISTING', contract: null };
      throw error;
    }
  }

  private async createFromExpedienteInternal(
    subscriberId: string,
    dto: CreateContractFromExpedienteDto,
    actorId: string | undefined,
    automatic: { expedienteId: string } | null,
  ): Promise<ContractAutoCreationOutcome> {
    const { schemaName, tenantId } = TenantContext.getOrThrow();

    const result = await runInTenantSchema<ContractAutoCreationOutcome>(
      this.dataSource,
      schemaName,
      async (qr) => {
        // Verificar que el subscriber existe en el tenant
        const subscriber = await this.lockSubscriberForContractCreation(
          qr,
          subscriberId,
          tenantId,
          {
            id: true,
            tenantId: true,
            status: true,
            personType: true,
            partyId: true,
            anonymizedAt: true,
            vatResponsibility: true,
            rutResponsibilities: true,
            nit: true,
            nitVerificationDigit: true,
            legalRepresentativePartyId: true,
            expedienteId: true,
            address: true,
            city: true,
            department: true,
            postalCode: true,
            customerSegment: true,
            stratum: true,
          },
        );
        await this.assertSubscriberNotBlocked(
          subscriber.partyId,
          subscriber.anonymizedAt,
          qr.manager,
        );
        if (dto.billingCycleDay !== undefined) {
          await this.assertActiveBillingCycle(qr, dto.billingCycleDay);
        }
        if (subscriber.status === SubscriberStatus.CANCELLED) {
          throw this.cancelledSubscriberConflict();
        }
        if (automatic) {
          // Bajo el bloqueo del suscriptor: un contrato vivo (automático o manual) basta.
          const [existing] = (await qr.query(
            `SELECT id FROM contracts
            WHERE subscriber_id = $1 AND tenant_id = $2 AND deleted_at IS NULL
            LIMIT 1`,
            [subscriberId, tenantId],
          )) as Array<{ id: string }>;
          if (existing) return { outcome: 'EXISTING', contract: null };
        } else {
          await this.requireContractualAuthorization(subscriber.partyId, qr.manager);
          this.subscriberFiscalCompletenessService.assertComplete(subscriber);
        }

        // Resolver el expediente: usar el del DTO si viene, o el del subscriber
        const expedienteId = dto.expedienteId ?? subscriber.expedienteId ?? null;
        if (!expedienteId) {
          throw new BadRequestException(
            'El suscriptor no tiene expediente de origen y no se proporcionó un expedienteId.',
          );
        }

        const expediente = await qr.manager.findOne(ExpedienteRecord, {
          where: { id: expedienteId },
        });
        if (!expediente) {
          throw new NotFoundException(`Expediente ${expedienteId} no encontrado.`);
        }
        await this.hydrateExpedienteFiscalDocument(qr.manager, expediente);
        const normalizedPlanId = normalizeContractPlanId(expediente.interestedPlanId);
        const planId = automatic
          ? normalizedPlanId
          : this._requirePlanId(
              expediente.interestedPlanId,
              'El expediente no tiene un plan de interés registrado. Crea el contrato de forma directa.',
            );

        // Dirección de instalación: prioridad DTO → expediente → subscriber
        const installationAddress =
          dto.installationAddress ?? expediente.address ?? subscriber.address;
        const installationCity =
          dto.installationCity ?? expediente.municipality ?? subscriber.city ?? null;
        const installationDepartment =
          dto.installationDepartment ?? expediente.department ?? subscriber.department ?? null;
        const installationPostalCode =
          dto.installationPostalCode ?? expediente.postalCode ?? subscriber.postalCode ?? null;

        const expedienteAddress = expediente.address?.trim() ?? '';
        const subscriberAddress = subscriber.address?.trim() ?? '';
        const resolvedInstallationAddress = installationAddress?.trim() ?? '';
        const sameInstallationPoint =
          expedienteAddress.length > 0 && expedienteAddress === resolvedInstallationAddress;
        const subscriberInstallationPoint =
          subscriberAddress.length > 0 && subscriberAddress === resolvedInstallationAddress;
        const subscriberStratum = subscriberInstallationPoint ? (subscriber.stratum ?? null) : null;
        const installationStratum =
          dto.installationStratum !== undefined
            ? dto.installationStratum
            : sameInstallationPoint
              ? (expediente.stratum ?? subscriberStratum)
              : subscriberStratum;

        const customerSegment =
          dto.customerSegment ?? expediente.customerSegment ?? subscriber.customerSegment ?? null;
        // Uso del servicio: lo declarado o, si no, la regla de ADR-093 (backfill de la 144).
        // Un uso RESIDENTIAL derivado sin estrato del punto no se deriva: queda como faltante
        // (automático) o sin uso hasta la firma (manual), nunca un residencial inválido.
        const derivedUsage = deriveServiceUsage(subscriber.personType, customerSegment);
        const serviceUsage =
          dto.serviceUsage ??
          (derivedUsage === ServiceUsage.RESIDENTIAL && installationStratum == null
            ? null
            : derivedUsage);
        if (serviceUsage === ServiceUsage.RESIDENTIAL) {
          this._validateServicePoint(serviceUsage, installationStratum, subscriber.personType);
        }

        const planSnapshot = planId
          ? await this.loadExpedientePlanSnapshot(qr.manager, planId, customerSegment)
          : null;

        let automaticCycleDay: number | null = null;
        if (automatic) {
          const missing = await this.collectAutomaticCreationMissing(
            qr.manager,
            subscriber,
            expediente,
          );
          if (planId && !planSnapshot) missing.push('PLAN');
          if (!serviceUsage) missing.push('SERVICE_USAGE');
          if (missing.length > 0) {
            const issue: ContractAutoCreationIssue = {
              reason: 'MISSING_DATA',
              missing: sortMissingFields(missing),
              detectedAt: new Date().toISOString(),
            };
            await qr.query(
              `UPDATE subscribers SET contract_auto_creation_issue = $3::jsonb
              WHERE id = $1 AND tenant_id = $2`,
              [subscriberId, tenantId, JSON.stringify(issue)],
            );
            return { outcome: 'MISSING_DATA', contract: null, issue };
          }
          automaticCycleDay = await this.resolveExpedienteCycleDay(qr, expediente.billingCycle);
        }
        if (!planId || !planSnapshot) {
          throw new UnprocessableEntityException({
            code: 'PLAN_PRICE_REQUIRED',
            message:
              'El plan de la oportunidad no está disponible o no tiene una tarifa vigente para el segmento del servicio.',
          });
        }

        const alias = dto.alias?.trim() || this._buildAlias(installationCity, installationAddress);

        const entity = qr.manager.create(Contract, {
          tenantId,
          quoteId: null,
          subscriberId,
          planId,
          planSnapshotJson: {
            ...planSnapshot,
            snapshotAt: planSnapshot.snapshotAt.toISOString(),
          },
          status: ContractStatus.DRAFT,
          alias,
          installationAddress: installationAddress ?? null,
          installationCity: installationCity ?? null,
          installationDepartment: installationDepartment ?? null,
          installationPostalCode: installationPostalCode ?? null,
          installationNotes: dto.installationNotes ?? null,
          customerSegment,
          serviceUsage,
          installationStratum,
          stratumEvidenceMediaId: null,
          vatSnapshot: null,
          additionalProductIds: (expediente.additionalProductIds as string[]) ?? [],
          additionalServiceIds: (expediente.additionalServiceIds as string[]) ?? [],
          paymentMethod: dto.paymentMethod ?? expediente.paymentMethod ?? null,
          billingCycle: dto.billingCycle ?? expediente.billingCycle ?? null,
          billingCycleDay: dto.billingCycleDay ?? automaticCycleDay,
          sourceExpedienteId: automatic?.expedienteId ?? null,
          installationFee:
            Number.isFinite(planSnapshot.installationFee) && planSnapshot.installationFee >= 0
              ? round2Money(planSnapshot.installationFee)
              : null,
          fiscalName: expediente.fiscalName ?? null,
          fiscalDocument: null,
          fiscalAddress: null,
          startDate: null,
          endDate: null,
        });
        setFiscalDocumentStorage(entity, expediente.fiscalDocument, this.fiscalDocumentCrypto);

        this.advanceContractVersion(entity);
        const saved = await qr.manager.save(Contract, entity);
        await this.clearAutoCreationIssue(qr, subscriberId, tenantId);
        return {
          outcome: 'CREATED',
          contract: await this.projectContractForMutation(saved, qr.manager),
        };
      },
    );
    if (result.outcome !== 'CREATED') return result;
    const created = result.contract;
    await this.auditService.log({
      action: AuditAction.CREATE,
      entityType: 'Contract',
      entityId: created.id,
      userId: actorId ?? null,
      newValue: {
        subscriberId: created.subscriberId,
        planId: created.planId,
        status: created.status,
        billingCycleDay: created.billingCycleDay,
        ...(automatic
          ? { source: 'AUTOMATIC_FROM_EXPEDIENTE', expedienteId: automatic.expedienteId }
          : {}),
      },
    });
    return result;
  }

  /**
   * Datos obligatorios del contrato automático (CA-3), todos a la vez para que el aviso diga
   * qué falta: plan de la oportunidad, dirección del punto de servicio, autorización
   * `TRATAMIENTO_CONTRACTUAL` vigente y datos fiscales del titular.
   */
  private async collectAutomaticCreationMissing(
    manager: EntityManager,
    subscriber: Subscriber,
    expediente: ExpedienteRecord,
  ): Promise<ContractAutoCreationMissingField[]> {
    const missing: ContractAutoCreationMissingField[] = [];
    if (!normalizeContractPlanId(expediente.interestedPlanId)) missing.push('PLAN');
    const address = (expediente.address ?? subscriber.address ?? '').trim();
    if (!address) missing.push('INSTALLATION_ADDRESS');
    if (!(await this.hasContractualAuthorization(subscriber.partyId, manager))) {
      missing.push('CONTRACTUAL_AUTHORIZATION');
    }
    missing.push(...this.subscriberFiscalCompletenessService.evaluate(subscriber).missing);
    return missing;
  }

  private async hasContractualAuthorization(
    partyId: string | null,
    manager: EntityManager,
  ): Promise<boolean> {
    try {
      await this.requireContractualAuthorization(partyId, manager);
      return true;
    } catch (error) {
      if (error instanceof UnprocessableEntityException) return false;
      throw error;
    }
  }

  /**
   * Ciclo de la oportunidad: `expediente_records.billing_cycle` es texto libre heredado; solo
   * se toma si es un día (1-28) con ciclo activo. Si no, el borrador queda sin ciclo (D3).
   */
  private async resolveExpedienteCycleDay(
    qr: QueryRunner,
    billingCycle: string | null,
  ): Promise<number | null> {
    const match = /^\s*(\d{1,2})\s*$/u.exec(billingCycle ?? '');
    if (!match) return null;
    const day = Number(match[1]);
    if (day < 1 || day > 28) return null;
    const rows = (await qr.query(
      `SELECT cycle_day FROM crm_billing_cycles WHERE cycle_day = $1 AND active = true`,
      [day],
    )) as Array<{ cycle_day: number }>;
    return rows.length > 0 ? day : null;
  }

  /** El aviso del contrato automático se limpia al crear cualquier contrato del suscriptor. */
  private async clearAutoCreationIssue(
    qr: QueryRunner,
    subscriberId: string,
    tenantId: string,
  ): Promise<void> {
    await qr.query(
      `UPDATE subscribers SET contract_auto_creation_issue = NULL
        WHERE id = $1 AND tenant_id = $2 AND contract_auto_creation_issue IS NOT NULL`,
      [subscriberId, tenantId],
    );
  }

  // ── Consulta ────────────────────────────────────────────────────────────────

  async findAll(
    filters: {
      status?: ContractStatus;
      planId?: string;
      page?: number;
      limit?: number;
    },
    canSeeBlocked = false,
    actorId?: string,
  ): Promise<ListResponse<Contract>> {
    const { schemaName } = TenantContext.getOrThrow();
    const cappedLimit = clampLimit(filters.limit);
    const { page, limit } = clampPage(filters.page ?? 1, cappedLimit);

    const result = await runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      const qb = qr.manager
        .createQueryBuilder(Contract, 'c')
        .orderBy('c.createdAt', 'DESC')
        .addOrderBy('c.id', 'DESC')
        .skip((page - 1) * limit)
        .take(limit);

      if (filters.status) {
        qb.andWhere('c.status = :status', { status: filters.status });
      }
      if (filters.planId) {
        qb.andWhere('c.planId = :planId', { planId: filters.planId });
      }

      const [data, total] = await qb.getManyAndCount();
      const projection = await this.projectContractsForRead(qr.manager, data, canSeeBlocked);
      return {
        data: projection.data,
        blockedServed: projection.blockedServed,
        meta: buildPageMeta({
          total,
          page,
          limit,
          randomAccess: true,
          sortableFields: [],
        }),
      };
    });
    await this.logBlockedContractListAccess(actorId, canSeeBlocked, result);
    return { data: result.data, meta: result.meta };
  }

  async findAllBySubscriber(
    subscriberId: string,
    filters: { page?: number; limit?: number } = {},
    canSeeBlocked = false,
    actorId?: string,
  ): Promise<ListResponse<Contract>> {
    const { schemaName } = TenantContext.getOrThrow();
    const cappedLimit = clampLimit(filters.limit);
    const { page, limit } = clampPage(filters.page ?? 1, cappedLimit);

    const result = await runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      const [data, total] = await qr.manager
        .createQueryBuilder(Contract, 'c')
        .where('c.subscriberId = :subscriberId', { subscriberId })
        .orderBy('c.createdAt', 'DESC')
        .addOrderBy('c.id', 'DESC')
        .skip((page - 1) * limit)
        .take(limit)
        .getManyAndCount();

      const projection = await this.projectContractsForRead(qr.manager, data, canSeeBlocked);
      return {
        data: projection.data,
        blockedServed: projection.blockedServed,
        meta: buildPageMeta({
          total,
          page,
          limit,
          randomAccess: true,
          sortableFields: [],
        }),
      };
    });
    await this.logBlockedContractListAccess(actorId, canSeeBlocked, result);
    return { data: result.data, meta: result.meta };
  }

  async findOne(id: string): Promise<Contract> {
    const { schemaName } = TenantContext.getOrThrow();
    const entity = await runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      const found = await qr.manager.findOne(Contract, { where: { id } });
      if (found)
        await hydrateContractFiscalDocuments(qr.manager, [found], this.fiscalDocumentCrypto);
      return found;
    });
    if (!entity) {
      throw new NotFoundException(`Contrato ${id} no encontrado.`);
    }
    return entity;
  }

  async getActiveBillingCycles(): Promise<BillingCycleOption[]> {
    const { schemaName, tenantId } = TenantContext.getOrThrow();
    const timezone = this.tenantSettingsReadPort
      ? await this.tenantSettingsReadPort.getTimezone(tenantId)
      : 'America/Bogota';
    const today = getTenantLocalDate(new Date(), timezone);
    return runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      const rows = (await qr.query(
        `SELECT cycle_day AS "cycleDay", cutoff_day AS "cutoffDay", active
           FROM crm_billing_cycles
          WHERE active = true
          ORDER BY cycle_day ASC`,
      )) as BillingCycle[];
      return rows.map((cycle) => ({
        ...cycle,
        nextCutoffDate: computeNextCutoffDate({
          cycleDay: cycle.cycleDay,
          cutoffDay: cycle.cutoffDay,
          today,
        }),
      }));
    });
  }

  async getCutoffAgenda(
    query: CutoffAgendaQuery,
    role: string,
    canSeeBlocked = false,
    actorId?: string,
  ): Promise<CutoffAgendaResponse> {
    const { schemaName, tenantId } = TenantContext.getOrThrow();
    const timezone = this.tenantSettingsReadPort
      ? await this.tenantSettingsReadPort.getTimezone(tenantId)
      : 'America/Bogota';
    const date = query.date ?? getTenantLocalDate(new Date(), timezone);
    const { page, limit } = clampPage(query.page, clampLimit(query.limit));

    const result = await runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      // Los contratos con un ciclo inactivo conservan su fecha (ADR-102 D2); por eso
      // la agenda calcula con el catálogo completo, aunque los selectores solo lean activos.
      const cycles = (await qr.query(
        `SELECT cycle_day AS "cycleDay", cutoff_day AS "cutoffDay"
           FROM crm_billing_cycles`,
      )) as Array<{ cycleDay: number; cutoffDay: number }>;
      const year = Number(date.slice(0, 4));
      const month = Number(date.slice(5, 7));
      const cycleDays = cycles
        .filter(
          (cycle) =>
            computeCutoffDate({
              cycleDay: cycle.cycleDay,
              cutoffDay: cycle.cutoffDay,
              year,
              month,
            }) === date,
        )
        .map((cycle) => cycle.cycleDay);
      const withoutCycleRows = (await qr.query(
        `SELECT COUNT(*)::int AS total
           FROM contracts
          WHERE tenant_id = $1 AND status = $2 AND deleted_at IS NULL
            AND billing_cycle_day IS NULL`,
        [tenantId, ContractStatus.ACTIVE],
      )) as Array<{ total: number }>;
      const withoutCycleCount = withoutCycleRows[0]?.total ?? 0;
      if (cycleDays.length === 0) {
        return {
          items: [] as CutoffAgendaItem[],
          meta: buildPageMeta({ total: 0, page, limit }),
          withoutCycleCount,
          blockedServed: 0,
        };
      }

      const countRows = (await qr.query(
        `SELECT COUNT(*)::int AS total
           FROM contracts c
           JOIN subscribers s ON s.id = c.subscriber_id AND s.tenant_id = c.tenant_id
          WHERE c.tenant_id = $1 AND s.tenant_id = $1
            AND c.status = $2 AND c.deleted_at IS NULL AND s.deleted_at IS NULL
            AND c.billing_cycle_day = ANY($3::smallint[])`,
        [tenantId, ContractStatus.ACTIVE, cycleDays],
      )) as Array<{ total: number }>;
      const total = countRows[0]?.total ?? 0;
      const rows = (await qr.query(
        `SELECT c.id AS contract_id, c.subscriber_id, c.billing_cycle_day,
                COALESCE(c.plan_snapshot_json->>'name', c.plan_snapshot_json->>'planName') AS plan_name,
                s.id AS projected_subscriber_id, s.tenant_id AS subscriber_tenant_id,
                s.party_id, s.user_id, s.status AS subscriber_status, s.person_type,
                s.customer_segment, s.stratum, s.vat_treatment, s.vat_responsibility,
                s.rut_responsibilities, s.legal_representative_party_id, s.tax_regime,
                s.expediente_id, s.document_type, s.first_name, s.last_name,
                s.business_name, s.commercial_name, s.anonymized_at, s.created_at, s.updated_at
           FROM contracts c
           JOIN subscribers s ON s.id = c.subscriber_id AND s.tenant_id = c.tenant_id
          WHERE c.tenant_id = $1 AND s.tenant_id = $1
            AND c.status = $2 AND c.deleted_at IS NULL AND s.deleted_at IS NULL
            AND c.billing_cycle_day = ANY($3::smallint[])
          ORDER BY c.billing_cycle_day ASC, c.id ASC
          LIMIT $4 OFFSET $5`,
        [tenantId, ContractStatus.ACTIVE, cycleDays, limit, (page - 1) * limit],
      )) as Array<Record<string, unknown>>;
      const partyIds = rows
        .map((row) => row['party_id'])
        .filter((partyId): partyId is string => typeof partyId === 'string');
      if (partyIds.length > 0 && !this.privacyMarksReadPort) {
        throw new ServiceUnavailableException({
          code: 'PRIVACY_MARKS_UNAVAILABLE',
          message: 'No se pudo verificar el estado de privacidad del titular.',
        });
      }
      const marksByParty =
        partyIds.length > 0 && this.privacyMarksReadPort
          ? await this.privacyMarksReadPort.activeMarks(partyIds, { manager: qr.manager })
          : {};
      const items = rows.map((row) =>
        this.toCutoffAgendaItem(row, role, canSeeBlocked, marksByParty, date),
      );
      const blockedServed = rows.filter((row) => {
        const partyId = row['party_id'];
        return (
          row['anonymized_at'] == null &&
          typeof partyId === 'string' &&
          (marksByParty[partyId] ?? []).includes('DATOS_BLOQUEADOS')
        );
      }).length;
      return {
        items,
        meta: buildPageMeta({ total, page, limit }),
        withoutCycleCount,
        blockedServed,
      };
    });

    if (canSeeBlocked && result.blockedServed > 0) {
      // RS-21: la auditoría ocurre antes de responder; si falla, 503.
      await this.logBlockedDataAccess({
        action: AuditAction.LIST_ACCESS,
        entityType: 'BillingCycleCutoffAgenda',
        entityId: 'N/A',
        userId: actorId ?? null,
        newValue: {
          date,
          totalServed: result.items.length,
          totalAvailable: result.meta.total,
          blockedServed: result.blockedServed,
        },
      });
    }

    const paymentStates = this.billingAccountReadPort
      ? await this.billingAccountReadPort.periodStates(
          result.items.map(({ contractId }) => contractId),
          date,
        )
      : {};
    // RS-22: la agenda expone estado e importes por contrato; nulos en SIN_DOCUMENTO.
    const items: CutoffAgendaItem[] = result.items.map((item) => {
      const period = paymentStates[item.contractId];
      return {
        ...item,
        ...(period ? { paymentState: period.state } : {}),
        ...(period
          ? { paymentPaidAmount: period.paidAmount, paymentTotalAmount: period.totalAmount }
          : {}),
      };
    });

    return {
      date,
      items,
      meta: result.meta,
      withoutCycleCount: result.withoutCycleCount,
    };
  }

  async findOneForRead(
    id: string,
    canSeeBlocked: boolean,
    actorId?: string,
    grantedBy?: 'PRIVACY_READ' | 'CRM_BLOCKED_DATA_READ',
  ): Promise<Contract> {
    const { schemaName } = TenantContext.getOrThrow();
    const projected = await runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      const entity = await qr.manager.findOne(Contract, { where: { id } });
      if (!entity) throw new NotFoundException(`Contrato ${id} no encontrado.`);
      const { data } = await this.projectContractsForRead(qr.manager, [entity], canSeeBlocked);
      const projected = data[0];
      return projected ?? entity;
    });
    if (
      canSeeBlocked &&
      grantedBy &&
      actorId &&
      (await this.isContractSubscriberBlocked(projected.subscriberId))
    ) {
      await this.logBlockedDataAccess({
        action: AuditAction.RECORD_ACCESS,
        entityType: 'Contract',
        entityId: id,
        userId: actorId,
        newValue: { privacyMark: 'DATOS_BLOQUEADOS', grantedBy },
      });
    }
    return projected;
  }

  async assertContractNotBlocked(
    id: string,
    options: { allowAnonymized?: boolean } = {},
  ): Promise<void> {
    const contract = await this.findOne(id);
    await this.assertContractSubscriberNotBlocked(contract.subscriberId, options);
  }

  async assertSubscriberNotBlockedForMutation(subscriberId: string): Promise<void> {
    await this.assertContractSubscriberNotBlocked(subscriberId);
  }

  private async projectContractsForRead(
    manager: import('typeorm').EntityManager,
    contracts: Contract[],
    canSeeBlocked: boolean,
  ): Promise<{ data: Contract[]; blockedServed: number }> {
    return projectContractsForRead(
      manager,
      contracts,
      canSeeBlocked,
      this.fiscalDocumentCrypto,
      this.privacyMarksReadPort,
    );
  }

  private async projectContractForMutation(
    contract: Contract,
    manager: EntityManager,
  ): Promise<Contract> {
    const projection = await this.projectContractsForRead(manager, [contract], false);
    return projection.data[0] ?? contract;
  }

  private async hydrateExpedienteFiscalDocument(
    manager: EntityManager,
    expediente: ExpedienteRecord,
  ): Promise<void> {
    if (typeof manager.query !== 'function') return;
    const [row] = (await manager.query(
      `SELECT fiscal_document, fiscal_document_encrypted, fiscal_document_hmac
         FROM expediente_records WHERE id = $1::uuid`,
      [expediente.id],
    )) as Array<{
      fiscal_document: string | null;
      fiscal_document_encrypted: string | null;
      fiscal_document_hmac: string | null;
    }>;
    if (!row) return;
    hydrateFiscalDocument(
      expediente,
      row.fiscal_document_encrypted,
      row.fiscal_document_hmac,
      row.fiscal_document,
      this.fiscalDocumentCrypto,
    );
  }

  private async logBlockedContractListAccess(
    actorId: string | undefined,
    canSeeBlocked: boolean,
    result: {
      data: Contract[];
      blockedServed: number;
      meta: ListResponse<Contract>['meta'];
    },
  ): Promise<void> {
    if (!actorId || !canSeeBlocked || result.blockedServed === 0) return;
    await this.logBlockedDataAccess({
      action: AuditAction.LIST_ACCESS,
      entityType: 'ContractList',
      entityId: 'N/A',
      userId: actorId,
      newValue: {
        totalServed: result.data.length,
        totalAvailable: result.meta.total,
        blockedServed: result.blockedServed,
      },
    });
  }

  private async logBlockedDataAccess(entry: AuditEntryInput): Promise<void> {
    try {
      const { schemaName } = TenantContext.getOrThrow();
      await runInTenantSchema(this.dataSource, schemaName, (queryRunner) =>
        this.auditService.logWithin(entry, queryRunner.manager),
      );
    } catch {
      throw new ServiceUnavailableException({
        code: 'PRIVACY_AUDIT_UNAVAILABLE',
        message: 'No se pudo registrar el acceso a los datos protegidos.',
      });
    }
  }

  /**
   * `manager` es opcional: dentro de una transacción del llamante se pasa su
   * manager para no pedir otra conexión al pool; fuera de ella se omite y la
   * lectura abre su propia transacción tenant.
   */
  private async assertSubscriberNotBlocked(
    partyId: string | null,
    anonymizedAt: Date | string | null,
    manager?: EntityManager,
  ): Promise<void> {
    if (anonymizedAt != null) throw titularAnonymizedConflict();
    if (!partyId) return;
    if (!this.privacyMarksReadPort) {
      throw new ServiceUnavailableException({
        code: 'PRIVACY_MARKS_UNAVAILABLE',
        message: 'No se pudo verificar el estado de privacidad del titular.',
      });
    }
    const marks = await this.privacyMarksReadPort.activeMarks(
      [partyId],
      manager ? { manager } : undefined,
    );
    if ((marks[partyId] ?? []).includes('DATOS_BLOQUEADOS')) {
      throw new ConflictException({
        code: 'PRIVACY_DATA_BLOCKED',
        message: 'Los datos de este titular están bloqueados para edición.',
      });
    }
  }

  private async assertContractSubscriberNotBlocked(
    subscriberId: string,
    options: { allowAnonymized?: boolean } = {},
  ): Promise<void> {
    const { schemaName, tenantId } = TenantContext.getOrThrow();
    const subscriber = await runInTenantSchema(this.dataSource, schemaName, (qr) =>
      qr.manager.findOne(Subscriber, {
        where: { id: subscriberId, tenantId },
        select: ['id', 'partyId', 'anonymizedAt'],
      }),
    );
    if (!subscriber) throw new NotFoundException('Suscriptor del contrato no encontrado.');
    if (options.allowAnonymized && subscriber.anonymizedAt != null) {
      await this.assertSubscriberNotBlocked(subscriber.partyId, null);
      return;
    }
    // Fuera de una transacción del llamante: la guarda abre su propia conexión.
    await this.assertSubscriberNotBlocked(subscriber.partyId, subscriber.anonymizedAt);
  }

  private async isContractSubscriberBlocked(subscriberId: string): Promise<boolean> {
    const { schemaName, tenantId } = TenantContext.getOrThrow();
    const subscriber = await runInTenantSchema(this.dataSource, schemaName, (qr) =>
      qr.manager.findOne(Subscriber, {
        where: { id: subscriberId, tenantId },
        select: ['id', 'partyId', 'anonymizedAt'],
      }),
    );
    if (!subscriber || subscriber.anonymizedAt != null || !subscriber.partyId) return false;
    if (!this.privacyMarksReadPort) {
      throw new ServiceUnavailableException({
        code: 'PRIVACY_MARKS_UNAVAILABLE',
        message: 'No se pudo verificar el estado de privacidad del titular.',
      });
    }
    const marks = await this.privacyMarksReadPort.activeMarks([subscriber.partyId]);
    return (marks[subscriber.partyId] ?? []).includes('DATOS_BLOQUEADOS');
  }

  // ── Actualización parcial ───────────────────────────────────────────────────

  async update(id: string, dto: UpdateContractDto, actorId?: string): Promise<Contract> {
    const { schemaName, tenantId } = TenantContext.getOrThrow();
    const result = await runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      const subscriber = await this.lockContractSubscriberForMutation(qr, id, tenantId);
      await this.assertSubscriberNotBlocked(
        subscriber.partyId,
        subscriber.anonymizedAt,
        qr.manager,
      );
      const entity = await qr.manager.findOne(Contract, {
        where: { id, tenantId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!entity) throw new NotFoundException(`Contrato ${id} no encontrado.`);
      const previousBillingCycleDay = entity.billingCycleDay;

      const servicePointFieldsChanged =
        dto.serviceUsage !== undefined || dto.installationStratum !== undefined;
      const fiscalFieldsChanged =
        servicePointFieldsChanged ||
        dto.fiscalName !== undefined ||
        dto.fiscalDocument !== undefined ||
        dto.fiscalAddress !== undefined;
      if (fiscalFieldsChanged && entity.status !== ContractStatus.DRAFT) {
        throw new ConflictException({
          code: 'SERVICE_POINT_REQUIRES_DEDICATED_ACTION',
          message: 'El punto de servicio solo se modifica en borradores o por la acción dedicada.',
        });
      }
      if (dto.planSnapshotJson !== undefined && entity.status !== ContractStatus.DRAFT) {
        throw new ConflictException(
          'CONTRACT_IMMUTABLE_AFTER_SIGN: El snapshot del plan no puede modificarse después de activar el contrato.',
        );
      }
      if (servicePointFieldsChanged) {
        const nextUsage = dto.serviceUsage ?? entity.serviceUsage;
        const nextStratum =
          dto.installationStratum !== undefined
            ? dto.installationStratum
            : entity.installationStratum;
        if (nextUsage === ServiceUsage.RESIDENTIAL) {
          this._validateServicePoint(nextUsage, nextStratum, subscriber.personType);
        }
      }

      if (dto.alias !== undefined) entity.alias = dto.alias.trim();
      if (dto.quoteId !== undefined) entity.quoteId = dto.quoteId ?? null;
      if (dto.installationAddress !== undefined)
        entity.installationAddress = dto.installationAddress ?? null;
      if (dto.installationCity !== undefined)
        entity.installationCity = dto.installationCity ?? null;
      if (dto.installationDepartment !== undefined)
        entity.installationDepartment = dto.installationDepartment ?? null;
      if (dto.installationPostalCode !== undefined)
        entity.installationPostalCode = dto.installationPostalCode ?? null;
      if (dto.installationNotes !== undefined)
        entity.installationNotes = dto.installationNotes ?? null;
      if (dto.customerSegment !== undefined) entity.customerSegment = dto.customerSegment ?? null;
      if (dto.serviceUsage !== undefined) entity.serviceUsage = dto.serviceUsage;
      if (dto.installationStratum !== undefined)
        entity.installationStratum = dto.installationStratum ?? null;
      if (dto.additionalProductIds !== undefined)
        entity.additionalProductIds = dto.additionalProductIds;
      if (dto.additionalServiceIds !== undefined)
        entity.additionalServiceIds = dto.additionalServiceIds;
      if (dto.paymentMethod !== undefined) entity.paymentMethod = dto.paymentMethod ?? null;
      if (dto.billingCycle !== undefined) entity.billingCycle = dto.billingCycle ?? null;
      if (dto.billingCycleDay !== undefined) entity.billingCycleDay = dto.billingCycleDay;
      if (dto.fiscalName !== undefined) entity.fiscalName = dto.fiscalName ?? null;
      if (dto.fiscalDocument !== undefined) entity.fiscalDocument = dto.fiscalDocument ?? null;
      if (dto.fiscalAddress !== undefined) entity.fiscalAddress = dto.fiscalAddress ?? null;
      if (dto.startDate !== undefined) entity.startDate = dto.startDate ?? null;
      if (dto.endDate !== undefined) entity.endDate = dto.endDate ?? null;
      if (dto.planSnapshotJson !== undefined) entity.planSnapshotJson = dto.planSnapshotJson;
      if (dto.fiscalDocument === undefined) prepareFiscalDocumentForSave(entity);
      else setFiscalDocumentStorage(entity, dto.fiscalDocument, this.fiscalDocumentCrypto);
      if (dto.billingCycleDay !== undefined)
        await this.assertActiveBillingCycle(qr, dto.billingCycleDay);
      this.advanceContractVersion(entity);
      const saved = await qr.manager.save(Contract, entity);
      return {
        updated: await this.projectContractForMutation(saved, qr.manager),
        status: entity.status,
        previousBillingCycleDay,
        billingCycleDay: entity.billingCycleDay,
      };
    });
    const updated = result.updated;
    const changedFields = Object.keys(dto).filter((field) =>
      AUDITABLE_CONTRACT_UPDATE_FIELDS.has(field),
    );
    await this.auditService.log({
      action: AuditAction.UPDATE,
      entityType: 'Contract',
      entityId: updated.id,
      userId: actorId ?? null,
      oldValue: {
        status: result.status,
        ...(dto.billingCycleDay !== undefined
          ? { billingCycleDay: result.previousBillingCycleDay }
          : {}),
      },
      newValue: {
        changedFields,
        ...(dto.billingCycleDay !== undefined ? { billingCycleDay: result.billingCycleDay } : {}),
      },
    });
    return updated;
  }

  /** Aplica el cambio comercial y su auditoría en una única transacción tenant. */
  async changePlan(
    id: string,
    command: ContractPlanChangeInput,
    actorId?: string,
  ): Promise<Contract> {
    const { schemaName, tenantId } = TenantContext.getOrThrow();
    return runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      const subscriber = await this.lockContractSubscriberForMutation(qr, id, tenantId);
      await this.assertSubscriberNotBlocked(
        subscriber.partyId,
        subscriber.anonymizedAt,
        qr.manager,
      );
      const entity = await qr.manager.findOne(Contract, {
        where: { id, tenantId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!entity) throw new NotFoundException('Contrato no encontrado.');
      if (entity.updatedAt.getTime() !== new Date(command.expectedUpdatedAt).getTime()) {
        throw new ConflictException({
          code: 'CONTRACT_CHANGED',
          message: 'El contrato cambió. Actualiza la ficha e inténtalo de nuevo.',
        });
      }
      if (entity.status !== ContractStatus.DRAFT && entity.status !== ContractStatus.ACTIVE) {
        throw new ConflictException({
          code: 'CONTRACT_PLAN_CHANGE_NOT_ALLOWED',
          message: 'Solo puedes cambiar el plan de un contrato en borrador o activo.',
        });
      }
      if (subscriber.status === SubscriberStatus.CANCELLED)
        throw this.cancelledSubscriberConflict();
      if (command.planId === entity.planId)
        return this.projectContractForMutation(entity, qr.manager);

      const unavailable = () =>
        new UnprocessableEntityException({
          code: 'PLAN_UNAVAILABLE',
          message: 'El plan seleccionado no está disponible.',
        });
      let plan;
      try {
        plan = await this.commercialCatalogPort.getPlanById(tenantId, schemaName, command.planId, {
          manager: qr.manager,
        });
      } catch (error) {
        // Los identificadores heredados son texto; un UUID inválido tampoco es un plan disponible.
        if (
          error instanceof Error &&
          'driverError' in error &&
          (error.driverError as { code?: string } | undefined)?.code === '22P02'
        )
          throw unavailable();
        throw error;
      }
      if (!plan?.isActive) throw unavailable();
      const priceRequired = () =>
        new UnprocessableEntityException({
          code: 'PLAN_PRICE_REQUIRED',
          message: 'El plan no tiene una tarifa vigente para el segmento del servicio.',
        });
      let snapshot;
      try {
        snapshot = await this.commercialCatalogPort.createSnapshot(
          tenantId,
          schemaName,
          command.planId,
          entity.customerSegment ?? subscriber.customerSegment,
          { manager: qr.manager },
        );
      } catch (error) {
        if (!(error instanceof NotFoundException)) throw error;
        const stillAvailable = await this.commercialCatalogPort.getPlanById(
          tenantId,
          schemaName,
          command.planId,
          { manager: qr.manager },
        );
        if (!stillAvailable?.isActive) throw unavailable();
        throw priceRequired();
      }
      if (!Number.isFinite(snapshot.monthlyPrice) || snapshot.monthlyPrice < 0)
        throw priceRequired();
      if (snapshot.monthlyPrice !== command.expectedMonthlyPrice) {
        throw new ConflictException({
          code: 'PLAN_PRICE_CHANGED',
          message: 'La tarifa del plan cambió. Revisa el precio vigente antes de confirmar.',
        });
      }
      const oldValue = {
        planId: entity.planId,
        planSnapshotJson: entity.planSnapshotJson,
        vatSnapshot: entity.vatSnapshot,
        installationFee: entity.installationFee,
      };
      const next: Contract = Object.assign(new Contract(), entity, {
        planId: command.planId,
        planSnapshotJson: { ...snapshot, snapshotAt: snapshot.snapshotAt.toISOString() },
        vatSnapshot: null,
        // En borrador la venta aún no se instala: el cargo se congela con el plan nuevo.
        // Activo: la instalación ya ocurrió y conserva el cargo congelado.
        installationFee:
          entity.status === ContractStatus.DRAFT
            ? round2Money(snapshot.installationFee)
            : entity.installationFee,
      });
      if (entity.status === ContractStatus.ACTIVE) {
        this._validateActivationInputs(
          entity.serviceUsage,
          entity.installationStratum,
          subscriber.personType,
        );
        next.vatSnapshot = await this._resolveVatSnapshot(next, snapshot, qr.manager);
      }
      // PostgreSQL puede actualizar varias veces dentro del mismo milisegundo: la versión
      // expuesta al cliente debe avanzar siempre tras una modificación comercial.
      this.advanceContractVersion(next);
      prepareFiscalDocumentForSave(next);
      const saved = await qr.manager.save(Contract, next);
      if (entity.status === ContractStatus.DRAFT) {
        await this.voidAcceptedPermanenceOnPlanChange(qr.manager, saved.id, tenantId, actorId);
      }
      await this.auditService.logWithin(
        {
          action: AuditAction.UPDATE,
          entityType: 'ContractPlanChange',
          entityId: saved.id,
          userId: actorId ?? null,
          oldValue,
          newValue: {
            planId: saved.planId,
            planSnapshotJson: saved.planSnapshotJson,
            vatSnapshot: saved.vatSnapshot,
            installationFee: saved.installationFee,
            effectiveAt: new Date().toISOString(),
          },
        },
        qr.manager,
      );
      return this.projectContractForMutation(saved, qr.manager);
    });
  }

  /**
   * Cambio de plan en borrador (decisión R4): la permanencia aceptada se calculó con el cargo
   * de instalación y la oferta del plan anterior, así que se anula en la misma transacción
   * (sin aceptar, todos sus datos en NULL) y se audita. El cliente la vuelve a aceptar con el
   * plan nuevo; el PDF y el primer cobro leen entonces la permanencia vigente.
   */
  private async voidAcceptedPermanenceOnPlanChange(
    manager: EntityManager,
    contractId: string,
    tenantId: string,
    actorId: string | undefined,
  ): Promise<void> {
    const existing = await manager.findOne(ContractPermanenceRecord, {
      where: { contractId, tenantId },
      lock: { mode: 'pessimistic_write' },
    });
    if (!existing?.accepted) return;
    const oldValue = {
      accepted: true,
      months: existing.months,
      connectionFee: existing.connectionFee,
      discountedAmount: existing.discountedAmount,
    };
    await manager.update(
      ContractPermanenceRecord,
      { contractId, tenantId },
      {
        accepted: false,
        months: null,
        connectionFee: null,
        discountedAmount: null,
        startDate: null,
        endDate: null,
        voluntarySuspensionDays: 0,
        ...(actorId ? { updatedBy: actorId } : {}),
      },
    );
    await this.auditService.logWithin(
      {
        action: AuditAction.UPDATE,
        entityType: 'ContractPermanence',
        entityId: contractId,
        userId: actorId ?? null,
        oldValue,
        newValue: { accepted: false, reason: 'PLAN_CHANGED' },
      },
      manager,
    );
  }

  /**
   * `installation_fee` vigente del plan para el segmento (fase 2, D1), leído por el puerto de
   * MOD06 dentro de la transacción. Null si el plan es un identificador heredado, no está
   * activo o no tiene precio vigente para el segmento: el contrato se crea igual y el cobro de
   * instalación no aplica.
   */
  private async resolveInstallationFee(
    manager: EntityManager,
    planId: string,
    segment: CustomerSegment | null,
  ): Promise<number | null> {
    if (!CONTRACT_PLAN_UUID_PATTERN.test(planId)) return null;
    const { schemaName, tenantId } = TenantContext.getOrThrow();
    try {
      const snapshot = await this.commercialCatalogPort.createSnapshot(
        tenantId,
        schemaName,
        planId,
        segment ?? undefined,
        { manager },
      );
      return Number.isFinite(snapshot.installationFee) && snapshot.installationFee >= 0
        ? round2Money(snapshot.installationFee)
        : null;
    } catch (error) {
      if (error instanceof NotFoundException) return null;
      throw error;
    }
  }

  /**
   * Snapshot completo del plan de la oportunidad (nombre, mensualidad, cargo de instalación,
   * concepto IVA y red) leído del catálogo de MOD06 por su puerto, como en el cambio de plan.
   * Null si el plan es un identificador heredado, no está activo o no tiene tarifa vigente.
   */
  private async loadExpedientePlanSnapshot(
    manager: EntityManager,
    planId: string,
    segment: CustomerSegment | null,
  ): Promise<CommercialItemSnapshot | null> {
    const { schemaName, tenantId } = TenantContext.getOrThrow();
    try {
      const snapshot = await this.commercialCatalogPort.createSnapshot(
        tenantId,
        schemaName,
        planId,
        segment ?? undefined,
        { manager },
      );
      if (!snapshot || !Number.isFinite(snapshot.monthlyPrice) || snapshot.monthlyPrice < 0) {
        return null;
      }
      return snapshot;
    } catch (error) {
      if (error instanceof NotFoundException) return null;
      // Identificador heredado que no es UUID: el catálogo no lo puede tener.
      const driverCode = (error as { driverError?: { code?: string } } | null)?.driverError?.code;
      if (driverCode === '22P02') return null;
      throw error;
    }
  }

  // ── Transiciones de estado ──────────────────────────────────────────────────

  /**
   * DRAFT → ACTIVE (activación manual, W0) y SUSPENDED → ACTIVE (heredado). Desde DRAFT
   * escribe `crm.contract.activated` (MANUAL) en el outbox dentro de la misma transacción.
   */
  async activate(
    id: string,
    actorId?: string,
    command: ActivateContractInput = {},
  ): Promise<Contract> {
    return this._transition(id, ContractStatus.ACTIVE, actorId, command.billingCycleDay, {
      activationSource: 'MANUAL',
    });
  }

  /**
   * Activación manual de ADMIN con motivo obligatorio y sin firma (CA-8, ADR-109 D2).
   * Solo DRAFT → ACTIVE; el motivo queda en la auditoría.
   */
  async activateManual(
    id: string,
    actorId: string,
    command: { billingCycleDay?: number | undefined; reason: string },
  ): Promise<Contract> {
    return this._transition(id, ContractStatus.ACTIVE, actorId, command.billingCycleDay, {
      activationSource: 'MANUAL',
      requireDraft: true,
      manualReason: command.reason,
    });
  }

  /**
   * DRAFT → ACTIVE por firma (bloque D). `startDate` = fecha de activación del
   * aprovisionamiento; `within` persiste la firma y la permanencia en la misma transacción.
   */
  async activateFromSignature(
    id: string,
    actorId: string,
    options: {
      startDate: string;
      within: (manager: EntityManager, contract: Contract) => Promise<void>;
    },
  ): Promise<Contract> {
    return this._transition(id, ContractStatus.ACTIVE, actorId, undefined, {
      activationSource: 'SIGNATURE',
      requireDraft: true,
      startDate: options.startDate,
      within: options.within,
    });
  }

  /** Recalcula el snapshot fiscal de un punto de servicio ya activo. */
  async updateServicePoint(
    id: string,
    dto: UpdateServicePointDto,
    actorId: string,
  ): Promise<Contract> {
    const { schemaName, tenantId } = TenantContext.getOrThrow();
    await runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      const subscriber = await this.lockContractSubscriberForMutation(qr, id, tenantId);
      await this.assertSubscriberNotBlocked(
        subscriber.partyId,
        subscriber.anonymizedAt,
        qr.manager,
      );
    });
    if (dto.serviceUsage === undefined && dto.installationStratum === undefined) {
      throw new UnprocessableEntityException({
        code: 'SERVICE_POINT_CHANGE_REQUIRED',
        message: 'Indica al menos un campo del punto de servicio.',
      });
    }

    const { updated, previousTreatment } = await runInTenantSchema(
      this.dataSource,
      schemaName,
      async (qr) => {
        const subscriber = await this.lockContractSubscriberForMutation(qr, id, tenantId);
        await this.assertSubscriberNotBlocked(
          subscriber.partyId,
          subscriber.anonymizedAt,
          qr.manager,
        );
        const entity = await qr.manager.findOne(Contract, {
          where: { id, tenantId },
          lock: { mode: 'pessimistic_write' },
        });
        if (!entity) throw new NotFoundException(`Contrato ${id} no encontrado.`);
        if (entity.status !== ContractStatus.ACTIVE) {
          throw new ConflictException({
            code: 'SERVICE_POINT_ACTION_REQUIRES_ACTIVE_CONTRACT',
            message: 'La acción dedicada requiere un contrato activo.',
          });
        }

        const serviceUsage = dto.serviceUsage ?? entity.serviceUsage;
        const installationStratum =
          dto.installationStratum !== undefined
            ? dto.installationStratum
            : entity.installationStratum;
        this._validateActivationInputs(serviceUsage, installationStratum, subscriber.personType);

        const previousTreatment = this._snapshotTreatment(entity.vatSnapshot);
        entity.serviceUsage = serviceUsage;
        entity.installationStratum = installationStratum;
        entity.vatSnapshot = await this._resolveVatSnapshot(entity, undefined, qr.manager);

        this.advanceContractVersion(entity);
        const saved = await qr.manager.save(Contract, entity);
        return {
          updated: await this.projectContractForMutation(saved, qr.manager),
          previousTreatment,
        };
      },
    );

    const changedFields = [
      ...(dto.serviceUsage !== undefined ? ['serviceUsage'] : []),
      ...(dto.installationStratum !== undefined ? ['installationStratum'] : []),
    ];
    const auditEntry: AuditEntryInput = {
      action: AuditAction.UPDATE,
      entityType: 'ContractServicePoint',
      entityId: updated.id,
      userId: actorId,
      oldValue: { vatTreatment: previousTreatment },
      newValue: {
        changedFields,
        vatTreatment: this._snapshotTreatment(updated.vatSnapshot),
      },
    };
    await this.auditService.log(auditEntry);
    return updated;
  }

  async uploadStratumEvidence(
    id: string,
    file: Express.Multer.File,
    actorId: string,
  ): Promise<Contract> {
    const { schemaName, tenantId } = TenantContext.getOrThrow();
    await runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      const subscriber = await this.lockContractSubscriberForMutation(qr, id, tenantId);
      await this.assertSubscriberNotBlocked(
        subscriber.partyId,
        subscriber.anonymizedAt,
        qr.manager,
      );
    });
    if (!file) {
      throw new BadRequestException('Se requiere el campo "file" con el soporte del estrato.');
    }

    const current = await this.findOne(id);
    this._assertEvidenceApplicable(current);
    if (current.status !== ContractStatus.DRAFT && current.status !== ContractStatus.ACTIVE) {
      throw new ConflictException({
        code: 'STRATUM_EVIDENCE_REQUIRES_EDITABLE_CONTRACT',
        message: 'El soporte solo puede modificarse en borradores o contratos activos.',
      });
    }

    const subscriber = await runInTenantSchema(this.dataSource, schemaName, (qr) =>
      qr.manager.findOne(Subscriber, {
        where: { id: current.subscriberId, tenantId },
        select: { id: true, tenantId: true, personType: true, partyId: true, anonymizedAt: true },
      }),
    );
    if (!subscriber) {
      throw new NotFoundException('Suscriptor del contrato no encontrado.');
    }
    this._validateServicePoint(
      ServiceUsage.RESIDENTIAL,
      current.installationStratum,
      subscriber.personType,
    );

    const asset = await this.mediaService.uploadStratumEvidence(schemaName, file, actorId);

    let updated: Contract;
    try {
      updated = await runInTenantSchema(this.dataSource, schemaName, async (qr) => {
        const subscriber = await this.lockContractSubscriberForMutation(qr, id, tenantId);
        await this.assertSubscriberNotBlocked(
          subscriber.partyId,
          subscriber.anonymizedAt,
          qr.manager,
        );
        const entity = await qr.manager.findOne(Contract, {
          where: { id, tenantId },
          lock: { mode: 'pessimistic_write' },
        });
        if (!entity) throw new NotFoundException(`Contrato ${id} no encontrado.`);
        this._assertEvidenceApplicable(entity);
        if (entity.status !== ContractStatus.DRAFT && entity.status !== ContractStatus.ACTIVE) {
          throw new ConflictException({
            code: 'STRATUM_EVIDENCE_REQUIRES_EDITABLE_CONTRACT',
            message: 'El soporte solo puede modificarse en borradores o contratos activos.',
          });
        }

        const previousTreatment = this._snapshotTreatment(entity.vatSnapshot);
        const previousAssetId = entity.stratumEvidenceMediaId;
        entity.stratumEvidenceMediaId = asset.id;
        if (entity.status === ContractStatus.ACTIVE) {
          entity.vatSnapshot = await this._resolveVatSnapshot(entity, undefined, qr.manager);
        }
        this.advanceContractVersion(entity);
        const saved = await qr.manager.save(Contract, entity);
        await this._auditStratumEvidenceChange(
          saved,
          actorId,
          previousAssetId,
          previousTreatment,
          entity.status === ContractStatus.ACTIVE,
        );
        return this.projectContractForMutation(saved, qr.manager);
      });
    } catch (error) {
      await this._softDeleteEvidenceAsset(asset.id, schemaName);
      throw error;
    }

    if (current.stratumEvidenceMediaId && current.stratumEvidenceMediaId !== asset.id) {
      await this._softDeleteEvidenceAsset(current.stratumEvidenceMediaId, schemaName);
    }
    return updated;
  }

  async removeStratumEvidence(id: string, actorId: string): Promise<Contract> {
    const { schemaName, tenantId } = TenantContext.getOrThrow();
    const { updated, previousAssetId } = await runInTenantSchema(
      this.dataSource,
      schemaName,
      async (qr) => {
        const subscriber = await this.lockContractSubscriberForMutation(qr, id, tenantId);
        await this.assertSubscriberNotBlocked(
          subscriber.partyId,
          subscriber.anonymizedAt,
          qr.manager,
        );
        const entity = await qr.manager.findOne(Contract, {
          where: { id, tenantId },
          lock: { mode: 'pessimistic_write' },
        });
        if (!entity) throw new NotFoundException(`Contrato ${id} no encontrado.`);
        if (entity.status !== ContractStatus.DRAFT && entity.status !== ContractStatus.ACTIVE) {
          throw new ConflictException({
            code: 'STRATUM_EVIDENCE_REQUIRES_EDITABLE_CONTRACT',
            message: 'El soporte solo puede modificarse en borradores o contratos activos.',
          });
        }

        const previousAssetId = entity.stratumEvidenceMediaId;
        const previousTreatment = this._snapshotTreatment(entity.vatSnapshot);
        if (!previousAssetId) {
          return {
            updated: await this.projectContractForMutation(entity, qr.manager),
            previousAssetId: null,
          };
        }

        entity.stratumEvidenceMediaId = null;
        if (entity.status === ContractStatus.ACTIVE) {
          entity.vatSnapshot = await this._resolveVatSnapshot(entity, undefined, qr.manager);
        }
        this.advanceContractVersion(entity);
        const saved = await qr.manager.save(Contract, entity);
        await this._auditStratumEvidenceChange(
          saved,
          actorId,
          previousAssetId,
          previousTreatment,
          entity.status === ContractStatus.ACTIVE,
        );
        return {
          updated: await this.projectContractForMutation(saved, qr.manager),
          previousAssetId,
        };
      },
    );

    if (previousAssetId) {
      await this._softDeleteEvidenceAsset(previousAssetId, schemaName);
    } else {
      await this.auditService.log({
        action: AuditAction.UPDATE,
        entityType: 'ContractStratumEvidence',
        entityId: updated.id,
        userId: actorId,
        oldValue: { hasStratumEvidence: false },
        newValue: { hasStratumEvidence: false },
      });
    }
    return updated;
  }

  async getStratumEvidenceSignedUrl(
    id: string,
    actorId: string,
    canSeeBlocked = false,
    grantedBy?: 'PRIVACY_READ' | 'CRM_BLOCKED_DATA_READ',
  ): Promise<{ signedUrl: string; expiresAt: Date }> {
    const { schemaName } = TenantContext.getOrThrow();
    const contract = await this.findOne(id);
    const blocked = await this.isContractSubscriberBlocked(contract.subscriberId);
    if (!canSeeBlocked && blocked) {
      throw new NotFoundException('Soporte del estrato no encontrado para este contrato.');
    }
    const mediaId = contract.stratumEvidenceMediaId;
    if (!mediaId || !(await this._hasVerifiedStratumEvidence(contract, schemaName))) {
      throw new NotFoundException('Soporte del estrato no encontrado para este contrato.');
    }

    const signedUrl = await this.mediaService.getStratumEvidenceSignedUrl(mediaId, schemaName);
    const auditEntry: AuditEntryInput = {
      action: AuditAction.RECORD_ACCESS,
      entityType: 'STRATUM_EVIDENCE_ACCESS',
      entityId: contract.id,
      userId: actorId,
      newValue: {
        resource: 'stratumEvidence',
        ...(blocked && grantedBy ? { privacyMark: 'DATOS_BLOQUEADOS', grantedBy } : {}),
      },
    };
    if (blocked && canSeeBlocked && grantedBy) {
      await this.logBlockedDataAccess(auditEntry);
    } else {
      await this.auditService.log(auditEntry);
    }
    return signedUrl;
  }

  /** ACTIVE → SUSPENDED */
  async suspend(
    id: string,
    command: LifecycleSuspendCommand,
    actorId: string,
    idempotencyKey?: string,
  ): Promise<Contract> {
    await this.subscriberLifecycleService.transitionContract(
      id,
      'SUSPEND',
      command,
      actorId,
      idempotencyKey,
    );
    return this.findOne(id);
  }

  /** SUSPENDED → ACTIVE */
  async reactivate(
    id: string,
    command: LifecycleReactivateCommand,
    actorId: string,
    idempotencyKey?: string,
  ): Promise<Contract> {
    await this.subscriberLifecycleService.transitionContract(
      id,
      'REACTIVATE',
      command,
      actorId,
      idempotencyKey,
      (qr, contractIds) => this.prepareLifecycleActivation(qr, contractIds),
    );
    return this.findOne(id);
  }

  /** ACTIVE | SUSPENDED → TERMINATED */
  async terminate(
    id: string,
    command: LifecycleTerminateCommand,
    actorId: string,
    idempotencyKey?: string,
  ): Promise<Contract> {
    await this.subscriberLifecycleService.transitionContract(
      id,
      'TERMINATE',
      command,
      actorId,
      idempotencyKey,
    );
    return this.findOne(id);
  }

  async suspendSubscriberServices(
    subscriberId: string,
    command: LifecycleSuspendCommand,
    actorId: string,
    idempotencyKey?: string,
  ): Promise<LifecycleCommandResponse> {
    return this.subscriberLifecycleService.suspend(subscriberId, command, actorId, idempotencyKey);
  }

  async reactivateSubscriberServices(
    subscriberId: string,
    command: LifecycleReactivateCommand,
    actorId: string,
    idempotencyKey?: string,
  ): Promise<LifecycleCommandResponse> {
    return this.subscriberLifecycleService.reactivate(
      subscriberId,
      command,
      actorId,
      idempotencyKey,
      (qr, contractIds) => this.prepareLifecycleActivation(qr, contractIds),
    );
  }

  async terminateSubscriberServices(
    subscriberId: string,
    command: LifecycleTerminateCommand,
    actorId: string,
    idempotencyKey?: string,
  ): Promise<LifecycleCommandResponse> {
    return this.subscriberLifecycleService.terminate(
      subscriberId,
      command,
      actorId,
      idempotencyKey,
    );
  }

  previewSubscriberServices(
    subscriberId: string,
    request: LifecyclePreviewRequest,
  ): Promise<LifecyclePreviewResponse> {
    return this.subscriberLifecycleService.preview(subscriberId, request);
  }

  /** SUSPENDED | TERMINATED → ARCHIVED */
  async archive(id: string, actorId?: string): Promise<Contract> {
    return this._transition(id, ContractStatus.ARCHIVED, actorId);
  }

  // ── Eliminación ─────────────────────────────────────────────────────────────

  async remove(id: string, actorId?: string): Promise<void> {
    const { schemaName, tenantId } = TenantContext.getOrThrow();
    const previousStatus = await runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      const subscriber = await this.lockContractSubscriberForMutation(qr, id, tenantId);
      await this.assertSubscriberNotBlocked(
        subscriber.partyId,
        subscriber.anonymizedAt,
        qr.manager,
      );
      const entity = await qr.manager.findOne(Contract, {
        where: { id, tenantId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!entity) throw new NotFoundException(`Contrato ${id} no encontrado.`);
      if (entity.status !== ContractStatus.DRAFT) {
        throw new BadRequestException('Solo se pueden eliminar contratos en estado DRAFT.');
      }
      await qr.manager.softDelete(Contract, { id, tenantId });
      return entity.status;
    });
    await this.auditService.log({
      action: AuditAction.DELETE,
      entityType: 'Contract',
      entityId: id,
      userId: actorId ?? null,
      oldValue: { status: previousStatus },
      newValue: { deleted: true },
    });
  }

  // ── Helpers privados ────────────────────────────────────────────────────────

  private async requireContractualAuthorization(
    partyId: string | null,
    manager?: EntityManager,
  ): Promise<void> {
    if (!partyId) {
      throw new UnprocessableEntityException({
        code: 'CONTRACT_DATA_AUTHORIZATION_REQUIRED',
        message: 'El suscriptor no tiene autorización vigente para el tratamiento contractual.',
      });
    }
    if (!this.privacyAuthorizationReadPort) {
      throw new ServiceUnavailableException('La consulta de autorizaciones no está disponible.');
    }
    const authorization = await this.privacyAuthorizationReadPort.hasActive(
      partyId,
      'TRATAMIENTO_CONTRACTUAL',
      manager ? { manager } : undefined,
    );
    if (!authorization.active) {
      throw new UnprocessableEntityException({
        code: 'CONTRACT_DATA_AUTHORIZATION_REQUIRED',
        message: 'El suscriptor no tiene autorización vigente para el tratamiento contractual.',
      });
    }
    if (authorization.legacyUnverified) {
      this.logger.warn('Autorización heredada del titular requiere recolectar evidencia.');
    }
  }

  private async lockSubscriberForContractCreation(
    qr: QueryRunner,
    subscriberId: string,
    tenantId: string,
    select: FindOptionsSelect<Subscriber> = {
      id: true,
      tenantId: true,
      status: true,
      personType: true,
    },
  ): Promise<Subscriber> {
    const rows = (await qr.query(
      `SELECT id FROM subscribers
        WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL
        FOR UPDATE`,
      [subscriberId, tenantId],
    )) as Array<{ id: string }>;
    if (!rows[0]) throw new NotFoundException('Suscriptor del contrato no encontrado.');
    const subscriber = await qr.manager.findOne(Subscriber, {
      where: { id: subscriberId, tenantId },
      select,
    });
    if (!subscriber) throw new NotFoundException('Suscriptor del contrato no encontrado.');
    return subscriber;
  }

  private async lockContractSubscriberForMutation(
    qr: QueryRunner,
    contractId: string,
    tenantId: string,
  ): Promise<Subscriber> {
    const rows = (await qr.query(
      `SELECT s.id, s.tenant_id AS "tenantId", s.party_id AS "partyId",
              s.anonymized_at AS "anonymizedAt", s.person_type AS "personType",
              s.customer_segment AS "customerSegment", s.status::text AS status
         FROM subscribers s
         JOIN contracts c ON c.subscriber_id = s.id AND c.tenant_id = s.tenant_id
        WHERE c.id = $1 AND c.tenant_id = $2 AND c.deleted_at IS NULL
          AND s.deleted_at IS NULL
        FOR SHARE OF s`,
      [contractId, tenantId],
    )) as Subscriber[];
    const subscriber = rows[0];
    if (!subscriber) throw new NotFoundException('Contrato no encontrado.');
    return subscriber;
  }

  private contractChangedConflict(): ConflictException {
    return new ConflictException({
      code: 'CONTRACT_CHANGED',
      message: 'El contrato cambió. Actualiza la ficha e inténtalo de nuevo.',
    });
  }

  private async assertNotSuspendedForDelinquency(
    qr: QueryRunner,
    tenantId: string,
    subscriberId: string,
  ): Promise<void> {
    const rows = (await qr.query(
      `SELECT to_status, reason_code
         FROM crm_lifecycle_changes
        WHERE tenant_id = $1 AND subscriber_id = $2 AND entity_type = 'SUBSCRIBER'
        ORDER BY changed_at DESC, id DESC
        LIMIT 1`,
      [tenantId, subscriberId],
    )) as Array<{ to_status: string; reason_code: string }>;
    if (rows[0]?.to_status === SubscriberStatus.SUSPENDED && rows[0].reason_code === 'MORA') {
      throw new ConflictException({
        code: 'SUBSCRIBER_SUSPENDED_FOR_DELINQUENCY',
        message:
          'No puedes activar un servicio nuevo mientras el suscriptor siga suspendido por mora.',
      });
    }
  }

  private cancelledSubscriberConflict(): ConflictException {
    return new ConflictException({
      code: 'SUBSCRIBER_CANCELLED',
      message: 'No puedes crear ni activar servicios para un suscriptor cancelado.',
    });
  }

  private async prepareLifecycleActivation(
    qr: QueryRunner,
    contractIds: readonly string[],
  ): Promise<void> {
    const { tenantId } = TenantContext.getOrThrow();
    const contracts = await qr.manager.find(Contract, {
      where: { id: In([...contractIds]), tenantId },
    });
    for (const contract of contracts) {
      const subscriber = await qr.manager.findOne(Subscriber, {
        where: { id: contract.subscriberId, tenantId },
        select: { id: true, tenantId: true, status: true, personType: true },
      });
      if (!subscriber) throw new NotFoundException('Suscriptor del contrato no encontrado.');
      if (subscriber.status === SubscriberStatus.CANCELLED) {
        throw this.cancelledSubscriberConflict();
      }
      this._validateActivationInputs(
        contract.serviceUsage,
        contract.installationStratum,
        subscriber.personType,
      );
      contract.vatSnapshot = await this._resolveVatSnapshot(contract, undefined, qr.manager);
      await this.assertContractVersionForSave(qr, contract);
      this.advanceContractVersion(contract);
      await qr.manager.save(Contract, contract);
    }
  }

  private async _transition(
    id: string,
    target: ContractStatus,
    actorId?: string,
    requestedBillingCycleDay?: number,
    activation: ActivationOptions = {},
  ): Promise<Contract> {
    const { schemaName, tenantId } = TenantContext.getOrThrow();
    const timezone =
      target === ContractStatus.ACTIVE && this.tenantSettingsReadPort
        ? await this.tenantSettingsReadPort.getTimezone(tenantId)
        : 'America/Bogota';
    const updated = await runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      const subscriber = await this.lockContractSubscriberForMutation(qr, id, tenantId);
      const anonymized = subscriber.anonymizedAt != null;
      if (!anonymized) {
        await this.assertSubscriberNotBlocked(
          subscriber.partyId,
          subscriber.anonymizedAt,
          qr.manager,
        );
      }
      const entity = await qr.manager.findOne(Contract, {
        where: { id, tenantId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!entity) throw new NotFoundException(`Contrato ${id} no encontrado.`);
      if (anonymized && entity.status !== ContractStatus.TERMINATED) {
        if (entity.status !== ContractStatus.ARCHIVED) {
          this.logger.warn(
            JSON.stringify({
              event: 'crm.contract.anonymized_open_contract',
              contractId: id,
              subscriberId: subscriber.id,
              status: entity.status,
            }),
          );
        }
        throw titularAnonymizedConflict();
      }
      if (anonymized && target !== ContractStatus.ARCHIVED) {
        throw titularAnonymizedConflict();
      }
      const currentStatus = entity.status;
      const lockedBillingCycleDay = entity.billingCycleDay;
      if (anonymized) {
        const rows = (await qr.query(
          `UPDATE contracts
              SET status = $1, status_reason_code = NULL, status_changed_at = clock_timestamp(),
                  updated_at = GREATEST(
                    date_trunc('milliseconds', clock_timestamp()),
                    date_trunc('milliseconds', updated_at) + interval '1 millisecond'
                  )
            WHERE id = $2 AND tenant_id = $3 AND status = $4 AND deleted_at IS NULL
            RETURNING id`,
          [ContractStatus.ARCHIVED, id, tenantId, ContractStatus.TERMINATED],
        )) as Array<{ id: string }>;
        if (!rows[0]) throw this.contractChangedConflict();
        const archived = await qr.manager.findOne(Contract, { where: { id, tenantId } });
        if (!archived) throw new NotFoundException(`Contrato ${id} no encontrado.`);
        const projected = await this.projectContractForMutation(archived, qr.manager);
        await this.auditService.logWithin(
          {
            action: AuditAction.UPDATE,
            entityType: 'Contract',
            entityId: id,
            userId: actorId ?? null,
            oldValue: { status: ContractStatus.TERMINATED },
            newValue: { status: ContractStatus.ARCHIVED },
          },
          qr.manager,
        );
        return projected;
      }
      if (activation.requireDraft && currentStatus !== ContractStatus.DRAFT) {
        throw new ConflictException({
          code: 'CONTRACT_NOT_DRAFT',
          message: 'Solo se activa por esta vía un contrato pendiente de firma.',
        });
      }
      const allowed = ALLOWED_TRANSITIONS[currentStatus];
      if (!allowed.includes(target)) {
        throw new ConflictException(
          `INVALID_STATE_TRANSITION: No se puede pasar de ${currentStatus} a ${target}.`,
        );
      }

      let previousBillingCycleDay: number | null = null;
      if (target === ContractStatus.ACTIVE) {
        // ADR-102 D3: resolver el ciclo solicitado o el guardado bajo el bloqueo de contrato.
        previousBillingCycleDay = lockedBillingCycleDay;
        entity.billingCycleDay = lockedBillingCycleDay;
        if (requestedBillingCycleDay !== undefined) {
          await this.assertActiveBillingCycle(qr, requestedBillingCycleDay);
          entity.billingCycleDay = requestedBillingCycleDay;
        }
        if (entity.billingCycleDay == null) {
          throw new UnprocessableEntityException({
            code: 'BILLING_CYCLE_REQUIRED',
            message: 'Selecciona un ciclo de facturación para activar el servicio.',
          });
        }
        if (subscriber.status === SubscriberStatus.CANCELLED) {
          throw this.cancelledSubscriberConflict();
        }
        if (
          currentStatus === ContractStatus.DRAFT &&
          subscriber.status === SubscriberStatus.SUSPENDED
        ) {
          await this.assertNotSuspendedForDelinquency(qr, tenantId, entity.subscriberId);
        }
        this._validateActivationInputs(
          entity.serviceUsage,
          entity.installationStratum,
          subscriber.personType,
        );
        entity.vatSnapshot = await this._resolveVatSnapshot(entity, undefined, qr.manager);
      }

      const previousStatus = currentStatus;
      entity.status = target;
      entity.statusReasonCode = null;
      entity.statusChangedAt = new Date();
      if (target === ContractStatus.TERMINATED || target === ContractStatus.ARCHIVED) {
        entity.terminatedAt ??= entity.statusChangedAt;
      }
      const activatesFromDraft =
        target === ContractStatus.ACTIVE && previousStatus === ContractStatus.DRAFT;
      if (activatesFromDraft && activation.startDate) entity.startDate = activation.startDate;
      prepareFiscalDocumentForSave(entity);
      this.advanceContractVersion(entity);
      const saved = await qr.manager.save(Contract, entity);
      if (activatesFromDraft && activation.within) await activation.within(qr.manager, saved);
      if (activatesFromDraft && activation.activationSource) {
        await appendContractActivatedEvent(qr, {
          tenantId,
          contractId: saved.id,
          subscriberId: saved.subscriberId,
          activatedAt: entity.statusChangedAt ?? new Date(),
          billingStartDate:
            activation.startDate ??
            saved.startDate ??
            getTenantLocalDate(entity.statusChangedAt ?? new Date(), timezone),
          source: activation.activationSource,
        });
      }
      const projected = await this.projectContractForMutation(saved, qr.manager);
      await this.auditService.logWithin(
        {
          action: AuditAction.UPDATE,
          entityType: 'Contract',
          entityId: projected.id,
          userId: actorId ?? null,
          oldValue: {
            status: previousStatus,
            ...(target === ContractStatus.ACTIVE
              ? { billingCycleDay: previousBillingCycleDay }
              : {}),
          },
          newValue: {
            status: projected.status,
            ...(target === ContractStatus.ACTIVE
              ? { billingCycleDay: projected.billingCycleDay }
              : {}),
            ...(activation.manualReason
              ? { activation: 'MANUAL', reason: activation.manualReason }
              : {}),
            ...(activation.activationSource === 'SIGNATURE'
              ? { activation: 'SIGNATURE', startDate: projected.startDate }
              : {}),
          },
        },
        qr.manager,
      );
      return projected;
    });
    return updated;
  }

  /** Mantiene una versión distinta aun con varias escrituras en el mismo milisegundo. */
  private advanceContractVersion(entity: Contract): void {
    const previous = entity.updatedAt instanceof Date ? entity.updatedAt.getTime() : 0;
    entity.updatedAt = new Date(Math.max(Date.now(), previous + 1));
  }

  /** Impide que una lectura anterior restaure plan, snapshot o IVA obsoletos. */
  private async assertContractVersionForSave(qr: QueryRunner, entity: Contract): Promise<void> {
    const { tenantId } = TenantContext.getOrThrow();
    const rows = (await qr.query(
      `SELECT updated_at AS "updatedAt" FROM contracts
        WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL FOR UPDATE`,
      [entity.id, tenantId],
    )) as Array<{ updatedAt: Date }>;
    if (!rows[0]) throw new NotFoundException('Contrato no encontrado.');
    if (new Date(rows[0].updatedAt).getTime() !== entity.updatedAt.getTime()) {
      throw new ConflictException({
        code: 'CONTRACT_CHANGED',
        message: 'El contrato cambió. Actualiza la ficha e inténtalo de nuevo.',
      });
    }
  }

  /** Valida el catálogo activo dentro del search_path transaccional (ADR-102 D2–D3). */
  private async assertActiveBillingCycle(qr: QueryRunner, cycleDay: number): Promise<void> {
    const rows = (await qr.query(
      `SELECT cycle_day
         FROM crm_billing_cycles
        WHERE cycle_day = $1 AND active = true`,
      [cycleDay],
    )) as Array<{ cycle_day: number }>;
    if (rows.length === 0) {
      throw new UnprocessableEntityException({
        code: 'BILLING_CYCLE_INVALID',
        message: 'El ciclo de facturación seleccionado no está disponible.',
      });
    }
  }

  private toCutoffAgendaItem(
    row: Record<string, unknown>,
    role: string,
    canSeeBlocked: boolean,
    marksByParty: Record<string, PrivacyMark[]>,
    cutoffDate: string,
  ): CutoffAgendaItem {
    const partyId = typeof row['party_id'] === 'string' ? row['party_id'] : null;
    const createdAt =
      row['created_at'] instanceof Date ? row['created_at'] : new Date(String(row['created_at']));
    const updatedAt =
      row['updated_at'] instanceof Date ? row['updated_at'] : new Date(String(row['updated_at']));
    const subscriber = Object.assign(new Subscriber(), {
      id: String(row['projected_subscriber_id']),
      tenantId: String(row['subscriber_tenant_id']),
      partyId,
      userId: typeof row['user_id'] === 'string' ? row['user_id'] : null,
      status: row['subscriber_status'] as Subscriber['status'],
      personType: row['person_type'] as PersonType,
      customerSegment: row['customer_segment'] as Subscriber['customerSegment'],
      stratum: typeof row['stratum'] === 'number' ? row['stratum'] : null,
      vatTreatment: row['vat_treatment'] as Subscriber['vatTreatment'],
      vatResponsibility: row['vat_responsibility'] as Subscriber['vatResponsibility'],
      rutResponsibilities: Array.isArray(row['rut_responsibilities'])
        ? (row['rut_responsibilities'] as string[])
        : [],
      legalRepresentativePartyId:
        typeof row['legal_representative_party_id'] === 'string'
          ? row['legal_representative_party_id']
          : null,
      taxRegime: row['tax_regime'] as Subscriber['taxRegime'],
      expedienteId: typeof row['expediente_id'] === 'string' ? row['expediente_id'] : null,
      documentType: row['document_type'] as Subscriber['documentType'],
      firstName: typeof row['first_name'] === 'string' ? row['first_name'] : null,
      lastName: typeof row['last_name'] === 'string' ? row['last_name'] : null,
      businessName: typeof row['business_name'] === 'string' ? row['business_name'] : null,
      commercialName: typeof row['commercial_name'] === 'string' ? row['commercial_name'] : null,
      anonymizedAt:
        row['anonymized_at'] instanceof Date
          ? row['anonymized_at']
          : typeof row['anonymized_at'] === 'string'
            ? new Date(row['anonymized_at'])
            : null,
      anonymizedRequestId: null,
      createdAt,
      updatedAt,
      privacyMarks: partyId ? (marksByParty[partyId] ?? []) : [],
      hasLiveContracts: true,
      otherLiveServicesCount: 0,
    });
    const projected: SubscriberListItem = projectSubscriberForList(subscriber, role, canSeeBlocked);
    const subscriberDisplayName = projected.anonymizedAt
      ? 'Anonimizado'
      : projected.privacyRestricted
        ? 'Datos bloqueados'
        : projected.personType === PersonType.JURIDICA
          ? projected.businessName?.trim() || 'Sin razón social'
          : [projected.firstName, projected.lastName].filter(Boolean).join(' ').trim() ||
            'Sin nombre';
    const billingCycleDay = Number(row['billing_cycle_day']);
    return {
      contractId: String(row['contract_id']),
      subscriberId: String(row['subscriber_id']),
      subscriberDisplayName,
      planName: typeof row['plan_name'] === 'string' ? row['plan_name'] : null,
      billingCycleDay,
      cutoffDate,
    };
  }

  private _validateActivationInputs(
    serviceUsage: ServiceUsage | null,
    installationStratum: number | null,
    personType: PersonType,
  ): asserts serviceUsage is ServiceUsage {
    if (!serviceUsage) {
      throw new UnprocessableEntityException({
        code: 'SERVICE_USAGE_REQUIRED',
        message: 'serviceUsage es obligatorio para activar el contrato.',
      });
    }
    this._validateServicePoint(serviceUsage, installationStratum, personType);
  }

  private _validateServicePoint(
    serviceUsage: ServiceUsage,
    installationStratum: number | null,
    personType: PersonType,
  ): void {
    if (serviceUsage === ServiceUsage.RESIDENTIAL && personType === PersonType.JURIDICA) {
      throw new UnprocessableEntityException({
        code: 'RESIDENTIAL_USAGE_NOT_ALLOWED',
        message: 'Una persona jurídica no puede registrar un punto de servicio residencial.',
      });
    }
    if (serviceUsage === ServiceUsage.RESIDENTIAL && installationStratum == null) {
      throw new UnprocessableEntityException({
        code: 'STRATUM_REQUIRED',
        message: 'installationStratum es obligatorio para un punto de servicio residencial.',
      });
    }
  }

  /**
   * `manager` es el de la transacción del llamante cuando la resolución corre
   * dentro de una; sin él las lecturas de catálogo y media abren su propia
   * conexión, como antes (D3).
   */
  private async _resolveVatSnapshot(
    contract: Contract,
    capturedPlan?: ContractPlanTaxSnapshot,
    manager?: EntityManager,
  ): Promise<Contract['vatSnapshot']> {
    const { tenantId, schemaName } = TenantContext.getOrThrow();
    const plan =
      capturedPlan ??
      (await this.commercialCatalogPort.getPlanById(
        tenantId,
        schemaName,
        contract.planId,
        manager ? { manager } : undefined,
      ));
    if (!plan || !plan.vatConcept) {
      throw new UnprocessableEntityException({
        code: 'VAT_CONCEPT_REQUIRED',
        message: 'El plan no tiene concepto fiscal asignado.',
      });
    }
    if (!contract.serviceUsage) {
      throw new UnprocessableEntityException({
        code: 'SERVICE_USAGE_REQUIRED',
        message: 'serviceUsage es obligatorio para activar el contrato.',
      });
    }

    const stratumEvidenceAvailable = await this._hasVerifiedStratumEvidence(
      contract,
      schemaName,
      manager,
    );
    if (contract.stratumEvidenceMediaId && !stratumEvidenceAvailable) {
      this.logger.warn(
        'Soporte de estrato heredado no verificable; se aplicará el tratamiento estándar.',
      );
    }

    let result: InternetVatResult;
    try {
      result = this.internetVatResolver.resolve({
        vatConcept: plan.vatConcept,
        networkType: plan.networkType,
        usage: contract.serviceUsage,
        stratum: contract.installationStratum,
        stratumEvidenceAvailable,
      });
    } catch (error) {
      if (error instanceof RangeError) {
        throw new UnprocessableEntityException({
          code: 'STRATUM_REQUIRED',
          message: 'installationStratum es obligatorio para un punto de servicio residencial.',
        });
      }
      throw error;
    }

    if (result.status === 'NOT_CANONICAL') return null;
    return {
      treatment: result.treatment,
      legalBasis: result.legalBasis,
      ratePercent: result.ratePercent,
      requiresAccountantReview: result.requiresAccountantReview,
      resolvedAt: new Date().toISOString(),
    };
  }

  private _assertEvidenceApplicable(contract: Contract): void {
    if (
      contract.serviceUsage !== ServiceUsage.RESIDENTIAL ||
      contract.installationStratum == null ||
      contract.installationStratum < 1 ||
      contract.installationStratum > 3
    ) {
      throw new UnprocessableEntityException({
        code: 'STRATUM_EVIDENCE_NOT_APPLICABLE',
        message: 'El soporte solo aplica a puntos residenciales de estrato 1, 2 o 3.',
      });
    }
  }

  private async _hasVerifiedStratumEvidence(
    contract: Contract,
    schemaName: string,
    manager?: EntityManager,
  ): Promise<boolean> {
    const mediaId = contract.stratumEvidenceMediaId;
    if (!mediaId) return false;
    try {
      const asset = await this.mediaService.findOne(
        mediaId,
        schemaName,
        manager ? { manager } : undefined,
      );
      return asset.usage === MediaUsage.STRATUM_EVIDENCE;
    } catch (error) {
      if (error instanceof NotFoundException) return false;
      throw error;
    }
  }

  private async _softDeleteEvidenceAsset(mediaId: string, schemaName: string): Promise<void> {
    try {
      await this.mediaService.softDeleteStratumEvidence(mediaId, schemaName);
    } catch (error) {
      if (!(error instanceof NotFoundException)) throw error;
    }
  }

  private async _auditStratumEvidenceChange(
    contract: Contract,
    actorId: string,
    previousAssetId: string | null,
    previousTreatment: string | null,
    wasActive: boolean,
  ): Promise<void> {
    await this.auditService.log({
      action: AuditAction.UPDATE,
      entityType: wasActive ? 'ContractServicePoint' : 'ContractStratumEvidence',
      entityId: contract.id,
      userId: actorId,
      oldValue: wasActive
        ? { vatTreatment: previousTreatment }
        : { hasStratumEvidence: previousAssetId !== null },
      newValue: wasActive
        ? {
            changedFields: ['stratumEvidenceMediaId'],
            vatTreatment: this._snapshotTreatment(contract.vatSnapshot),
          }
        : { hasStratumEvidence: contract.stratumEvidenceMediaId !== null },
    });
  }

  private _snapshotTreatment(value: Contract['vatSnapshot']): string | null {
    if (!value || typeof value !== 'object') return null;
    const treatment = (value as Record<string, unknown>)['treatment'];
    return typeof treatment === 'string' ? treatment : null;
  }

  /** Única regla del plan de un contrato, para la creación directa y desde expediente. */
  private _requirePlanId(value: unknown, message: string): string {
    const planId = normalizeContractPlanId(value);
    if (!planId) {
      throw new BadRequestException(message);
    }
    return planId;
  }

  /** Genera un alias legible a partir de ciudad y dirección. */
  private _buildAlias(city?: string | null, address?: string | null): string {
    // La ciudad puede llegar como código de catálogo (EL_COLEGIO): se guarda legible.
    const parts = [city, address]
      .flatMap((part) => (part ?? '').replace(/_+/g, ' ').trim().split(/\s+/))
      .filter(Boolean)
      .map(
        (word) =>
          word.charAt(0).toLocaleUpperCase('es-CO') + word.slice(1).toLocaleLowerCase('es-CO'),
      );
    if (parts.length > 0) {
      return `Servicio — ${parts.join(' ')}`.slice(0, 120);
    }
    return `Servicio del ${new Date().toLocaleDateString('es-CO')}`;
  }
}
