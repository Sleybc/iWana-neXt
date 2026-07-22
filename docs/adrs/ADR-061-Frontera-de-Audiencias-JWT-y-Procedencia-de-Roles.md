# ADR-061: Frontera de audiencias JWT y procedencia de roles plataforma/tenant

**Versión:** 1.0
**Estado:** Propuesto
**Fecha:** 2026-07-22
**Modo activo:** Architect
**Autor:** AI-EM-ARCH
**Aprobado por:** — pendiente CTO Humano
**Hallazgo origen:** H-01 (crítica) — auditoría MOD04 Usuarios Internos, revisión AppSec 2026-07-22 (AI-SEC-ENG)

---

## Contexto

La plataforma emite dos clases de access token desde el mismo servicio de autenticación:

| Clase | Emisión | Claims distintivos |
| --- | --- | --- |
| Token de plataforma | `PlatformUser` (SYSTEM_ADMIN, IWANA_SUPPORT) | `type: 'platform'`, `tenantId: null`, `schemaName: null` |
| Token de tenant | `User` del schema de un tenant | `type: 'tenant'`, `tenantId` y `schemaName` poblados |

El claim `type` existía y estaba correctamente poblado. **Ningún guard de la cadena de autorización lo leía.** La autorización se resolvía exclusivamente comparando el string del rol en `RolesGuard`, y los enums `PlatformRole` y `UserRole` comparten dos literales idénticos: `SYSTEM_ADMIN` e `IWANA_SUPPORT`.

Consecuencia verificada por AI-SEC-ENG: un `ADMIN` de cualquier tenant podía autopromoverse a `SYSTEM_ADMIN` (el CRUD de usuarios de tenant aceptaba el valor sin allowlist), re-loguearse, y alcanzar todas las superficies de plataforma — incluido `POST /tenants/:id/regenerate-admin-credentials`, que devuelve credenciales de administrador de **tenants ajenos** en texto claro. La operación además no dejaba asiento de auditoría, porque el interceptor descartaba en silencio las peticiones sin `TenantContext` resoluble.

Agravante estructural: ambos tokens se firman con **la misma clave RSA**, sin `issuer` ni `audience` diferenciados. Son criptográficamente indistinguibles para todo lo que no lea `payload.type`.

Dos causas raíz independientes, que exigen dos decisiones separadas:

1. **La verificación del token no distingue audiencias.** Un fallo de la capa criptográfica.
2. **El modelo de roles mezcla dos dominios en un enum.** Un fallo del modelo de datos.

## Decisión

### 1. Separación criptográfica de audiencias (implementada)

Cada clase de token se firma con un par `(issuer, audience)` disjunto, declarado en una fuente única (`auth.constants.ts`) consumida tanto por la firma como por la verificación:

- Plataforma: `iwana-next/platform` + `iwana-next:platform-api`
- Tenant: `iwana-next/tenant` + `iwana-next:tenant-api`

`JwtStrategy` valida `issuer` y `audience` en la verificación de firma, y **además** exige coherencia entre el par recibido y el claim `type`. Aceptar ambos pares en `verifyOptions` sin esa segunda comprobación dejaría la puerta abierta; la comprobación de coherencia es la frontera real.

Se retira `JWT_ISSUER` como variable de configuración: no estaba en el esquema Joi ni en ningún `.env`, siempre resolvía al valor por defecto, y un issuer único ya no basta para distinguir audiencias.

### 2. Frontera de procedencia de roles (implementada)

En tiempo de ejecución un rol es solo un string; su enum de origen no es recuperable. Se declara por tanto un conjunto explícito en `@iwana/shared`, derivado de `Object.values(PlatformRole)` para que no pueda desincronizarse si el enum crece:

- `PLATFORM_ONLY_ROLES` / `isPlatformOnlyRole()`
- `TENANT_ASSIGNABLE_ROLES` / `isTenantAssignableRole()`

`RolesGuard` exige coherencia simétrica: **rol de plataforma ⇔ token de plataforma**. La comprobación es por rol efectivo, no por ruta, de modo que una ruta de plataforma futura queda cubierta sin intervención. Un `PlatformOnlyGuard` a nivel de clase complementa —no sustituye— en los controladores cuya superficie completa es de plataforma.

`TenantController` **no** puede llevar ese guard de clase: mezcla rutas de ámbito tenant y de plataforma. Ahí la protección la da exclusivamente `RolesGuard`.

### 3. Contención en el CRUD de tenant (implementada)

`SYSTEM_ADMIN` e `IWANA_SUPPORT` dejan de ser asignables desde el módulo de usuarios de tenant, validado **en el DTO y en el servicio**. La duplicación es deliberada: `bulkCreate` entra por un validador Zod distinto, y un servicio no debe confiar en su único llamador de hoy.

### 4. Salida de los roles de plataforma del enum `UserRole` (PENDIENTE — requiere aprobación)

Los puntos 1–3 son defensa perimetral eficaz para el vector reportado, pero **la columna `users.role` sigue admitiendo los valores a nivel de tipo**. Cualquier escritura futura que no pase por `UsersService` puede reintroducir el estado inválido; `RolesGuard` seguiría negando el acceso, pero el dato sucio existiría.

La corrección estructural es retirar `SYSTEM_ADMIN` e `IWANA_SUPPORT` de `UserRole`, dejándolos exclusivamente en `PlatformRole`. Exige:

- Migración tenant que verifique ausencia de filas con esos roles y estreche el dominio de la columna.
- Revisión de las ~200 rutas que declaran `@Roles(UserRole.ADMIN, UserRole.SYSTEM_ADMIN)` — patrón que hoy mezcla ambos dominios en un mismo decorador.
- Consolidación de la tercera copia de la regla en `access-control.service.ts`.

**Esta parte no se ejecuta sin aprobación del CTO.** Se documenta aquí para que la deuda quede trazada y no se pierda.

## Impacto

**Multi-tenancy:** restaura el aislamiento entre tenants, que era la garantía rota. Sin cambios en la estrategia de schema por tenant.

**Seguridad:** cierra una escalación de privilegio crítica cross-tenant. Añade defensa en profundidad en dos capas independientes (verificación de firma y autorización). Cierra además el punto ciego de auditoría que hacía el ataque intrazable.

**Escala:** sin impacto. Las comprobaciones son O(1) sobre un `Set` en memoria.

**Regulación:** relevante para Ley 1581 (habeas data) — el vector permitía acceso a datos personales de clientes de otros tenants. Sin exposición productiva confirmada por el CTO el 2026-07-22, por lo que **no procede notificación a la SIC**. Requiere verificación con fuente oficial si esa premisa cambiara.

**Compatibilidad:** los tokens emitidos antes del cambio dejan de validar (401). Requiere re-login en `web` y `portal`. Aceptable por ausencia de entorno productivo; debe comunicarse al equipo de desarrollo.

## Alternativas descartadas

**Guard dedicado aplicado ruta por ruta.** Insuficiente por sí solo: `TenantController` mezcla ámbitos, y el patrón "aplicar a mano en cada ruta" se olvida en la siguiente ruta que alguien añada. Se conserva como complemento, no como defensa primaria.

**Dos estrategias Passport separadas (`jwt-platform` / `jwt-tenant`).** Habría obligado a etiquetar explícitamente cada ruta del repo — el mismo modo de fallo por omisión que se quiere eliminar.

**Claves RSA distintas por audiencia.** Defensa más fuerte, pero duplica la gestión de claves y su rotación (ver [ADR-058](ADR-058-Rotacion-Clave-Cifrado-PII-MFA.md)) sin ventaja material sobre `issuer`/`audience` validados. Reevaluable si el modelo de amenaza cambia.

## Consecuencias

**Positivas:** el invariante queda fijado por tests que leen la metadata real de las rutas vía `Reflector`, de modo que una ruta de plataforma nueva entra automáticamente en la regresión. El modo de fallo por olvido queda eliminado, no solo la instancia.

**Negativas:** la deuda del punto 4 permanece abierta. Mientras exista, el modelo de roles sigue admitiendo un estado que la aplicación rechaza — una divergencia entre lo que el tipo permite y lo que el sistema acepta, que es exactamente el tipo de ambigüedad que originó H-01.

## Requiere CTO

**Sí.** Específicamente sobre el punto 4 (salida de los roles de plataforma del enum `UserRole`), que implica migración de datos y revisión transversal de decoradores. Los puntos 1–3 se implementaron como remediación de una vulnerabilidad crítica y se documentan aquí para su ratificación.

## Referencias

- Auditoría MOD04 Usuarios Internos — backend, migraciones y datos (2026-07-22)
- [ADR-017](ADR-017-Provisioning-Schema-BullMQ.md) — aislamiento multi-tenant por schema
- [ADR-058](ADR-058-Rotacion-Clave-Cifrado-PII-MFA.md) — gestión de claves de cifrado
- `AGENTS.md` — gates de merge: sin vulnerabilidades críticas, sin violaciones de boundary
