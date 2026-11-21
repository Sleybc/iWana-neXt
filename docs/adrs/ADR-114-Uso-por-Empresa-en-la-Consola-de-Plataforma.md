# ADR-114: Uso por empresa en la consola de plataforma (conteos leídos desde schemas de empresa)

**Versión:** 1.0
**Estado:** Propuesto
**Aprobación:** pendiente del CTO (decisión D3 de la dirección)
**Fecha:** 2026-11-21
**Autor:** Claude Code (AI-EM-ARCH) · **Revisión de seguridad:** AI-SEC-ENG (§7)
**Módulos:** `apps/worker` · `apps/api` (`tenant`) · `packages/database` (schema `public`) · `apps/web` (`/dashboard`)
**Origen:** contrato P4 y decisión D3 de [`2026-11-21-web-centro-control-pulso-plataforma-direccion.md`](../specs/2026-11-21-web-centro-control-pulso-plataforma-direccion.md) §5–§7

## 1. Contexto

El Centro de control quiere mostrar, por empresa, los suscriptores activos frente al cupo contratado (`tenants.max_subscribers`). El cupo vive en `public`; los suscriptores viven en el schema de cada empresa. Hoy ningún endpoint de plataforma lee un schema de empresa para una vista agregada: la consola de plataforma solo lee `public`. Mostrar P4 rompe esa frontera, aunque sea con conteos.

## 2. Decisión propuesta

| # | Decisión |
| --- | --- |
| D1 | El API de plataforma **no lee schemas de empresa**. Lee una tabla de `public`, `tenant_usage_snapshots` (`tenant_id`, `active_subscribers`, `measured_at`), sin otra columna. |
| D2 | La tabla la llena un job repetible de `apps/worker` (cada hora y bajo demanda tras activar una empresa) que, por cada empresa `ACTIVE`, ejecuta **una sola consulta fija** `SELECT count(*)` sobre su schema con `search_path` acotado por `runInTenantSchema`, con la definición de «suscriptor activo» de CRM (primera activación o contrato activado). Ninguna fila ni identificador sale del schema: solo el número. |
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

- D3 de la dirección: que la consola muestre conteos por empresa (CTO).
- Si `IWANA_SUPPORT` debe ver P4 o solo `SYSTEM_ADMIN` (CTO).

## 7. Revisión de AI-SEC-ENG

**Veredicto: aprobable con condiciones** (2026-11-21, AI-SEC-ENG). Contrastado con `runInTenantSchema` (`packages/database/src/data-source.ts`: valida `tenant_*`, `SET LOCAL search_path` en transacción), `docker-compose.prod.yml` y `tenant.controller.ts`.

Hallazgo de contexto: API y worker conectan con el **mismo** rol `DB_APP_USER`, que ya lee todos los schemas de empresa. D3 no amplía privilegios, pero tampoco aísla: el confinamiento de D1/D2 es de código, no de base de datos. Se acepta así; no exigir rol nuevo.

STRIDE: **S** — D4 hereda JWT RS256 + guard de plataforma; un token de empresa no debe alcanzar la ruta. **T** — solo el worker escribe la tabla; el API no tiene ruta de escritura. **R** — D6 cubre la lectura; la medición no es acción de usuario. **I** — riesgo principal: que el conteo arrastre filas o que el payload filtre datos de otra empresa; mitigado por D1/D4. **D** — N empresas por hora; consultas secuenciales con tiempo límite. **E** — la consulta fija no admite entrada externa; el nombre de schema sale de `public.tenants`, nunca de la petición.

Tenancy: aceptable; ningún dato de empresa vuelve al contexto de empresa ni cruza entre empresas. PII/Ley 1581: un conteo agregado no es dato personal; sí es dato comercial reservado del ISP (requiere verificación con fuente oficial si el contrato de servicio lo regula). Los suscriptores anonimizados o con DATOS_BLOQUEADOS (ADR-094) cuentan según la regla CRM vigente, sin leer sus columnas.

Condiciones:
1. El conteo lo expone CRM (función o puerto con la misma definición de `subscribers.controller` «primera activación o contrato activado»); el job no duplica el SQL ni lee tablas de CRM directamente (boundary).
2. El job usa `runInTenantSchema` con el schema leído de `public.tenants` (`ACTIVE`), consulta parametrizada, `SET LOCAL statement_timeout` y fallo aislado por empresa (una caída no detiene a las demás ni escribe 0).
3. Nunca usar `DB_MIGRATOR_USER` ni `DB_PURGER_USER` en el job.
4. Logs del job: solo `tenantId`, duración y resultado; sin nombre de schema en errores al cliente.
5. D4 con `@Roles(PlatformRole...)` explícito y prueba de integración que un JWT de empresa (incluido `ADMIN`) recibe 403; respuesta sin campos fuera de D4.
6. D6 con `actorId`, `ip` y conteo de empresas devueltas; la decisión `IWANA_SUPPORT` (§6) queda en el CTO.
7. La tabla `tenant_usage_snapshots` con FK a `tenants` y borrado en cascada en la purga R7 (ADR-108).
