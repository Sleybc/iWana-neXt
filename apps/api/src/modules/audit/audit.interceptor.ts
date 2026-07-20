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
   *
   * **La cobertura es por nombre de clave, no por naturaleza del dato.** Un
   * secreto cuyo nombre el patrón no reconozca pasa igual: `otpauthUri` —que
   * contiene la semilla TOTP completa— sobrevivía hasta que se añadieron `otp`
   * y `qr`. Al añadir un endpoint que devuelva un secreto, comprobar que su
   * clave empareja aquí **o** ponerle `@SkipAudit()`; no basta con confiar en
   * que el patrón lo adivine.
   */
  static readonly SECRET_KEY_PATTERN =
    /password|secret|token|credential|apikey|api_?key|private_?key|authorization|otp|qr|seed|recovery|backup/i;

  /**
   * Claves PII / identidad siempre omitidas (SEC-05 + SWEEP), normalizadas a
   * minúsculas. Además, `isSecretEntry` omite sufijos `*Email` / `*Encrypted`.
   */
  static readonly ALWAYS_OMITTED_KEYS = new Set([
    'email',
    'value',
    'whatsapp',
    'nit',
    'nitdv',
    'nit_dv',
    'fullname',
    'businessname',
    'business_name',
    'razonsocial',
    'razon_social',
    'firstname',
    'first_name',
    'lastname',
    'last_name',
    'displayname',
    'display_name',
    'legalname',
    'legal_name',
    'address',
    'birthdate',
    'birth_date',
    'contactphone',
    'contact_phone',
    'contactname',
    'contact_name',
    'altcontactphone',
    'alt_contact_phone',
    'adminemail',
    'admin_email',
    'contactemail',
    'contact_email',
    'emailprimary',
    'email_primary',
    'emailsecondary',
    'email_secondary',
    'documentnumber',
    'document_number',
    'nationalid',
    'national_id',
    'identification',
    'identificacion',
    'cedula',
    'cédula',
    'phone',
    'mobile',
    'telefono',
    'teléfono',
    'celular',
    'phonenumber',
    'phone_number',
    'mobilenumber',
    'mobile_number',
    'sitecontactphone',
    'site_contact_phone',
    'phoneprimary',
    'phone_primary',
    'phonesecondary',
    'phone_secondary',
    // Altas explícitas: PII real cuyo sufijo no está cualificado por persona y
    // que un patrón genérico solo alcanzaría a costa de falsos positivos.
    // `customerDisplayName`/`expedienteFullName` terminan en `display_name` /
    // `full_name`, sufijos que comparten con campos no personales.
    'customerdisplayname',
    'customer_display_name',
    'expedientefullname',
    'expediente_full_name',
    'fiscalname',
    'fiscal_name',
    'suggestedpartyname',
    'suggested_party_name',
  ]);

  /**
   * Claves que **nunca** se omiten, aunque algún patrón futuro las empareje.
   *
   * - `actorName`: es el *sujeto* del asiento, no PII de un titular de datos.
   *   Un audit log existe para registrar quién hizo qué; la identidad del
   *   operador en ejercicio profesional es el registro mismo. Además `userId`
   *   se guarda al lado, así que redactarlo no aporta privacidad —la persona
   *   sigue identificada— y sí degrada la bitácora: `expediente.service.ts`
   *   lo lee de vuelta para pintar el actor en el timeline del expediente.
   * - `piiaAccess`: su valor es el *nombre* del campo accedido
   *   (p. ej. `'documentNumber'`), nunca su contenido. `expediente.service.ts`
   *   lo lee para distinguir un acceso PII de una edición de sección. Omitirlo
   *   rompería ese filtro sin proteger ningún dato.
   *
   * Es la frontera de esta política: se protege la PII de los **titulares de
   * datos**, no la identidad de quien opera el sistema ni los nombres de campo.
   */
  static readonly NEVER_OMITTED_KEYS = new Set(['actorname', 'piiaaccess']);

  /**
   * Direcciones técnicas: identifican una máquina, no un domicilio. `ipAddress`
   * es además columna propia del audit y su omisión rompería la trazabilidad.
   */
  static readonly TECHNICAL_ADDRESS_PATTERN = /(^|_)(ip|mac|remote)_address$/;

  /**
   * Sufijos de clave que denotan PII de un titular de datos.
   *
   * **Se evalúa sobre la clave normalizada a snake_case** (ver
   * {@link normalizePiiKey}), no sobre la clave cruda. Eso da un límite de
   * token real y es lo que evita los falsos positivos que hundirían la
   * fidelidad del registro:
   * - `unit` NO empareja `nit` (en crudo, `/nit$/i` sí lo hace).
   * - `fileName`, `schemaName`, `categoryName`, `queueName`, `typeName` NO
   *   emparejan: `name` a secas no está en la lista. Un `name$` ciego habría
   *   redactado `schemaName` en `platform_audit_logs`, que es justo lo que
   *   permite trazar qué tenant se aprovisionó.
   *
   * Por eso los nombres solo se omiten **cualificados por persona**
   * (`purchasingContactName`, `technicianName`, …) y nunca por el sufijo
   * `name` suelto. Lo que no encaje en un sufijo va a
   * {@link ALWAYS_OMITTED_KEYS} como alta explícita.
   */
  static readonly PII_KEY_SUFFIX_PATTERN =
    /(^|_)(email|encrypted|phone|document_number|nit|address|(contact|person|customer|holder|owner|subscriber|responsible|technician|uploaded_by|directed_to)_name)$/;

  /** `purchasingContactPhone` → `purchasing_contact_phone`. */
  static normalizePiiKey(key: string): string {
    return key
      .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
      .replace(/([A-Z]+)([A-Z][a-z])/g, '$1_$2')
      .toLowerCase();
  }

  /** ¿La clave denota PII de un titular de datos, por sufijo normalizado? */
  static matchesPiiSuffix(key: string): boolean {
    if (AuditInterceptor.NEVER_OMITTED_KEYS.has(key.toLowerCase())) {
      return false;
    }

    const normalized = AuditInterceptor.normalizePiiKey(key);

    if (AuditInterceptor.TECHNICAL_ADDRESS_PATTERN.test(normalized)) {
      return false;
    }

    return AuditInterceptor.PII_KEY_SUFFIX_PATTERN.test(normalized);
  }

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

  /**
   * ¿Esta pareja clave/valor transporta un secreto o PII?
   * - Secretos: patrón sobre el nombre + valor string.
   * - PII listada: string o Date (p. ej. birthDate).
   * - Sufijos *Email / *Encrypted: solo valores string.
   */
  private static isSecretEntry(key: string, value: unknown): boolean {
    const normalizedKey = key.toLowerCase();

    // Gana sobre todo lo demás: ver NEVER_OMITTED_KEYS.
    if (AuditInterceptor.NEVER_OMITTED_KEYS.has(normalizedKey)) {
      return false;
    }

    if (AuditInterceptor.ALWAYS_OMITTED_KEYS.has(normalizedKey)) {
      return typeof value === 'string' || value instanceof Date;
    }

    if (typeof value !== 'string') {
      return false;
    }

    if (AuditInterceptor.SECRET_KEY_PATTERN.test(key)) {
      return true;
    }

    return AuditInterceptor.matchesPiiSuffix(key);
  }
}
