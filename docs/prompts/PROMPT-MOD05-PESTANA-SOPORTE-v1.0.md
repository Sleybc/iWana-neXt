# PROMPT — MOD05 · Pestaña Soporte del suscriptor (E6): tickets y visitas

**Versión:** 1.0 · **Fecha:** 2026-10-20 · **Emisor:** AI-EM-ARCH · **Estado:** Contrato congelado; G0 aprobado por el CTO el 2026-10-20 (D-E6-1 A (composición en el portal con el permiso de cada módulo), D-E6-2 tres vías de vínculo del ticket, D-E6-3 visitas por subscriber_id o expediente, D-E6-4 OT fuera, D-E6-5 solo informar y D-E6-6 incluir el buscador del formulario de MOD10; [PRD Fase 07](../prds/PRD-MOD05-CRM-SUBSCRIBERS-FASE-07-v1.0.md) §9.1)
**Plan:** [2026-10-20-mod05-pestana-soporte.md](../plans/2026-10-20-mod05-pestana-soporte.md)
**Base:** `main` en `b6c50fef`. Última migración tenant: `158`. Se trabaja en `main`, sin ramas. **Ningún agente commitea**: lo hace AI-EM-ARCH en G7.

## 0. Reglas comunes

1. Lee `AGENTS.md`, el PRD Fase 07 completo, el plan y tu § antes de tocar código.
2. Lee los `SKILL.md` de tu fila en el plan §3 como documentación, no como tool.
3. Solo editas los archivos de tu fila en §2. Si necesitas otro, emite `[BLOQUEO]` y para.
4. TDD: el test de cada RF se escribe primero y se ve fallar.
5. Assurance y WFM **nunca** consultan tablas de CRM: solo `CrmSubscriberReadPort`.
6. Nunca PII en logs, en la URL ni en mensajes de error.
7. Evidencia: comando exacto y conteo real, sin caché. Las integraciones contra PostgreSQL deben **correr** (no omitirse) también en el job de CI.
8. Antes de congelar una aserción de prueba, verifica que el producto actual la puede cumplir o que tu bloque la implementa; si no, `[BLOQUEO]` (lección de la fase de cuarentenas).

## 1. Hechos de partida

H1-H9 del PRD §1. Anclas: `packages/database/src/entities/support-ticket.entity.ts`, `visit-request.entity.ts`, `schedule-event.entity.ts`; `apps/api/src/modules/assurance/dto/index.ts:101-113` y `services/tickets.service.ts:359`; `apps/api/src/modules/wfm/wfm.controller.ts:139-395`; `apps/api/src/modules/crm/ports/crm-subscriber-read.port.ts`; `apps/portal/src/components/assurance/AssuranceCreateTicketForm.tsx:204` y `AssuranceTicketDrawer.tsx`; `apps/portal/src/components/crm/subscribers/SubscriberDetailClient.tsx`.

## 2. Propiedad de archivos

| Bloque | Edita | Crea |
| --- | --- | --- |
| P0 | — | `docs/specs/2026-10-20-mod05-pestana-soporte-ux-spec.md` |
| B0 | `packages/database/src/migrations/tenant/runner.ts`, `apps/api/src/modules/crm/ports/crm-subscriber-read.port.ts` y su adaptador en `crm/subscribers/` | migración `159` de índices con su test integrado up/down |
| B1 | `apps/api/src/modules/assurance/**` (DTO, servicio y controlador de tickets), su esquema en `packages/shared` si existe, OpenAPI de Assurance | specs unitarias e integradas |
| B2 | `apps/api/src/modules/wfm/**` (DTO, servicios de visit-requests y events), su esquema en `packages/shared` si existe, OpenAPI de WFM | specs unitarias e integradas |
| B3 | — | `apps/api/src/cli/report-ticket-subscriber-links.ts` y sus specs |
| F1 | `apps/portal/src/components/crm/subscribers/SubscriberDetailClient.tsx` (registro de la pestaña), `apps/portal/src/lib/api-client.ts` (métodos por suscriptor) | `SubscriberSupportTab.tsx`, `SubscriberTicketsSection.tsx`, `SubscriberVisitsSection.tsx` y sus specs; E2E `e2e/tests/portal-mod05-pestana-soporte.spec.ts` |
| F2 | `apps/portal/src/components/assurance/AssuranceCreateTicketForm.tsx` y su spec | — |

`AssuranceTicketDrawer` se consume sin editarlo. Si F1 necesita cambiarlo, `[BLOQUEO]`.

---

## P0 — Spec UX de la pestaña Soporte · `prod-ux`

Secciones Tickets y Visitas (RF-SO-09, RF-SO-10), orden y campos visibles, estados de carga, vacío, error y sin permiso por sección (RF-SO-11, RF-SO-13), «Crear ticket» (RF-SO-12) y el buscador de suscriptor del formulario de tickets (RF-SO-15). Recetas de `iwana-identity-ui-review`; textos definitivos.
**Cierras cuando:** cada RF de §5.4 y RF-SO-15 tiene estado y texto (S3).

## B0 — Índices y puerto de CRM · `sr-backend`

1. Migración `159` (RF-SO-07): índices parciales aditivos y reversibles. Regístrala en `runner.ts`.
2. `CrmSubscriberReadPort.listContractIds` y `findExpedienteId` (PRD §7) con su adaptador en CRM, con alcance de tenant. **Publícalos primero (S1)** y avisa.
**Tests:** up/down contra Postgres real; el adaptador devuelve solo datos del tenant actual.
**Cierras cuando:** tests verdes con conteo real.

## B1 — Tickets por suscriptor · `sr-backend` (tras S1)

RF-SO-01 a RF-SO-03: `subscriberId` en `ListTicketsQuerySchema` con las tres vías de vínculo; los contratos llegan por el puerto. Sin cambios en el resto del listado.
**Tests:** CA-SO-01 con test integrado contra Postgres (corre en CI); `EXPLAIN` anexado (CA-SO-07).
**Cierras cuando:** tests verdes, OpenAPI regenerado y el parámetro publicado (S2).

## B2 — Visitas por suscriptor · `sr-backend` (tras S1)

RF-SO-04 a RF-SO-06: `subscriberId` en las consultas de `/wfm/visit-requests` y `/wfm/events`; coincide `subscriber_id` o el expediente del suscriptor (por el puerto); las visitas originadas en un ticket no se incluyen por esta vía.
**Tests:** CA-SO-02 con test integrado contra Postgres (corre en CI); `EXPLAIN` anexado.
**Cierras cuando:** tests verdes, OpenAPI regenerado y el parámetro publicado (S2).

## B3 — CLI de tickets mal vinculados · `sr-backend` (tras S1)

RF-SO-16: simulación por defecto, sin modo de escritura; salida con conteos e ids de ticket, sin PII.
**Cierras cuando:** CA-SO-08 con test integrado y la salida contra el tenant de desarrollo anexada.

## F1 — Pestaña Soporte · `fe-platform` (tras S2 y S3)

RF-SO-08 a RF-SO-14 según la spec de P0. Las dos secciones cargan en paralelo e independientes; cada una se oculta tras el aviso si falta su permiso, sin hacer la petición. Consume `AssuranceTicketDrawer` sin editarlo. Cualquier foco diferido se cancela en el cleanup.
**Tests:** CA-SO-03, CA-SO-04 (con F2 integrado), CA-SO-06 en specs de componente y en el E2E nuevo (sintético).
**Cierras cuando:** tests verdes con conteo real, typecheck verde y `audit-ui.mjs` sin hallazgos.

## F2 — Buscador de suscriptor en el formulario de tickets · `fe-platform` (tras S3)

RF-SO-15: con `requesterType = SUBSCRIBER`, la referencia se elige con un buscador sobre la búsqueda de suscriptores existente; los demás tipos no cambian. Acepta un suscriptor fijado desde fuera (para F1).
**Tests:** CA-SO-05; los tests existentes del formulario siguen verdes.
**Cierras cuando:** tests verdes con conteo real y typecheck verde.

---

## V1 — `sr-qa`
Traza CA-SO-01 a CA-SO-09. Corre API, shared y portal sin caché, y el E2E del portal completo (0 fallos, 0 cuarentenas). Confirma que las integraciones nuevas no están en `apps/api/integration-expected-skips.json`. Veredicto GO/NO-GO.

## V2 — `sec-eng`
RBAC por sección (CA-SO-03) y en los filtros nuevos de la API; sin PII en logs ni URL; el CLI no expone datos personales. Veredicto GO/NO-GO.

## V3 — `boundary-reviewer` ∥ `contract-drift-reviewer`
Assurance y WFM leen CRM solo por el puerto; parámetros nuevos coherentes entre shared, API, OpenAPI y portal.

## V4 — `ds-owner`
Identidad de la pestaña y del buscador contra la spec P0; `audit-ui.mjs` en 0.

## V5 — `gate-verifier`
Gates Before Merge en local, sin caché, sobre `@iwana/api`, `@iwana/shared`, `@iwana/db` y `@iwana/portal`; integración de la API con las specs nuevas ejecutadas; E2E del portal en verde. El CI de `main` se verifica en G7, después del push.

## 3. Formato de reporte

Entregables con ruta; comando y conteo real; RF y CA cubiertos por identificador; `[BLOQUEO]` si los hay; deuda nueva por severidad P0-P3.
