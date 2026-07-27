---
description: "Tests slaBreachStatus list assurance — AI-SR-QA"
name: "DEF-2 D-1 tests slaBreachStatus"
agent: "sr-qa"
---

# PROMPT DE EJECUCIÓN — AI-SR-QA

**Emisor:** AI-EM-ARCH (Orquestador)
**Fecha:** 2026-07-24
**Gate origen:** [INFORME-ADR065-OLA1-AUDITORIA-GATE-v1.0](../../docs/informes/INFORME-ADR065-OLA1-AUDITORIA-GATE-v1.0.md) · D-1
**Skills:** `testing-patterns`, `test-driven-development`

## Objetivo

Cerrar la condición de la disposición D-1: el filtro `slaBreachStatus` ya está en SQL (H-2 cerrado en código) pero **cero specs** lo cubren. Bloqueante del **cierre de DEF-2**.

## Alcance

- [ ] Test(s) de `tickets.service` `list()` (o HTTP integration del controller) con `slaBreachStatus` en las **cinco variantes** del `CASE` SQL + **un caso de página 2**.
- [ ] Congelar el contrato de alineación `entities[idx] ↔ raw[idx]` de `getRawAndEntities()` (regresión si se introduce join).
- [ ] `grep slaBreachStatus` sobre `**/*.spec.ts` debe devolver al menos un archivo tras el cambio.
- [ ] No debilitar el filtro; no mover lógica a memoria.

## Fuera de alcance

- Remediación H-1 / applySort / DEF-1 (SR-FULL).
- E2E portal (salvo que el unit/integration sea insuficiente y se justifique).

## Stop / Go

| Condición | Acción |
| --- | --- |
| 5 variantes + página 2 verdes | GO D-1 |
| Spec flaky por `NOW()` | Estabilizar con clock/fixture; no skip |
| Bloqueo de fixture tenant | `[BLOQUEO]` a EM-ARCH |

## Entregable

Specs + comando Jest ejecutado + resumen de cobertura del filtro.
