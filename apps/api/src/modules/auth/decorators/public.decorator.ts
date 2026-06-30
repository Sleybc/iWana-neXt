import { SetMetadata } from '@nestjs/common';

/**
 * Clave de metadata para identificar endpoints publicos.
 * JwtAuthGuard verifica esta metadata antes de validar el token.
 */
export const IS_PUBLIC_KEY = 'isPublic';

/**
 * Decorador @Public().
 * Marca un endpoint como publico — omite la validacion JWT.
 * Debe usarse con endpoints de acceso anonimo como login,
 * forgot-password, reset-password.
 *
 * Uso:
 *   @Public()
 *   @Post('login')
 *   async login(...) { ... }
 *
 * NEVER usar en endpoints que manipulen datos de usuario o tenant.
 *
 * HLD-MOD01-ARQUITECTURA-v1.0 Seccion 2 (JwtAuthGuard)
 */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
