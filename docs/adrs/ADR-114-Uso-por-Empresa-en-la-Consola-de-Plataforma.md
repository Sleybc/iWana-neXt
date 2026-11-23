# ADR-114: Uso por empresa en la consola de plataforma (conteos leídos desde schemas de empresa)

**Versión:** 1.3 (2026-11-23: visibilidad configurable por rol, §9) · 1.2 (2026-11-22: anonimizados fuera del conteo, §8)
**Estado:** Aprobado
**Aprobación:** CTO, 2026-11-21 («Aprobar ADR-114»), junto con D3 de la dirección; obligan las condiciones 1–7 de §7
**Fecha:** 2026-11-21
**Autor:** Claude Code (AI-EM-ARCH) · **Revisión de seguridad:** AI-SEC-ENG (§7)
**Módulos:** `apps/worker` · `apps/api` (`tenant`, `platform-branding`) · `packages/database` (schema `public`) · `apps/web` (`/dashboard`, `/settings`)
**Origen:** contrato P4 y decisión D3 de [`2026-11-21-web-centro-control-pulso-plataforma-direccion.md`](../specs/2026-11-21-web-centro-control-pulso-plataforma-direccion.md) §5–§7

## 1. Contexto

El Centro de control quiere mostrar, por empresa, los suscriptores activos frente al cupo contratado (`tenants.max_subscribers`). El cupo vive en `public`; los suscriptores viven en el schema de cada empresa. Hoy ningún endpoint de plataforma lee un schema de empresa para una vista agregada: la consola de plataforma solo lee `public`. Mostrar P4 rompe esa frontera, aunque sea con conteos.

## 2. Decisión propuesta

| # | Decisión |
| --- | --- |
| D1 | El API de plataforma **no lee schemas de empresa**. Lee una tabla de `public`, `tenant_usage_snapshots` (`tenant_id`, `active_subscribers`, `measured_at`), sin otra columna. |
| D2 | La tabla la llena un job repetible de `apps/worker` (cada hora y bajo demanda tras activar una empresa) que, por cada empresa `ACTIVE`, ejecuta **una sola consulta fija** `SELECT count(*)` sobre su schema con `search_path` acotado por `runInTenantSchema`, con la definición de «suscriptor activo» de CRM (primera activación o contrato activado), sin los anonimizados (§8). Ninguna fila ni identificador sale del schema: solo el número. |
| D3 | El job usa el rol de base de datos del worker; no se crea rol nuevo ni se amplían grants del API. |
| D4 | El endpoint `GET /api/v1/tenants/usage` (solo roles de plataforma, envuelto en `{ data }`) devuelve `{ tenantId, name, activeSubscribers, maxSubscribers, measuredAt }` por empresa. Sin nombres de suscriptores, sin montos. |
| D5 | Una empresa sin medición se muestra «sin dato», nunca 0. Una medición de más de 2 h se marca desactualizada. |
| D6 | La lectura queda auditada en `platform_audit_logs` como `LIST_ACCESS` con `entityType = 'TenantUsage'`. |

## 3. Alternativas descartadas

| Alternativa | Por qué no |
| --- | --- |
| El API recorre los schemas en cada petición | N consultas por carga del inicio, y el API de plataforma gana acceso de lectura a todos los schemas |
| Contador en `public` actualizado por CRM en cada alta y baja | Acopla CRM a una tabla de plataforma y deriva si un evento se pierde; exige reconciliación igual |
| No mostrar P4 | Deja la consola sin la señal de capacidad que pide la dirección; es la salida si el CTO rechaza D3 |

## 4. Consecuencias

- La frontera «plataforma solo lee `public`» se conserva en el API; el cruce queda confinado a un job con una consulta de conteo revisable.
- El dato tiene hasta una hora de retraso y lo dice en pantalla.
- Una empresa nueva aparece sin dato hasta su primera medición.

## 5. Tenancy y PII

Solo conteos agregados. Ninguna columna con PII cruza a `public`. El conteo de suscriptores de una empresa es dato comercial de esa empresa: lo ven solo usuarios de plataforma (`SYSTEM_ADMIN`, `IWANA_SUPPORT`).

## 6. Pendiente para aprobar

- ~~D3 de la dirección~~: aprobada por el CTO el 2026-11-21.
- ~~Visibilidad~~: CTO 2026-11-21: «System_Admin, y a los roles que se les dé permiso». ~~Se aplica con la constante `PLATFORM_TENANT_USAGE_ROLES`~~ (superado por §9: ajuste por rol guardado, sin constante).

## 7. Revisión de AI-SEC-ENG

**Veredicto: aprobable con condiciones** (2026-11-21, AI-SEC-ENG). Contrastado con `runInTenantSchema` (`packages/database/src/data-source.ts`: valida `tenant_*`, `SET LOCAL search_path` en transacción), `docker-compose.prod.yml` y `tenant.controller.ts`.

Hallazgo de contexto: API y worker conectan con el **mismo** rol `DB_APP_USER`, que ya lee todos los schemas de empresa. D3 no amplía privilegios, pero tampoco aísla: el confinamiento de D1/D2 es de código, no de base de datos. Se acepta así; no exigir rol nuevo.

STRIDE: **S** — D4 hereda JWT RS256 + guard de plataforma; un token de empresa no debe alcanzar la ruta. **T** — solo el worker escribe la tabla; el API no tiene ruta de escritura. **R** — D6 cubre la lectura; la medición no es acción de usuario. **I** — riesgo principal: que el conteo arrastre filas o que el payload filtre datos de otra empresa; mitigado por D1/D4. **D** — N empresas por hora; consultas secuenciales con tiempo límite. **E** — la consulta fija no admite entrada externa; el nombre de schema sale de `public.tenants`, nunca de la petición.

Tenancy: aceptable; ningún dato de empresa vuelve al contexto de empresa ni cruza entre empresas. PII/Ley 1581: un conteo agregado no es dato personal; sí es dato comercial reservado del ISP (requiere verificación con fuente oficial si el contrato de servicio lo regula). Los suscriptores anonimizados o con DATOS_BLOQUEADOS (ADR-094) cuentan según la regla CRM vigente, sin leer sus columnas (superado por §8: los anonimizados no cuentan).

Condiciones:
1. El conteo lo expone CRM (función o puerto con la misma definición de `subscribers.controller` «primera activación o contrato activado»); el job no duplica el SQL ni lee tablas de CRM directamente (boundary).
2. El job usa `runInTenantSchema` con el schema leído de `public.tenants` (`ACTIVE`), consulta parametrizada, `SET LOCAL statement_timeout` y fallo aislado por empresa (una caída no detiene a las demás ni escribe 0).
3. Nunca usar `DB_MIGRATOR_USER` ni `DB_PURGER_USER` en el job.
4. Logs del job: solo `tenantId`, duración y resultado; sin nombre de schema en errores al cliente.
5. D4 con `@Roles(PlatformRole...)` explícito y prueba de integración que un JWT de empresa (incluido `ADMIN`) recibe 403; respuesta sin campos fuera de D4.
6. D6 con `actorId`, `ip` y conteo de empresas devueltas; la decisión `IWANA_SUPPORT` (§6) queda en el CTO.
7. La tabla `tenant_usage_snapshots` con FK a `tenants` y borrado en cascada en la purga R7 (ADR-108).

**Verificación de implementación (2026-11-21, AI-SEC-ENG, diff sin commit).** Las 7 condiciones se cumplen; GO de seguridad.
1. Cumple: `LISTED_SUBSCRIBER_SCOPE_SQL` y `countListedSubscribers` en `packages/database/src/crm/listed-subscribers.ts:14,28`, única definición usada por CRM (`subscribers.service.ts`, copia local retirada) y por el job. Se acepta `@iwana/db` en lugar de un puerto: el worker no puede importar `apps/api`, la definición es una sola, CRM sigue como dueño declarado y solo sale un número.
2. Cumple: `tenant-usage-sampler.processor.ts:63-79` (schema de `public.tenants` `ACTIVE`, `runInTenantSchema`, `SET LOCAL statement_timeout` 5 s, `$1`), fallo aislado sin escribir 0 (`:92-98`; prueba `tenant-usage-sampler.integration.spec.ts:110-118`).
3. Cumple: conexión por defecto del worker (`:112`); ninguna referencia a migrator ni purger.
4. Cumple: logs `tenantId`, `durationMs`, `result` (`:162-170`) con `summarizeErrorForLog` y `@SanitizeFailedReason`; el job no responde a clientes.
5. Cumple: `tenant.controller.ts:799-800` `@Roles(...PLATFORM_TENANT_USAGE_ROLES)` = `SYSTEM_ADMIN`; `tenant-usage.postgres.integration.spec.ts:195-207` prueba 403 para `IWANA_SUPPORT`, `ADMIN` y `SUPPORT` de empresa, y `:154` solo campos del contrato.
6. Cumple: `tenant-usage.service.ts:51-58` audita `userId`, `ipAddress` y `tenantsReturned`.
7. Cumple: `035_tenant_usage_snapshots.ts:63-64` FK `ON DELETE CASCADE`. `iwana_purge_tenant_schema` (`029:195`) borra `public.tenants`; la acción referencial corre con el dueño de la tabla, así que `iwana_purger` no necesita grant. Prueba de cascada en `tenant-usage-sampler.integration.spec.ts:125` (con DELETE directo; informativo: no ejercita la función de purga).
Conteo con anonimizados: conforme a la regla CRM vigente y a esta §7; solo agrega, no lee columnas (superado por §8).

**Nota de implementación de la condición 1 (2026-11-21, AI-EM-ARCH).** El worker no puede importar módulos de `apps/api`, así que la definición de «suscriptor listado» vive en `packages/database/src/crm/listed-subscribers.ts` como única copia: CRM (`subscribers.service.ts`) y el job la importan de `@iwana/db`. El dueño del dato sigue siendo CRM; un cambio a esa definición se revisa como cambio de CRM. Líneas de la verificación corregidas tras `boundary-reviewer`.

## 8. Enmienda v1.2 — anonimizados fuera del conteo

**Decisión del CTO (2026-11-22):** el conteo de «Uso por empresa» excluye a los suscriptores anonimizados (`anonymized_at` no nulo); un titular anonimizado no ocupa cupo. Cierra la deuda F4-D2.

- La lista de CRM no cambia: `LISTED_SUBSCRIBER_SCOPE_SQL` sigue siendo la definición única y la comparten CRM y el job.
- El job usa `countUsageSubscribers` (`packages/database/src/crm/listed-subscribers.ts`, antes `countListedSubscribers`): esa definición más `s.anonymized_at IS NULL`. Solo lee la columna en el `WHERE`; sigue saliendo un número.
- La frase de §7 «cuentan según la regla CRM vigente» queda superada por esta enmienda.

**Verificación de AI-SEC-ENG (2026-11-22):** las 7 condiciones de §7 siguen cumpliéndose; GO. `anonymized_at` solo se lee en el `WHERE` y sale un número. Un schema anterior a la migración tenant 150 fallaría con 42703, aislado y sin escribir 0.

## 9. Enmienda v1.3 — visibilidad configurable por rol

**Decisión del CTO (2026-11-23):** alcance «ajuste por rol» (deuda F4-D3), no un modelo de permisos por usuario.

| # | Decisión |
| --- | --- |
| V1 | `SYSTEM_ADMIN` ve el uso por empresa siempre; no se puede quitar. |
| V2 | Los demás roles de plataforma (hoy solo `IWANA_SUPPORT`) lo ven si están concedidos. Valor por defecto: ninguno (solo `SYSTEM_ADMIN`). |
| V3 | Solo `SYSTEM_ADMIN` cambia el ajuste: `PUT /api/v1/tenants/usage/visibility` con `{ grantedRoles }`, validado con Zod (`UpdateTenantUsageVisibilitySchema`, `@iwana/shared`) y acotado a `TENANT_USAGE_GRANTABLE_ROLES`. Cualquier rol de plataforma lee el ajuste y su propio `canView` con `GET`. Un token de empresa recibe 403 en los tres endpoints. |
| V4 | `GET /tenants/usage` evalúa el permiso en cada petición contra el ajuste guardado (`canRoleViewTenantUsage`), sin caché: un cambio rige en la siguiente petición. `@Roles` admite los dos roles de plataforma y el servicio niega con 403 al no concedido, antes de leer o auditar. |
| V5 | El cambio se audita en `platform_audit_logs`: `UPDATE`, `entityType = 'TenantUsageVisibility'`, actor, IP, `oldValue` y `newValue` (`{ grantedRoles }`). |
| V6 | La consola monta el área según `canView` del API y no repite la regla. El control vive en Configuración → pestaña «Equipo»; para quien no es administrador se muestra en solo lectura. |

**Persistencia (migración pública 037, reversible).** Sin tabla ni módulo nuevos: columna `tenant_usage_viewer_roles text[] NOT NULL DEFAULT '{}'` en la fila única de configuración de plataforma `platform_branding_settings` (id `platform`), con `CHECK (… <@ ARRAY['IWANA_SUPPORT'])`. La lee y escribe `PlatformAccessSettingsService`, exportado por `PlatformBrandingModule` e importado por `TenantModule`. El `down` descarta las concesiones y el comportamiento vuelve a v1.2. Añadir un rol de plataforma nuevo exige ampliar el enum, `TENANT_USAGE_GRANTABLE_ROLES` y el `CHECK` en una migración.

**Fuera de alcance:** otras áreas de la consola no usan este ajuste; extenderlo es decisión aparte del CTO.

**Revisión de AI-SEC-ENG (2026-11-23):** GO de seguridad. Las 7 condiciones de §7 siguen cumpliéndose; la 5 queda con `@Roles(SYSTEM_ADMIN, IWANA_SUPPORT)` más la verificación por petición del servicio, que sustituye a la constante citada en la verificación del 2026-11-21. El permiso se evalúa en cada petición sin caché y el 403 ocurre antes de leer o auditar. Zod estricto con lista cerrada; el CHECK de la 037 acota a `IWANA_SUPPORT`; el UPSERT es parametrizado; la auditoría registra actor, IP y valores anterior y nuevo. Un token de empresa recibe 403 en los tres endpoints (prueba de integración). Deuda baja S1: envolver la lectura del valor anterior, el UPSERT y la auditoría en una transacción con `FOR UPDATE` (`platform-access-settings.service.ts`). No bloquea.

**Cierre de S1 (2026-11-23):** la escritura bloquea la fila con `SELECT … FOR UPDATE` y audita con `PlatformAuditService.logWithin` en la misma transacción; si la auditoría falla, el ajuste no cambia. Pruebas: `platform-access-settings.postgres.integration.spec.ts` y `037_tenant_usage_viewer_roles.integration.spec.ts` (reversibilidad de la 037).
