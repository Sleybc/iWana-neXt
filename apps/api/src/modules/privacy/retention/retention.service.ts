import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { RetentionPolicy, UpdateRetentionPolicy } from '@iwana/shared';
import { DataSource } from 'typeorm';
import { RetentionPolicyEntity } from '../entities/retention-policy.entity';
import { withPrivacyTenant } from '../ports/privacy-tenant-query';

export function assertRetentionOnlyExtends(currentYears: number, requestedYears: number): void {
  if (requestedYears < currentYears) {
    throw new BadRequestException('El periodo de conservación solo se puede alargar.');
  }
}

@Injectable()
export class RetentionService {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async list(): Promise<RetentionPolicy[]> {
    return withPrivacyTenant(this.dataSource, async (manager) => {
      const rows = await manager.getRepository(RetentionPolicyEntity).find({
        order: { category: 'ASC' },
      });
      return rows.map((row) => this.toView(row));
    });
  }

  async extend(input: UpdateRetentionPolicy): Promise<RetentionPolicy> {
    const saved = await withPrivacyTenant(this.dataSource, async (manager) => {
      const repository = manager.getRepository(RetentionPolicyEntity);
      const policy = await repository.findOne({ where: { category: input.category } });
      if (!policy) throw new NotFoundException('No existe la categoría de retención indicada.');
      assertRetentionOnlyExtends(policy.years, input.years);
      if (input.years === policy.years) return policy;
      policy.years = input.years;
      return repository.save(policy);
    });

    return this.toView(saved);
  }

  private toView(row: RetentionPolicyEntity): RetentionPolicy {
    return {
      category: row.category,
      years: row.years,
      startEvent: row.startEvent,
      legalBasis: row.legalBasis,
      isLegalMinimum: row.isLegalMinimum,
    };
  }
}
