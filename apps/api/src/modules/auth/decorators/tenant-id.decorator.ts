import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { JwtPayload } from '../interfaces/jwt-payload.interface';

/**
 * Decorador @TenantId().
 * Extrae el tenantId del JWT payload del request autenticado.
 * Requiere que JwtAuthGuard este activo.
 *
 * Uso:
 *   @Get('something')
 *   @UseGuards(JwtAuthGuard)
 *   async action(@TenantId() tenantId: string) { ... }
 *
 * Complementa TenantContext (AsyncLocalStorage) para acceso
 * directo al tenantId en el handler cuando se prefiera inyeccion
 * explicita al contexto implicito.
 *
 * HLD-MOD01-ARQUITECTURA-v1.0 Seccion 2 (Guards y decoradores)
 */
export const TenantId = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): string | null => {
    const request = ctx.switchToHttp().getRequest<{ user: JwtPayload }>();
    return request.user?.tenantId ?? null;
  },
);
