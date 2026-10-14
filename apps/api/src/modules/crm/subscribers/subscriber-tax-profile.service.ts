import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import {
  TaxApplicationSnapshot,
  TaxAssignmentRateSource,
  TaxAssignmentStatus,
  TaxCategory,
  TaxProfileStatus,
  TaxTreatment,
} from '@iwana/shared';
import { TenantContext, runInTenantSchema } from '@iwana/db';
import { SubscriberTaxProfile } from './entities/subscriber-tax-profile.entity';
import { SubscriberTaxAssignment } from './entities/subscriber-tax-assignment.entity';
import { Subscriber } from './entities/subscriber.entity';
import { TaxCatalogReadPort } from '../../taxation/ports/tax-catalog-read.port';
import {
  ITaxApplicationReadPort,
  type TaxApplicationResolveInput,
} from '../../taxation/ports/tax-application-read.port';
import {
  SubscriberTaxProfileSnapshotDto,
  TaxAssignmentSnapshotDto,
} from './dto/subscriber-tax-profile-snapshot.dto';
import { UpsertTaxAssignmentDto } from './dto/upsert-tax-assignment.dto';

/**
 * Servicio de perfil tributario del suscriptor.
 *
 * Dueño del submodelo subscriber_tax_profile / subscriber_tax_assignment.
 * Consume TaxationModule vía TaxCatalogReadPort e ITaxApplicationReadPort (ADR-082).
 *
 * Usa runInTenantSchema para todas las operaciones de escritura/lectura en el
 * schema del tenant activo, compatibilidad con pgBouncer transaction pooling.
 *
 * Responsabilidades:
 * - Crear o retornar el perfil tributario de un suscriptor.
 * - Sugerir tributos distintos de IVA mediante las reglas tributarias vigentes.
 * - Guardar asignaciones en bulk (upsert por profileId + taxDefinitionId).
 * - Leer el perfil tributario completo para Suscriptor 360.
 *
 * Ref: spec-2026-04-22 §6.3, §7, §9 — BT-TAXMVP-05, BT-TAXMVP-06, BT-TAXMVP-07
 */
@Injectable()
export class SubscriberTaxProfileService {
  private readonly logger = new Logger(SubscriberTaxProfileService.name);

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly taxCatalogPort: TaxCatalogReadPort,
    private readonly taxApplicationPort: ITaxApplicationReadPort,
  ) {}

  /**
   * Retorna el perfil tributario completo del suscriptor con sus asignaciones.
   * Si aún no existe, crea el perfil y sugiere tributos distintos de IVA.
   */
  async getOrCreateProfile(subscriberId: string): Promise<SubscriberTaxProfileSnapshotDto> {
    const { tenantId, schemaName } = TenantContext.getOrThrow();

    return runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      const subscriber = await qr.manager.findOne(Subscriber, {
        where: { id: subscriberId, tenantId },
      });
      if (!subscriber) {
        throw new NotFoundException(`Suscriptor ${subscriberId} no encontrado`);
      }

      let profile = await qr.manager.findOne(SubscriberTaxProfile, {
        where: { subscriberId, tenantId },
        relations: ['assignments'],
      });

      if (!profile) {
        this.logger.log('Creando perfil tributario de suscriptor.');
        const newProfile = qr.manager.create(SubscriberTaxProfile, {
          tenantId,
          subscriberId,
          segment: subscriber.customerSegment,
          stratumAtSuggestion: subscriber.stratum,
          profileStatus: TaxProfileStatus.PENDING_REVIEW,
        });
        profile = await qr.manager.save(SubscriberTaxProfile, newProfile);
        profile.assignments = [];
      }

      // Las asignaciones legadas se conservan; nuevas sugerencias excluyen IVA.
      if (!profile.assignments.length) {
        await this._suggestNonVatApplications(qr, profile, subscriber);
        profile =
          (await qr.manager.findOne(SubscriberTaxProfile, {
            where: { id: profile.id },
            relations: ['assignments'],
          })) ?? profile;
      }

      return this._toSnapshot(profile);
    });
  }

  /**
   * Guarda (upsert) la lista completa de asignaciones tributarias del suscriptor.
   * - Si ya existe una asignación para ese taxDefinitionId, la actualiza.
   * - Si no existe, la crea.
   * Actualiza profileStatus a CONFIGURED si hay al menos una CONFIRMED o MANUAL_ADJUSTMENT.
   *
   * Ref: spec-2026-04-22 §9.2
   */
  async saveAssignments(
    subscriberId: string,
    dtos: UpsertTaxAssignmentDto[],
    userId: string,
  ): Promise<SubscriberTaxProfileSnapshotDto> {
    const { tenantId, schemaName } = TenantContext.getOrThrow();

    return runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      const profile = await qr.manager.findOne(SubscriberTaxProfile, {
        where: { subscriberId, tenantId },
        relations: ['assignments'],
      });
      if (!profile) {
        throw new NotFoundException(
          `Perfil tributario para suscriptor ${subscriberId} no encontrado. Llame primero al endpoint GET tax-profile.`,
        );
      }

      for (const dto of dtos) {
        // Verificar que la definición tributaria existe en el catálogo
        const taxDef = await this.taxCatalogPort.findById(dto.taxDefinitionId);
        if (!taxDef) {
          throw new NotFoundException(
            `Definición tributaria ${dto.taxDefinitionId} no encontrada o inactiva en el catálogo`,
          );
        }

        // Determinar origen de la tasa
        const rateSource =
          dto.rateSource ??
          (dto.effectiveRate !== undefined
            ? TaxAssignmentRateSource.MANUAL
            : TaxAssignmentRateSource.CATALOG);

        // Tasa efectiva: preferir valor explícito del DTO; si no, usar baseRate del catálogo
        const effectiveRate =
          dto.effectiveRate !== undefined
            ? (dto.effectiveRate?.toString() ?? null)
            : taxDef.baseRate;

        // Buscar asignación existente para hacer upsert
        const existing = await qr.manager.findOne(SubscriberTaxAssignment, {
          where: { profileId: profile.id, taxDefinitionId: dto.taxDefinitionId },
        });

        if (existing) {
          existing.effectiveRate = effectiveRate;
          existing.rateSource = rateSource;
          if (dto.treatment !== undefined) existing.treatment = dto.treatment ?? null;
          if (dto.status !== undefined) existing.status = dto.status;
          if (dto.reason !== undefined) existing.reason = dto.reason ?? null;
          existing.taxNameSnapshot = taxDef.name;
          await qr.manager.save(SubscriberTaxAssignment, existing);
        } else {
          const newAssignment = qr.manager.create(SubscriberTaxAssignment, {
            tenantId,
            profileId: profile.id,
            taxDefinitionId: dto.taxDefinitionId,
            taxNameSnapshot: taxDef.name,
            effectiveRate,
            rateSource,
            treatment: dto.treatment ?? (taxDef.treatment as unknown as TaxTreatment) ?? null,
            status: dto.status ?? TaxAssignmentStatus.SUGGESTED,
            reason: dto.reason ?? null,
          });
          await qr.manager.save(SubscriberTaxAssignment, newAssignment);
        }
      }

      // Actualizar estado del perfil según el estado de las asignaciones
      const allAssignments = await qr.manager.find(SubscriberTaxAssignment, {
        where: { profileId: profile.id },
      });
      const hasConfirmed = allAssignments.some(
        (a) =>
          a.status === TaxAssignmentStatus.CONFIRMED ||
          a.status === TaxAssignmentStatus.MANUAL_ADJUSTMENT,
      );

      if (hasConfirmed && profile.profileStatus === TaxProfileStatus.PENDING_REVIEW) {
        profile.profileStatus = TaxProfileStatus.CONFIGURED;
        profile.confirmedAt = new Date();
        profile.confirmedBy = userId;
        await qr.manager.save(SubscriberTaxProfile, profile);
      }

      const refreshed = await qr.manager.findOne(SubscriberTaxProfile, {
        where: { id: profile.id },
        relations: ['assignments'],
      });
      return this._toSnapshot(refreshed!);
    });
  }

  /**
   * Actualiza una asignación tributaria individual.
   * Ref: spec-2026-04-22 §9.2
   */
  async updateAssignment(
    subscriberId: string,
    assignmentId: string,
    dto: Partial<UpsertTaxAssignmentDto>,
    userId: string,
  ): Promise<SubscriberTaxProfileSnapshotDto> {
    const { tenantId, schemaName } = TenantContext.getOrThrow();

    return runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      const profile = await qr.manager.findOne(SubscriberTaxProfile, {
        where: { subscriberId, tenantId },
      });
      if (!profile) {
        throw new NotFoundException(
          `Perfil tributario para suscriptor ${subscriberId} no encontrado`,
        );
      }

      const assignment = await qr.manager.findOne(SubscriberTaxAssignment, {
        where: { id: assignmentId, profileId: profile.id, tenantId },
      });
      if (!assignment) {
        throw new NotFoundException(`Asignación tributaria ${assignmentId} no encontrada`);
      }

      if (dto.effectiveRate !== undefined) {
        assignment.effectiveRate = dto.effectiveRate?.toString() ?? null;
        assignment.rateSource = TaxAssignmentRateSource.MANUAL;
      }
      if (dto.treatment !== undefined) assignment.treatment = dto.treatment ?? null;
      if (dto.status !== undefined) assignment.status = dto.status;
      if (dto.reason !== undefined) assignment.reason = dto.reason ?? null;

      await qr.manager.save(SubscriberTaxAssignment, assignment);

      // Actualizar estado del perfil si corresponde
      const allAssignments = await qr.manager.find(SubscriberTaxAssignment, {
        where: { profileId: profile.id },
      });
      const hasConfirmed = allAssignments.some(
        (a) =>
          a.status === TaxAssignmentStatus.CONFIRMED ||
          a.status === TaxAssignmentStatus.MANUAL_ADJUSTMENT,
      );
      if (hasConfirmed && profile.profileStatus === TaxProfileStatus.PENDING_REVIEW) {
        profile.profileStatus = TaxProfileStatus.CONFIGURED;
        profile.confirmedAt = new Date();
        profile.confirmedBy = userId;
        await qr.manager.save(SubscriberTaxProfile, profile);
      }

      const refreshed = await qr.manager.findOne(SubscriberTaxProfile, {
        where: { id: profile.id },
        relations: ['assignments'],
      });
      return this._toSnapshot(refreshed!);
    });
  }

  /**
   * Conserva la ruta legada de sugerencias para compatibilidad, pero ya no genera
   * asignaciones de IVA por suscriptor. Solo añade sugerencias de otros tributos.
   *
   * Ref: spec-2026-04-22 §6.3
   */
  async suggestVatForSubscriber(subscriberId: string): Promise<SubscriberTaxProfileSnapshotDto> {
    const { tenantId, schemaName } = TenantContext.getOrThrow();

    return runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      const subscriber = await qr.manager.findOne(Subscriber, {
        where: { id: subscriberId, tenantId },
      });
      if (!subscriber) {
        throw new NotFoundException(`Suscriptor ${subscriberId} no encontrado`);
      }

      const profile = await qr.manager.findOne(SubscriberTaxProfile, {
        where: { subscriberId, tenantId },
        relations: ['assignments'],
      });
      if (!profile) {
        throw new NotFoundException(
          `Perfil tributario para suscriptor ${subscriberId} no encontrado`,
        );
      }

      await this._suggestNonVatApplications(qr, profile, subscriber);

      const refreshed = await qr.manager.findOne(SubscriberTaxProfile, {
        where: { id: profile.id },
        relations: ['assignments'],
      });
      return this._toSnapshot(refreshed!);
    });
  }

  // ── Helpers privados ──────────────────────────────────────────────────────────

  /** Resuelve sugerencias no IVA; nunca modifica ni crea asignaciones IVA existentes. */
  private async _suggestNonVatApplications(
    qr: { manager: DataSource['manager'] },
    profile: SubscriberTaxProfile,
    subscriber: Subscriber,
  ): Promise<void> {
    const resolveInput: TaxApplicationResolveInput = {
      personType: subscriber.personType,
      segment: subscriber.customerSegment,
      ...(subscriber.stratum != null ? { stratum: subscriber.stratum } : {}),
    };
    const resolvedApps = await this.taxApplicationPort.resolve(resolveInput);
    await this._suggestResolvedApplications(qr, profile, resolvedApps);
  }

  /**
   * Sugiere tributos no IVA que devolvió el motor de Taxation.
   * El IVA canónico no se toma de tax_rules (ADR-025 / ADR-082 D6).
   */
  private async _suggestResolvedApplications(
    qr: { manager: DataSource['manager'] },
    profile: SubscriberTaxProfile,
    resolvedApps: TaxApplicationSnapshot[],
  ): Promise<void> {
    for (const snapshot of resolvedApps) {
      const taxDef = await this.taxCatalogPort.findById(snapshot.taxDefinitionId);
      if (!taxDef || taxDef.category === TaxCategory.VAT) {
        continue;
      }

      const existing = await qr.manager.findOne(SubscriberTaxAssignment, {
        where: { profileId: profile.id, taxDefinitionId: taxDef.id },
      });
      if (existing) {
        continue;
      }

      const newAssignment = qr.manager.create(SubscriberTaxAssignment, {
        tenantId: profile.tenantId,
        profileId: profile.id,
        taxDefinitionId: taxDef.id,
        taxNameSnapshot: taxDef.name,
        effectiveRate:
          snapshot.effectiveRate != null ? snapshot.effectiveRate.toString() : taxDef.baseRate,
        rateSource: TaxAssignmentRateSource.CATALOG,
        treatment: this._mapSnapshotTreatment(snapshot.treatment),
        status: TaxAssignmentStatus.SUGGESTED,
        reason: 'Sugerido por reglas de aplicación tributaria',
      });
      await qr.manager.save(SubscriberTaxAssignment, newAssignment);
    }
  }

  private _mapSnapshotTreatment(treatment: TaxApplicationSnapshot['treatment']): TaxTreatment {
    if (treatment === TaxTreatment.EXEMPT) return TaxTreatment.EXEMPT;
    if (treatment === TaxTreatment.EXCLUDED) return TaxTreatment.EXCLUDED;
    if (treatment === TaxTreatment.FIXED) return TaxTreatment.FIXED;
    return TaxTreatment.STANDARD;
  }

  private async _toSnapshot(
    profile: SubscriberTaxProfile,
  ): Promise<SubscriberTaxProfileSnapshotDto> {
    return {
      id: profile.id,
      subscriberId: profile.subscriberId,
      segment: profile.segment,
      stratum: profile.stratumAtSuggestion,
      profileStatus: profile.profileStatus,
      confirmedAt: profile.confirmedAt?.toISOString() ?? null,
      confirmedBy: profile.confirmedBy,
      assignments: await Promise.all(
        (profile.assignments ?? []).map((assignment) => this._toAssignmentSnapshot(assignment)),
      ),
      updatedAt: profile.updatedAt.toISOString(),
    };
  }

  private async _toAssignmentSnapshot(
    a: SubscriberTaxAssignment,
  ): Promise<TaxAssignmentSnapshotDto> {
    const taxDefinition = await this.taxCatalogPort.findById(a.taxDefinitionId);
    if (!taxDefinition) {
      throw new NotFoundException(
        `Definición tributaria ${a.taxDefinitionId} no disponible para clasificar la asignación.`,
      );
    }
    return {
      id: a.id,
      taxDefinitionId: a.taxDefinitionId,
      taxName: a.taxNameSnapshot,
      taxCategory: taxDefinition.category,
      effectiveRate: a.effectiveRate,
      rateSource: a.rateSource,
      treatment: a.treatment,
      status: a.status,
      reason: a.reason,
      updatedAt: a.updatedAt.toISOString(),
    };
  }
}
