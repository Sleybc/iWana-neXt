import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { JwtPayload } from '../interfaces/jwt-payload.interface';
import { JwtAuthGuard } from './jwt-auth.guard';

describe('JwtAuthGuard — superficie', () => {
  const original = process.env['NODE_ENV'];
  afterEach(() => {
    process.env['NODE_ENV'] = original;
  });
  const run = (type: 'platform' | 'tenant', surface?: string) => {
    const context = {
      switchToHttp: () => ({
        getRequest: () => ({ path: '/api/v1/auth/me', headers: { 'x-iwana-surface': surface } }),
      }),
    } as unknown as ExecutionContext;
    return () =>
      new JwtAuthGuard(new Reflector()).handleRequest(
        null,
        { type } as JwtPayload,
        undefined,
        context,
      );
  };

  it.each(['portal', undefined])('en producción rechaza plataforma desde %s', (surface) => {
    process.env['NODE_ENV'] = 'production';
    expect(run('platform', surface)).toThrow(UnauthorizedException);
  });

  it('en producción admite plataforma desde la consola y empresa desde ambas', () => {
    process.env['NODE_ENV'] = 'production';
    expect(run('platform', 'console')).not.toThrow();
    expect(run('tenant', 'portal')).not.toThrow();
    expect(run('tenant', 'console')).not.toThrow();
  });

  it('fuera de producción no exige la cabecera', () => {
    expect(run('platform')).not.toThrow();
  });
});
