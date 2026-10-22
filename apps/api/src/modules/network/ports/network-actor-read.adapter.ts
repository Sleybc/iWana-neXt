import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { PlatformUser, runInTenantSchema, User } from '@iwana/db';
import { DataSource, In } from 'typeorm';
import type { ActorRefDto } from '@iwana/shared';
import { NetworkActorReadPort } from './network-actor-read.port';

@Injectable()
export class NetworkActorReadAdapter extends NetworkActorReadPort {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {
    super();
  }

  async findByIds(schemaName: string, ids: string[]): Promise<ActorRefDto[]> {
    const uniqueIds = [...new Set(ids.filter(Boolean))];
    if (uniqueIds.length === 0) return [];

    return runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      const tenantUsers = await qr.manager.find(User, {
        where: { id: In(uniqueIds) },
        select: ['id', 'firstName', 'lastName'],
      });
      const foundTenantIds = new Set(tenantUsers.map((user) => user.id));
      const unmatchedIds = uniqueIds.filter((id) => !foundTenantIds.has(id));
      const platformUsers =
        unmatchedIds.length > 0
          ? await qr.manager.find(PlatformUser, {
              where: { id: In(unmatchedIds) },
              select: ['id', 'firstName', 'lastName'],
            })
          : [];

      return [...tenantUsers, ...platformUsers].map((actor) => ({
        id: actor.id,
        name: [actor.firstName, actor.lastName].filter(Boolean).join(' ').trim() || null,
      }));
    });
  }
}
