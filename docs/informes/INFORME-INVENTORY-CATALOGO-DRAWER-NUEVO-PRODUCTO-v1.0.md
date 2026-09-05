# INFORME-INVENTORY-CATALOGO-DRAWER-NUEVO-PRODUCTO-v1.0

**Fecha:** 2026-09-01
**Modo:** AI-EM-ARCH (Orchestrator + Product Architect) con ejecución delegada
**Agentes:** AI-FE-PLATFORM (Fase A), AI-DS-OWNER (auditoría + Fase B), AI-PROD-UX (decisión drawer + Fase C), exploración FE
**Alcance:** apps/portal — `/dashboard/inventory?tab=catalog`, creación de producto
**Estado:** Fase A ejecutada y verificada · Fase B propuesta (pendiente aprobación) · Fase C posición emitida (pendiente go) · **F2 aplicada sobre este drawer (2026-09-02, ver §9)**

---

## 1. Contexto y decisión

La superficie "Nuevo producto" era el único formulario del eje catálogo en modal centrado (`Dialog` de `@iwana/ui`, `sm:max-w-lg`): crear/editar categoría y editar producto ya usaban drawer lateral en la misma tab. La revisión multiagente contra la Firma iWana (§2.7), la receta §9 de `iwana-identity-ui-review` (multi-campo → drawer con guardado deliberado) y el criterio de consistencia intra-tab resolvió: **migrar a drawer lateral con el patrón probado del módulo**. Usuario aprobó la Fase A, el fix de contraste H3 incluido, más agendar Fase B y lanzar consulta C.

## 2. Entregables Fase A (ejecutada)

| Archivo | Cambio |
| --- | --- |
| `apps/portal/src/components/inventory/InventoryCreateProductDialog.tsx` | Shell reescrito: overlay + `aside role="dialog" aria-modal` (`w-full max-w-2xl`) + header eyebrow/título + cuerpo scrollable + footer sticky dentro del `<form>`. Trípode del módulo: `useDiscardChangesGuard` + `usePortalSideDrawerA11y(open && !discardOpen)` + `PortalDiscardChangesDialog`. Fix H3: `text-iwana-primary` en el cuadro "Código sugerido". Well inline → `portalWellClassName`. |
| `apps/portal/src/components/inventory/InventoryCreateProductDialog.spec.tsx` | +3 tests del guard (10 en total). Los 7 previos sin cambios. |

**Contrato congelado respetado:** props públicas, schema Zod, payload, efectos (`categorySelectionOverride`, reset, autocompletar), copy visible e `aria-labelledby` intactos. Sin drawer anidado (categoría sigue inline). Diff: 2 archivos, +252/−170.

## 3. Evidencia de gates (corrida de verificación propia del orquestador, no solo del ejecutor)

| Gate | Resultado |
| --- | --- |
| `pnpm --filter @iwana/portal test inventory` | ✅ 64 suites, 309 tests pasados, 1 skipped |
| `pnpm --filter @iwana/portal typecheck` | ✅ `tsc --noEmit` limpio |
| `pnpm --filter @iwana/portal lint` | ✅ 0 errores; 45 warnings preexistentes de flujos paralelos ajenos a este cambio |
| `audit-ui.mjs` (skill identidad) sobre archivos tocados | ✅ Sin hallazgos |
| E2E `portal-inventory-scm.spec.ts` (flujo creación) | ⚠️ Parcial: "crea categoria, producto y lo usa en solicitud de compra" **PASS**; "crea producto comprable en catalogo…" **FAIL preexistente** — verificado A/B con stash: falla en navegación de tabs antes de tocar el drawer, reproducible con el código original. No introducido por esta fase. |

- **Blockers:** ninguno.
- **Boundary/multi-tenancy/seguridad:** sin impacto (solo presentación; sin cambios de contrato API, ni PII nueva en logs).
- **Nota anti-falso-positivo:** la "deuda #5" del ejecutor (label "Descripción" con `text-iwana-secondary-700`) se descarta: está sobre fondo blanco, donde cumple AA (gotcha #9 de `AGENTS.md`).

## 4. Hallazgos de la auditoría de alineación iWana

| ID | Severidad | Hallazgo | Disposición |
| --- | --- | --- | --- |
| H1 | P1 | Modal vs drawer rompía el modelo mental crear/editar en la misma tab | **Cerrado** por Fase A |
| H2 | P1 | Sin guard de descarte (Escape/backdrop perdían datos en silencio) | **Cerrado** por Fase A |
| H3 | P2 | `text-iwana-secondary-700` sobre `bg-iwana-primary-50` (4.49:1 < AA), prohibido por `globals.css` | **Cerrado** por Fase A |
| H4 | P2 | Triplicación del patrón side-peek (`PortalSidePeek` ~10 consumidores, `OperationalSidePeek` 3, 3 drawers a mano en inventory con `z-[1200]`) + drift `StockItemDetailDrawer` (`z-50`) | **Fase B** (spec Propuesta) |
| H5 | P2 | `Dialog` de `@iwana/ui`: `shadow-2xl` (no sombra dual, Firma §1.7) y `z-10000/10001` literales contra ADR-075 (Aprobado) | **Fase B** (requiere CTO) |
| H6 | P3 | "Tipo de producto" y "Control de material" comparten opciones ("Consumible", "Con serial") para conceptos distintos; label hardcodeado | **Fase C** (posición emitida) |

## 5. Fase B — propuesta versionada (AI-DS-OWNER)

- Artefacto: `docs/specs/2026-09-01-consolidacion-side-peek-dialog-remediacion-ds.md` (v1.0, estado **Propuesto**).
- Decisión propuesta: `OperationalSidePeek` como primitiva canónica única; `PortalSidePeek` deprecado vía shim; hooks `usePortalSideDrawerA11y`/`portal-side-drawer-layers` absorbidos; guard y diálogo de descarte se conservan y componen vía `onBeforeClose`. Prohibida una cuarta primitiva. Orden de fases vinculante M1→M5.
- `pnpm audit:adr-citations`: **BLOQUEANTE: 0** (avisos preexistentes en espacio histórico; ninguna cita de la nueva spec marcada).
- **Aprobaciones requeridas:** CTO para la remediación de `Dialog` (primitiva compartida multi-app, ~45 consumidores); orquestador para la migración de drawers. No desbloquea ejecución hasta entonces.

## 6. Fase C — posición de vocabulario (AI-PROD-UX, no ejecutada aún)

- `itemKind` "Tipo de producto": **mantener** (naturaleza de negocio, correcta).
- `trackingMode`: **renombrar desde `inventory-labels.ts`** (fuente única, solo frontend): `CONSUMABLE → "Por cantidad"`, `SERIALIZED → "Serializada"`, `FIXED_ASSET → "Activo fijo"` sin cambio; label de campo **"Trazabilidad en bodega"**; eliminar el hardcode del form.
- Interacción aprobada en la posición: preselección coherente de trazabilidad según tipo de producto (ajustable a mano).
- Alcance: tabla, filtros y drawer de edición se actualizan solos (consumen `getInventoryTrackingModeLabel`); tests que fijan copy: `InventoryCreateProductDialog.spec.tsx`, `InventoryClient.spec.tsx`.
- Notas no bloqueantes: restringir la matriz itemKind×trackingMode en backend sería contrato nuevo (escalar si se desea); el mensaje del DTO "…requieren control de activo" merece pasada de vocabulario backend posterior.

## 7. Deuda registrada

| Severidad | Deuda | Destino |
| --- | --- | --- |
| P2 | Consolidación side-peek + remediación `Dialog` (H4/H5) | Spec Fase B (Propuesta) |
| P2 | E2E "crea producto comprable en catalogo…" roto **preexistente** (evidencia A/B en §3) | Diagnóstico propio del flujo paralelo que toca `InventoryClient` |
| P3 | Componente se llama `*Dialog` siendo drawer | Renombrar en migración Fase B |
| P3 | Foco inicial: soporte `initialFocusRef` debe vivir en la primitiva futura, no en el componente | Fase B |
| P3 | Cambio de vocabulario trackingMode | Fase C (pendiente go) |

## 8. Trazabilidad normativa

- Firma iWana §2.7 y recetas §8/§9/§11 (`component-recipes.md`), regla de promoción.
- ADR-075 *Contrato de capas Z* — **Aprobado** (v1.0, CTO, 2026-08-04) — verificado en fuente antes de citar.
- ADR-056 (Estrella Polar, tres dominios) — base de la revisión de identidad.
- `system-vocabulary-review` SKILL §Diccionario y regla de mismo-nombre-para-misma-cosa.

---

## 9. F2 — saneamiento del alta y del copy (2026-09-02, AI-FE-PLATFORM)

Corrección del informe vigente (regla §6 de la plantilla): se ejecutó la Fase F2 de MOD12 Catálogo sobre este drawer, con decisiones D1–D5 de AI-PROD-UX implementadas literalmente. Informe completo con evidencia: `INFORME-MOD12-CATALOGO-ALTA-COPY-F2-v1.0.md`.

Cambios sobre la Fase A descrita en este informe:

- **Reubicación (D1/D3):** Marca y Modelo salen del `<details>` y pasan a `Input` plenos, renderizados después de «Unidad de medida» y **antes** del well «Código sugerido». Orden final: Nombre → Categoría (+ creación inline intacta) → Tipo de producto → Control de material → Unidad de medida → Marca → Modelo → Código sugerido → `<details>` Descripción. La lógica `skuPreview` con `watch()` no cambió; el well conserva sus tokens.
- **Copy veraz (D2):** `Input` Modelo con `helperText` «Opcional. Ambos forman parte del código del producto, que no se puede modificar después.»; header del drawer ahora cierra con «…compras, inventario y activos fijos después.»; caption del well «Se asigna automáticamente al crear el producto.»
- **Acordeón retitulado (D4 del spec de diálogo):** «Agregar descripción» / «La puedes completar más adelante. No forma parte del código del producto.» — corrige el subtítulo falso «Estos datos son opcionales y puedes completarlos más adelante» (marca y modelo NO son completables después: el SKU solo se genera en `create`).
- **Contrato Fase A preservado:** `useDiscardChangesGuard`, `usePortalSideDrawerA11y`, `PortalDiscardChangesDialog`, reset al abrir, autoselección de primera categoría activa y creación inline con debounce 300 ms permanecen intactos (los 10 tests del guard/inline siguen en verde; la suite completa queda en 11).
- **Tests:** `InventoryCreateProductDialog.spec.tsx` actualizado (header nuevo + test nuevo de copy veraz y orden Marca/Modelo → well). Gates: ver informe F2 §5 (tests 11/11, typecheck, lint 0 errores, audit-ui P0/P1 = 0, control SKU sin cambios).
- **E2E:** «crea producto comprable en catalogo» sigue roto de forma **preexistente** (evidencia A/B en §3 de este informe); no se usó `git stash` en F2, se documenta sin atribución a esta fase.