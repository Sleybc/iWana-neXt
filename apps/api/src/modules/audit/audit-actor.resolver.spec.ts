import { DataSource } from 'typeorm';
import { PlatformUser, User } from '@iwana/db';
import { AuditActorResolver } from './audit-actor.resolver';

describe('AuditActorResolver', () => {
  it('resuelve actores tenant por lote con nombre, rol, estado y soft delete', async () => {
    const find = jest.fn().mockResolvedValue([
      {
        id: 'tenant-user-1',
        email: 'persona@example.test',
        firstName: 'Laura',
        lastName: 'Rojas',
        role: 'ADMIN',
        status: 'ACTIVE',
        deletedAt: null,
      },
      {
        id: 'tenant-user-2',
        email: 'legacy@example.test',
        firstName: null,
        lastName: null,
        role: 'SUPPORT',
        status: 'INACTIVE',
        deletedAt: new Date('2026-01-01T00:00:00.000Z'),
      },
    ]);
    const manager = { getRepository: jest.fn().mockReturnValue({ find }) };
    const queryRunner = { manager } as never;
    const resolver = new AuditActorResolver({} as DataSource);

    const result = await resolver.resolveMany(
      ['tenant-user-1', 'tenant-user-2', 'tenant-user-1', null],
      { source: 'tenant', queryRunner },
    );

    expect(manager.getRepository).toHaveBeenCalledWith(User);
    expect(find).toHaveBeenCalledWith(
      expect.objectContaining({
        where: [{ id: 'tenant-user-1' }, { id: 'tenant-user-2' }],
        withDeleted: true,
        select: ['id', 'firstName', 'lastName', 'role', 'status', 'deletedAt'],
      }),
    );
    expect(result.get('tenant-user-1')).toEqual({
      id: 'tenant-user-1',
      type: 'tenant',
      displayName: 'Laura Rojas',
      role: 'ADMIN',
      status: 'ACTIVE',
      isDeleted: false,
    });
    expect(result.get('tenant-user-2')).toEqual({
      id: 'tenant-user-2',
      type: 'tenant',
      displayName: 'Usuario tenant-u',
      role: 'SUPPORT',
      status: 'INACTIVE',
      isDeleted: true,
    });
    expect(JSON.stringify(result.get('tenant-user-2'))).not.toContain('legacy@example.test');
  });

  it('no expone correo en el read-model cuando el actor legacy no tiene nombre', async () => {
    const find = jest.fn().mockResolvedValue([
      {
        id: 'tenant-user-legacy',
        email: 'legacy@example.test',
        firstName: null,
        lastName: null,
        role: 'SUPPORT',
        status: 'INACTIVE',
        deletedAt: null,
      },
    ]);
    const manager = { getRepository: jest.fn().mockReturnValue({ find }) };
    const resolver = new AuditActorResolver({} as DataSource);

    const result = await resolver.resolveMany(['tenant-user-legacy'], {
      source: 'tenant',
      queryRunner: { manager } as never,
    });
    const actor = result.get('tenant-user-legacy');

    expect(actor?.displayName).toBe('Usuario tenant-u');
    expect(actor?.displayName).not.toContain('@');
    expect(JSON.stringify(actor)).not.toContain('legacy@example.test');
    expect(find).toHaveBeenCalledWith(
      expect.objectContaining({
        select: ['id', 'firstName', 'lastName', 'role', 'status', 'deletedAt'],
      }),
    );
  });

  it('resuelve actores plataforma sin seleccionar email cifrado', async () => {
    const find = jest.fn().mockResolvedValue([
      {
        id: 'platform-user-1',
        firstName: 'Marta',
        lastName: 'Silva',
        role: 'SYSTEM_ADMIN',
        status: 'ACTIVE',
        deletedAt: null,
      },
    ]);
    const dataSource = {
      getRepository: jest.fn().mockReturnValue({ find }),
    } as unknown as DataSource;
    const resolver = new AuditActorResolver(dataSource);

    const result = await resolver.resolveMany(['platform-user-1'], { source: 'platform' });

    expect(dataSource.getRepository).toHaveBeenCalledWith(PlatformUser);
    expect(find).toHaveBeenCalledWith(
      expect.objectContaining({
        select: ['id', 'firstName', 'lastName', 'role', 'status', 'deletedAt'],
        withDeleted: true,
      }),
    );
    expect(result.get('platform-user-1')).toEqual({
      id: 'platform-user-1',
      type: 'platform',
      displayName: 'Marta Silva',
      role: 'SYSTEM_ADMIN',
      status: 'ACTIVE',
      isDeleted: false,
    });
  });

  it('genera actores sistema y desconocido como fallback seguro', () => {
    const resolver = new AuditActorResolver({} as DataSource);

    expect(resolver.systemActor()).toEqual({
      id: null,
      type: 'system',
      displayName: 'Sistema',
    });
    expect(resolver.unknownActor('12345678-actor')).toEqual({
      id: '12345678-actor',
      type: 'unknown',
      displayName: 'Actor 12345678',
    });
  });
});
