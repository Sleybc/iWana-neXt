import { CallHandler, ExecutionContext, Injectable, Logger, NestInterceptor } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { AuditAction } from '@iwana/shared';
import { TenantContext } from '@iwana/db';
import { AuditService } from './audit.service';
import { PlatformAuditService } from './platform-audit.service';
import { AUDIT_ENTITY_KEY } from './decorators/audit-entity.decorator';
import { SKIP_AUDIT_KEY } from './decorators/skip-audit.decorator';
import { JwtPayload } from '../auth/interfaces/jwt-payload.interface';

/**
 * Interceptor global de auditoria automatica para operaciones CUD.
 *
 * Intercepta respuestas de controladores HTTP con metodos POST, PUT, PATCH, DELETE
 * y registra automaticamente una entrada de audit trail sin necesidad de que
 * el codigo de negocio lo haga explicitamente.
 *
 * ENRUTAMIENTO DE AUDIT (RF-AUD-03, ADR-018):
 * - jwt.type === 'platform' (SYSTEM_ADMIN / IWANA_SUPPORT) → PlatformAuditService
 *   → escribe en public.platform_audit_logs
 * - jwt.type === 'tenant' con TenantContext activo → AuditService
 *   → escribe en <schema>.audit_logs del tenant
 * - Sin usuario autenticado ni TenantContext → omite silenciosamente
 *
 * EXCLUSIONES:
 * - Metodos GET, HEAD, OPTIONS (solo lectura)
 * - Handlers marcados con @SkipAudit() (emiten su propio audit o no lo requieren)
 *
 * CONVENCION DE NOMBRE DE ENTIDAD:
 * - Primero busca @AuditEntity('nombre') en el handler o controlador
 * - Si no hay decorador, deriva el nombre del controlador: 'UsersController' → 'User'
 *
 * ENTITY ID:
 * - Extrae el param :id de la ruta, si existe
 * - Fallback: propiedad `data.id` del cuerpo de la respuesta
 *
 * HLD-MOD01-ARQUITECTURA-v1.0 Seccion 1 (@iwana/audit)
 */
@Injectable()
export class AuditInterceptor implements NestInterceptor {
  private readonly logger = new Logger(AuditInterceptor.name);

  /**
   * Claves cuyo valor string se considera secreto. Es el matcher primario: la
   * lista literal de abajo solo cubre lo que el patrón no puede deducir.
   */
  static readonly SECRET_KEY_PATTERN =
    /password|secret|token|credential|apikey|api_?key|private_?key|authorization/i;

  /**
   * Claves siempre omitidas aunque el patrón no las reconozca.
   * `email` va cifrado con AES y no debe reproducirse en el registro.
   */
  static readonly ALWAYS_OMITTED_KEYS = new Set(['email']);

  /** Tope de recursión: las respuestas auditadas no anidan más que esto. */
  static readonly MAX_SANITIZE_DEPTH = 5;

  constructor(
    private readonly auditService: AuditService,
    private readonly platformAuditService: PlatformAuditService,
    private readonly reflector: Reflector,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    // Solo HTTP — ignorar RPC, WebSockets, etc.
    if (context.getType() !== 'http') return next.handle();

    const request = context.switchToHttp().getRequest<Request>();
    const method = request.method.toUpperCase();

    // Solo operaciones de escritura
    const action = this.httpMethodToAuditAction(method);
    if (!action) return next.handle();

    // Verificar si el handler o controlador tiene @SkipAudit()
    const skip = this.reflector.getAllAndOverride<boolean>(SKIP_AUDIT_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (skip) return next.handle();

    // Usuario desde el JWT claim adjunto por JwtAuthGuard
    const user = request['user'] as JwtPayload | undefined;
    const isPlatformUser = user?.type === 'platform';

    // Determinar contexto de audit:
    // - Usuario de plataforma → PlatformAuditService (public.platform_audit_logs)
    // - Usuario de tenant con TenantContext → AuditService (<schema>.audit_logs)
    // - Sin contexto identificable → omitir silenciosamente
    const tenantCtx = TenantContext.get();

    if (!isPlatformUser && !tenantCtx) return next.handle();

    // Nombre de entidad desde decorador o clase del controlador
    const entityType =
      this.reflector.getAllAndOverride<string>(AUDIT_ENTITY_KEY, [
        context.getHandler(),
        context.getClass(),
      ]) ?? context.getClass().name.replace(/Controller$/i, '');

    const userId = user?.sub ?? null;

    // IP/User-Agent del request
    const ipAddress = (request.ip ?? request.socket?.remoteAddress ?? null) as string | null;
    const rawUserAgent = request.headers['user-agent'];
    const userAgent = typeof rawUserAgent === 'string' ? rawUserAgent : null;

    // ID de entidad desde route param :id
    const routeId = (request.params as Record<string, string> | undefined)?.['id'] ?? null;

    return next.handle().pipe(
      tap({
        next: (response: unknown) => {
          const responseRecord =
            response && typeof response === 'object' ? (response as Record<string, unknown>) : null;
          const responseData =
            responseRecord?.['data'] && typeof responseRecord['data'] === 'object'
              ? (responseRecord['data'] as Record<string, unknown>)
              : responseRecord;

          // Extraer entityId desde la ruta o del cuerpo de la respuesta
          const entityId =
            routeId ??
            (typeof responseData?.['id'] === 'string' ? responseData['id'] : null) ??
            'unknown';

          // Registrar solo el nuevo valor para CREATE; omitir el cuerpo para DELETE
          const newValue =
            action !== AuditAction.DELETE ? this.sanitizeResponseData(responseData) : null;

          const entryBase = {
            action,
            entityType,
            entityId: String(entityId),
            newValue,
            userId,
            ipAddress,
            userAgent,
          };

          // RF-AUD-03 (ADR-018): enrutar según tipo de usuario
          if (isPlatformUser) {
            // SYSTEM_ADMIN / IWANA_SUPPORT → public.platform_audit_logs
            void this.platformAuditService.log(entryBase);
          } else if (tenantCtx) {
            // Usuario de tenant → <schema>.audit_logs
            void this.auditService.log({
              ...entryBase,
              tenantId: tenantCtx.tenantId,
              schemaName: tenantCtx.schemaName,
            });
          }
        },
        error: () => {
          // No auditar errores aqui — el handler de errores los registra si aplica
        },
      }),
    );
  }

  /**
   * Mapea el metodo HTTP al AuditAction correspondiente.
   * Retorna null para metodos no auditables (GET, HEAD, OPTIONS).
   */
  private httpMethodToAuditAction(method: string): AuditAction | null {
    switch (method) {
      case 'POST':
        return AuditAction.CREATE;
      case 'PUT':
      case 'PATCH':
        return AuditAction.UPDATE;
      case 'DELETE':
        return AuditAction.DELETE;
      default:
        return null;
    }
  }

  /**
   * Sanitiza el objeto de respuesta antes de guardarlo en el audit log.
   *
   * La versión anterior era una denylist de claves literales aplicada **solo al
   * primer nivel**. Dos consecuencias, ambas confirmadas contra la base real:
   * `temporaryPassword` no estaba en la lista, y las respuestas de los endpoints
   * de credenciales devuelven la contraseña dentro de un envoltorio `{data:{…}}`
   * — de modo que el secreto quedó en claro en `platform_audit_logs` y en
   * `<schema>.audit_logs`.
   *
   * Ahora el matcher primario es un patrón sobre el nombre de la clave, y el
   * recorrido es recursivo. La garantía no la da esta lista sino
   * `audit.interceptor.sanitize.spec.ts`, que afirma que ninguna clave que
   * empareje el patrón sobrevive al saneado a ninguna profundidad.
   *
   * **El predicado solo se aplica a valores de tipo string.** Un secreto siempre
   * es una cadena; `passwordResetRequired` es un booleano y es dato de auditoría
   * legítimo. Sin esa condición se perdería fidelidad sin ganar seguridad.
   */
  private sanitizeResponseData(data: unknown): Record<string, unknown> | null {
    // Un array en el nivel superior sigue sin auditarse, como hasta ahora: las
    // respuestas de listado no aportan trazabilidad de cambio y el volumen es
    // alto. Cambiarlo sería una decisión aparte.
    if (!data || typeof data !== 'object' || Array.isArray(data)) return null;

    return this.sanitizeValue(data, 0) as Record<string, unknown>;
  }

  private sanitizeValue(value: unknown, depth: number): unknown {
    if (depth > AuditInterceptor.MAX_SANITIZE_DEPTH) {
      return '[PROFUNDIDAD_EXCEDIDA]';
    }

    if (value === null || typeof value !== 'object') {
      return value;
    }

    // Las fechas deben pasar intactas: `Object.entries(new Date())` es `[]`, así
    // que un recorrido ingenuo convertiría cada createdAt/updatedAt en `{}`.
    if (value instanceof Date) {
      return value;
    }

    if (Buffer.isBuffer(value)) {
      return '[BINARIO]';
    }

    if (Array.isArray(value)) {
      return value.map((item) => this.sanitizeValue(item, depth + 1));
    }

    const result: Record<string, unknown> = {};

    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      if (AuditInterceptor.isSecretEntry(key, item)) {
        continue;
      }

      result[key] = this.sanitizeValue(item, depth + 1);
    }

    return result;
  }

  /** ¿Esta pareja clave/valor transporta un secreto? */
  private static isSecretEntry(key: string, value: unknown): boolean {
    if (AuditInterceptor.ALWAYS_OMITTED_KEYS.has(key)) {
      return true;
    }

    return typeof value === 'string' && AuditInterceptor.SECRET_KEY_PATTERN.test(key);
  }
}
