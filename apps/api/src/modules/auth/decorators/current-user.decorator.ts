import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { JwtPayload } from '../interfaces/jwt-payload.interface';

/**
 * Decorador @CurrentUser().
 * Extrae el payload del JWT del request autenticado.
 * Requiere que JwtAuthGuard este activo en el endpoint.
 *
 * Uso:
 *   @Get('me')
 *   @UseGuards(JwtAuthGuard)
 *   async me(@CurrentUser() user: JwtPayload) { ... }
 *
 * HLD-MOD01-ARQUITECTURA-v1.0 Seccion 2 (Guards y decoradores)
 */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): JwtPayload => {
    const request = ctx.switchToHttp().getRequest<{ user: JwtPayload }>();
    return request.user;
  },
);
