# UX + DS — Inventario · subnavegación horizontal lima (`PortalModuleSubnav`)

| Campo | Valor |
| --- | --- |
| **Versión** | 1.3 |
| **Estado** | Congelado (v1.3 — validación DS-OWNER incorporada 2026-09-02: divisor del grupo anclado, compensación 19 px vía utilidad en fuente de tokens, contrato visual del estado inline) |
| **Fecha** | 2026-09-02 |
| **Autor** | AI-PROD-UX + AI-DS-OWNER (carril rápido UI, ADR-049) |
| **Módulo** | MOD12 Inventario · portal `/dashboard/inventory` |
| **Identidad** | [Firma iWana 2026-07-12](./2026-07-12-firma-iwana-diseno-visual-design.md) §3 elem. 1 |
| **Antecesor de receta** | [2026-08-19-comercial-module-subnav-ux.md](./2026-08-19-comercial-module-subnav-ux.md) v1.1 |
| **Informe** | [INFORME-INVENTORY-MODULE-SUBNAV-v1.0.md](../informes/INFORME-INVENTORY-MODULE-SUBNAV-v1.0.md) (v1.1 con antes/después llega con la implementación 2A) |

**Postura:** visualmente sobrio, interactivamente denso. El menú de módulo es **navegación** (`<nav>` + `aria-current`), no tabs de un mismo recurso. Activo `lg+` = subrayado lima inferior. Las subtabs internas de recurso (Productos/Categorías, Por bodega/Kardex, Lista/Comodatos) usan la receta de Oportunidades: tira con `border-b`, icono + label, activo = `portalTabLimeActiveClassName`.

**Cambio v1.1:** las subtabs internas dejan el fill navy.

**Cambio v1.2:** Vista general deja de duplicar Catálogo. KPI sueltos (`PortalMetricCard`) + un panel «Atención ahora». Sin tabla preview ni rankings de workspace.

**Cambio v1.3:** reagrupación del subnav por eje de responsabilidad (Fase 2A, ADR-084 D5): **Vista general** anclada sin eyebrow + grupos **Maestros**, **Operación**, **Abastecimiento** y **Seguimiento**; 11 destinos, mismos `?tab`. El gate de pestaña Compras pasa a **gate por grupo completo** (Compras + Proveedores; cierra el defecto D-3: Proveedores visible sin acceso). Deep-link a pestaña oculta → **estado restringido inline** según la gramática de gates vigente (convergencia nav-gates §2.3). Contrato visual v1.2 intacto; única extensión de la primitive, **aditiva**: `hideLabel?: boolean` en `PortalModuleSubnavGroup`.

**Supersede:** Comercial v1.1 reservaba Inventario en tabs navy. Esta spec lo migra a `PortalModuleSubnav` (módulo) + tira lima (recurso). No se sube a `@iwana/ui`.

---

## 1. IA

Aterrizaje = **Vista general** (solo dashboard). Al elegir una sección, el dashboard se sustituye por el workspace. El menú lima permanece arriba.

Los 11 destinos se reagrupan **por eje de responsabilidad** (árbol funcional congelado por AI-EM-ARCH en el prompt de Fase 2A). Ninguno cambia de `?tab`, de ruta ni de workspace interno:

```text
Vista general                    ← aterrizaje (?tab omitido; grupo sin eyebrow)

Maestros          Catálogo · Bodegas                  (datos de configuración)
Operación         Existencias · Salidas · Conteos     (día a día de bodega)
Abastecimiento    Compras · Proveedores               ← gate de grupo inventory.purchasing.read
Seguimiento       Activos · Movimientos · Bajas       (trazabilidad y fin de vida)
```

Árbol implementable — grupos con id · label · items en orden interno congelado (los iconos Lucide de cada ítem se conservan):

| Grupo (id) | Label | Items en orden (id — label) | Notas |
| --- | --- | --- | --- |
| `overview` | Vista general | `overview` — Vista general | Grupo anclado primero, `hideLabel: true` (§2.2): un solo ítem, sin eyebrow |
| `masters` | Maestros | `catalog` — Catálogo · `locations` — Bodegas | |
| `operation` | Operación | `stock` — Existencias · `issues` — Salidas · `counts` — Conteos | Reutiliza el id de grupo vigente |
| `supply` | Abastecimiento | `purchasing` — Compras · `suppliers` — Proveedores | El grupo completo viaja con el gate (§2.3) |
| `traceability` | Seguimiento | `assets` — Activos · `movements` — Movimientos · `writeoffs` — Bajas | Id e ítems sin cambios |

**Orden interno congelado** (coincide con el árbol funcional; no se afina nada adicional): dentro de cada grupo, del dato maestro o la consulta más frecuente hacia lo periódico o el cierre de ciclo — Catálogo antes que Bodegas (el producto es la semilla de todo lo demás); Existencias → Salidas → Conteos por frecuencia de uso; Compras (operación) antes que Proveedores (su maestro); Activos → Movimientos → Bajas del presente al histórico.

**URL:** sin `?tab` → overview. `?tab=catalog|stock|…` sin cambio de ids. Legacy `?tab=summary` → overview. Deep links `commercialRef`, `serializedAssetId` y `custody=mobile` siguen forzando Catálogo o Existencias. Deep-link a pestaña oculta por gate → §2.4 (sin redirección).

**Modo federado (dormant, ADR-084):** `INVENTORY_FEDERATED_NAV_GROUPS` no se toca — queda byte-idéntico. Sus 3 maestros (Catálogo, Proveedores, Bodegas) **conservan el eyebrow «Maestros»** (`INVENTORY_FEDERATED_EYEBROW`): en el modo federado la lista es plana y los tres destinos sí son maestros. La asimetría con el modo completo (donde Proveedores vive en Abastecimiento) es aceptable mientras el modo duerme; cuando la Fase 2B/3 active la federación se re-evaluará si ese eyebrow debe convertirse en grupo. Esta spec no lo activa (CA-2A-08).

---

## 2. Contrato

Misma primitive `PortalModuleSubnav` que Comercial. Sticky `lg:top-(--portal-sticky-offset)`. Ítems `min-h-11` + icono Lucide 16 px (`aria-hidden`). Activo: `bg-iwana-surface-soft` + `h-0.5 bg-iwana-secondary` + icono `text-iwana-secondary-700`.

`<lg`: `Sección: {label} ▾` + Dialog en columna.

### 2.1 Subtabs de recurso

Dentro de Catálogo, Existencias y Activos la tira interna replica Oportunidades (`/dashboard/crm/expedientes`): `role="tablist"` + `border-b`, `min-h-11`, icono + label, activo = `portalTabLimeActiveClassName` + icono `text-iwana-secondary-700`. Tokens: `portalResourceTabListClassName` / `portalResourceTabTriggerClassName` / `portalResourceTabIconClassName`.

Fuera de alcance: tabs de composer/workbench (Salidas, compras).

### 2.2 «Vista general»: grupo anclado sin eyebrow (extensión aditiva `hideLabel?`)

**Decisión congelada — opción (b):** «Vista general» es un grupo anclado primero cuyo eyebrow se oculta, mediante una extensión **aditiva** del tipo `PortalModuleSubnavGroup`.

Justificación frente a las alternativas:

- **(a) Grupo con eyebrow propio + un ítem:** duplicaría «Vista general» (eyebrow + label del ítem) — ruido sin información, contra la reducción de carga cognitiva que motiva la fase.
- **(c) Slot `leading` fuera del modelo de grupos:** introduciría un segundo modelo de ítems dentro de la misma nav y obligaría a tocar `resolveSubnavItem`, el trigger móvil y el gate. Mayor área de regresión en un contrato compartido.
- **(b) elegida:** conserva un único modelo `groups[]`; el filtro de gate, la resolución del ítem activo, el Dialog y el trigger móvil funcionan sin cambios. Comercial y Reglas no pasan la prop → render byte-idéntico (CA-2A-05). Los fixtures genéricos Catálogo/Reglas de `portal-module-subnav.spec.tsx` no cambian.

Firma exacta propuesta (aditiva, default = comportamiento actual):

```ts
export interface PortalModuleSubnavGroup {
  id: string;
  label: string;
  items: PortalModuleSubnavItem[];
  /** v1.3 — aditivo (default false). Oculta el eyebrow del grupo en pantalla.
   *  `label` sigue siendo obligatorio: es el nombre accesible del grupo. */
  hideLabel?: boolean;
}
```

Comportamiento congelado con `hideLabel: true`:

| Aspecto | Regla |
| --- | --- |
| Eyebrow | No se renderiza el `<p class="portal-eyebrow">`, tanto en `lg+` horizontal como en el Dialog `<lg` |
| Nombre accesible | La `ul` del grupo pasa de `aria-labelledby` a `aria-label={label}` — el heading ya no existe en el DOM; prohibido dejar un `aria-labelledby` apuntando a un id inexistente |
| Divisor horizontal | Intacto: la lógica del divisor no cambia (un `role="separator"` precede a cada grupo con `index > 0`). `overview` es el grupo anclado primero (índice 0): **no lleva divisor antes**; el primer divisor aparece antes de «Maestros». |
| Alineación | El ítem único se alinea a la **línea de ítems** de los demás grupos con una compensación de **19 px** sobre el wrapper del grupo (`div.space-y-1`), calculada y validada por DS-OWNER: eyebrow 15 px (`.portal-eyebrow` = 10 px × line-height 1.5 heredado; verificado que no hay `leading-*`/`text-*` en la cadena html→body→main→contenido, y `portal-typography.css` no fija line-height) + gap `space-y-1` = 4 px. Mecanismo: **una única utilidad documentada en la fuente de tokens** (`packages/ui/src/styles/globals.css`, junto a `.portal-eyebrow`), p. ej. `.portal-subnav-group-sans-label { padding-top: 19px; }`, con comentario de acoplamiento (reevaluar si `.portal-eyebrow` cambia). Prohibido: valor mágico inline en `portal-ui.tsx` o redeclarar las utilidades del eyebrow (valores paralelos). Aplica igual en `lg+` y en el Dialog `<lg`. |
| Grupos sin la prop | Byte-idéntico al comportamiento v1.2 (Comercial, Reglas, fixtures del test de la primitive) |

Uso en Inventario: exactamente un grupo con `hideLabel: true` (`overview`), siempre anclado primero. Prohibido reutilizar el patrón para ocultar eyebrows de grupos multi-ítem: el eyebrow agrupa y da contexto de lectura, y solo el destino sin grupo del árbol funcional lo omite.

### 2.3 Gate por grupo «Abastecimiento»

`Compras` y `Proveedores` comparten backend (`purchasing.controller.ts`) y llave (`INVENTORY_PURCHASING_*`). El gate de pestaña individual v1.2 (defecto D-3: ocultaba `purchasing` y dejaba `suppliers` visible → 403 crudo) se sustituye por **gate de grupo completo**: sin permiso efectivo, el grupo Abastecimiento entero desaparece y la incoherencia se cierra por construcción.

Semántica fail-open idéntica a la del Sidebar (convergencia nav-gates §1.5), sin fetch adicional — consume el mismo `usePermissions()` del layout, una sola llamada por sesión de navegación:

| Condición del contexto de permisos | Grupo Abastecimiento |
| --- | --- |
| `status === 'ready'` + set no vacío + rol no-ADMIN + **sin** `inventory.purchasing.read` | **Oculto completo** (Compras y Proveedores no existen en el DOM: ni visibles, ni disabled, ni con candado) |
| `loading` | Visible (fail-open; la barrera real es el backend, `PermissionsGuard`) |
| `degraded` | Visible |
| Tripwire (`ready` + set vacío, no-ADMIN) | Visible |
| ADMIN o modo federado | Visible |

Reglas congeladas:

- `filterInventoryNavGroups(canReadPurchasing)` pasa de filtrar un ítem a **excluir el grupo completo** `supply`; los demás grupos, su orden y sus ítems quedan intactos. El grupo `overview` jamás se filtra.
- Prohibido crear permisos nuevos (ADR-084 Regla 2, ADR-083): el grupo viaja con la llave existente `inventory.purchasing.read`.
- La barrera real de datos sigue siendo el backend; el gate de nav es presentación.

### 2.4 Deep-link a pestaña oculta: estado restringido inline

`/dashboard/inventory` ya está page-gateada con `inventory.stock.read` (`apps/portal/src/app/dashboard/inventory/layout.tsx`). El gate de pestaña es una **segunda frontera dentro de una página ya autorizada**: solo aplica cuando el tab base resuelto por `resolveInventoryTab` (función sin cambios) sea `purchasing` o `suppliers`, el contexto de permisos esté **resuelto** (`ready`), el set no esté vacío, el rol no sea ADMIN y no exista la llave de purchasing. En `loading`, `degraded` o tripwire no aparece: manda el fail-open de §2.3 y la barrera del backend (comportamiento actual, sin pantalla nueva).

Comportamiento congelado (aplica la gramática de gates vigente, convergencia nav-gates §2.3: explica el motivo, conserva la URL, no redirige):

- **No redirige.** La URL se conserva — `?tab=suppliers` sigue siendo compartible y recargable para que el usuario reporte el enlace exacto a su administrador. Un colega con la llave sí puede usarlo.
- El workspace de la pestaña **no se monta** (ni en DOM oculto). En su lugar se renderiza el **estado restringido inline** en el área de contenido, bajo el subnav. El marco de la página (PageHeader + subnav) se mantiene: la página sí está autorizada; solo la sección no.
- El subnav no marca ningún `aria-current` en ese estado (el destino no existe para este usuario). El trigger `<lg` conserva su fallback actual (primer ítem del nav); no se inventa un ítem fantasma en el listado.
- `document.title` sin cambio.
- Aplica también a variantes con sufijo (`?tab=purchasing/…`): la resolución se hace sobre la base del tab.

Copy congelado (sentence case; sin «permiso», «rol» ni claves crudas; patrón del estado restringido del hub):

| Pieza | Copy |
| --- | --- |
| Badge | `Acceso restringido` — `Badge variant="warning"` + `Lock`, tokens ámbar del patrón del hub |
| Título | `No tienes acceso a esta sección` |
| Descripción | `Tu tipo de usuario y sus perfiles asignados no incluyen el acceso necesario para usar esta sección.` |
| Acción primaria | `Volver a Vista general` — retira únicamente `tab` del query (aterrizaje en overview) y conserva el resto |

**Contrato visual del estado inline (patrón del gate, diferencias deliberadas):**

- **Shell:** reutilizar la clase del gate `restrictedShellClassName` (`flex flex-col items-start gap-4 rounded-2xl border border-gray-200 bg-white p-6 shadow-iwana-soft dark:border-dark-border dark:bg-dark-surface-2 md:p-8`). Hoy es un `const` privado de `PagePermissionGate.tsx`: FE-PLATFORM la **exporta** (o la reubica en `portal-ui.tsx` y reexporta). **Prohibido duplicar la cadena de clases** (dos fuentes de verdad).
- **Título:** `<h2>` — no `<h1>`. El gate usa `h1` porque reemplaza la página completa; el estado inline convive con el `h1` del `PageHeader` de Inventario (`InventoryClient.tsx` L2245). Mismas clases visuales que el gate (`text-xl font-semibold text-gray-900 dark:text-white md:text-2xl`), `id` único y `aria-labelledby` sobre el `section`.
- **Badge:** idéntico al gate: `Badge variant="warning"` + `Lock` (`h-3.5 w-3.5`) + `gap-1.5`.
- **Acción primaria:** `buttonVariants({ variant: 'primary', size: 'lg' })` + `min-h-11`.

Diferencias deliberadas frente al estado restringido de página completa (convergencia nav-gates §2.3): sin `Volver a inicio` ni `Ver usuarios y accesos` — el usuario ya está dentro de una página autorizada y las demás secciones están a un clic en el propio subnav; salir del módulo no es la salida natural de una pestaña.

### 2.5 Comportamiento `<lg`

Sin cambios estructurales respecto a v1.2. El Dialog presenta los 5 grupos en columna con sus eyebrows; el grupo `overview` (§2.2) aparece sin eyebrow como primera entrada del listado, y `hideLabel` aplica igual en ambas orientaciones. Trigger `Sección: {label}` + Dialog `max-w-md` intactos; al elegir, cierra. Con 11 ítems + 4 eyebrows la columna es más larga que la de Comercial: el Dialog conserva su scroll interno estándar; prohibido introducir acordeones o grupos plegables en esta primitive en este ciclo.

---

## 3. Criterios de aceptación

### 3.1 Vigentes (v1.2, se conservan)

1. `/dashboard/inventory` muestra KPIs de salud y el panel de excepciones; no la tabla de catálogo ni rankings de bodegas/categorías.
2. El menú de 11 destinos está arriba; Vista general lleva lima.
3. `?tab=catalog` oculta el dashboard y muestra el workspace de catálogo.
4. Atrás restaura `?tab`.
5. Subtabs internas de Catálogo, Existencias y Activos: subrayado lima + icono; sin fill navy.
6. «Activos a vigilar» incluye CTA «Ver activos», simétrico a «Ver reposición».

### 3.2 Nuevos (v1.3)

| # | Criterio | Fuente |
| --- | --- | --- |
| 7 | El subnav presenta exactamente 5 agrupaciones (overview sin eyebrow + 4 eyebrows) y los 11 destinos con los mismos `?tab` de v1.2; ningún destino cambia de ruta ni de workspace. | CA-2A-01 |
| 8 | Sin `?tab` se aterriza en Vista general; `?tab=summary` legacy sigue resolviendo a `overview`. | CA-2A-02 |
| 9 | Sin `inventory.purchasing.read` efectivo (contexto resuelto), el grupo Abastecimiento completo (Compras + Proveedores) no existe en el DOM; en `loading`, `degraded` o tripwire permanece visible. | CA-2A-03 |
| 10 | Deep-links intactos: `?tab=catalog&commercialRefId=…`, `?tab=locations&custody=mobile`, `?tab=locations&action=create`, `serializedAssetId`. | CA-2A-04 |
| 11 | Comercial y Reglas, que comparten `PortalModuleSubnav`, no presentan regresión visual ni funcional: sin la prop `hideLabel` el render es byte-idéntico. | CA-2A-05 |
| 12 | Contrato visual v1.2 preservado: activo lima, sticky `lg:top-(--portal-sticky-offset)`, ítems `min-h-11`, Dialog `<lg`. | CA-2A-06 |
| 13 | `audit-ui.mjs` sobre los archivos tocados: P0 = 0 y P1 = 0. | CA-2A-07 |
| 14 | Nada de esta spec activa la federación ni contradice el estado `COMING_SOON` del registry de Settings. | CA-2A-08 |
| 15 | Deep-link `?tab=suppliers` o `?tab=purchasing` sin llave efectiva (contexto resuelto) muestra el estado restringido inline con URL conservada, sin contenido del workspace montado y sin redirección. | CA-2Ab-05 |
| 16 | Con `hideLabel: true`, la lista del grupo conserva nombre accesible («Vista general») vía `aria-label`; ningún `aria-labelledby` apunta a un heading inexistente. | v1.3 |

---

## 4. Fuera de alcance

- Subtabs internas de recurso (Catálogo, Existencias, Activos) y workspaces internos.
- Modo federado: sin activación (Fase 2B/3); `INVENTORY_FEDERATED_NAV_GROUPS` y su wrapper permanecen byte-idénticos y dormant.
- Backend, permisos nuevos, registry de Settings, rutas e ids de `?tab`.
- Promover `PortalModuleSubnav` a `@iwana/ui`.
- Gramática de 3 bandas (candados en nav) — evolución futura registrada en convergencia nav-gates §1.1.

## 5. Relación con artefactos vigentes

| Artefacto | Efecto |
| --- | --- |
| ADR-084 v1.1 (Aprobado) | D5 autoriza la reagrupación sin evidencia previa; D3 fija el gate por grupo. |
| Convergencia nav-gates v1.2 | §2.2 nota (Compras = gate de pestaña, no página) y §2.3 (estado restringido: explica, conserva URL, no redirige) — adoptados en §2.3/§2.4 de esta spec. |
| Comercial v1.1 · Reglas (`rules-settings-nav.ts`) | Contrato compartido de `PortalModuleSubnav`; extensión aditiva sin efecto sobre ellas. |
| Prompt Fase 2A v1.0 (AI-EM-ARCH) | Árbol funcional y CA-2A-01..08 congelados; el diseño detallado (§2) es de PROD-UX + DS-OWNER. |

Cambios posteriores a esta spec se versionan (v1.4+) y se notifican vía orquestador a AI-FE-PLATFORM y AI-SR-QA; nunca se parchean solo en código.
