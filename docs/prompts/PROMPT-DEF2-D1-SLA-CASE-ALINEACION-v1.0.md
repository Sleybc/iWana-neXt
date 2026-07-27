---
description: "Alinear CASE SQL slaBreachStatus al enum SlaBreachStatus — AI-SR-FULL"
name: "DEF-2 D-1 CASE vs enum desempate"
agent: "sr-backend"
---

# PROMPT DE EJECUCIÓN — AI-SR-FULL (desempate EM-ARCH)

**Emisor:** AI-EM-ARCH  
**Origen:** [BLOQUEO] de AI-SR-QA tras D-1  
**Fecha:** 2026-07-24  
**Prioridad:** ALTA — bloquea cierre completo de DEF-2 D-1

## [DESEMPATE]

El contrato canónico es **`SlaBreachStatus` en `@iwana/shared`** y la lógica de **`SlaService.deriveBreachStatus`**.  
El `CASE` SQL de `tickets.service.ts` (~281-288) **está mal**: inventó `WITHIN_SLA | BREACHED | NOT_APPLICABLE` y columna fantasma `st.sla_due_at`.

| Fuente de verdad | Valores / columnas |
| --- | --- |
| Enum | `OK`, `AT_RISK`, `FIRST_RESPONSE_BREACHED`, `RESOLUTION_BREACHED` |
| Columnas reales | `sla_first_response_at`, `sla_resolve_by_at`, `first_responded_at`, `resolved_at`, `status`, `created_at` |
| **No usar** | `sla_due_at`, `WITHIN_SLA`, `BREACHED` (genérico), `NOT_APPLICABLE` |

## Alcance

1. Reescribir el `CASE` para que emita **exactamente** los literales del enum, espejando `deriveBreachStatus` (prioridad resolución > primera respuesta; ventana AT_RISK = 20% restante vía umbral ya usado en `sla.service.ts`; estados CANCELLED/CLOSED/RESOLVED con la misma rama).
2. El filtro `andWhere` compara contra `validated.slaBreachStatus` (valores Zod del enum) — debe coincidir 1:1.
3. Actualizar specs de QA en `tickets.service.spec.ts` que asumen literales CASE erróneos: las 5 variantes del prompt original se reinterpretan como las **4 del enum** + el caso de página 2 (o 4 ramas + merge + página 2). Retirar el spec que solo «documenta el gap» cuando el gap esté cerrado.
4. Correr Jest del archivo + smoke del list con cada valor del enum.

## Fuera de alcance

- No cambiar el enum ni el contrato OpenAPI del filtro (salvo alinear descripciones si mienten).
- No UI.

## Stop / Go

| Condición | Acción |
| --- | --- |
| CASE emite solo literales `SlaBreachStatus` + columnas reales | GO |
| `ListTicketsQuerySchema` acepta los 4 valores y el WHERE los usa | GO |
| Specs D-1 verdes sin documentar gap residual | GO D-1 completo |
| Ambigüedad en umbral AT_RISK en SQL | Consultar; no inventar ratio distinto de `AT_RISK_THRESHOLD_RATIO` |

## Entregable

Diff + tests verdes + nota de que D-1 queda listo para re-gate.
