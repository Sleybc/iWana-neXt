# Informe vivo - MOD12 Inventario / Submódulo Existencias — Definición

**Version:** 1.0
**Fecha:** 2026-07-18
**Estado:** ✅ Fase 1 — G7 GO (recomendación AI-EM-ARCH); pendiente confirmación explícita del CTO para producción
**Auditoría G5:** docs/informes/INFORME-MOD12-INVENTARIO-EXISTENCIAS-FASE-01-AUDITORIA-ARCH-v1.0.md
**Review G6:** docs/informes/INFORME-MOD12-INVENTARIO-EXISTENCIAS-FASE-01-G6-REVIEW-v1.0.md
**Cierre G7:** docs/informes/INFORME-MOD12-INVENTARIO-EXISTENCIAS-FASE-01-CIERRE-G7-v1.0.md
**Modo activo:** Product Architect + Orchestrator
**Responsable:** AI-EM-ARCH
**PRD:** docs/prds/PRD-MOD12-INVENTARIO-EXISTENCIAS-v1.0.md
**Prompt Fase 1:** docs/prompts/PROMPT-MOD12-EXISTENCIAS-KARDEX-AJUSTES-FASE-01-v1.0.md
**Prompt Fase 2 (emitido, ejecutable al cierre G7 de Fase 1):** docs/prompts/PROMPT-MOD12-EXISTENCIAS-REORDEN-FASE-02-v1.0.md
**Spec Fase 2:** docs/specs/2026-07-18-mod12-existencias-reorden-fase02-design.md

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
| Prompt Fase 2 (reposición sugerida + valor) | docs/prompts/PROMPT-MOD12-EXISTENCIAS-REORDEN-FASE-02-v1.0.md | **Emitido (G4)** — ejecutable al cierre G7 de Fase 1 (ADR-016) |
| Spec de diseño Fase 2 (decisiones D-F2-1…D-F2-5, flujo UX, CA) | docs/specs/2026-07-18-mod12-existencias-reorden-fase02-design.md | Aprobado — habilita G4 |
| Este informe vivo | docs/informes/INFORME-MOD12-INVENTARIO-EXISTENCIAS-DEFINICION-v1.0.md | Vigente |

No se emitió HLD ni ADR nuevo: la Fase 1 no crea boundary, entidad, migración ni patrón (justificación en PRD §9); reutiliza el ledger aprobado por ADR-048.

## 4. Roadmap del submódulo

| Fase | Alcance | Estado |
| --- | --- | --- |
| 1 | Kardex consultable, ajustes con razón tipificada, pestaña Existencias (Por producto / Por bodega / Kardex), Bodegas reducida | **Cerrada (G7 GO)** — pendiente confirmación CTO; ver `INFORME-MOD12-INVENTARIO-EXISTENCIAS-FASE-01-CIERRE-G7-v1.0.md` |
| 2 | Reposición sugerida (anti doble pedido) → composer de compras prellenado; valor estimado en Resumen | **Definida** — contrato congelado, spec + prompt emitidos; ejecutable al cierre G7 de Fase 1 |
| 3 | Conteos físicos / inventario cíclico; reservas efectivas | Planificada |
| 4 | Costeo promedio móvil, valoración y reportes | Planificada |

## 5. Riesgos vigentes

- Volumen del kardex en tenants grandes: mitigado con paginación de servidor e índices existentes.
- Fase 2 reutiliza `PurchaseRequestComposer` / `POST /purchasing/requests`: validar anti doble pedido al ejecutar el prompt F2.
- Deuda UX post-G6 (skeleton, drawer a11y, `canAdjust` por rol) no bloquea cierre pero degrada pulido operativo.

## 6. Próximos pasos

1. **CTO:** confirmar explícitamente la aprobación de producción de la Fase 1 (recomendación AI-EM-ARCH ya emitida en G7).
2. Con G7 GO, el criterio de entrada de Fase 2 (PRD §8) queda satisfecho: ejecutar `docs/prompts/PROMPT-MOD12-EXISTENCIAS-REORDEN-FASE-02-v1.0.md`.
3. Deuda registrada al cierre (no bloqueante, backlog): skeleton en listados Existencias/Bodegas, foco en controles custom, drawer a11y, label de lote, cablear rol→`canAdjust`, ampliar `stock-movement-query.service.spec.ts`.

## 7. Historial

| Fecha | Cambio |
| --- | --- |
| 2026-07-18 | v1.0 — auditoría de estado, benchmark, decisiones del CTO, emisión de PRD + prompt Fase 1 + borrador Fase 2 |
| 2026-07-18 | Fase 1 implementada por AI-SR-FULL; informe de fase emitido; estado → pendiente G6/G7 |
| 2026-07-18 | Smoke E2E Playwright Existencias (6) + Bodegas regresión (5) en verde; mocks movements/adjustments |
| 2026-07-18 | Auditoría G5 (AI-EM-ARCH): go condicionado — B1 bloqueante; H2/O1 transferidos a Compras F07 |
| 2026-07-18 | Remediación B1 + H2; estado → lista para G6 |
| 2026-07-18 | G6 paralelo PROD-UX/DS-OWNER/SR-QA; remediación UX serializados + custody Por bodega; **G6 GO** → pendiente G7 |
| 2026-07-18 | Fase 2 definida (AI-EM-ARCH, protocolo multiagente): factibilidad verificada contra código (backend compras/dashboard + patrones portal); contrato congelado en PRD §7 con decisión D-F2-1 (se elimina el POST de creación — composer prellenado + `POST /purchasing/requests` vigente); spec de diseño y prompt de ejecución emitidos (G4), ejecutables al cierre G7 de Fase 1 |
| 2026-07-18 | **Cierre G7 (AI-EM-ARCH):** re-verificación independiente; gates en verde; O1 aún flaky no-regresivo. **Recomendación: GO a producción**, pendiente CTO |
| 2026-07-18 | **O1 cerrado (AI-SR-FULL, track F07):** root cause timeout Jest 5s vs PDFKit; `jest.setTimeout(20_000)` + caché buffers assets; inventory 217/217 ×2 |
