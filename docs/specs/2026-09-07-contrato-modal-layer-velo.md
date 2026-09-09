# Contrato — `ModalLayer` y velo unificado

**Fecha:** 2026-09-07
**Emisor:** AI-DS-OWNER (carril rápido, salvo lo elevado en §6)
**Persistido por:** coordinador, a petición del emisor — las reglas de salida del rol le impiden
escribir archivos, y el contrato **no está congelado hasta existir como artefacto localizable**.
**Estado:** congelado y **EJECUTADO** el 2026-09-07 (olas 0-4). Verificación al pie.
**Base normativa:** ADR-075 + enmienda C-DS-04 (aprobada por el CTO el 2026-09-07), §2bis
(regla de decisión de velos) y §2ter (regla del contexto de apilamiento).

---

## 1. Diagnóstico de partida, corregido

No son cuatro opacidades de velo: son **cinco en claro**, y el problema mayor está en oscuro.

| Sitio | Claro | Oscuro | Blur |
| --- | --- | --- | --- |
| `PortalModalDrawerLayer` | /45 | /60 | sí |
| `DispatchDrawerPortal:38` | /45 | **ninguno** | sí |
| `OperationalSidePeek:141` | /40 | /60 | sí |
| `PortalSidePeek` (`portal-ui.tsx:1767`) | /40 | /60 | **no** |
| `Dialog` (`packages/ui:321`) | /55 | **ninguno** | sí (sobre la capa) |
| `CreateContractDialog:265`, `ConvertExpediente…:106` | /40 | **ninguno** | sí |
| `ContractDetailDrawer:392` | /30 | **ninguno** | sí |
| `dashboard/layout.tsx:224`, `web/(protected)/layout.tsx:42` | /50 | **ninguno** | no |

Cinco valores claros y **oscuro definido en solo 3 de 10 sitios**: siete velos pintan el valor
claro en modo oscuro. La deriva real es el modo oscuro, no la opacidad.

### Hallazgo no reportado antes — `Dialog` viola §2ter

`packages/ui/src/components/Dialog.tsx:321` pinta el velo como fondo de la propia capa, con
`backdrop-blur-sm` **sobre el elemento `fixed inset-0`**. Ese `backdrop-filter` convierte la capa
en contexto de apilamiento y en **bloque contenedor de descendientes `fixed`**. El comentario
interno se cuida de no dar `z` al panel «para no atrapar a los descendientes en `--z-popover`»
— pero el ancestro ya los atrapa. **46 consumidores.** Lo cierra la misma consolidación.

## 2. API

```tsx
// packages/ui/src/components/ModalLayer.tsx
export type ModalLayerAlign = 'end' | 'center';

interface ModalLayerProps {
  /** Alineación del panel. Sin defecto: se declara siempre. */
  align: ModalLayerAlign;
  /** Cierre por clic en el velo. Ausente ⇒ velo inerte, sin handler. */
  onVeilClick?: () => void;
  /** SOLO alcance responsive y padding de la capa (`xl:hidden`, `px-4 py-6`).
   *  Prohibido: `z-`, `fixed`, `inset-`, `justify-`, `items-`, `bg-`. */
  className?: string;
  children: ReactNode;
}
```

**Fijo, no configurable:** portal a `document.body`, guarda SSR, `fixed inset-0`,
`z-(--z-modal)`, `flex`, y el velo entero — elemento, fill, blur y posición.
**Variante:** solo `align`. No se añade `start`: no hay consumidor en el árbol.

### El velo deja de ser un `<button>`, siempre

```tsx
<div
  data-portal-veil=""
  aria-hidden="true"
  className="absolute inset-0 bg-(--color-veil) backdrop-blur-sm"
  {...(onVeilClick ? { onMouseDown: onVeilClick } : {})}
/>
```

No es una concesión al caso con guarda: es la lectura correcta de `aria-modal="true"`. El panel
declara el modal; el velo es hermano del panel, fuera del subárbol del modal, y toda AT que
honre `aria-modal` lo omite. Un `<button>` etiquetado no compra accesibilidad — compra un nombre
que la AT tiene instrucción de saltar, y cuando **no** lo salta (soporte imperfecto) anuncia un
*affordance* que en el caso con guarda miente. El *affordance* real de cierre para teclado y AT
es Escape más el botón «Cerrar» de la cabecera.

Consecuencias: la rama `<button>` / `<button disabled>` / `<div>` desaparece; `overlayLabel` se
elimina del contrato.

- **`onMouseDown`, no `onClick`** — alinea con `Dialog` y `PortalSidePeek`, los dos primitivos
  más maduros. Rompe specs que hagan `fireEvent.click` sobre el velo.
- **`cursor-default` se elimina**: era necesario porque el velo era un `<button>`.
- **`portalModalDrawerVeilClassName` se elimina, no se convierte en prop.** La constante
  exportada *es* el mecanismo que produjo cinco valores: permite componer un velo propio
  conservando la apariencia de cumplimiento.

### Estados

| Estado | Condición | Velo | Panel |
| --- | --- | --- | --- |
| activo | `onVeilClick` presente | `<div>` con `onMouseDown` | interactivo |
| inerte | `onVeilClick` ausente | `<div>` sin handler | interactivo |
| anidado | no es la capa superior | sin handler efectivo (guarda del consumidor) | interactivo |

No hay hover, focus, active, disabled, loading, skeleton, empty ni error: la capa no es un
control ni una superficie de contenido. Esos estados los debe el panel.

## 3. Opacidad — calculada, no elegida

Criterio: **WCAG 1.4.11 (3:1)** para el borde del panel contra el fondo velado. Panel blanco
`#FFFFFF` sobre fondo claro:

| Velo | Fondo compuesto | Contraste | |
| --- | --- | --- | --- |
| /30 | #B3B3B3 | 2.10:1 | falla |
| /40 | #999999 | 2.85:1 | falla |
| **/45** | **#8C8C8C** | **3.35:1** | **pasa** |
| /50 | #808080 | 3.98:1 | pasa |
| /55 | #737373 | 4.76:1 | pasa |

**45% es el mínimo incumbente que satisface 3:1.** No se introduce ningún valor nuevo: gana el
incumbente más pequeño que pasa, y los otros cuatro se retiran. El `/30` de
`ContractDetailDrawer` —el drawer que originó la investigación— es el peor. El `/40`, el más
repetido, falla por poco: por eso nadie lo notó.

### Token: uno, no dos

```css
/* packages/ui/src/styles/globals.css — dentro de @theme */
--color-veil: rgb(0 0 0 / 45%);

/* fuera de @theme, junto a `.dark body` */
.dark { --color-veil: rgb(0 0 0 / 60%); }
```

- **`--portal-veil-blur` no se crea.** Un solo valor, un solo consumidor, y `sm` ya es un
  escalón nombrado del framework. Un token exige justificación; este no la tiene.
- Nombre sin prefijo `portal-`: sirve también a `apps/web`, y la convención vecina (`--z-*`,
  `--color-dark-surface-*`) no está prefijada por app.
- **Mecanismo nuevo:** hoy `globals.css` no redefine ninguna custom property bajo `.dark`
  (`.dark body` solo asigna valores). Éste sería el primero — y es lo que da el beneficio:
  colapsa claro y oscuro en **una sola clase sin variante `dark:`**, así que olvidarse del modo
  oscuro deja de ser posible. La herencia funciona con el portal: `.dark` va en `<html>` y el
  velo cuelga de `<body>`. **Exige verificación en navegador en ambos temas.**

### El velo del chrome móvil

`dashboard/layout.tsx:224` y `web/(protected)/layout.tsx:42` adoptan el mismo token y **no
llevan blur**. Pasan de /50 a /45 —imperceptible, ambos pasan 3:1— y ganan el valor oscuro que
hoy no tienen. Siguen siendo un constructo de dos escalones: es la excepción de §2bis, porque su
panel es el `Sidebar`, chrome que no puede portalarse. **No consumen `ModalLayer`.** El blur
queda fuera por clase, no por token: es decisión del consumidor, y es el único de la familia
cuyo velo no debe desenfocar.

Fuera de alcance: `BrandingForm.tsx:777` y `PlatformBrandingSettings.tsx:275` — son *scrims* de
hover sobre miniatura, no velos de viewport.

## 4. Ubicación y convergencia

**`packages/ui/src/components/ModalLayer.tsx`, exportado desde `@iwana/ui`.** No en
`apps/portal/src/components/shared/`: `Dialog` (46 consumidores) y `OperationalSidePeek` viven en
`packages/ui` y **no pueden importar de `apps/portal`**. Dejar la capa en el portal condenaría a
los dos primitivos de mayor alcance a repetir el velo a mano — la duplicación que se pide
eliminar, reinstalada por decisión de ubicación.

Convergen los tres, pero **no** en un solo componente:

- **`Dialog` no se reemplaza.** Consume `ModalLayer align="center"` por dentro; su API pública no
  cambia. Arregla de paso la violación §2ter: el `backdrop-filter` se va de la capa al velo hijo,
  y el velo `absolute inset-0` sigue cubriendo el padding `px-4 py-6`, así que el cierre por clic
  en el margen se conserva.
- **`OperationalSidePeek` tampoco.** Consume `ModalLayer align="end"`.
- **`PortalSidePeek`** queda como tercer primitivo, con su guarda de anidamiento por `mousedown`.
  Consume `ModalLayer align="end"`.

`ModalLayer` es **plomería compartida** de los tres —portal, escalón, velo, alineación—, no un
cuarto primitivo que compita. `PortalModalLayer` y `PortalModalDrawerLayer` se eliminan.

**Diferido con razón:** los tres registros de capa superior (`isTopMostDialogLayer`,
`isTopMostSidePeekLayer`, `isTopMostPortalSideDrawerLayer`) son la misma pila triplicada y
`ModalLayer` es su casa natural. Unificarlos cambia el comportamiento de los drawers anidados
—contrato de interacción, no de presentación— y va en su propio ciclo.

## 5. Orden de migración

**Ola 0 — token y componente.** Riesgo bajo.
1. `--color-veil` en `globals.css` (+ bloque `.dark`). **Verificación en navegador, ambos temas.**
2. `packages/ui/src/components/ModalLayer.tsx`. Sin consumidores todavía.

**Ola 1 — consumidores ya sobre la capa compartida.** Riesgo medio-bajo; el riesgo son los specs.
3. `InventorySideDrawerShell.tsx`
4. `StockItemDetailDrawer.tsx` — **spec rompe**: `StockItemDetailDrawer.spec.tsx:175`
5. `InventoryCreateProductDialog.tsx` — **spec rompe**: `:505`
6. `SupplierFormDrawer.tsx`
7. `AssuranceTicketDrawer.tsx`
8. `DispatchDrawerPortal.tsx` — **spec rompe** en `:14` y `:30` (`fireEvent.click` →
   `mouseDown`). Justifica el passthrough de `className` (`xl:hidden` por `drawerScope`).

**Ola 2 — primitivos de `packages/ui`.** Mayor radio.
9. `OperationalSidePeek.tsx` — **dos specs rompen**: `ExecutionOrderExperience.spec.tsx:184`,
   `OperationsClient.spec.tsx:829`.
10. `Dialog.tsx` — **mayor radio (46 consumidores)**, cambio interno; ningún spec consulta su velo
    por rol. Cierra §2ter. Velo /55 → /45: cambio visible, intencional.
11. `portal-ui.tsx` (`PortalSidePeek`) — **gana blur, que hoy no tiene**: cambio visible en
    producción, exige captura en navegador. `portal-ui.spec.tsx:313` afirma sobre la capa.

**Ola 3 — CRM, el disparador.** Cambios visuales mayores.
12. `ContractDetailDrawer.tsx:389` → `align="end"`, `onVeilClick={isEditing ? undefined : onClose}`.
    Velo /30 → /45: el salto mayor, y el que corrige el fallo de 1.4.11.
13. `CreateContractDialog.tsx:262` → `align="center"`, `onVeilClick={saving ? undefined : onClose}`.
14. `ConvertExpedienteToContractDialog.tsx:103` → `align="center"`, `onVeilClick={onClose}`.

**Ola 4 — velos del shell.** Debe aterrizar **después** del renombrado
`--z-overlay` → `--z-shell-raised`.
15. `dashboard/layout.tsx:224` — `bg-black/50` → `bg-(--color-veil)`, sin blur. Spec acoplada:
    `layout.spec.tsx:115`.
16. `web/(protected)/layout.tsx:42` — idéntico.

## 6. Elevado al orquestador — no lo decide DS-OWNER

1. **Borde del panel modal en oscuro.** El panel es `dark-surface-2` (#222222) y el fondo
   `dark-surface` (#181818); un velo negro al 60% deja el fondo en ≈#0A0A0A y da **1.24:1**.
   Ninguna opacidad de negro puede separar dos superficies ya casi negras: **el velo no es la
   herramienta**. La separación tiene que venir del borde del panel, y el actual
   (`dark:border-dark-border`, #2E2E2E) da ≈1.2:1. La nota de ADR-056 en `globals.css:127` ya dice
   que un borde que identifica un control debe ser `iwana-neutral-600`. Cambiar la regla de borde
   de los paneles modales en oscuro toca ADR-056 y el lenguaje visual global. **La consolidación
   del velo puede avanzar sin esperarla**: el gap de oscuro es preexistente y no empeora.
2. **Los tres diálogos de CRM no tienen Escape ni foco atrapado.** Verificado: cero coincidencias
   de `Escape` y no usan `usePortalSideDrawerA11y`. La consolidación del velo no lo arregla, y la
   decisión de §2 —que el *affordance* de cierre para AT es Escape más el botón de cabecera— lo
   convierte en **prerrequisito de la Ola 3**. Los dos centrados deberían adoptar `Dialog`
   directamente en vez de `ModalLayer align="center"`; eso es alcance, no contrato de componente.


---

## 7. Ejecución — cerrada el 2026-09-07

Las cuatro olas aplicadas. `PortalModalLayer` y `PortalModalDrawerLayer` **eliminados**;
`portalModalDrawerVeilClassName` retirado (cero ocurrencias en fuente). `Dialog`,
`OperationalSidePeek` y `PortalSidePeek` consumen `ModalLayer`.

**Mecanismo del token, verificado en navegador** (Chrome 148, `localhost:3002`) — era el
punto que el contrato marcaba como estreno y exigía comprobar en ambos temas. Se montó un
velo con la clase real (`bg-(--color-veil) backdrop-blur-sm`) **como hijo directo de
`<body>`**, que es donde lo deja el portal:

| Tema | `--color-veil` en `:root` | Fondo computado del velo portalado | Blur |
| --- | --- | --- | --- |
| Claro | `#00000073` | `rgba(0, 0, 0, 0.45)` | `blur(8px)` |
| Oscuro (`.dark`) | `#0009` | `rgba(0, 0, 0, 0.6)` | `blur(8px)` |

La herencia atraviesa el portal: `.dark` vive en `<html>` y el velo cuelga de `<body>`, así
que una sola clase sin variante `dark:` resuelve ambos temas. **Olvidarse del modo oscuro
deja de ser posible**, que era el objetivo del token.

**Suites tras la consolidación:** `apps/portal` 238 suites / 2102 pasados + 1 skipped;
`packages/ui` 4 suites / 30 pasados; `apps/web` 36 / 229. `tsc --noEmit` exit 0 en los tres;
ESLint 0 errores; T1 4/4 con canario; `pnpm audit:adr-citations` 0 bloqueantes.

**Pendiente de este contrato:** los dos puntos de §6 siguen elevados al orquestador — el
borde del panel en oscuro (ADR-056) y la adopción de `Dialog` por los dos diálogos centrados
de CRM.
