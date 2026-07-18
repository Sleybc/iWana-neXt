# Informe vivo - MOD12 Inventario / Submódulo Existencias — Definición

**Version:** 1.0
**Fecha:** 2026-07-18
**Estado:** ✅ Fase 1 — G7 GO (pendiente CTO F1); ✅ Fase 2 — **G7 GO confirmado por CTO** (`33cd6ecd`); ✅ Fase 3A — **G7 GO** (`1de09b62`); 🟡 Fase 3B — **implementada, pendiente G6/G7** — ver `INFORME-MOD12-INVENTARIO-EXISTENCIAS-FASE-03B-v1.0.md`
**Auditoría G5 F1:** docs/informes/INFORME-MOD12-INVENTARIO-EXISTENCIAS-FASE-01-AUDITORIA-ARCH-v1.0.md
**Review G6 F1:** docs/informes/INFORME-MOD12-INVENTARIO-EXISTENCIAS-FASE-01-G6-REVIEW-v1.0.md
**Cierre G7 F1:** docs/informes/INFORME-MOD12-INVENTARIO-EXISTENCIAS-FASE-01-CIERRE-G7-v1.0.md
**Informe Fase 2:** docs/informes/INFORME-MOD12-INVENTARIO-EXISTENCIAS-FASE-02-v1.0.md
**Review G6 F2:** docs/informes/INFORME-MOD12-INVENTARIO-EXISTENCIAS-FASE-02-G6-REVIEW-v1.0.md
**Cierre G7 F2:** docs/informes/INFORME-MOD12-INVENTARIO-EXISTENCIAS-FASE-02-CIERRE-G7-v1.0.md
**Informe Fase 3A:** docs/informes/INFORME-MOD12-INVENTARIO-EXISTENCIAS-FASE-03A-v1.0.md
**Review G6 F3A:** docs/informes/INFORME-MOD12-INVENTARIO-EXISTENCIAS-FASE-03A-G6-REVIEW-v1.0.md
**Cierre G7 F3A:** docs/informes/INFORME-MOD12-INVENTARIO-EXISTENCIAS-FASE-03A-CIERRE-G7-v1.0.md
**ADR Fase 3A:** docs/adrs/ADR-054-Conteo-Fisico-Inventario-Ciclico.md (**Aprobado CTO 2026-07-18**)
**ADR Fase 3B:** docs/adrs/ADR-055-Reservas-Efectivas-Disponible-Comprometido.md (**Aprobado CTO 2026-07-18**)
**Spec Fase 3B:** docs/specs/2026-07-18-mod12-existencias-reservas-fase03B-design.md
**Prompt Fase 3B:** docs/prompts/PROMPT-MOD12-EXISTENCIAS-RESERVAS-FASE-03B-v1.0.md (**ejecutable**)
**Auditoría G5 F3B:** docs/informes/INFORME-MOD12-INVENTARIO-EXISTENCIAS-FASE-03B-AUDITORIA-ARCH-v1.0.md (**G5 GO** — condición EV-1 para G7)
**Spec Fase 3A:** docs/specs/2026-07-18-mod12-existencias-conteo-fisico-fase03A-design.md
**Prompt Fase 3A:** docs/prompts/PROMPT-MOD12-EXISTENCIAS-CONTEO-FISICO-FASE-03A-v1.0.md (**cerrado — G7 GO**)
**Modo activo:** Product Architect + Orchestrator
**Responsable:** AI-EM-ARCH
**PRD:** docs/prds/PRD-MOD12-INVENTARIO-EXISTENCIAS-v1.0.md
**Prompt Fase 1:** docs/prompts/PROMPT-MOD12-EXISTENCIAS-KARDEX-AJUSTES-FASE-01-v1.0.md
**Prompt Fase 2:** docs/prompts/PROMPT-MOD12-EXISTENCIAS-REORDEN-FASE-02-v1.0.md
**Spec Fase 2:** docs/specs/2026-07-18-mod12-existencias-reorden-fase02-design.md
**Plan Fase 2:** docs/plans/2026-07-18-mod12-existencias-fase-02.md

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

Fases 1-2 no requirieron HLD ni ADR (no crean boundary, entidad, migración ni patrón; reutilizan el ledger de ADR-048). **Fase 3A sí introduce entidades y migración**, por lo que emite **ADR-054** (modelo de conteo físico) + spec + prompt:

| Artefacto Fase 3A | Ruta | Estado |
| --- | --- | --- |
| ADR-054 conteo físico | docs/adrs/ADR-054-Conteo-Fisico-Inventario-Ciclico.md | ✅ **Aprobado CTO 2026-07-18** |
| Spec de diseño 3A (D-F3A-1…10, ciclo de vida, CA) | docs/specs/2026-07-18-mod12-existencias-conteo-fisico-fase03A-design.md | Aprobado — habilita G4 |
| Prompt de ejecución 3A | docs/prompts/PROMPT-MOD12-EXISTENCIAS-CONTEO-FISICO-FASE-03A-v1.0.md | **Ejecutable** — G7 F2 cerrado + ADR-054 aprobado |

**Fase 3B** también introduce cambios estructurales (invariante de saldos y guardado anti-sobre-venta), por lo que emite **ADR-055** + spec + prompt:

| Artefacto Fase 3B | Ruta | Estado |
| --- | --- | --- |
| ADR-055 reservas efectivas | docs/adrs/ADR-055-Reservas-Efectivas-Disponible-Comprometido.md | ✅ **Aprobado CTO 2026-07-18** |
| Spec de diseño 3B (D-F3B-1…11, máquina de reserva, CA) | docs/specs/2026-07-18-mod12-existencias-reservas-fase03B-design.md | Aprobado — G4 ejecutable |
| Prompt de ejecución 3B | docs/prompts/PROMPT-MOD12-EXISTENCIAS-RESERVAS-FASE-03B-v1.0.md | **Ejecutable** — ADR-055 aprobado + G7 F3A cerrado |

## 4. Roadmap del submódulo

| Fase | Alcance | Estado |
| --- | --- | --- |
| 1 | Kardex consultable, ajustes con razón tipificada, pestaña Existencias (Por producto / Por bodega / Kardex), Bodegas reducida | **Cerrada (G7 GO)** — pendiente confirmación CTO F1; ver `INFORME-MOD12-INVENTARIO-EXISTENCIAS-FASE-01-CIERRE-G7-v1.0.md` |
| 2 | Reposición sugerida (anti doble pedido) → composer de compras prellenado; valor estimado en Resumen | **Cerrada — G7 GO confirmado CTO 2026-07-18** (`33cd6ecd`); ver `INFORME-MOD12-INVENTARIO-EXISTENCIAS-FASE-02-CIERRE-G7-v1.0.md` |
| 3A | Conteo físico / inventario cíclico (documento → congelar → contar → cierre reconcilia saldo vía ledger) | **Cerrada — G7 GO + verificación independiente AI-EM-ARCH** (2026-07-18); ver addendum en cierre G7 F3A |
| 3B | Reservas efectivas (`quantityReserved` en ciclo de salidas; validaciones de disponible; cierra la sobre-venta) | **G5 GO (auditoría ARCH)** — pendiente G6 con condición **EV-1** (evidencia de integración real) y luego G7; ver `INFORME-MOD12-INVENTARIO-EXISTENCIAS-FASE-03B-AUDITORIA-ARCH-v1.0.md` |
| 4 | Costeo promedio móvil, valoración y reportes | Planificada |

## 5. Riesgos vigentes

- Volumen del kardex en tenants grandes: mitigado con paginación de servidor e índices existentes.
- Fase 2 reutiliza `PurchaseRequestComposer` / `POST /purchasing/requests`: validar anti doble pedido al ejecutar el prompt F2.
- Deuda F3A aceptada en G6: `window.confirm` en cierre/cancelación; foco inicial al crear conteo (no bloqueante).
- Deuda F1/F2 «`canAdjust` fijo en true» **resuelta** en F3A (gateo por rol ADMIN: `canAdjustStock`).

## 6. Próximos pasos

1. **G6 Fase 3B** (PROD-UX / DS-OWNER / SR-QA) con **EV-1 obligatoria**: E2E manual §7.5 (reserva → transferencia bloqueada → despacho/cancelación → conteo vs reservado) + verificación de la migración 072 contra base real (aplicar, re-ejecutar directamente, revertir). Preferible dejar smoke Playwright de reservas (paridad con F1/F2/F3A).
2. **G7 Fase 3B** (AI-EM-ARCH): no procede hasta cerrar G6 + EV-1 — el invariante es de runtime y los tests unitarios usan `EntityManager` mockeado. Al cerrarse habilita definición de **Fase 4** (costeo).
3. **CTO (opcional pendiente):** confirmar explícitamente G7 de Fase 1 si aún no quedó registrado aparte.
4. Deuda F3A aceptada: `window.confirm` y foco al crear conteo (pulido).

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
| 2026-07-18 | **Fase 2 implementada (AI-SR-FULL + FE-PLATFORM, multiagente §3bis):** ReplenishmentService + GET suggestions + valor dashboard; subvista Reposición → composer prellenado; gates API 235 + portal 37 + lint/typecheck PASS → G5 listo para G6 |
| 2026-07-18 | **G6 Fase 2** (PROD-UX/DS-OWNER/SR-QA): GO condicionado; remediación DS-H1/H2 + UX-H1/H2/H3; Playwright Existencias 8/8; **G6 GO** → pendiente G7 |
| 2026-07-18 | **Cierre G7 Fase 2 (AI-EM-ARCH):** re-verificación independiente en código de D-F2-1…5 y de las 5 remediaciones G6; gates re-ejecutados (lint/typecheck limpios, suites F2 en verde; 2 fallos flaky de infra `ECONNRESET`/`SupplierPicker` no-regresivos, pasan aislados). **Recomendación: GO a producción**, pendiente CTO + commit de la fase. Habilita entrada de Fase 3 (requiere HLD/ADR por entidades/migraciones nuevas) |
| 2026-07-18 | **Fase 3 definida y dividida (AI-EM-ARCH, protocolo multiagente):** factibilidad verificada contra código (reservas/ledger/StockIssue lifecycle/migraciones + patrones de entidad y UI). Decisión CTO: **split 3A (conteos, aditivo) / 3B (reservas, toca oversell)** y **reutilizar ADJUSTMENT** para el ajuste de conteo. Emitidos ADR-054 + spec 3A + prompt 3A; PRD roadmap y §7 actualizados. 3A ejecutable al cierre G7 F2 + aprobación ADR-054 |
| 2026-07-18 | **CTO confirma G7 Fase 2 (GO producción)** + commit `33cd6ecd` en `main`. **CTO aprueba ADR-054.** Fase 3A queda **ejecutable** (ADR-016). |
| 2026-07-18 | **Fase 3A implementada (AI-SR-FULL):** migración 071 + CycleCountService + tab Conteos; deuda F2 residual cerrada; gates API 245 + portal F3A en verde → G5 listo para G6. Subagentes §3bis abortaron por límite API; ejecución consolidada en sesión. |
| 2026-07-18 | **Cierre operativo G6 Fase 3A:** migración 071 verificada en DB; Playwright Conteos 2/2 + Existencias 8/8; remediación carga de categorías en tab Conteos; informe G6 **GO** → pendiente G7. |
| 2026-07-18 | **Cierre G7 Fase 3A (AI-EM-ARCH):** re-verificación D-F3A-1…10; API inventory 245/245; E2E Conteos/Existencias en verde; **GO a producción** + commit de la fase. Habilita definición de Fase 3B. |
| 2026-07-18 | **Fase 3B definida (AI-EM-ARCH):** emitidos **ADR-055** (reservas efectivas: invariante `0 ≤ reserved ≤ onHand`, reserva atada al ciclo de `StockIssue`, migración de las 3 validaciones a disponible, migración 072 de reconciliación sin columnas nuevas), spec 3B y prompt de ejecución; PRD §7 y roadmap actualizados. Ejecutable con ADR-055 aprobado |
| 2026-07-18 | **Auditoría G5 Fase 3B (AI-EM-ARCH):** verificado en código el cumplimiento de ADR-055 y D-F3B-1…11, incluido el criterio de stop (las tres validaciones migradas) y el borde crítico D-F3B-6 (el despacho libera su propia reserva antes de validar). Gates re-ejecutados: API 256/256, portal 234/234, lint y typecheck limpios. Corrección a favor del ejecutor: la migración 072 es idempotente **a nivel SQL** (asigna con `LEAST`), más fuerte que lo declarado. **G5 GO**; G7 condicionado a **EV-1** (falta toda evidencia de integración real: sin E2E manual ni Playwright de reservas) |
| 2026-07-18 | **CTO revisa y aprueba ADR-055 + documentos de Fase 3B.** Estados actualizados: ADR Aprobado, spec G4 ejecutable, prompt EJECUTABLE, PRD roadmap. Fase 3B queda **habilitada para implementación** sin puertas de gobierno pendientes |
| 2026-07-18 | **Auditoría G7 independiente (AI-EM-ARCH):** el cierre previo se produjo en sesión del ejecutor (subagentes abortados); AI-EM-ARCH ejecuta la verificación independiente (aprobador ≠ productor). Releídos servicio/controller/migración/entidades; **verificado el registro de `StockCount`/`StockCountLine` en runtime** (autoLoadEntities + forFeature, no en data-source explícito); gates re-ejecutados por el auditor: **API 245/245, portal 232/232, lint y typecheck limpios**. Deuda F1/F2 `canAdjust` resuelta. **GO confirmado** (addendum en cierre G7 F3A). |
| 2026-07-18 | **Fase 3B implementada (AI-SR-FULL + FE-PLATFORM):** motor `reservedDelta` + invariante; ciclo reserva en `StockIssue`; validaciones a disponible; migración 072; matriz Por bodega corregida. Gates: API inventory **256/256**, portal inventory **234/234**, lint/typecheck PASS. Subagente FE abortó por límite API (consolidado en sesión). Informe `INFORME-MOD12-INVENTARIO-EXISTENCIAS-FASE-03B-v1.0.md` → pendiente G6/G7. |
