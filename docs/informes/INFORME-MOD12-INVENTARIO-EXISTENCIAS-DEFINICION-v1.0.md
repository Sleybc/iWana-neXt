# Informe vivo - MOD12 Inventario / Submódulo Existencias — Definición

**Version:** 1.0
**Fecha:** 2026-07-18
**Estado:** 🟡 Fase 1 implementada — pendiente G6/G7
**Modo activo:** Product Architect + Orchestrator
**Responsable:** AI-EM-ARCH
**PRD:** docs/prds/PRD-MOD12-INVENTARIO-EXISTENCIAS-v1.0.md
**Prompt Fase 1:** docs/prompts/PROMPT-MOD12-EXISTENCIAS-KARDEX-AJUSTES-FASE-01-v1.0.md
**Prompt Fase 2 (borrador, no ejecutable):** docs/prompts/PROMPT-MOD12-EXISTENCIAS-REORDEN-FASE-02-v1.0.md

---

## 1. Resumen ejecutivo

El CTO solicitó determinar si MOD12 ya cuenta con el submódulo de inventario propiamente dicho (stock/existencias) y, de faltar, definirlo correctamente con benchmark de mercado (Odoo, Zoho, ERPNext). La auditoría (2026-07-18) concluyó:

- **El backend de stock ya existe casi completo** y sigue el patrón de la industria: ledger inmutable (`StockMovement`/`StockMovementLine`) + agregado de saldos (`StockBalance` por ítem × bodega × lote × condición), con recepciones, transferencias, salidas, bajas y compra de mostrador escribiendo al ledger.
- **La brecha es de consulta y operación:** no hay pestaña "Existencias" de primer nivel en el portal (solo la matriz dentro de Bodegas), el kardex no es consultable (`GET /inventory/movements` no existe), y los ajustes de inventario están modelados (`StockMovementOrigin.ADJUSTMENT`) pero sin servicio, endpoint ni UI. Tampoco existen conteos físicos, reservas efectivas, costeo/valoración ni reorden automático.

## 2. Decisiones del CTO (2026-07-18)

1. Alcance de Fase 1 **ampliada**: kardex consultable + vista Existencias + **ajustes de inventario**.
2. Organización de pestañas: **Existencias absorbe la matriz** bodega × producto; "Bodegas" queda solo para gestión de bodegas.
3. Modelo de trabajo: el arquitecto (AI-EM-ARCH) emite el plan con todas las fases y los documentos de control; **la implementación la ejecuta el fullstack** contra el prompt de ejecución.

## 3. Artefactos emitidos

| Artefacto | Ruta | Estado |
| --- | --- | --- |
| PRD del submódulo (10 secciones, roadmap Fases 1-4, benchmark, decisiones D1-D6) | docs/prds/PRD-MOD12-INVENTARIO-EXISTENCIAS-v1.0.md | Aprobado por CTO |
| Prompt de ejecución Fase 1 (kardex + ajustes + pestaña Existencias) | docs/prompts/PROMPT-MOD12-EXISTENCIAS-KARDEX-AJUSTES-FASE-01-v1.0.md | Emitido (G4) |
| Prompt Fase 2 (reorden y valor básico) | docs/prompts/PROMPT-MOD12-EXISTENCIAS-REORDEN-FASE-02-v1.0.md | Borrador — no ejecutable hasta cierre de Fase 1 (ADR-016) |
| Este informe vivo | docs/informes/INFORME-MOD12-INVENTARIO-EXISTENCIAS-DEFINICION-v1.0.md | Vigente |

No se emitió HLD ni ADR nuevo: la Fase 1 no crea boundary, entidad, migración ni patrón (justificación en PRD §9); reutiliza el ledger aprobado por ADR-048.

## 4. Roadmap del submódulo

| Fase | Alcance | Estado |
| --- | --- | --- |
| 1 | Kardex consultable, ajustes con razón tipificada, pestaña Existencias (Por producto / Por bodega / Kardex), Bodegas reducida | **Implementada** — informe `INFORME-MOD12-INVENTARIO-EXISTENCIAS-FASE-01-v1.0.md` |
| 2 | Reorden → solicitud de compra prellenada; indicadores básicos de valor | Preparada (contrato borrador en PRD §7) |
| 3 | Conteos físicos / inventario cíclico; reservas efectivas | Planificada |
| 4 | Costeo promedio móvil, valoración y reportes | Planificada |

## 5. Riesgos vigentes

- Trabajo de Compras Fase 07 **sin commitear** comparte archivos con la Fase 1 (dto/index.ts, inventory.module.ts, InventoryClient.tsx, specs): el prompt impone solo-appends y la integración de `InventoryClient` al final.
- Volumen del kardex en tenants grandes: mitigado con paginación de servidor e índices existentes.
- El contrato de Fase 2 depende del flujo de `PurchaseRequest`, que evoluciona en paralelo: se verificará contra el código al emitir su prompt.

## 6. Próximos pasos

1. Review G6 (PROD-UX, DS-OWNER, SR-QA) sobre la entrega de Fase 1; G7 con recomendación de AI-EM-ARCH y aprobación del CTO.
2. Al cierre G7 de Fase 1: congelar contrato de Fase 2 y emitir su prompt ejecutable.

## 7. Historial

| Fecha | Cambio |
| --- | --- |
| 2026-07-18 | v1.0 — auditoría de estado, benchmark, decisiones del CTO, emisión de PRD + prompt Fase 1 + borrador Fase 2 |
| 2026-07-18 | Fase 1 implementada por AI-SR-FULL; informe de fase emitido; estado → pendiente G6/G7 |
| 2026-07-18 | Smoke E2E Playwright Existencias (6) + Bodegas regresión (5) en verde; mocks movements/adjustments |
