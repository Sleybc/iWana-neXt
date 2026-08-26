import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, In } from 'typeorm';
import { PlatformUser, runInTenantSchema, User } from '@iwana/db';
import { CrmActorReadPort, type CrmActorSnapshot } from '../ports/crm-actor-read.port';

@Injectable()
export class CrmActorReadAdapter extends CrmActorReadPort {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {
    super();
  }

  async findById(schemaName: string, actorId: string): Promise<CrmActorSnapshot | null> {
    if (!actorId) {
      return null;
    }

    const actors = await this.findByIds(schemaName, [actorId]);
    return actors[0] ?? null;
  }

  async findByIds(schemaName: string, actorIds: string[]): Promise<CrmActorSnapshot[]> {
    if (actorIds.length === 0) {
      return [];
    }

    return runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      const tenantUsers = await qr.manager.find(User, {
        where: { id: In(actorIds) },
        select: ['id', 'firstName', 'lastName', 'role'],
      });
      const foundTenantIds = new Set(tenantUsers.map((user) => user.id));
      const unmatchedIds = actorIds.filter((id) => !foundTenantIds.has(id));
      const platformUsers =
        unmatchedIds.length > 0
          ? await qr.manager.find(PlatformUser, {
              where: { id: In(unmatchedIds) },
              select: ['id', 'firstName', 'lastName'],
            })
          : [];

      return [...tenantUsers, ...platformUsers].map((actor) => ({
        id: actor.id,
        name: this.formatActorName(actor),
        role: 'role' in actor && typeof actor.role === 'string' ? actor.role : null,
      }));
    });
  }

  private formatActorName(actor: {
    firstName: string | null;
    lastName: string | null;
  }): string | null {
    const composedName = [actor.firstName, actor.lastName].filter(Boolean).join(' ').trim();
    return composedName || null;
  }
}
