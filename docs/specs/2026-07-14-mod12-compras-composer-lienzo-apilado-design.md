# SPEC de diseño: Compositor de compras — layout "lienzo apilado" (MOD12)

**Versión:** 1.0
**Estado:** Aprobado (Etapa 2 congelada) — ejecución autorizada
**Fecha:** 2026-07-14
**Modo activo:** Orchestrator + Architect (AI-EM-ARCH)
**Módulo:** MOD12 Inventario / SCM — Submódulo Compras
**Superficie:** Portal tenant (`apps/portal`) → `/dashboard/inventory?tab=purchasing` (create-mode)
**Responsable de gobierno:** AI-EM-ARCH
**Análisis UX:** AI-PROD-UX (consolidado por EM-ARCH)
**Clasificación:** Uso interno

---

## 1. Trazabilidad

| Artefacto | Relación |
| --- | --- |
| `docs/specs/SPEC-MOD12-COMPRAS-UI-ALIGNMENT-v1.0.md` | Spec previa; §6.4 (composer) **evoluciona** con este documento |
| `docs/prds/PRD-MOD12-COMPRAS-WORKSPACE-HIBRIDO-v1.0.md` | Alcance funcional vigente (sin cambio) |
| `docs/hlds/HLD-MOD12-COMPRAS-WORKSPACE-HIBRIDO-v1.0.md` | Contratos backend (sin cambio) |
| `docs/adrs/ADR-048-Bounded-Context-Inventario-SCM-Ciclo-Vida-Productos.md` | Boundary inmutable |
| `docs/specs/2026-07-12-firma-iwana-diseno-visual-design.md` | Dirección visual vigente |
| `docs/roles/Perfil_IA_Product_Designer_UX_v1.md`, `docs/roles/Perfil_IA_EM_Architect_Unificado_v2.md` | Roles activos |

**Motivo:** El usuario de abastecimiento reportó fricción al crear una solicitud (pedir cotizaciones): el campo "Título" desproporcionado y la lista de productos ilegible al crecer. La causa raíz es un reparto de ancho invertido en el split del compositor. Cambio **exclusivamente presentacional** dentro de ADR-048.

**Impacto (tenant/seguridad/escala/regulación):** sin impacto — no toca `search_path`, JWT, RBAC, PII, endpoints ni `CreatePurchaseRequestDto`.

---

## 2. Problema (evidencia en código)

`PurchaseRequestComposer` (create-mode desktop, `apps/portal/src/components/inventory/`):

1. **"Título" full-bleed.** Input a todo el ancho bajo una grilla de 4 columnas (`PurchaseRequestComposer.tsx:288-295`); campo más pesado siendo de baja prioridad, sin placeholder ni ayuda.
2. **Reparto invertido.** Split `xl:grid-cols-[7fr_5fr]` (`PurchaseRequestComposer.tsx:372`): izquierda "Productos" (~58%) contiene **solo un buscador**; derecha "Borrador" (~42%) contiene una **tabla de 7 columnas** que no cabe → `overflow-x-auto` → scroll horizontal por fila (`PurchaseDraftLinesTable.tsx:53`).
3. **Ruido y jerarquía.** Columnas de bajo valor (Origen, Unidad, "Sin proveedor sugerido"); "Justificación" atrapada bajo la tabla que crece; conteo y total solo visibles en el footer.

---

## 3. Dirección aprobada — lienzo apilado

Se elimina el split. El create-mode desktop (`xl`) se compone en **cuatro zonas apiladas a todo el ancho**. Mobile (`<768px`) conserva el flujo por pasos existente (capture → review).

### 3.1 Wireframe anotado (desktop `xl`)

```
┌───────────────────────────────────────────────────────────────┐
│ Zona 1 — Datos de la solicitud                                 │
│  [ Título (col-span-2)        ] [ Tipo ]      [ Prioridad ]    │
│  [ Área (col-span-2)          ] [ Fecha ]                      │
├───────────────────────────────────────────────────────────────┤
│ Zona 2 — Captura (barra sticky, full-width)                    │
│  [ 🔍 Buscar producto ......................] [+ Línea manual ]│
├───────────────────────────────────────────────────────────────┤
│ Zona 3 — Borrador (tabla full-width, sin scroll horizontal)    │
│  Líneas seleccionadas · 3 líneas · Total estimado $X           │
│  ┌───┬───────────────────────┬──────────────┬──────────┬─────┐ │
│  │ ☐ │ Producto  [Origen]    │ Cantidad·ud  │ Proveedor│  ⋯  │ │
│  └───┴───────────────────────┴──────────────┴──────────┴─────┘ │
├───────────────────────────────────────────────────────────────┤
│ Zona 4 — Justificación (full-width) + footer sticky (resumen)  │
└───────────────────────────────────────────────────────────────┘
```

### 3.2 Especificación por zona

**Zona 1 — Datos.** Grilla `md:grid-cols-2 xl:grid-cols-4`. Orden: **Título `md:col-span-2`** (líder, ancho sano ~50%, con `placeholder`/`helperText`, ej. "Ej. Reposición de routers — Bodega Norte") · Tipo de compra · Prioridad; segunda fila: Área solicitante `md:col-span-2` · Fecha requerida.

**Zona 2 — Captura.** `captureSection` como barra horizontal full-width y **sticky** bajo el contexto: `PurchaseProductSearch` (crece) + botón "Agregar línea manual". El header de sección se conserva compacto. El aviso de duplicado (`PortalAlert warning`) sigue apareciendo aquí.

**Zona 3 — Borrador.** `draftSection` a 100% de ancho.
- Header con conteo + total: reutilizar `draftEstimate` (`PurchaseRequestComposer.tsx:150`) + `formatInventoryCurrency`. Ej.: "3 líneas · Total estimado $X" (omitir total si `coveredLines === 0`).
- Tabla: adoptar `portalDataTableShellClassName` / `portalDataTableHeadClassName` / `portalDataTableCellClassName`.
- **Origen** → `Badge variant="neutral"` junto al nombre del producto (elimina la columna); label vía `getPurchaseRequestLineSourceLabel`.
- **Unidad** → fusionada en la celda de Cantidad ("5 · unidad").
- **Proveedor sugerido** → texto atenuado cuando vacío.
- Cantidades con `tabular-nums`.
- Empty state: `PortalEmptyState` (se conserva).

**Zona 4 — Justificación + footer.** `justificationSection` sale de debajo de la tabla y queda como sección full-width propia antes del `CreateModeSummaryFooter` sticky (se conserva).

---

## 4. Estados de experiencia

| Estado | Comportamiento |
| --- | --- |
| Vacío (primera vez) | `PortalEmptyState` "Aún no hay líneas en el borrador" + guía a la barra de captura |
| Duplicado | `PortalAlert warning` en zona de captura (ya existente) |
| Carga (búsqueda) | "Buscando en catálogo..." en el listbox (ya existente) |
| Error de envío/validación | `PortalAlert error` en la parte superior del contenido (ya existente) |
| Con datos | Conteo + total visibles junto a la lista; tabla legible sin scroll horizontal |

---

## 5. Criterios de accesibilidad (WCAG 2.2 AA)

- Foco visible en todos los controles (`interactiveFocusClassName`).
- Targets ≥44px.
- Texto sobre blanco con `iwana-secondary-700` (no `iwana-secondary` puro); superficies dark con `dark-surface-*` (no `dark:bg-gray-{700-950}`).
- Ningún enum crudo visible (Origen como Badge con label canónico).
- Si se añade realce de fila al agregar línea: `prefers-reduced-motion` respetado, 150–300ms, solo transform/opacity.
- `Badge` de Origen: es redundante con texto; no depende solo de color.

---

## 6. Criterios de aceptación (verificables por QA)

- **CA-1:** con ≥5 líneas, la tabla del borrador se lee sin scroll horizontal en `xl`.
- **CA-2:** "Título" no ocupa el ancho completo del formulario y tiene ayuda de contenido.
- **CA-3:** conteo y total de líneas visibles junto a la lista, sin llegar al footer.
- **CA-4:** ningún enum crudo visible (Origen como Badge con label canónico).
- **CA-5:** foco visible; targets ≥44px; motion respeta `prefers-reduced-motion`.
- **CA-6:** paridad de tokens (dark-surface-*, `iwana-secondary-700`, sin `dark:bg-gray-{700-950}`).

---

## 7. Prompt de ejecución (Etapa 4 → 5) — AI-SR-FULL / AI-FE-PLATFORM

**Alcance exacto (solo estos archivos):**

| Archivo | Acción |
| --- | --- |
| `apps/portal/src/components/inventory/PurchaseRequestComposer.tsx` | Grid Título `col-span-2` + helper; reemplazar rama split por zonas apiladas; captura sticky; reubicar justificación; pasar conteo/total al header del borrador |
| `apps/portal/src/components/inventory/PurchaseLinesEditor.tsx` | `captureSection` barra compacta; `draftSection` header con conteo + total |
| `apps/portal/src/components/inventory/PurchaseDraftLinesTable.tsx` | Full-width; clases `portalDataTable*`; Origen→`Badge`; Unidad fusionada; `tabular-nums`; proveedor vacío atenuado |
| `apps/portal/src/components/inventory/PurchaseProductSearch.tsx` | Ajuste menor de layout inline (opcional) |

**Restricciones:** reutilizar primitivos `@iwana/ui` (`Badge`, `Input`, `Select`, `Button`) y `portal-ui.tsx` (`PortalSectionHeader`, `PortalEmptyState`, `CreateModeSummaryFooter`, helpers `portalDataTable*`, `interactiveFocusClassName`). **Prohibido:** `tailwind.config.js`, nuevas dependencias, `PortalPanel` anidado, controles HTML crudos con equivalente `@iwana/ui`, lima como urgencia, `iwana-secondary` sin `700` sobre blanco, enums crudos, cambios en `CreatePurchaseRequestDto` o backend.

**Stop/go:** detenerse y escalar si se requiere patrón/token nuevo (→ DS-OWNER) o cambio de contrato de datos (fuera de fase).

---

## 8. Definition of Done

- [ ] `pnpm --filter @iwana/portal typecheck` sin errores.
- [ ] `pnpm --filter @iwana/portal lint` sin errores.
- [ ] Tests unitarios de componentes tocados en verde.
- [ ] E2E `portal-inventory-scm.spec.ts` en verde.
- [ ] CA-1..CA-6 verificados (desktop, `<768px`, dark mode).
- [ ] Informe de cierre `docs/informes/INFORME-MOD12-COMPRAS-COMPOSER-LIENZO-APILADO-v1.0.md` publicado.
- [ ] Addendum en `SPEC-MOD12-COMPRAS-UI-ALIGNMENT-v1.0.md` §6.4.
