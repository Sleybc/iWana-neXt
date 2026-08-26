# UX + DS — Comercial · subnavegación horizontal lima (`PortalModuleSubnav`)

| Campo | Valor |
| --- | --- |
| **Versión** | 1.1 |
| **Estado** | Congelado |
| **Fecha** | 2026-08-19 |
| **Autor** | AI-PROD-UX + AI-DS-OWNER (carril rápido UI) |
| **Módulo** | MOD06 Comercial · portal `/dashboard/commercial` |
| **Antecesor UX** | [2026-07-22-mod06-comercial-resumen-navegacion-ux.md](./2026-07-22-mod06-comercial-resumen-navegacion-ux.md) (H9) |
| **Identidad** | [Firma iWana 2026-07-12](./2026-07-12-firma-iwana-diseno-visual-design.md) §3 elem. 1 |
| **Informe** | [INFORME-COMMERCIAL-UI-ALIGNMENT-v2.1.md](../informes/INFORME-COMMERCIAL-UI-ALIGNMENT-v2.1.md) |

**Postura:** visualmente sobrio, interactivamente denso. La barra es **navegación de módulo**, no tabs. Activo en `lg+` = subrayado lima inferior; nunca fill navy (`bg-iwana-primary`). Sidebar de app permanece blanco + lima; no reabrir navy.

**Cambio v1.1:** el rail vertical se retira. En `lg+` la misma primitive se reorienta a barra horizontal agrupada encima del listado. El Dialog móvil y la IA de 10 destinos no cambian.

---

## 1. Enmienda H9 — Tributación plana

H9 (2026-07-22) agrupó Catálogo / Ofertas / Reglas y dejó Tributación con subsecciones internas (Catálogo · Reglas de aplicación · Simulador).

**Enmienda 2026-08-19:** esos tres destinos fiscales suben a primer nivel del grupo **Reglas**. Un solo nav. Sin segundo tablist. El label «Catálogo» no se reutiliza para impuestos.

Taxonomía de grupos (H9) **se conserva**. Lo que cambia es la profundidad de Tributación.

### IA canónica (10 destinos)

```text
Catálogo
  Planes                 ← aterrizaje (?tab omitido)
  Productos
  Servicios

Ofertas
  Combos
  Promociones

Reglas
  Reemplazos             ← antes «Compatibilidad»
  Impuestos              ← antes subtab «Catálogo»
  Aplicación de impuestos
  Simulador
```

**URL (sin breaking change):** `?tab=plans|products|services|bundles|promotions|compatibility|taxation` y `taxation/tax-catalog|tax-rules-app|tax-simulator`. Aliases `summary`, `offers`, `offers/promotions` siguen resolviendo.

Clic en Impuestos / Aplicación / Simulador → `tab=taxation` + subtab correspondiente.

---

## 2. Contrato `PortalModuleSubnav`

Primitive de portal (`apps/portal/src/components/shared/portal-ui.tsx`). No subir a `@iwana/ui`. Inventario **no** se migra: sigue en tabs navy (`portalModuleTabTriggerClassName`).

### Semántica

- Landmark `<nav>` + botones. **No** `role="tablist"`.
- Ítem activo: `aria-current="page"`. Un solo current por nav.
- Grupos: `portal-eyebrow` + `ul` con `aria-labelledby`.

### Activo (firma #1) — `lg+` horizontal

En menú horizontal el ancla lima no es fill navy (contrato de **tabs** de Inventario) ni barra a la izquierda (rail retirado). Receta:

- Contenedor: `relative bg-iwana-surface-soft dark:bg-dark-surface-3`
- Subrayado: `absolute bottom-0 left-3 right-3 h-0.5 rounded-full bg-iwana-secondary`
- Texto: `text-iwana-primary font-medium`
- **Prohibido:** `bg-iwana-primary`, `data-[state=active]:bg-iwana-primary`, `bg-iwana-primary-50` como fill; barra `left-0 w-1` en el chrome desktop

### Activo — Dialog `<lg` (columna táctil)

El listado **dentro del Dialog** sigue en columna. Receta vertical:

- Barra: `absolute left-0 top-1/2 h-6 w-1 -translate-y-1/2 rounded-r-full bg-iwana-secondary`
- Mismo tinte `iwana-surface-soft` y texto `text-iwana-primary`

### Inactivo

`text-gray-600 hover:bg-iwana-surface-soft dark:text-gray-400 dark:hover:bg-dark-surface-3`

### Estados requeridos

| Estado | Receta |
| --- | --- |
| hover | tinte `iwana-surface-soft`, sin subrayado / sin barra |
| focus-visible | `interactiveFocusClassName` |
| active (`lg+`) | subrayado lima inferior + surface-soft |
| active (dialog) | barra lima izquierda + surface-soft |
| disabled | no aplica en Comercial (todas las secciones son consultables) |
| current | `aria-current="page"` |

**Medidas:** `min-h-11` (44 px) en cada ítem y en el trigger móvil. Ítems horizontales: `flex-row`, `whitespace-nowrap`. Superficie: `bg-white` / `dark:bg-dark-surface-2`, `rounded-2xl`, `shadow-iwana-soft`. **Nunca** `bg-iwana-primary` de aside.

**Chrome `lg+`:** una sola fila compacta. Eyebrow (~16 px) + ítem `min-h-11` ≈ 60 px. Grupos en fila con divisor `w-px self-stretch bg-gray-200`. No se apilan tres bloques como el shell viejo de tabs. No hay columna de 14 rem a la izquierda del listado.

**Sticky:** `lg:sticky lg:top-(--portal-sticky-offset) lg:z-(--z-sticky)`. Token `--portal-sticky-offset` en `globals.css` (altura del TopHeader: 69 px). Prohibido `top-[69px]` mágico.

### Responsive

| Breakpoint | Comportamiento |
| --- | --- |
| `<lg` | Botón de una fila `Sección: {label} ▾` (`min-h-11`) abre `Dialog` de `@iwana/ui` con la misma lista agrupada **en columna**. Al elegir, cierra. No se apilan grupos en el primer viewport. |
| `lg+` | Barra horizontal sticky **encima** del contenido; grupos en una fila; scroll interno `overflow-x-auto` (nowrap) si el viewport es estrecho entre `lg` y ~1280. |

Overflow: la barra hace scroll interno. Nunca `flex-wrap` de pills. Layout del módulo: apilado (`PortalModuleSubnav` + panel), sin `lg:grid` de dos columnas.

### API

```ts
groups: { id: string; label: string; items: { id: string; label: string }[] }[]
value: string
onValueChange: (id: string) => void
ariaLabel: string
```

Ids internos nunca visibles. Labels en español, sentence case. Cada destino de Comercial lleva un icono Lucide opcional en el ítem (`icon`): `aria-hidden`, 16 px; activo `text-iwana-secondary-700`, inactivo `text-gray-400`. El nombre accesible sigue siendo el label.

---

## 3. Copy de producto

| Hoy | Canónico |
| --- | --- |
| Productos adicionales | Productos |
| Compatibilidad | Reemplazos |
| Tributación → Catálogo | Impuestos |
| Reglas de aplicación | Aplicación de impuestos |
| Simulador tributario | Simulador |
| Huecos en reglas | Reglas incompletas |
| Código municipio (opcional) | Municipio + ayuda «código DANE de 5 dígitos» |

Tab / ítem del nav y `PortalPanel.title` del mismo destino usan el **mismo** nombre. Eyebrow de paneles fiscales: **Reglas** (el grupo), no «Tributación».

---

## 4. Criterios de aceptación

1. En `lg+` la sección activa se identifica en &lt; 5 s (subrayado lima inferior + label), sin fill navy ni barra izquierda en el chrome desktop.
2. Los 10 destinos son visibles sin un segundo tablist. «Catálogo» no aparece dos veces con significados distintos.
3. En `&lt;lg` la tabla o el empty del destino entra en el primer viewport tras header + a lo sumo una alerta; el cambio de sección es un control de una fila.
4. Atrás restaura tab, subdestino fiscal, `offerStatus` y `focus`.
5. Teclado: Tab llega a cada destino; Enter/Espacio activa; foco visible; targets ≥ 44 px.
6. Deep link `?tab=taxation/tax-simulator` marca **Simulador** con lima inferior en `lg+`.
7. Lima no se usa en alertas ni como fondo de la barra.
8. En 1280 la barra cabe en una fila y la tabla queda a altura completa debajo; en 375 el selector no apila grupos.

---

## 5. Fuera de alcance

- Selector de municipio por nombre (contrato API).
- Migrar Inventario a este primitive.
- Promover a `@iwana/ui`.
- Sandwich de elevación panel + tabla (class-tokens globales).
