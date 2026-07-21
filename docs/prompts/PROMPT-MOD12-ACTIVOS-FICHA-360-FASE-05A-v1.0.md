# PROMPT — MOD12 Activos y comodato — Ficha 360 del activo — Fase 05A

> **Estado: CERRADO (G7 GO CTO 2026-07-21).**

> ~~**Estado: Emitido (G4) — EJECUTABLE**~~

## Vinculos de trazabilidad

- Plantilla base: `docs/prompts/TEMPLATE-PROMPT-EJECUCION-FASE-MODULO.md`
- PRD: `docs/prds/PRD-MOD12-ACTIVOS-COMODATO-v1.0.md` §7 Fase 5A
- Spec: `docs/specs/2026-07-21-mod12-activos-ficha360-comodato-fase05-design.md` (D-F5-1…14)
- Auditoría de origen: `docs/informes/INFORME-MOD12-INVENTARIO-AUDITORIA-ESTADO-v1.0.md` (H1)
- PRD padre: `docs/prds/PRD-MOD12-INVENTARIO-SCM-v1.0.md` (RF-INV-20)
- ADR base: `docs/adrs/ADR-048-Bounded-Context-Inventario-SCM-Ciclo-Vida-Productos.md`

## Modulo

- Nombre: Inventario / SCM — submódulo Activos y comodato
- Codigo: MOD12
- Fase: 05A (Ficha 360 del activo)
- Version: 1.0
- Fecha: 2026-07-21
- Generado por: AI-EM-ARCH
- Destinatario: **AI-SR-FULL (backend, líder)** + **AI-FE-PLATFORM (portal)**
- Nombre de archivo destino: `PROMPT-MOD12-ACTIVOS-FICHA-360-FASE-05A-v1.0.md`

---

## 1. Objetivo exacto de la fase

- **Resultado esperado:** un usuario de soporte abre un activo serializado y ve en una sola pantalla qué es, dónde está, quién lo tiene, qué le ha pasado, de qué compra vino y (sección lista, vacía por ahora) a qué cliente está entregado.
- **Sí entra:** composición del detalle en `GET /inventory/assets/:id`; consumo de `AssetLifecycleService.listForAsset` (hoy sin consumidor); filtro `serializedAssetId` en el kardex; origen de compra resuelto dentro de MOD12; vida útil como estado derivado; reconstrucción por secciones del `SerializedAssetDetailDrawer`; sección Comodato vacía con su contrato congelado.
- **No entra:** escritura de comodatos (5B); alertas de vida útil, jobs y evento `StockLow` (H4); documento/aprobación de bajas (H3); rediseño de las pestañas legacy Movimientos y Bajas (H5); resolución de nombres de suscriptor/técnico/contrato; migraciones.

> **Stop:** no inventar el enlace evento↔movimiento (`asset_lifecycle_events` **no** tiene `stock_movement_id` — D-F5-3). No resolver identidades cross-module. No introducir DDL.

---

## 2. Artefactos de entrada obligatorios

- PRD §7 (contrato congelado) y §8 (CA-5A-01…08)
- Spec D-F5-1…11 (las 12-14 son de 5B, léelas para no cerrar puertas)
- Skills: `nestjs-expert`, `nextjs-app-router-patterns`, `frontend-dev-guidelines`, `core-components`, `tailwind-patterns`, `testing-patterns`, `system-vocabulary-review`, `openapi-spec-generation`

---

## 3. Instrucciones

### Backend (AI-SR-FULL)

1. **Filtro de kardex por activo** — añadir `serializedAssetId` opcional a `ListStockMovementsQuerySchema` (`dto/index.ts`, solo append) y a `StockMovementQueryService.list`, con el patrón `EXISTS (SELECT 1 FROM stock_movement_lines …)` ya usado para `itemId`/`locationId` (D-F5-4). Actualizar también el DTO de Swagger.
2. **Lectura del ciclo de vida** — extender `AssetLifecycleService` con una consulta paginada por activo (orden `created_at DESC`, apoyada en `idx_asset_lifecycle_events_asset`) que devuelva `AssetLifecycleEventRecord` con etiqueta de ubicación resuelta en lote. Es el primer consumidor de esa tabla.
3. **Origen de compra** — resolver dentro de MOD12 desde `serialized_assets.purchase_order_ref` y la línea de recepción que creó el activo; proveedor vía `supplier_profiles` (`partyRefId` + `displayName`). Si no se resuelve, devolver `null` — nunca aproximar (D-F5-6).
4. **Vida útil derivada** — calcular en el servidor `monthsElapsed` / `monthsRemaining` / `status` con los umbrales de D-F5-7. Sin jobs, sin alertas, sin notificaciones.
5. **Composición** — `SerializedAssetService.getById` pasa a devolver `SerializedAssetDetailRecord` según PRD §7, conservando los campos actuales en la raíz (D-F5-8) y reutilizando `StockMovementQueryService.list` para la sección de movimientos (D-F5-5). Acepta `lifecyclePage/lifecycleLimit` y `movementsPage/movementsLimit` (default 20, tope 100 — D-F5-2).
6. **Sección Comodato** — devolver siempre `loans: { data: [], total: 0 }` con el shape `AssetLoanRecord` congelado; no leer aún `asset_loan_assignments` (D-F5-10).
7. **Swagger** — documentar el nuevo shape y el filtro.
8. **Tests** — unitarios de composición (con y sin origen de compra, con y sin vida útil, activo sin historia), de los cuatro estados de vida útil, del filtro de kardex por activo, y **prueba de aislamiento tenant** sobre `GET /assets/:id` siguiendo el patrón de `supplier-profile.isolation.spec.ts`. Registrar cualquier provider nuevo en `inventory.module.spec.ts` (omisión recurrente del módulo).

### Frontend (AI-FE-PLATFORM)

1. Tipos y método en `apps/portal/src/lib/api-client.ts` alineados al nuevo shape.
2. Reconstruir `SerializedAssetDetailDrawer.tsx` en las siete secciones del spec §4, con estados vacíos explicativos en las cuatro que pueden venir vacías.
3. Etiquetas nuevas en `inventory-labels.ts` (patrón `getSerializedAssetStatusLabel`); sin enums crudos; español sentence case.
4. Enlace «Ver en kardex» que abra la pestaña Existencias filtrada por el activo (deep-link consistente con el patrón vigente de `?tab=`).
5. Paginación «Ver más» en ciclo de vida y movimientos.
6. Specs de portal del drawer (secciones, estados vacíos, paginación) y actualización de los specs existentes que consumen el endpoint.

---

## 4. Restricciones

- Multi-tenant por schema con los helpers vigentes; tenant desde JWT; nunca hardcodear schema.
- Sin FKs ni lecturas directas a CRM, WFM, Parties o Tasks. Referencias opacas con etiqueta de tipo (D-F5-9).
- Sin PII en respuesta, logs, fixtures ni mensajes de error.
- Texto visible en español, sentence case, sin enums crudos.
- Cobertura ≥ 80 % en el código nuevo core.
- Append-only en archivos compartidos (`dto/index.ts`, `inventory.module.ts`, `api-client.ts`, `InventoryClient.tsx`).
- Reconstruir `@iwana/db` antes de typecheck (checklist DoD vigente).

---

## 5. Entregables

- Código backend + portal + tests
- Informe de fase: `docs/informes/INFORME-MOD12-ACTIVOS-FICHA-360-FASE-05A-v1.0.md` con evidencia por criterio
- OpenAPI/Swagger actualizado
- E2E ampliado en `e2e/tests/portal-inventory-scm.spec.ts`: abrir la ficha 360 de un activo recibido y ver timeline + origen de compra
- Handoff G5 → AI-EM-ARCH (auditoría arquitectónica), luego G6 (PROD-UX / DS-OWNER / SR-QA) y G7 (cierre; aprobador ≠ productor), siguiendo `CHECKLIST-MOD12-INVENTARIO-EXISTENCIAS-GATES-G6-G7-v1.0.md`

---

## 6. Criterio stop/go

| Stop — detente y escala a AI-EM-ARCH | Go |
| --- | --- |
| Concluyes que hace falta una migración (columna, índice, tabla) | La fase se completa sin DDL |
| Necesitas leer CRM/WFM/Parties para mostrar un nombre | Referencias opacas con etiqueta de tipo |
| Se te ocurre correlacionar eventos y movimientos por timestamp | Secciones paralelas, sin enlace inventado |
| El nuevo shape rompe el drawer o los tests vigentes del endpoint | Campos actuales conservados en la raíz |
| Aparece cualquier PII en respuesta o logs | Solo referencias y etiquetas |
| Sin prueba de aislamiento tenant en las rutas tocadas | CA-5A-01…08 con evidencia |

**Verificación exigida antes del handoff G5:**

```powershell
pnpm --filter @iwana/api test -- src/modules/inventory
pnpm --filter @iwana/portal test -- inventory
pnpm lint
pnpm typecheck
npx playwright test --config e2e/playwright.portal.config.ts e2e/tests/portal-inventory-scm.spec.ts
```

**Salida de fase:** al cerrar G7, 5A habilita la ejecución de `PROMPT-MOD12-COMODATO-FASE-05B-v1.0.md` (ADR-016).
