import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { JwtPayload } from '../interfaces/jwt-payload.interface';

/**
 * Guard de superficie de plataforma.
 *
 * Exige que el token sea de plataforma (`jwt.type === 'platform'`),
 * independientemente del rol declarado en @Roles().
 *
 * Es un COMPLEMENTO de defensa en profundidad, no un sustituto de la frontera
 * de tipo de token que ya aplica `RolesGuard`: se aplica a nivel de clase en
 * los controladores cuya superficie completa es de plataforma, de modo que una
 * ruta nueva en ellos quede protegida aunque olviden el @Roles().
 *
 * No se aplica a `TenantController` porque ese controlador mezcla rutas de
 * tenant y de plataforma; alli la proteccion la da `RolesGuard`.
 *
 * Respeta @Public(): las rutas anonimas de estos controladores (branding
 * publico, estado de bootstrap) no llevan token y deben seguir accesibles.
 */
@Injectable()
export class PlatformOnlyGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest<{ user?: JwtPayload }>();

    if (request.user?.type !== 'platform') {
      throw new ForbiddenException('Acceso denegado. El token no habilita este recurso.');
    }

    return true;
  }
}
