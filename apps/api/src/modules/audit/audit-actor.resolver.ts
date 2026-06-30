import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, In, QueryRunner } from 'typeorm';
import { PlatformUser, User } from '@iwana/db';
import { AuditActorDto } from './dto/audit-actor.dto';

type ActorSource = 'tenant' | 'platform';

interface ResolveActorsOptions {
  source: ActorSource;
  queryRunner?: QueryRunner;
}

function compactName(firstName: string | null, lastName: string | null): string | null {
  const name = [firstName, lastName]
    .map((part) => part?.trim())
    .filter(Boolean)
    .join(' ');
  return name || null;
}

function shortId(id: string): string {
  return id.length > 8 ? id.slice(0, 8) : id;
}

/**
 * Read-model de actores para auditoría.
 * Resuelve IDs por lote y devuelve solo campos mínimos de presentación.
 */
@Injectable()
export class AuditActorResolver {
  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
  ) {}

  async resolveMany(
    userIds: Array<string | null>,
    options: ResolveActorsOptions,
  ): Promise<Map<string, AuditActorDto>> {
    const ids = [...new Set(userIds.filter((id): id is string => Boolean(id)))];
    if (ids.length === 0) return new Map();

    return options.source === 'tenant'
      ? this.resolveTenantActors(ids, options.queryRunner)
      : this.resolvePlatformActors(ids);
  }

  systemActor(): AuditActorDto {
    return {
      id: null,
      type: 'system',
      displayName: 'Sistema',
    };
  }

  unknownActor(userId: string): AuditActorDto {
    return {
      id: userId,
      type: 'unknown',
      displayName: `Actor ${shortId(userId)}`,
    };
  }

  private async resolveTenantActors(
    userIds: string[],
    queryRunner?: QueryRunner,
  ): Promise<Map<string, AuditActorDto>> {
    const manager = queryRunner?.manager ?? this.dataSource.manager;
    const repo = manager.getRepository(User);
    const users = await repo.find({
      where: userIds.map((id) => ({ id })),
      withDeleted: true,
      select: ['id', 'email', 'firstName', 'lastName', 'role', 'status', 'deletedAt'],
    });

    const actors = new Map<string, AuditActorDto>();
    for (const user of users) {
      const displayName =
        compactName(user.firstName, user.lastName) ?? user.email ?? `Usuario ${shortId(user.id)}`;
      actors.set(user.id, {
        id: user.id,
        type: 'tenant',
        displayName,
        role: user.role,
        status: user.status,
        isDeleted: user.deletedAt !== null,
      });
    }
    return actors;
  }

  private async resolvePlatformActors(userIds: string[]): Promise<Map<string, AuditActorDto>> {
    const repo = this.dataSource.getRepository(PlatformUser);
    const users = await repo.find({
      where: { id: In(userIds) },
      withDeleted: true,
      select: ['id', 'firstName', 'lastName', 'role', 'status', 'deletedAt'],
    });

    const actors = new Map<string, AuditActorDto>();
    for (const user of users) {
      const displayName =
        compactName(user.firstName, user.lastName) ?? `Usuario plataforma ${shortId(user.id)}`;
      actors.set(user.id, {
        id: user.id,
        type: 'platform',
        displayName,
        role: user.role,
        status: user.status,
        isDeleted: user.deletedAt !== null,
      });
    }
    return actors;
  }
}
