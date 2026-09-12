# Plan de ejecución — MOD12 Compras · Fase 30 · Adjudicación por cotización con orden por proveedor

**Version:** 1.0
**Estado:** Vigente
**Fecha:** 2026-09-11
**Modo activo:** EM + Orchestrator
**Autor:** AI-EM-ARCH
**Prompt de ejecución:** docs/prompts/PROMPT-MOD12-COMPRAS-ADJUDICACION-MATRIZ-FASE-30-v1.0.md
**Spec congelada:** docs/specs/2026-09-11-mod12-compras-adjudicacion-matriz-design.md (v1.0)
**ADR:** ADR-087 (propuesto) — docs/adrs/ADR-087-Cobertura-Adjudicacion-Derivada-Compras.md
**Fase anterior:** 29 — auditoría de la ronda de cotización, G6 GO el 2026-09-11

---

## 1. Objetivo y origen

El CTO pidió, en `/dashboard/inventory?tab=purchasing`, poder marcar **producto a producto dentro de
cada cotización** y obtener **una orden de compra por proveedor**.

La auditoría del 2026-09-11 concluyó que **no es alcance nuevo**: `RF-CMP-06` del PRD aprobado ya
exige la adjudicación por línea, `purchase_request_line_awards` ya la modela y `POST
/purchasing/orders` ya emite N órdenes agrupadas por proveedor. Lo que existe es un **defecto de UX**
—el eje de la pantalla está invertido— más **tres defectos de backend**, uno de ellos incapacitante:
generar una orden parcial deja la solicitud varada para siempre.

Decisiones del CTO que enmarcan la fase: un producto se adjudica a un solo proveedor (no se parte la
cantidad); `validateLineAward` **no se toca**; la solicitud queda abierta si restan productos.

## 2. Estructura de la fase

Cinco tracks contra dos contratos congelados (protocolo §3bis). El workflow de siete etapas es la
secuencia de gobierno; **la ejecución no se serializa**.

```
T0 contrato API ─┬─► BE-1 defectos ─► BE-2 contrato ─┬─► FE-3 cableado ─► E2E ─► G6
                 │                                    │
                 └─► FE-1 lógica pura ─► FE-2 componentes
                     (UX y DS corren al costado de T0)
```

**Camino crítico:** T0 → BE-1 → BE-2 → FE-3 → E2E.

## 3. Tracks

### T0 · Contrato de API tipado — AI-SR-FULL · **bloqueante**

`packages/shared/src/contracts/inventory/purchase-award-matrix.contract.ts`, patrón de
`stock-issue-picking.ts`. Es la primera entrega de la fase: ningún track de frontend escribe una línea
antes de que exista. Los Zod siguen en el API y se afirman con `satisfies`.

**Salida:** contrato publicado y declarado congelado en el prompt de fase.

### Track UX — AI-PROD-UX · paralelo a T0

Ya ejecutado en esta sesión: la spec `2026-09-11-mod12-compras-adjudicacion-matriz-design.md` está
congelada. Queda pendiente el **review de vocabulario** con `system-vocabulary-review` sobre las
etiquetas de `awardCoverage` y los textos de la barra de resumen, antes de G6.

### Track Design System — AI-DS-OWNER · paralelo a T0

Auditoría, no construcción. Confirmado que `@iwana/ui` **no exporta `Table` ni `Checkbox`** y que esta
fase **no los añade**: el trabajo consiste en validar que las recetas de `portal-ui` fijadas en la spec
§5.4 son las vigentes y que los tokens de los cinco estados de celda respetan la Firma iWana. Una
primitiva `Checkbox` real es otra fase.

### Track BE-1 · Defectos — AI-SR-FULL · no depende de la UI

Migración tenant 128 (dedupe, UNIQUE de tres columnas, CHECK, columnas de snapshot, índice, backfill),
helper `purchase-request-award-coverage.ts`, corrección del `CONVERTED_TO_PO` incondicional y tope de
cantidad ordenada en `createSingleOrder`.

**Va primero y sin esperar a nadie.** No desbloquea interfaz, pero desactiva la bomba: hoy cualquier
orden parcial deja la solicitud muerta.

### Track BE-2 · Superficie de contrato — AI-SR-FULL · **requiere ADR-087 (propuesto) aprobado**

Validación de `supplierQuoteId` y snapshot económico, idempotencia de `createLineAwards`, `DELETE` de
awards, costo unitario derivado en servidor, `awardCoverage` en detalle y listado, enum compartido,
test-guarda de `validateLineAward`.

### Track FE-1 · Lógica pura — AI-FE-PLATFORM · paralelo total con backend

`award-matrix.ts` + spec. Testeable al 100 % con fixtures antes de que exista un solo endpoint nuevo.
Aquí vive el grueso de la cobertura de la fase.

### Track FE-2 · Componentes — AI-FE-PLATFORM

Los cuatro componentes con sus specs, contra el contrato congelado.

### Track FE-3 · Cableado — AI-FE-PLATFORM · requiere BE-2 y FE-2

Drawer, `InventoryClient`, `api-client`, `purchase-workbench`, `purchase-orders-from-awards`,
`QuoteComparisonPanel`, y eliminación de `AwardLinesPanel` con la escotilla preservada.

### Track QA — AI-SR-QA

Integraciones Supertest escritas contra el contrato congelado en paralelo con BE-2; E2E Playwright y
pasada axe al final.

### Review de seguridad — AI-SEC-ENG

Sobre el `DELETE` de awards: autorización, aislamiento de tenant, ausencia de IDOR entre tenants, y
verificación de que ningún log emite payloads de cotización.

## 4. RACI de la fase

| Área | A (responde) | R (ejecuta) | C (consultado) |
| --- | --- | --- | --- |
| Alcance y decisiones de producto | AI-EM-ARCH | AI-EM-ARCH | CTO |
| ADR-087 (propuesto) | CTO | AI-EM-ARCH | AI-SR-FULL |
| Flujo y criterios de UX | AI-EM-ARCH | AI-PROD-UX | AI-FE-PLATFORM |
| Contrato de componente | CTO (excepción) | AI-DS-OWNER | AI-PROD-UX |
| Contrato de API y backend | AI-EM-ARCH | AI-SR-FULL | AI-SEC-ENG, AI-DATA-ENG |
| Migración y datos | AI-EM-ARCH | AI-SR-FULL | AI-DATA-ENG |
| Implementación de portal | AI-EM-ARCH | AI-FE-PLATFORM | AI-DS-OWNER |
| E2E, visual y a11y | AI-EM-ARCH | AI-SR-QA | AI-PROD-UX, AI-DS-OWNER |
| Seguridad aplicativa | AI-EM-ARCH | AI-SEC-ENG | AI-SR-FULL |
| CI y merge readiness | AI-EM-ARCH | AI-PLAT-OPS | — |

## 5. Secuencia de gates

| Gate | Contenido | Aprueba |
| --- | --- | --- |
| **G1** | ADR-087 (propuesto) — cobertura derivada frente a nuevo valor de enum | **CTO — pendiente** |
| **G2** | Spec UX + contrato DS congelado | AI-EM-ARCH |
| **G3** | Dictamen de factibilidad de SR-FULL y FE-PLATFORM sobre el contrato congelado | AI-EM-ARCH |
| **G4** | Prompt de ejecución emitido | AI-EM-ARCH — **cumplido** |
| **G5** | Gates técnicos + review de segunda capa | AI-EM-ARCH |
| **G6** | Flujo, contrato DS, criterios de aceptación, a11y | AI-PROD-UX · AI-DS-OWNER · AI-SR-QA |
| **G6.5** | Corrida Linux de CI **por SHA** + resumen sanitizado | AI-EM-ARCH consolida |
| **G7** | Cierre de módulo | AI-EM-ARCH recomienda · CTO aprueba |

## 6. Riesgos y mitigaciones

| Riesgo | Severidad | Mitigación |
| --- | --- | --- |
| Solicitudes ya varadas en `CONVERTED_TO_PO` con líneas pendientes | Alta | Backfill en la 128 + conteo previo por tenant. Sin él, esas solicitudes siguen muertas con el código ya corregido |
| Awards duplicados con distinto proveedor bloquean el UNIQUE | Media | La migración se detiene y emite `[BLOQUEO]` con el listado; elegir por cuenta propia sería decidir a quién se le compra |
| Regresión de compras sin cotización al eliminar `AwardLinesPanel` | Media | Escotilla de spec §7, verificada por test |
| Reintroducción del `CONVERTED_TO_PO` incondicional en una sesión futura | Media | Test de regresión explícito y test-guarda de `validateLineAward` |
| Matriz ilegible con más de 5 cotizaciones o más de 30 líneas | Baja | Conmutación a acordeón; virtualización fuera de alcance |
| Comparación con monedas mixtas | Media | Preservar `quotesShareCurrency` íntegra; totales separados por moneda |
| Tres ejes de estado conviviendo en la interfaz | Baja | ADR-087 (propuesto) + review de vocabulario antes de G6 |

## 7. Deuda heredada que esta fase declara, no hereda en silencio

- **Fase 26** (compras de mostrador con impuestos) sigue **sin commitear** en working copy.
- **Fase 27** tiene spec congelada (`2026-09-09-mod12-compras-layout-dos-columnas-design.md`) **sin
  informe de cierre**.
- **G6.5 pendiente** acumulado de las fases 28 y 29: ninguna tiene aún corrida Linux de CI por SHA.

Las tres constan como abiertas en el informe de Fase 29 §8. La Fase 30 **no las resuelve**, pero su
G6.5 no puede firmarse sin saldar el acumulado.

## 8. Instrumentación de KPIs

A registrar en el informe de fase: reescrituras de PRD o spec; conflictos y desempates emitidos; deuda
por severidad al cierre; latencia de gates; hallazgos post-merge; y el dato específico de esta fase,
**número de solicitudes rescatadas por el backfill, por tenant**. Un KPI sin dato se reporta como «sin
instrumentar», nunca se estima.

## 9. Escalaciones abiertas

**[ESCALACIÓN AL CTO] · Prioridad: media**
**Contexto:** ADR-087 (propuesto) decide si la cobertura de adjudicación vive como eje derivado o como valor nuevo
de `PurchaseRequestStatus`.
**Opciones:** (1) eje derivado `awardCoverage`, calcado de `fulfillmentStatus`; (2) ampliar el enum
persistido con `PARTIALLY_CONVERTED_TO_PO`; (3) no expresar la cobertura.
**Recomendación:** opción 1.
**Decisión requerida antes de:** inicio del track BE-2.
