---
description: "Remediacion bloqueante Ola 1 ADR-065 + cierre H-1 DEF-2 — AI-SR-FULL"
name: "ADR-065 Ola 1 + DEF-2 remediacion backend"
agent: "sr-backend"
---

# PROMPT DE EJECUCIÓN — AI-SR-FULL

**Emisor:** AI-EM-ARCH (Orquestador)
**Fecha:** 2026-07-24
**Modo:** Etapa 5 del protocolo (implementación)
**Gate origen:** [INFORME-ADR065-OLA1-AUDITORIA-GATE-v1.0](../../docs/informes/INFORME-ADR065-OLA1-AUDITORIA-GATE-v1.0.md)
**Skills:** `nestjs-expert`, `testing-patterns`, `backend-security-coder` (cota PII)

## Objetivo

Cerrar los bloqueantes de **Ola 1 → GO-CON-DEUDA** y el **H-1 de DEF-2** (tope de `limit` en CRM). Sin esto el gate permanece NO-GO / DEF-2 incompleto.

## Decisiones de gobierno ya fijadas (no reabrir)

1. **Alcance Ola 1 (estrecho):** contrato + helper + patrón en 4 recursos; los 31 restantes migran en Olas 5/6/7.
2. **`sortableFields`:** nombres lógicos; `applySort` resuelve prefijo con `qb.alias` (ADR-065 §18 actualizado).
3. **`buildPageMeta.sort`:** del **retorno** de `applySort`, nunca de la entrada del cliente.

## Alcance exacto (checklist)

### Bloqueante Ola 1 — ALTA

- [ ] **O-7(b)** En `tickets.service.ts`, `subscribers.service.ts`, `party.service.ts`: mover `applySort` **después** del `.orderBy` default (patrón = `tasks.service.ts`). Usar `addOrderBy` para desempate si aplica; no dejar que un `.orderBy` posterior borre el sort.
- [ ] **O-7(b)** Alimentar `buildPageMeta` con el retorno de `applySort` (no `sortBy`/`sortDir` crudos del DTO).
- [ ] **O-7(d)** En `apply-sort.ts`: resolver nombres lógicos → `${qb.alias}.${campo}` (o mapa del recurso). Spec propio.
- [ ] **DEF-1 / O-3** `addOrderBy('<alias>.id', …)` en las 7 órdenes:
  - `tasks.service.ts` (~229)
  - `expediente.service.ts` (~643 y ~1105)
  - `asset-lifecycle.service.ts` (~50)
  - `serialized-asset.service.ts` (~249)
  - `party-read.adapter.ts` (~82)
  - `tenant.service.ts` (~277)

### Bloqueante cierre DEF-2 — ALTA (Ley 1581)

Dictamen SEC: [INFORME-DEF2-H1-SEC-ENG-REVIEW-v1.0](../../docs/informes/INFORME-DEF2-H1-SEC-ENG-REVIEW-v1.0.md) — diseño **aceptable con ajustes**.

- [ ] **H-1 / D-2** Alcance obligatorio = **3 rutas**: `GET /crm/subscribers`, `GET /crm/expedientes`, `GET /crm/expedientes/:id/contact-attempts`. (`responsibilities` = hardening opcional).
- [ ] En **service**: `const limit = clampLimit(rawLimit)` **antes** de `clampPage(page, limit)`. Control primario = service, no solo controller.
- [ ] Defense-in-depth: DTO/Zod `@Max(100)` además del service si cabe.
- [ ] `meta.limit` = limit **efectivo**. Cap silencioso o 400 genérico (sin stack/SQL).
- [ ] Handoff a AI-SEC-ENG: **re-review del diff** antes de cerrar H-1 (no mergear sin visto PII).

### Media / junto al mismo PR

- [ ] **D-4** Retirar el comentario engañoso de `expediente.service.ts` (~653-655). Acotar la rama `documentNumber`: o `take` duro + mensaje «refine la búsqueda», o ticket explícito de índice por hash (no fingir mitigación).
- [ ] **D-7** `@ApiQuery` de `page` con `minimum: 1` en assurance + tasks; specs de `apply-sort.ts` y `clamp-limit.ts`.
- [ ] **D-3** Verificar consumidores de `apps/web` que usen `offset` no múltiplo de `limit` en la ruta de plataforma/tenants; documentar hallazgo o no-op.
- [ ] **D-6** Nota breve (comentario de módulo o JSDoc en controller) de que assurance valida query con Zod, no solo ValidationPipe.

## Fuera de alcance

- Poblar `SORTABLE_FIELDS` (Ola 2).
- Implementar ADR-066 en `runner.ts` (primer entregable Ola 2, otro prompt).
- UI / portal (AI-FE-PLATFORM).
- Tests de `slaBreachStatus` (AI-SR-QA — prompt hermano).

## Restricciones

- Sin `any`; sin PII en logs/tests; multi-tenant intacto.
- No cambiar envelope de los 31 endpoints no migrados.
- TypeORM: `orderBy` reemplaza; `addOrderBy` extiende — el defecto latente es exactamente eso.
- No inventar índices ni migraciones en este prompt.

## Stop / Go

| Condición | Acción |
| --- | --- |
| Los 3 servicios dejan de sobrescribir `applySort` + `meta.sort` = retorno | GO parcial Ola 1 |
| Las 7 órdenes tienen desempate `id` | GO parcial Ola 1 |
| CRM `limit` tope 100 en las 4 rutas | GO parcial DEF-2 |
| typecheck + lint + tests del paquete api verdes en el diff | Entrega lista para G5 |
| Cualquier duda de boundary o contrato | `[BLOQUEO]` a AI-EM-ARCH |

## Entregables

1. Diff acotado a archivos de la checklist.
2. Specs nuevos/actualizados listados arriba.
3. Resumen de fase: archivos tocados, tests corridos, deuda residual (D-4 si queda ticket).
