# INFORME — MOD12 Compras · Journey shell + Cotizar — Fase 24

**Versión:** 1.0  
**Estado:** Implementado — GO CTO 2026-07-17  
**Fecha:** 2026-07-17  
**Módulo:** MOD12 Inventario / SCM — Compras  
**Ejecutor:** AI-FE-PLATFORM (+ EM-ARCH docs)  
**Prompt:** `docs/prompts/PROMPT-MOD12-COMPRAS-JOURNEY-SHELL-COTIZAR-FASE-24-v1.0.md`  
**Spec:** `docs/specs/2026-07-17-mod12-compras-journey-shell-cotizar-fase24-design.md`

## Objetivo

Shell de journey en 3 fases (Preparar / Decidir / Abastecer) y progressive disclosure en Cotizar, sin cambiar API ni romper CA-23.

## Protocolo multiagente

| Track | Rol | Resultado |
| --- | --- | --- |
| Gobernanza | AI-EM-ARCH | Spec/prompt marcados GO CTO; addendum auditoría |
| UX / DS | CTO | D1–D3 congelados (aprobación explícita) |
| Frontend | AI-FE-PLATFORM | Helpers + drawer shell + disclosure |
| QA | AI-SR-QA | RTL CA-24 + typecheck |

## Cambios

### Helpers (`purchase-workbench.ts`)

- `PurchaseWorkbenchPhase`, labels, tabs por fase.
- `getPurchaseWorkbenchPhase`, `getSuggestedPurchaseWorkbenchPhase`, `canVisitPurchaseWorkbenchPhase`, `resolveTabForPurchaseWorkbenchPhase`.
- `getCotizarPrimarySection` (matriz D3).

### Shell (`PurchaseRequestWorkbenchDrawer.tsx`)

- Navegación primaria: 3 fases (`aria-label="Fase del flujo"`).
- Sub-tabs solo de la fase activa.
- Abastecer deshabilitado en borrador / fases futuras sin contenido.
- CTA next-action F23 conservada.

### Cotizar progressive disclosure

- Bloques colapsables: Ronda / Comparación / Nueva cotización.
- Primario expandido según `hasActiveRfq` → quotes → `canAddQuote`.
- C1: alerta de manual bloqueada con ronda activa.

## Criterios de aceptación

| CA | Estado |
| --- | --- |
| CA-24-01 3 fases primarias | Implementado + RTL |
| CA-24-02 Fase alineada a next-action | Implementado (helpers) |
| CA-24-03 Sub-paneles por fase | Implementado + RTL |
| CA-24-04 Fases futuras no accionables | Implementado + RTL |
| CA-24-05 Ronda activa → invitaciones | Implementado + RTL |
| CA-24-06 Quotes → comparación primaria | Implementado (helper + UI) |
| CA-24-07 Manual primaria sin ronda/quotes | Implementado + RTL |
| CA-24-08 Next-action + overlay F23 | Sin regresión |
| CA-24-09 RTL + tsc | OK |
| CA-24-10 Copy F23 | Conservado |

## Verificación

| Suite | Resultado |
| --- | --- |
| purchase-workbench + WorkbenchDrawer + Rfq + QuoteComparison + ApprovalDecision | **45/45 pass** |
| `tsc --noEmit` `@iwana/portal` | **OK** |

## Deuda restante

- Side-peek Firma iWana como primitive de `@iwana/ui`.
- Promoción de «fila operativa» a `portal-ui`.
- Afinar enable de Abastecer en `APPROVED` con awards pendientes (hoy visitables por status).
