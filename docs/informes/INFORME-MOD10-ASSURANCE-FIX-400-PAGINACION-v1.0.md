# INFORME-MOD10-ASSURANCE-FIX-400-PAGINACION-v1.0

**Versión:** 1.0
**Fecha:** 2026-08-19
**Clasificación:** Técnico — Confidencial
**Identificador:** AI-EM-ARCH (modo Orquestador + ejecución delegada)
**Módulo:** MOD10 — Service Assurance
**Tipo:** Fix de regresión (contrato de paginación, ADR-065)

---

## 1. Contexto

El portal (apps/portal, puerto 3002) recibía `400 Bad Request` en la primera carga de la bandeja de tickets: `GET /api/v1/assurance/tickets?limit=20`. El stack trace del navegador apuntaba a `AssuranceClient.tsx:253` → `api-client.ts:436`. La doble invocación visible en la consola corresponde a React StrictMode (ruido conocido, no es el defecto).

## 2. Causa raíz

Regresión de validación introducida por `9ea24f99` (2026-07-27, ADR-065 Ola 1): al reemplazar el `@Allow()` puro de `page`/`limit` por `@Type(() => Number) @IsInt() @Min(1) [@Max(100)]`, se omitió `@IsOptional()` en el DTO clase `ListTicketsQueryDto` (`apps/api/src/modules/assurance/dto/index.ts`).

El `ValidationPipe` global (`apps/api/src/main.ts:44-51`) valida el DTO clase además del `ZodValidationPipe` del parámetro. class-validator no omite valores `undefined` sin `@IsOptional()` → `?limit=20` sin `page` fallaba con `"page must be an integer number"` antes de alcanzar el schema Zod (que sí declara ambos opcionales con defaults, l.109-110).

El request del portal es válido contra el contrato vigente: ADR-065 (Aprobado) y `ListTicketsQuerySchema` (fuente de verdad de validación). La primera carga envía `{limit: 20}` sin `page` desde `cf052fe9` (2026-08-18, migración de tablas al contrato datagrid MOD00), lo que hizo el defecto inevitablemente visible.

## 3. Decisión de gobernanza

**Modo:** Orchestrator + Architect (consolidación de desempate FE-PLATFORM vs SR-FULL).

- Posición FE-PLATFORM: el frontend no envía parámetros inválidos; el 400 no se explica por el cliente.
- Posición SR-FULL: el 400 lo lanza el ValidationPipe global sobre el DTO clase (reproducido en simulación con el dist real).

**Decisión:** defecto de backend (contrato/validación). **Opción A** — añadir `@IsOptional()` como primer decorador de `page` y `limit`, replicando el patrón canónico `CrmListPaginationDto` (defense-in-depth con cotas conservadas, dictamen AI-SEC-ENG). Se descarta la Opción B (`@Allow()` total estilo inventory) por degradar la defensa en profundidad.

**Impacto:** tenant — sin impacto · seguridad — sin impacto (RBAC/PII intactos) · escala — sin impacto · regulación — sin impacto.
**Requiere ADR:** No · **Requiere CTO:** No.

## 4. Cambios aplicados

| Archivo | Cambio |
| --- | --- |
| `apps/api/src/modules/assurance/dto/index.ts:3` | Import `IsOptional` de class-validator |
| `apps/api/src/modules/assurance/dto/index.ts:364` | `@IsOptional()` en `page` (antes de `@Type`) |
| `apps/api/src/modules/assurance/dto/index.ts:371` | `@IsOptional()` en `limit` (antes de `@Type`) |
| `apps/api/src/modules/assurance/dto/list-tickets-query.dto.spec.ts` | Nuevo spec de regresión (5 tests) |

Auditoría del módulo: único DTO de query con el patrón defectuoso; el resto usa `@Allow()` + Zod. No se tocaron controller, service, Zod schema, OpenAPI, frontend ni migraciones.

## 5. Evidencia de gates

| Gate | Estado | Evidencia |
| --- | --- | --- |
| G6 — calidad | **GO** | Suite assurance: 8 suites / 63 tests PASS · spec regresión 5/5 PASS (incluye el escenario exacto `{limit:'20'}` sin `page`) · `tsc --noEmit` sin errores · lint 0 errores (8 warnings preexistentes ajenos al módulo) |
| G6.5 — merge readiness | Pendiente | Requiere corrida Linux de CI por SHA al momento de mergear |
| G7 — despliegue | No aplica | Fix no desplegado |

## 6. Deuda registrada

Ninguna nueva. Sin deuda crítica/alta abierta atribuible a este fix.

## 7. Seguimiento

- El working tree contiene trabajo preexistente de otros módulos (MOD00/MOD03/MOD05/MOD09, remediaciones UI/UX y flujo de usuarios) ajeno a este fix; debe mergearse por su propio cauce con sus gates.
- No se encontraron otros módulos con el mismo defecto en esta auditoría; si aparece un 400 análogo en otro endpoint GET paginado (mismo patrón `@Type/@IsInt` sin `@IsOptional`), aplicar el mismo fix con su test de regresión.