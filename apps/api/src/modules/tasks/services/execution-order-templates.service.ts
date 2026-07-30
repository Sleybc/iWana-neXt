import { ConflictException, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, QueryFailedError, QueryRunner } from 'typeorm';
import {
  ExecutionOrderTemplate,
  ExecutionOrderTemplateVersion,
  ExecutionOrderTemplateRequirement,
  TenantContext,
  runInTenantSchema,
} from '@iwana/db';
import {
  WfmWorkType,
  type ExecutionOrderTemplateRequirement as TemplateRequirement,
} from '@iwana/shared';

export interface CreateTemplateInput {
  key: string;
  label: string;
  workType: WfmWorkType;
  requirements: TemplateRequirement[];
  reasonCatalogs?: string[];
}

export interface CreateVersionInput {
  label: string;
  requirements: TemplateRequirement[];
  reasonCatalogs?: string[];
  effectiveFrom?: string;
}

const TEMPLATE_VERSION_RETRY_LIMIT = 3;
const TEMPLATE_VERSION_UNIQUE_CONSTRAINT = 'idx_execution_order_template_versions_key_version';

type UniqueConstraintDriverError = { code?: unknown; constraint?: unknown };

function isTemplateVersionUniqueViolation(error: unknown): boolean {
  const driverError =
    error instanceof QueryFailedError
      ? (error.driverError as UniqueConstraintDriverError)
      : typeof error === 'object' && error !== null && 'driverError' in error
        ? ((error as { driverError?: unknown }).driverError as UniqueConstraintDriverError)
        : undefined;

  return (
    driverError?.code === '23505' &&
    (driverError.constraint === undefined ||
      driverError.constraint === TEMPLATE_VERSION_UNIQUE_CONSTRAINT)
  );
}

@Injectable()
export class ExecutionOrderTemplatesService {
  private readonly logger = new Logger(ExecutionOrderTemplatesService.name);

  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  // ═══════════════════════════════════════════════════════════════════
  // Templates CRUD
  // ═══════════════════════════════════════════════════════════════════

  async listTemplates(params: {
    workType?: WfmWorkType;
    status?: 'DRAFT' | 'PUBLISHED' | 'RETIRED';
  }): Promise<ExecutionOrderTemplate[]> {
    const { tenantId, schemaName } = TenantContext.getOrThrow();

    return runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      const qb = qr.manager
        .createQueryBuilder(ExecutionOrderTemplate, 'template')
        .where('template.tenantId = :tenantId', { tenantId })
        .orderBy('template.key', 'ASC');

      if (params.workType) {
        qb.andWhere('template.workType = :workType', { workType: params.workType });
      }
      if (params.status) {
        qb.andWhere('template.status = :status', { status: params.status });
      }

      return qb.getMany();
    });
  }

  async getTemplateById(id: string): Promise<ExecutionOrderTemplate> {
    const { tenantId, schemaName } = TenantContext.getOrThrow();

    return runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      const template = await qr.manager.findOne(ExecutionOrderTemplate, {
        where: { id, tenantId },
      });
      if (!template) {
        throw new NotFoundException('Plantilla no encontrada');
      }
      return template;
    });
  }

  async createTemplate(input: CreateTemplateInput): Promise<ExecutionOrderTemplate> {
    const { tenantId, schemaName } = TenantContext.getOrThrow();

    return runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      const entity = qr.manager.create(ExecutionOrderTemplate, {
        tenantId,
        key: input.key,
        label: input.label,
        workType: input.workType,
        status: 'DRAFT',
      });
      const saved = await qr.manager.save(ExecutionOrderTemplate, entity);
      return saved;
    });
  }

  // ═══════════════════════════════════════════════════════════════════
  // Versions CRUD
  // ═══════════════════════════════════════════════════════════════════

  async listVersions(templateId: string): Promise<ExecutionOrderTemplateVersion[]> {
    const { tenantId, schemaName } = TenantContext.getOrThrow();

    return runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      const template = await qr.manager.findOne(ExecutionOrderTemplate, {
        where: { id: templateId, tenantId },
      });
      if (!template) {
        throw new NotFoundException('Plantilla no encontrada');
      }

      return qr.manager
        .createQueryBuilder(ExecutionOrderTemplateVersion, 'version')
        .leftJoinAndSelect('version.requirements', 'requirements')
        .where('version.templateId = :templateId', { templateId })
        .andWhere('version.tenantId = :tenantId', { tenantId })
        .orderBy('version.version', 'DESC')
        .addOrderBy('requirements.sortOrder', 'ASC')
        .getMany();
    });
  }

  async getVersionById(versionId: string): Promise<ExecutionOrderTemplateVersion> {
    const { tenantId, schemaName } = TenantContext.getOrThrow();

    return runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      const version = await qr.manager.findOne(ExecutionOrderTemplateVersion, {
        where: { id: versionId, tenantId },
        relations: ['requirements'],
      });
      if (!version) {
        throw new NotFoundException('Versión de plantilla no encontrada');
      }
      return version;
    });
  }

  async createVersion(
    templateId: string,
    input: CreateVersionInput,
  ): Promise<ExecutionOrderTemplateVersion> {
    const { tenantId, schemaName } = TenantContext.getOrThrow();

    for (let attempt = 0; attempt < TEMPLATE_VERSION_RETRY_LIMIT; attempt += 1) {
      try {
        return await runInTenantSchema(this.dataSource, schemaName, async (qr) =>
          this.createVersionInTransaction(qr, tenantId, templateId, input),
        );
      } catch (error) {
        // El 23505 aborta la transacción PostgreSQL; el reintento debe abrir
        // una transacción tenant nueva, no continuar con el QueryRunner actual.
        if (
          !isTemplateVersionUniqueViolation(error) ||
          attempt === TEMPLATE_VERSION_RETRY_LIMIT - 1
        ) {
          if (isTemplateVersionUniqueViolation(error)) {
            throw new ConflictException({
              code: 'TEMPLATE_VERSION_CONFLICT',
              message: 'No fue posible generar una versión única para la plantilla.',
            });
          }
          throw error;
        }
      }
    }

    throw new ConflictException({
      code: 'TEMPLATE_VERSION_CONFLICT',
      message: 'No fue posible generar una versión única para la plantilla.',
    });
  }

  private async createVersionInTransaction(
    qr: QueryRunner,
    tenantId: string,
    templateId: string,
    input: CreateVersionInput,
  ): Promise<ExecutionOrderTemplateVersion> {
    const template = await qr.manager.findOne(ExecutionOrderTemplate, {
      where: { id: templateId, tenantId },
      lock: { mode: 'pessimistic_write' },
    });
    if (!template) {
      throw new NotFoundException('Plantilla no encontrada');
    }

    // Compute next version number while holding the template row lock.
    const maxResult = await qr.manager
      .createQueryBuilder(ExecutionOrderTemplateVersion, 'v')
      .select('MAX(v.version)', 'maxVersion')
      .where('v.templateId = :templateId', { templateId })
      .andWhere('v.tenantId = :tenantId', { tenantId })
      .getRawOne<{ maxVersion: string | null }>();

    const nextVersion = Number.parseInt(maxResult?.maxVersion ?? '0', 10) + 1;

    const version = qr.manager.create(ExecutionOrderTemplateVersion, {
      tenantId,
      templateId,
      templateKey: template.key,
      version: nextVersion,
      label: input.label,
      status: 'DRAFT',
      effectiveFrom: input.effectiveFrom ? new Date(input.effectiveFrom) : null,
      reasonCatalogs: input.reasonCatalogs ?? null,
    });

    const savedVersion = await qr.manager.save(ExecutionOrderTemplateVersion, version);

    // Create requirement rows
    if (input.requirements.length > 0) {
      const requirementEntities = input.requirements.map((req, index) =>
        qr.manager.create(ExecutionOrderTemplateRequirement, {
          tenantId,
          versionId: savedVersion.id,
          key: req.key,
          label: req.label,
          required: req.required,
          kind: req.kind,
          config: this.extractConfig(req),
          sortOrder: index,
        }),
      );
      await qr.manager.save(ExecutionOrderTemplateRequirement, requirementEntities);
    }

    return qr.manager.findOne(ExecutionOrderTemplateVersion, {
      where: { id: savedVersion.id, tenantId },
      relations: ['requirements'],
    }) as Promise<ExecutionOrderTemplateVersion>;
  }

  async publishVersion(versionId: string): Promise<ExecutionOrderTemplateVersion> {
    const { tenantId, schemaName } = TenantContext.getOrThrow();

    return runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      const version = await qr.manager.findOne(ExecutionOrderTemplateVersion, {
        where: { id: versionId, tenantId },
        relations: ['requirements'],
      });
      if (!version) {
        throw new NotFoundException('Versión de plantilla no encontrada');
      }

      if (version.status === 'PUBLISHED') {
        // Idempotent: already published, return as-is
        return version;
      }

      if (version.status === 'RETIRED') {
        throw new ConflictException({
          code: 'TEMPLATE_VERSION_ALREADY_RETIRED',
          message: 'No se puede publicar una versión retirada.',
        });
      }

      version.status = 'PUBLISHED';
      version.publishedAt = new Date();
      const saved = await qr.manager.save(ExecutionOrderTemplateVersion, version);

      // Update template status if this is the first published version
      const template = await qr.manager.findOne(ExecutionOrderTemplate, {
        where: { id: version.templateId, tenantId },
      });
      if (template && template.status === 'DRAFT') {
        template.status = 'PUBLISHED';
        await qr.manager.save(ExecutionOrderTemplate, template);
      }

      return qr.manager.findOne(ExecutionOrderTemplateVersion, {
        where: { id: saved.id, tenantId },
        relations: ['requirements'],
      }) as Promise<ExecutionOrderTemplateVersion>;
    });
  }

  async retireVersion(versionId: string): Promise<ExecutionOrderTemplateVersion> {
    const { tenantId, schemaName } = TenantContext.getOrThrow();

    return runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      const version = await qr.manager.findOne(ExecutionOrderTemplateVersion, {
        where: { id: versionId, tenantId },
        relations: ['requirements'],
      });
      if (!version) {
        throw new NotFoundException('Versión de plantilla no encontrada');
      }

      if (version.status === 'RETIRED') {
        return version; // Idempotent
      }

      version.status = 'RETIRED';
      version.retiredAt = new Date();
      const saved = await qr.manager.save(ExecutionOrderTemplateVersion, version);

      return qr.manager.findOne(ExecutionOrderTemplateVersion, {
        where: { id: saved.id, tenantId },
        relations: ['requirements'],
      }) as Promise<ExecutionOrderTemplateVersion>;
    });
  }

  async getActiveVersionForWorkType(
    workType: WfmWorkType,
  ): Promise<ExecutionOrderTemplateVersion | null> {
    const { tenantId, schemaName } = TenantContext.getOrThrow();

    return runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      const template = await qr.manager.findOne(ExecutionOrderTemplate, {
        where: { tenantId, workType, status: 'PUBLISHED' },
      });
      if (!template) return null;

      const version = await qr.manager.findOne(ExecutionOrderTemplateVersion, {
        where: { tenantId, templateId: template.id, status: 'PUBLISHED' },
        relations: ['requirements'],
        order: { version: 'DESC' },
      });
      return version;
    });
  }

  // ═══════════════════════════════════════════════════════════════════
  // Immutability enforcement (DATA-P1-3)
  // ═══════════════════════════════════════════════════════════════════

  /**
   * Checks whether a published version can be deleted.
   * Returns the count of OTs still referencing it.
   */
  async countOrdersReferencingVersion(versionId: string): Promise<number> {
    const { tenantId, schemaName } = TenantContext.getOrThrow();

    return runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      const result = await qr.manager
        .createQueryBuilder('execution_orders', 'eo')
        .select('COUNT(*)', 'cnt')
        .where('eo.template_version_id = :versionId', { versionId })
        .andWhere('eo.tenant_id = :tenantId', { tenantId })
        .getRawOne<{ cnt: string }>();

      return Number.parseInt(result?.cnt ?? '0', 10);
    });
  }

  // ═══════════════════════════════════════════════════════════════════
  // Helpers
  // ═══════════════════════════════════════════════════════════════════

  /**
   * Extrae la configuración específica del requisito según su kind,
   * excluyendo las propiedades comunes que ya van en columnas propias.
   */
  private extractConfig(req: TemplateRequirement): Record<string, unknown> {
    const { key: _key, label: _label, required: _required, kind: _kind, ...rest } = req;
    return rest;
  }
}
