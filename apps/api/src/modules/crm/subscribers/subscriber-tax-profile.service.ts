import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, IsNull } from 'typeorm';
import {
  TaxAssignmentRateSource,
  TaxAssignmentStatus,
  TaxProfileStatus,
  TaxTreatment,
} from '@iwana/shared';
import { TenantContext, runInTenantSchema } from '@iwana/db';
import { SubscriberTaxProfile } from './entities/subscriber-tax-profile.entity';
import { SubscriberTaxAssignment } from './entities/subscriber-tax-assignment.entity';
import { Subscriber } from './entities/subscriber.entity';
import { TaxCatalogReadPort } from '../../taxation/ports/tax-catalog-read.port';
import {
  SubscriberTaxProfileSnapshotDto,
  TaxAssignmentSnapshotDto,
} from './dto/subscriber-tax-profile-snapshot.dto';
import { UpsertTaxAssignmentDto } from './dto/upsert-tax-assignment.dto';

/**
 * Servicio de perfil tributario del suscriptor.
 *
 * Dueño del submodelo subscriber_tax_profile / subscriber_tax_assignment.
 * Consume TaxationModule exclusivamente vía TaxCatalogReadPort (ADR-029 §D4).
 * No cruza el boundary hacia tablas de Taxation.
 *
 * Usa runInTenantSchema para todas las operaciones de escritura/lectura en el
 * schema del tenant activo, compatibilidad con pgBouncer transaction pooling.
 *
 * Responsabilidades:
 * - Crear o retornar el perfil tributario de un suscriptor.
 * - Sugerir el tratamiento de IVA según estrato (encapsulado en este servicio).
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
  ) {}

  /**
   * Retorna el perfil tributario completo del suscriptor con sus asignaciones.
   * Si aún no existe, lo crea vacío y sugiere IVA por estrato automáticamente.
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
        this.logger.log(`Creando perfil tributario para suscriptor ${subscriberId}`);
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

      // Sugerir IVA automáticamente si el perfil no tiene asignaciones aún
      if (!profile.assignments.length) {
        await this._suggestVatInSchema(qr, profile, subscriber);
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
   * Recalcula y actualiza la sugerencia de IVA del suscriptor basándose en el estrato actual.
   * Solo actualiza la asignación IVA si está en estado SUGGESTED; no sobreescribe confirmadas.
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

      await this._suggestVatInSchema(qr, profile, subscriber);

      const refreshed = await qr.manager.findOne(SubscriberTaxProfile, {
        where: { id: profile.id },
        relations: ['assignments'],
      });
      return this._toSnapshot(refreshed!);
    });
  }

  // ── Helpers privados ──────────────────────────────────────────────────────────

  /**
   * Genera o actualiza la asignación de IVA basándose en la política de estrato.
   * Busca el preset de IVA en el catálogo por código; si no existe, no genera asignación.
   * Solo sobreescribe si la asignación existente sigue en estado SUGGESTED.
   */
  private async _suggestVatInSchema(
    qr: { manager: DataSource['manager'] },
    profile: SubscriberTaxProfile,
    subscriber: Subscriber,
  ): Promise<void> {
    const ivaDef =
      (await this.taxCatalogPort.findActiveByCode('IVA_19')) ??
      (await this.taxCatalogPort.findActiveByCode('IVA'));

    if (!ivaDef) {
      this.logger.warn(
        `No se encontró definición IVA en el catálogo para tenant ${profile.tenantId}. Sin sugerencia IVA.`,
      );
      return;
    }

    const treatment = this._resolveVatTreatmentByStratum(
      subscriber.personType as string,
      subscriber.stratum,
    );
    const reason = this._buildVatReason(subscriber.personType as string, subscriber.stratum);

    const existing = await qr.manager.findOne(SubscriberTaxAssignment, {
      where: { profileId: profile.id, taxDefinitionId: ivaDef.id },
    });

    if (existing) {
      // Solo sobreescribir si sigue siendo sugerida (no confirmada ni ajustada manualmente)
      if (existing.status === TaxAssignmentStatus.SUGGESTED) {
        existing.treatment = treatment;
        existing.reason = reason;
        existing.taxNameSnapshot = ivaDef.name;
        await qr.manager.save(SubscriberTaxAssignment, existing);
      }
    } else {
      const newAssignment = qr.manager.create(SubscriberTaxAssignment, {
        tenantId: profile.tenantId,
        profileId: profile.id,
        taxDefinitionId: ivaDef.id,
        taxNameSnapshot: ivaDef.name,
        effectiveRate: treatment === TaxTreatment.STANDARD ? ivaDef.baseRate : null,
        rateSource: TaxAssignmentRateSource.CATALOG,
        treatment,
        status: TaxAssignmentStatus.SUGGESTED,
        reason,
      });
      await qr.manager.save(SubscriberTaxAssignment, newAssignment);
    }
  }

  /**
   * Política de sugerencia IVA por estrato — encapsulada para facilitar cambios normativos.
   *
   * Política operativa MVP:
   *   - Natural estrato 1-2 → EXEMPT  (exento, Ley 1819/2016 Art. 476)
   *   - Natural estrato 3   → EXCLUDED (excluido, Art. 477)
   *   - Natural estrato 4-6 → STANDARD (IVA 19%)
   *   - Jurídica            → STANDARD (IVA 19%)
   *
   * Ref: spec-2026-04-22 §6.3
   */
  private _resolveVatTreatmentByStratum(personType: string, stratum: number | null): TaxTreatment {
    if (personType === 'JURIDICA') return TaxTreatment.STANDARD;
    if (stratum === null) return TaxTreatment.STANDARD;
    if (stratum <= 2) return TaxTreatment.EXEMPT;
    if (stratum === 3) return TaxTreatment.EXCLUDED;
    return TaxTreatment.STANDARD;
  }

  private _buildVatReason(personType: string, stratum: number | null): string {
    if (personType === 'JURIDICA') return 'Persona jurídica — IVA estándar 19%';
    if (stratum === null) return 'Sin estrato — IVA estándar aplicado por defecto';
    if (stratum <= 2) return `Estrato ${stratum} — IVA exento (Ley 1819/2016 Art. 476)`;
    if (stratum === 3) return `Estrato ${stratum} — IVA excluido (Ley 1819/2016 Art. 477)`;
    return `Estrato ${stratum} — IVA estándar 19%`;
  }

  private _toSnapshot(profile: SubscriberTaxProfile): SubscriberTaxProfileSnapshotDto {
    return {
      id: profile.id,
      subscriberId: profile.subscriberId,
      segment: profile.segment,
      stratum: profile.stratumAtSuggestion,
      profileStatus: profile.profileStatus,
      confirmedAt: profile.confirmedAt?.toISOString() ?? null,
      confirmedBy: profile.confirmedBy,
      assignments: (profile.assignments ?? []).map((a) => this._toAssignmentSnapshot(a)),
      updatedAt: profile.updatedAt.toISOString(),
    };
  }

  private _toAssignmentSnapshot(a: SubscriberTaxAssignment): TaxAssignmentSnapshotDto {
    return {
      id: a.id,
      taxDefinitionId: a.taxDefinitionId,
      taxName: a.taxNameSnapshot,
      effectiveRate: a.effectiveRate,
      rateSource: a.rateSource,
      treatment: a.treatment,
      status: a.status,
      reason: a.reason,
      updatedAt: a.updatedAt.toISOString(),
    };
  }
}
