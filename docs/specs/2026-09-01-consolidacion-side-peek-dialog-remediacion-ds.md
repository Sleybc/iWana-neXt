# SPEC — Consolidación side peek y remediación de Dialog: contrato DS

**Fecha:** 2026-09-01
**Versión:** 1.0 — **Propuesto** (no congelado; no autoriza ejecución)
**Autoridad:** AI-DS-OWNER
**Destinatario ejecutor:** AI-FE-PLATFORM
**Destinatario validador:** AI-SR-QA
**Orquestador:** AI-EM-ARCH
**Fuente de tokens:** `packages/ui/src/styles/globals.css` (verificada 2026-09-01 en auditoría DS)

> **Estado Propuesto — matriz de aprobación requerida:**
> - **Parte 1 (remediación de `@iwana/ui`):** aprueba **CTO** — primitiva compartida multi-app (`apps/web` + `apps/portal`), contrato de componente del DS.
> - **Parte 2 (consolidación de drawers del portal):** aprueba **orquestador (AI-EM-ARCH)** — carril de ejecución de fe-platform, sin tokens de marca ni cambio de alcance.
> Cualquier modificación post-aprobación se versiona como v1.1+ y se notifica a AI-FE-PLATFORM y AI-SR-QA vía el orquestador antes de ejecutarse.

---

## 0. Veredicto de carril (protocolo §3bis)

Esta spec **no altera** alcance funcional, contrato de datos/API ni boundary Modulith. Toca primitivas compartidas de UI y su consumo. No crea tokens de marca: todos los valores usados ya existen en `globals.css`. La aprobación se pide porque parte 1 modifica `packages/ui` (ámbito CTO) y parte 2 consolida un patrón transversal del portal (ámbito orquestador).

**Fase A (conversión de "Nuevo producto" a drawer, carril rápido ya aprobado) corre en paralelo y no depende de esta spec.** Este documento no la cubre; ver §5 no-objetivos.

---

## 1. Contexto: el patrón "panel lateral" está triplicado (y con un cuarto caso derivado)

La auditoría DS del 2026-09-01 sobre la tab de catálogo de inventario detectó que el mismo patrón visual —panel lateral overlay con role `dialog`— tiene **tres implementaciones coexistentes** en el código, más un caso derivado fuera de todo patrón:

| # | Implementación | Ubicación | Consumidores | Capa z | Sombra | Anchos |
| --- | --- | --- | --- | --- | --- | --- |
| A | `PortalSidePeek` | `apps/portal/src/components/shared/portal-ui.tsx` | **~10** (users: `EditUserModal`; commercial: `BundlesManager`, `AdditionalProductsPanel`, `AdditionalServicesPanel`, `PlanCatalogFormPeek`, `CompatibilityRulesManager`, `PromotionsManager`, `TaxCatalogManager`, `TaxApplicationRulesManager`; settings: `AccessControlSettingsClient`) | `z-(--z-drawer)` ✅ | `shadow-iwana-soft` ✅ | `max-w-lg` |
| B | `OperationalSidePeek` | `packages/ui/src/components/OperationalSidePeek.tsx` (exportada en `index.ts`) | **3** (operations: `ExecutionOrderDrawer`; scheduling: `ScheduleEventDrawer`, `VisitRequestRecommendationPanel`) | `z-(--z-modal)` ⚠️ | `shadow-iwana-soft` ✅ | `32rem` / `48rem` (`size wide`) |
| C | Drawer a mano + hooks compartidos | `apps/portal/src/components/inventory/` — `InventoryCategoryDrawer`, `SupplierFormDrawer`, `InventoryCatalogDrawer` | **3** | `z-[1200]` / `z-[1201]` literales ❌ (violan ADR-075) | `shadow-2xl` ❌ | `max-w-2xl` / `max-w-4xl` (drift entre hermanos) |
| D | Deriva fuera de patrón | `apps/portal/src/components/inventory/StockItemDetailDrawer.tsx` | **1** (consumido por `StockWorkspace`) | `z-50` literal ❌ (queda por debajo incluso de `--z-sticky: 100` — riesgo de apilamiento real) | `shadow-xl` ❌ | `max-w-xl`; overlay `bg-black/30` (el resto usa `bg-black/40-45`); **sin par dark de superficie** (no aplica `dark:bg-dark-surface-*`); sin hooks del patrón (ni guard de descarte ni a11y compartido) |

Los tres drawers del caso C comparten hooks de `apps/portal/src/components/shared/`: `usePortalSideDrawerA11y`, `use-discard-changes-guard` y `PortalDiscardChangesDialog`, más el registro de capas `portal-side-drawer-layers.ts`. Cada uno, sin embargo, re-estila a mano el `<aside>` del shell (~80 líneas de boilerplate repetido por archivo).

### Consecuencias observadas

- **Deriva visual intra-módulo:** tres anchos distintos del mismo patrón dentro de inventory solo; dos técnicas de sombra (`shadow-iwana-soft` vs `shadow-2xl`/`shadow-xl`) en overlays que deberían compartir firma.
- **Capas z incoherentes:** ADR-075 (`docs/adrs/ADR-075-Contrato-Capas-Z-Portal.md`, estado Aprobado) define `--z-drawer: 300` y `--z-modal: 400` y prohíbe el z literal. Hoy conviven `300` (token), `400` (token), `1200/1201` (literal) y `50` (literal).
- **Semántica de capa ambigua entre primitivas:** `PortalSidePeek` (drawer) usa `--z-drawer`; `OperationalSidePeek` (también drawer) usa `--z-modal`. Dos primitivas del mismo patrón en escalones distintos.
- **Regla de promoción superada por triplicado:** `component-recipes.md` (regla de promoción) manda promover un patrón repetido ≥2 veces. El patrón aparece 17 veces por tres vías distintas. El defecto ya no es "falta primitiva": es **duplicación sin dueño**.
- **Deuda adicional registrada (fuera de alcance, ver §5):** cinco componentes de inventory con nombre `*Drawer` están construidos sobre el `Dialog` centrado de `@iwana/ui`, no sobre ningún panel lateral (`PurchaseRequestWorkbenchDrawer`, `PurchaseOrderDrawer`, `SerializedAssetDetailDrawer`, `StockIssueDetailDrawer`, `StockIssueFormDrawer`).

---

## 2. Decisión propuesta: una sola primitiva canónica, sin crear una cuarta

**PROHIBIDO crear una cuarta primitiva de panel lateral.** La decisión es consolidar hacia la primitiva más madura y deprecar el resto.

### 2.1 Comparativa

| Criterio | `PortalSidePeek` (portal-ui) | `OperationalSidePeek` (@iwana/ui) | Drawer a mano (inventory) |
| --- | --- | --- | --- |
| Ámbito | Solo portal | **Multi-app** (web + portal, destino de la cadena de madurez) | Solo inventory |
| Contrato de componente | `open/onClose/title/description/eyebrow/footer/className` | **Completo y probado**: añade `busy` (aria-busy + estado visible), `size default/wide`, `initialFocusRef`, `onBeforeClose` | Ninguno: shell repetido a mano |
| Guard de descarte | No integrado | **`onBeforeClose` nativo** — punto de composición para `useDiscardChangesGuard` | Manual: coreografía `open && !discardOpen` en cada consumidor |
| A11y | Focus trap + retorno de foco + capas propias | Focus trap + retorno de foco + capas propias + `aria-busy` | Hook compartido correcto, pero acoplado a cada drawer |
| Capa z | `z-(--z-drawer)` ✅ | `z-(--z-modal)` ⚠️ (remediar: ver §3.2) | `z-[1200]` literal ❌ |
| Sombra | `shadow-iwana-soft` ✅ | `shadow-iwana-soft` ✅ | `shadow-2xl` ❌ |
| Tamaño de migración restante | 10 consumidores (o 0 con shim, ver §2.3) | 3 consumidores + 1 cambio interno de capa z | 4 archivos (3 con patrón + 1 deriva) |
| Tests de a11y existentes | `portal-ui.spec.tsx` | `ExecutionOrderExperience.spec.tsx` | Specs por drawer |

### 2.2 Primitiva canónica: `OperationalSidePeek` (`@iwana/ui`)

Justificación:

1. **Es la única con contrato de componente completo** (anatomía, props, estados busy, intercepción de cierre) — requisito de contrato DS.
2. **Vive en el destino final de la cadena de madurez** (pantalla → `portal-ui.tsx` → `@iwana/ui`): promover a ella es avanzar en la dirección prevista; promover a `portal-ui.tsx` sería un paso atrás.
3. **Su `onBeforeClose` reemplaza la coreografía manual** del guard de descarte: `onBeforeClose={async () => { if (isDirty) { …devolver false si el operador no confirma } return true }}`, componiendo `useDiscardChangesGuard` + `PortalDiscardChangesDialog` sin acoplar el shell.
4. **Menor tamaño de migración directo:** solo 3 consumidores la usan ya; los 10 de `PortalSidePeek` se consolidan por shim sin tocarlos (§2.3).

### 2.3 Destino de `PortalSidePeek` y de los hooks compartidos

| Pieza | Decisión propuesta |
| --- | --- |
| `PortalSidePeek` (`portal-ui.tsx`) | **Fase 1: shim.** Reimplementar su cuerpo como wrapper de `OperationalSidePeek` (mapeo 1:1 de props: `onClose` → `onOpenChange(false)`, `busy` default `false`, `size default`). Sus ~10 consumidores no cambian. **Fase 3: deprecación** del export una vez verificados los consumidores; migración de consumidores al nombre canónico queda como trabajo opcivo de fe-platform, no bloqueante. |
| `usePortalSideDrawerA11y` | **Absorbido y eliminado.** La trampa de foco, el retorno de foco y el registro de capas ya viven dentro de la primitiva canónica. Se elimina cuando el último drawer de inventory migre (verifica grep: hoy solo lo consumen los 3 drawers de inventory). |
| `portal-side-drawer-layers.ts` | **Absorbido y eliminado** junto con el hook (solo lo consume el hook). |
| `useDiscardChangesGuard` | **Se conserva** en `shared/`: es lógica de estado del formulario (dirty tracking), no shell. Se compone con la primitiva vía `onBeforeClose`. |
| `PortalDiscardChangesDialog` | **Se conserva** en `shared/`: es un dialog modal de confirmación, hermano del drawer, no parte de él. Debe quedar por encima del drawer (garantizado por la jerarquía de capas de §3.2). |

### 2.4 Anchos y variante wide

Los casos del módulo usan `max-w-2xl` (categorías, proveedores) y `max-w-4xl` (catálogo). La primitiva ofrece `size="default"` (32rem ≈ max-w-lg+) y `size="wide"` (48rem ≈ max-w-3xl+). Propuesta:

- `max-w-2xl` → `size="wide"` cubre el caso con la anchura normalizada.
- El caso excepcional `max-w-4xl` (`InventoryCatalogDrawer`) usa el `className` de la primitiva con el override documentado; **no se añade variante nueva al contrato** salvo que aparezca un segundo caso (regla de promoción, versión variante).

---

## 3. Remediación de `Dialog` en `@iwana/ui` (parte 1 — requiere CTO)

### 3.1 Sombra

El shell de `DialogContent` usa `shadow-2xl` (sombra genérica de Tailwind). La Firma iWana (§1.7 y §5) define la familia de sombras `--shadow-iwana-*` como técnica única de profundidad.

**Cambio propuesto:** shell de `DialogContent` → `shadow-iwana-lg` (token `--shadow-iwana-lg`, elevación dual adecuada para modal flotante). El backdrop (`bg-black/55 backdrop-blur-sm`) se conserva: el blur está permitido en overlays.

### 3.2 Capas z

`DialogContent` usa literales `z-10000` (backdrop) y `z-10001` (panel), en contradicción con ADR-075 (Aprobado) y con la nota de `globals.css` ("Prohibido z literal").

**Cambio propuesto:**

| Literal actual | Reemplazo | Justificación |
| --- | --- | --- |
| `z-10000` (contenedor fixed) | `z-(--z-modal)` | El dialog ES la capa modal de ADR-075 |
| `z-10001` (panel interno) | `z-10` relativo | Mismo patrón que ya usan las dos peeks (panel relativo dentro del contenedor) |

**Jerarquía resultante (coherente con ADR-075):** side peek = `--z-drawer` (300) < dialog/modal = `--z-modal` (400) < popover/toast. Esto garantiza por tokens lo que hoy garantizan literales: el `PortalDiscardChangesDialog` (un `Dialog`) siempre pinta por encima del drawer que lo invoca.

**Cambio asociado obligatorio en la primitiva canónica:** `OperationalSidePeek` pasa de `z-(--z-modal)` a `z-(--z-drawer)` — su nombre semántico correcto y su diferencia real frente a un dialog. Es un cambio de una línea dentro de la primitiva; sus 3 consumidores no cambian.

### 3.3 Alcance multi-app y compatibilidad

- **Blast radius:** `DialogContent` se consume en ~40 archivos de `apps/portal/src/components/**` (users, crm, settings, scheduling, operations, inventory, commercial, shared) y 5 de `apps/web/src/components/**` (`UserManagementModal`, `UserCreateModal`, `ConfirmDialog`, `CredentialsModal`, `PlatformBrandingSettings`), más specs que lo mockean.
- **Impacto en consumidores: cero cambios de código.** La capa z y la sombra viven dentro de la primitiva; los consumidores solo pasan overrides de ancho/altura. Ningún consumidor declara su propio z del shell.
- **Riesgo real de apilamiento y por qué el orden de fases importa:** hoy el dialog gana a los drawers literales de inventory (`10000 > 1200`) y a la deriva de stock (`10000 > 50`) por accidente numérico. Si se tokeniza el dialog a `--z-modal` (400) **antes** de eliminar esos literales, los drawers quedarían por encima de los modales — regresión de apilamiento. Por eso el orden de §4.2 es vinculante: primero se eliminan los literales externos, después se tokeniza el dialog.
- **Verificación de anidamientos:** inventariar en ejecución si algún flujo monta un `Dialog` dentro de una peek (hoy empate 400 vs 400 resuelto por orden del DOM; tras el cambio queda determinístico 300 < 400) y el caso inverso (peek dentro de dialog, no esperado).

---

## 4. Migración

### 4.1 Inventario de consumidores (verificado por grep 2026-09-01)

**Sobre `PortalSidePeek` (10):** `users/EditUserModal` · `commercial/BundlesManager` · `commercial/catalog/AdditionalProductsPanel` · `commercial/catalog/AdditionalServicesPanel` · `commercial/catalog/PlanCatalogFormPeek` · `commercial/CompatibilityRulesManager` · `commercial/PromotionsManager` · `commercial/TaxCatalogManager` · `commercial/TaxApplicationRulesManager` · `settings/AccessControlSettingsClient`.

**Sobre `OperationalSidePeek` (3):** `operations/ExecutionOrderDrawer` · `scheduling/ScheduleEventDrawer` · `scheduling/VisitRequestRecommendationPanel`.

**Drawers a mano con hooks (3):** `inventory/InventoryCatalogDrawer` · `inventory/InventoryCategoryDrawer` · `inventory/SupplierFormDrawer`.

**Deriva fuera de patrón (1):** `inventory/StockItemDetailDrawer`.

**Sobre `Dialog` (remediación interna, sin tocar consumidores):** ~40 archivos portal + 5 web (ver §3.3).

### 4.2 Orden de migración propuesto (vinculante)

| Fase | Contenido | Quita del sistema | Riesgo |
| --- | --- | --- | --- |
| **M1** | Migrar los 3 drawers con patrón de inventory a `OperationalSidePeek` (`size="wide"`, guard vía `onBeforeClose`, anchos por §2.4) | Los 3 shells `<aside>` a mano y los literales `z-[1200]/z-[1201]` | Bajo: cada drawer tiene spec propia que valida foco y guard |
| **M2** | Migrar `StockItemDetailDrawer` a la primitiva canónica, con par dark de superficie y guard si aplica | El shell `z-50` + `bg-black/30` + `shadow-xl` sin dark | Bajo: 1 consumidor (`StockWorkspace`) con spec |
| **M3** | Remediación interna de `Dialog` (sombra §3.1 + capas §3.2) y capa de `OperationalSidePeek` a `--z-drawer` | Literales `z-10000/z-10001`; ambigüedad de capas entre peeks | Medio: solo tras M1+M2 (sin literales externos por encima de 400); regresión visible y revertible en un commit |
| **M4** | Shim de `PortalSidePeek` → wrapper de `OperationalSidePeek`; verificación de sus 10 consumidores | La tercera implementación del shell | Bajo: contrato de props equivalente; specs de a11y existentes deben pasar sin cambios |
| **M5** | Deprecación: eliminar `usePortalSideDrawerA11y`, `portal-side-drawer-layers.ts` y (opcional, diferido) el export `PortalSidePeek` tras grep cero de consumidores directos | Código muerto del patrón viejo | Trivial |

Cada fase es un PR independiente, revertible, con sus gates (§7). M1/M2 corresponden a la parte 2 (aprobación orquestador); M3 requiere además la aprobación CTO de la parte 1.

### 4.3 Riesgos de regresión y mitigación

| Riesgo | Mitigación |
| --- | --- |
| Apilamiento incorrecto entre fases | Orden vinculante M1→M5; gate grep que impide mergear M3 con literales externos vivos |
| Pérdida de comportamiento del guard (cerrar con cambios sin confirmar) | El guard se mueve a `onBeforeClose`; specs de los 3 drawers validan Escape, clic en overlay y botón cerrar con formulario dirty |
| Regresión de foco (trampa/retorno) | Specs de a11y existentes de las dos peeks y de los drawers migrados; prueba manual con teclado en claro y oscuro |
| Cambio visual no deseado en los 10 consumidores del shim M4 | Diferencia visual esperada: cero (misma estructura); revisión de capturas antes/después en un módulo representativo (users) |
| Tests que mockean `DialogContent` (varios specs) | No cambian contrato de props; validar que los mocks siguen pasando |

### 4.4 Criterios de aceptación verificables

- **CA-1 (capas z tokenizadas):** grep de literales `z-\[` y `z-50|z-10000|z-10001` en shells overlay de portal = **0**; solo `z-(--z-*)` y `z-10` relativos internos.
- **CA-2 (una sola técnica de sombra):** grep de `shadow-2xl|shadow-xl` en shells de drawer/dialog del portal y de `packages/ui` = **0**; solo familia `--shadow-iwana-*`.
- **CA-3 (un solo shell de drawer lateral):** ningún módulo de portal renderiza un `<aside role="dialog">` a mano fuera de la primitiva canónica y su shim; grep de `role="dialog"` en `apps/portal/src/components` solo encuentra consumidores de `OperationalSidePeek`/`PortalSidePeek`/`Dialog`.
- **CA-4 (foco y guard):** suite verde de `portal-ui.spec.tsx` (a11y de peeks), `ExecutionOrderExperience.spec.tsx` (a11y de `OperationalSidePeek`), specs de los 4 drawers migrados y de `PortalDiscardChangesDialog`; navegación por teclado (Escape cierra con guard, Tab cicla dentro del panel, foco retorna al trigger) verificada manualmente en claro y oscuro.
- **CA-5 (ADR-075):** `pnpm audit:adr-citations` sin hallazgos de cita rota; revisión visual de que ninguna capa nueva pisa `--z-sticky` del topheader.
- **CA-6 (multi-app):** build y tests de `apps/web` verdes tras M3 (los 5 consumidores web no cambian).

---

## 5. No-objetivos

1. **La conversión de "Nuevo producto" (Fase A).** Ya aprobada como carril rápido separado y en ejecución en paralelo sobre `InventoryCreateProductDialog.tsx` (por eso esta spec no cita líneas de ese archivo). Esa fase lleva su propia revisión DS, incluida la corrección de contraste del cuadro de código sugerido detectada en la auditoría (`text-iwana-secondary-700` sobre `bg-iwana-primary-50` no pasa AA — token de reemplazo existente: `text-iwana-primary`).
2. **Tokens de marca.** Ningún valor nuevo en `globals.css`; no se toca la escala de marca. Marca = CTO.
3. **Los `*Drawer` construidos sobre `Dialog` centrado** (`PurchaseRequestWorkbenchDrawer`, `PurchaseOrderDrawer`, `SerializedAssetDetailDrawer`, `StockIssueDetailDrawer`, `StockIssueFormDrawer`). Quedan **registrados como deuda de semántica** (nombre dice drawer, shell es dialog): la receta §9 manda ediciones estructurales multi-campo a drawer. Requieren decisión de prod-ux + DS en una fase futura; no se consolidan aquí.
4. **Rediseño de flujos UX, anchos de negocio o motion.** La migración es de shell, no de interacción.
5. **Tokens dark tolerados** (`dark:text-gray-200/400`): deuda vigiliada por Firma §1.2bis(d), fuera de alcance.

---

## 6. Fuentes

- `docs/adrs/ADR-075-Contrato-Capas-Z-Portal.md` — Aprobado; define `--z-base/sticky/overlay/drawer/modal/popover/toast` y prohíbe el z literal.
- `docs/specs/2026-07-12-firma-iwana-diseno-visual-design.md` — §1.7 (consolidación de sombras), §2.7 (side peek de detalle, generaliza `SupplierFormDrawer`), §5 (anti-patrones; una sola técnica de profundidad).
- `.agents/skills/iwana-identity-ui-review/references/component-recipes.md` — §8 (formularios), §9 (side peek/drawer de detalle), §11 (eyebrows), regla de promoción (≥2 → promover; cadena pantalla → portal-ui → @iwana/ui).
- `packages/ui/src/styles/globals.css` — tokens `--z-*`, `--shadow-iwana-*`, `--color-iwana-*`, `--color-dark-*` (fuente de verdad de valores).
- `docs/adrs/ADR-056-Integridad-Base-Normativa-Diseno.md` §2 — norma dark y emparejamiento de superficies (aplica a los shells migrados).
- Auditoría DS-OWNER 2026-09-01 (esta sesión): verificación de tokens, exports de `@iwana/ui`, conteos de consumidores por grep y drift de `StockItemDetailDrawer`.

---

## 7. Plan de gates

| Gate | Comando / verificación | Fases |
| --- | --- | --- |
| Lint | `pnpm lint` | Todas |
| Typecheck | `pnpm typecheck` | Todas |
| Tests unitarios portal | `pnpm --filter @iwana/web test` y suite portal (specs de drawers, `portal-ui.spec.tsx`, `ExecutionOrderExperience.spec.tsx`, `PortalDiscardChangesDialog`) | M1, M2, M4 |
| Tests web (multi-app) | suite de `apps/web` (5 consumidores de Dialog sin cambios) | M3 |
| E2E inventory | `pnpm test:e2e:portal` — tab catálogo: abrir/editar categoría, proveedor, catálogo y detalle de stock; guard con cambios sin guardar | M1, M2 |
| Auditoría mecánica de identidad | Script de reglas duras de `iwana-identity-ui-review` + gates grep de CA-1/CA-2/CA-3 | Todas |
| Citas de ADR | `pnpm audit:adr-citations` (existe en `package.json`) | M3 y cierre |
| Revisión visual DS | Capturas claro/oscuro de un módulo representativo por fase (users para M4, inventory para M1/M2) firmadas por AI-DS-OWNER | Todas |
| Cierre | Informe en `docs/informes/` con evidencia de CA-1…CA-6 | Cierre |
