# Plan de orquestación — cierre del contrato de capas (ADR-075)

**Fecha:** 2026-09-07
**Origen:** hallazgo elevado en `docs/informes/INFORME-MOD12-INVENTARIO-CHROME-DRAWER-DESENFOQUE-v3.0.md` §3.4
**Veredicto de contrato:** AI-DS-OWNER, 2026-09-07 (barrido exhaustivo del árbol, 6.309 líneas)
**Enmienda asociada:** [`ADR-075-ENMIENDA-C-DS-04-PROPUESTA.md`](../adrs/ADR-075-ENMIENDA-C-DS-04-PROPUESTA.md) — **no aprobada**

---

## 1. El problema en una frase

`--z-drawer` (300) aloja dos semánticas incompatibles —chrome persistente del shell y
cajón transitorio— y `--z-overlay` (200) otras dos —velo y panel de chrome—, de modo que
el contrato escrito no describe lo que el código necesita y el siguiente componente con
velo volverá a alojarlo mal.

## 2. Estado del árbol al abrir el plan

| Escalón | Consumidores | Semánticas |
| --- | --- | --- |
| `--z-base` (0) | **ninguno** | token muerto |
| `--z-sticky` (100) | `TopHeader.tsx:90`, `portal-ui.tsx:2201` | 1 |
| `--z-overlay` (200) | `dashboard/layout.tsx:224`, `(protected)/layout.tsx:42`, `TopHeader.tsx:90` y `:143` | **2** |
| `--z-drawer` (300) | `Sidebar.tsx:430` (portal), `Sidebar.tsx:126` (web), `portal-ui.tsx:1742`, `DispatchDrawerPortal.tsx:31` | **2** |
| `--z-modal` (400) | `PortalModalDrawerLayer.tsx:57`, `OperationalSidePeek.tsx:130` | 1 |
| `--z-popover` (500) | `MultiSelect.tsx:177`, `Calendar.tsx:132`, `GlobalSearchOverlay.tsx:48` | 1 |
| `--z-toast` (600) | **ninguno** | reservado |

### Estado tras M1-M3 (verificado 2026-09-07)

`--z-drawer` queda con **una sola semántica**: chrome persistente del shell —
`apps/portal/src/components/layout/Sidebar.tsx:430` y `apps/web/src/components/layout/Sidebar.tsx:126`.
Las cuatro capas de cajón portalado viven ahora juntas en `--z-modal`:
`DispatchDrawerPortal.tsx:31`, `portal-ui.tsx:1758` (`PortalSidePeek`),
`PortalModalDrawerLayer.tsx:57` y `OperationalSidePeek.tsx:138`.

La franja del shell (`--z-overlay`) sigue con dos semánticas: eso lo resuelve la
enmienda E1, no una migración.

## 3. Ejecución

| # | Acción | Ruta de gobernanza | Estado |
| --- | --- | --- | --- |
| **M6** | Docblock obsoleto de `InventorySideDrawerShell.tsx:18-21`, que propagaba el modelo erróneo dentro del propio arreglo | Corrección directa | **Hecho (2026-09-07)** |
| **M2** | `DispatchDrawerPortal.tsx:31` → `--z-modal` | Carril rápido DS-OWNER · ejecuta FE-PLATFORM | **Hecho (2026-09-07)** |
| **M3** | `OperationalSidePeek.tsx:130`: falta `createPortal` al `body`; unificar `backdrop-blur-[2px]` → `backdrop-blur-sm` | Carril rápido DS-OWNER · ejecuta FE-PLATFORM | **Hecho (2026-09-07)** |
| **M1** | `PortalSidePeek` (`portal-ui.tsx:1742`) → `--z-modal` + `createPortal`; eliminar el `relative z-10` literal de `:1761` y el gemelo de `OperationalSidePeek.tsx:154` | Carril rápido · **alcance ampliado por el orquestador (2026-09-07)** | **Hecho (2026-09-07)** |
| **M4** | Cierre de la migración del paso 4 de ADR-075: 7 emisores literales vivos (`Dialog.tsx:321,350`, `Popover.tsx:21`, `Select.tsx:292,653`, `DropdownMenu.tsx:228`, `DailyTimelineHoverHint.tsx:119`) + `SearchablePicker.tsx:176` | Carril rápido · **riesgo de regresión** | **Hecho (2026-09-07)**: 8/8 migrados; añadido el rezagado `GlobalSearchOverlay.tsx:65` de web (`z-50` → `z-(--z-popover)`, espejo del gemelo portal) |
| **M5** | CRM Suscriptores al patrón de capa única: `ContractDetailDrawer.tsx:375,385`, `ConvertExpedienteToContractDialog.tsx:90,100`, `CreateContractDialog.tsx:248,258` | Carril rápido · módulo cerrado | **Hecho (2026-09-07)** |
| **M7** | `apps/web`: `TopHeader.tsx:119` (`z-20`) y `:196` (`z-50`); `portal-ui.tsx:2423` (`sticky bottom-0 z-20`) | Carril rápido | **Reabierto y rehecho (2026-09-07)** — ver §3ter |
| **M8** | Cazadores de clic de dos capas (`ContractCard.tsx:216-217`, `CatalogPicker.tsx:96-97` y `:291-292`): rompen en cuanto el menú viva dentro de un drawer | Carril rápido | **Hecho (2026-09-07)**: literales eliminados en ambas capas; apilamiento por orden de documento |
| **E1** | Enmienda C-DS-04: descripciones por relación de apilamiento, renombrado de dos tokens, retiro de `--z-base`, §2bis y §2ter | **AI-EM-ARCH → CTO** · ejecuta FE-PLATFORM | **Aprobada por el CTO e incorporada (2026-09-07)** — ADR-075 v1.1 §1 (Adenda A), §2 ampliado, §2bis, §2ter; `--z-overlay`→`--z-shell-raised` y `--z-drawer`→`--z-shell-panel` migrados en los 6 consumidores + specs, **sin cambio de valores**; `--z-base` retirado de `globals.css` |
| **M9** ✅ | `PortalSidePeek` no difunde `setPortalModalDrawerState`: en sus 12 pantallas el chrome queda bajo el velo pero **no inerte**. No es regresión de M1 (nunca difundió) y el foco sigue confinado por su propia trampa de `Tab`, pero es la mitad del contrato que le falta | Requiere decisión de alcance | **Hecho (2026-09-07)** — visto bueno del orquestador en la sesión de cierre; una línea (`usePortalModalDrawerBroadcast(open)` en `portal-ui.tsx:1722`) + caso punta a punta en `layout.spec.tsx` |
| **M10** ✅ | `VisitRequestRecommendationPanel.tsx:587`: `relative z-10` literal en la rama `presentation === 'drawer'`. Violación de ADR-075 §2 no contemplada en M1-M8 | Sumar a M4 o ítem propio | **Hecho (2026-09-07)**, dentro de la pasada M4 (queda `relative`; pinta sobre el velo por orden de documento) |
| **T1** | Test estructural anti-z-literal (ADR-075 §4, nunca implementado) | Carril rápido · **secuenciado tras M4 y M5** | **Hecho (2026-09-07)**: `z-layer-contract.structure.spec.ts` (D1/D2/D3 + canario); nació **verde, sin lista de excepciones** (canario real: 29 ≥ 12) |

### M1: por qué estaba bloqueado y qué se decidió

`PortalSidePeek` reproduce hoy, sin corregir, el defecto que los 5 drawers de Inventario
acaban de resolver: emite `fixed inset-0 z-(--z-drawer)` dentro del árbol de la página,
con velo interno y en el **mismo escalón que el Sidebar**. Que su velo cubra hoy el chrome
depende del orden de inserción en el DOM — exactamente el «contrato negociado en el
código» que ADR-075 vino a eliminar.

Tiene **12 consumidores** en Comercial, Usuarios y Control de acceso: módulos ya cerrados
en auditoría, fuera del alcance de `fix/mod12-s2-cierre-auditoria`. La decisión de
ampliar alcance correspondía al orquestador humano: **ampliación autorizada el 2026-09-07**,
por ser lo único que cierra el hallazgo de raíz.

Riesgo declarado al ejecutar: los specs que consulten por `container.querySelector` dejan
de encontrar el cajón al portalarse y **se vuelven verdes sin verificar nada**. Ocurrió ya
en M3 (`ScheduleEventDrawer.spec.tsx:269`). Cada uno de los 12 consumidores y sus specs se
revisan y reapuntan a `document.body` / `screen`.

### Por qué T1 va después de M4 y M5

Un test que nace con 19 excepciones documenta el incumplimiento en vez de impedirlo, y
esas excepciones sobreviven al motivo que las creó (ADR-056 §Lección de gobernanza;
ADR-075 §Riesgos: «una remediación parcial es tan defectuosa como el defecto original y
más peligrosa, porque aparenta estar cerrada»).

Si la secuenciación obligara a lo contrario, la única forma admisible es una lista
`PENDIENTE_M4` claveada **por fragmento de clase, nunca por número de línea**, más una
segunda aserción que **exija que la lista se consuma por completo**: si una entrada ya no
corresponde a ninguna infracción, el test falla. Así la lista solo puede encoger.

## 4. Especificación de T1 — test estructural

**Archivo:** `apps/portal/src/components/shared/z-layer-contract.structure.spec.ts`, con el
molde de `aria-busy-contrast.structure.spec.ts` (entra en la suite existente sin
configuración nueva).

**Rutas:** `apps/portal/src`, `apps/web/src`, `packages/ui/src`, extensiones `.ts`/`.tsx`.
**Excluir:** `node_modules`, `.next`, **`coverage`**, `dist`, `*.spec.ts`, `*.spec.tsx`.

> La exclusión de `coverage` no es cosmética: `apps/portal/coverage/lcov-report/**` contiene
> HTML con JSX escapado que dispara los tres detectores con código obsoleto. Sin ella el
> test nace en rojo con decenas de infracciones inexistentes y el implementador lo desactiva.

**Tres detectores** — los tres, o se escapa la mitad del problema (enmienda C-DS-03 del ADR):

| # | Detecta | Por qué hace falta |
| --- | --- | --- |
| D1 | Etiqueta cuyas clases contienen `fixed` **y** una utilidad `z-<n>` o `z-[<n>]` | Capa de viewport con literal: siempre violación |
| D2 | Cualquier `z-<n>`/`z-[<n>]` con `n >= 100`, con o sin `fixed` | `Popover.tsx:21` (`z-10002`, posicionado por Floating UI, sin `fixed`) y `Dialog.tsx:350` (`relative z-10001`) |
| D3 | `zIndex:` cuyo valor no sea `var(--z-…)` | Marca `zIndex: 11000`, `'11000'` y variables; acepta `zIndex: 'var(--z-popover)'` |

**No debe marcar:** la forma tokenizada `z-(--z-modal)` y sus variantes (`lg:`, `max-lg:`,
`dark:`, `md:`); `z-auto`; utilidades que solo empiecen por `z` (`zoom-`); y el
**apilamiento local** (`relative`/`absolute`/`sticky` con `z-<n>`, `n < 100`, sin `fixed`)
— unos 35 sitios legítimos, que van documentados en el docblock como fuera de alcance, no
como lista de excepciones. Es la ampliación de §2 que pide la enmienda (punto 5): **si E1
no se aprueba, este test no puede escribirse sin una lista de 35 entradas, y eso lo
convierte en ruido.**

**Canario de cobertura:** contar apariciones de `z-(--z-` en fuente y afirmar un mínimo
(hoy ≥ 12). Si alguien rompe el regex o el recorrido de directorios, el test se volvería
verde por vacío; el canario lo mata.

## 3ter. M7 reabierto — el escalón no estaba donde se creía

La quinta pasada cerró M7 poniendo `apps/web/src/components/layout/TopHeader.tsx:196` en
`z-(--z-modal)`, argumentando que la hoja de búsqueda tiene `role="dialog"`, `aria-modal` y
trampa de `Tab`. AI-DS-OWNER revocó esa justificación el 2026-09-07: es correcta sobre la
trampa de foco y **errónea sobre el escalón**.

**El hecho que decide el caso:** la hoja es el último hijo de un `<header>` con
`position: sticky`, que **crea contexto de apilamiento siempre**, con o sin `z-index`. Por
tanto el `z-(--z-modal)` de `:196` no es un escalón: es ordenación interna entre hermanos.
Frente al `Sidebar` (300) y al velo del menú (200), la hoja pintaba —y pinta— en **100**, el
escalón del header. El token sustituyó a un literal y dejó intacto lo único que importaba.

El gemelo del portal no comete ese error porque eleva **el raíz del contexto**
(`TopHeader.tsx:90`), no la capa interior.

Ejecutado en esta corrección:

| Punto | Estado |
| --- | --- |
| `:196` pierde el `z-(--z-modal)`; sin token sustituto | Hecho |
| `:119` se queda en `z-(--z-sticky)` con la justificación de vecindad y el disparo falsable para subir a 200 | Hecho |
| Comentario espejo en el gemelo del portal (`TopHeader.tsx`), para que nadie unifique los números | Hecho |
| Estado de limpieza por cambio de breakpoint: la hoja es `lg:hidden`, y al cruzar a desktop el estado seguía abierto con la trampa de `Tab` viva sobre un overlay no renderizado | Hecho |
| **Verificación en navegador del `backdrop-blur` del header** (ver abajo) | **Pendiente** |
| Cobertura: no existe **ni un spec** que toque `mobile-global-search`; `apps/web/.../TopHeader.spec.tsx` no existe. El veredicto es invisible para la suite | **Pendiente (sr-qa)** |

### Hallazgo CONFIRMADO en navegador — `backdrop-blur` del header de web

`TopHeader.tsx:119` lleva `backdrop-blur` **incondicional**. Por Filter Effects L2, un
`backdrop-filter` distinto de `none` convierte al elemento en **bloque contenedor de
descendientes `fixed`**: si el navegador lo aplica como especifica (Blink lo hace), el
`fixed inset-0` de la hoja resuelve contra la caja del header —unos 60 px— y no contra el
viewport. La hoja de búsqueda móvil de `apps/web` sería una franja, no una pantalla.

El gemelo del portal **no** tiene `backdrop-blur`, y por eso su hoja sí cubre el viewport.
La asimetría no está documentada ni cubierta por ningún test.

**Confirmado el 2026-09-07 con medición directa en Chrome 148**, sesión autenticada:

*Mecanismo, aislado:* un `fixed inset-0` bajo un ancestro `sticky` con
`backdrop-filter: blur(8px)` mide **60 px** de alto; el mismo caso sin `backdrop-filter` mide
**455 px** (el viewport). El ancestro es bloque contenedor.

*Caso real* (`localhost:3001`, viewport 375×812): el `<header>` computa
`backdrop-filter: blur(8px)`, y la hoja `#mobile-global-search` mide **375 × 68 px** con
`offsetParent: HEADER`. No es una pantalla: es una franja del alto del header.

*Consecuencia funcional:* con la hoja abierta, `document.elementFromPoint` a 400 px, 600 px y
780 px devuelve **elementos de la página de detrás**, no de la hoja. Un `aria-modal="true"` que
deja el 92% de la pantalla interactuable y sin cubrir.

La corrección es **del constructo** —portalar la hoja fuera del header— y no del token. Se
ejecuta dentro de la consolidación `ShellSearchSheet`; por §2bis, una capa portalada que captura
el foco vive en `--z-modal`, que es el desenlace que AI-DS-OWNER ya anticipó.

### Derivación al orquestador — `ShellSearchSheet`

AI-DS-OWNER ordena consolidar las dos hojas de búsqueda en un único constructo de
`@iwana/ui` (nombre propuesto `ShellSearchSheet`) con la a11y de web —el gemelo del portal
**no tiene** `role`, `aria-modal` ni confinamiento de foco: una hoja opaca a pantalla
completa que deja al teclado y al lector de pantalla recorriendo el shell de debajo— y el
emplazamiento de escalón del portal, **con el escalón como responsabilidad del shell que la
aloja, nunca horneado en el componente**. La divergencia de escalón sobrevive a la
consolidación.

**No es carril rápido**: toca las app-shells de las dos aplicaciones y `@iwana/ui`, con
módulos cerrados de por medio. Requiere la misma autorización de alcance que se dio a M1.

## 3quater. Sexta pasada — auditoría de la quinta (2026-09-07)

Siete desviaciones detectadas y cerradas; detalle en
`docs/informes/INFORME-MOD12-INVENTARIO-CHROME-DRAWER-DESENFOQUE-v3.0.md` §3.7 y §3.8.

| # | Cierre |
| --- | --- |
| 1 | Los tres diálogos de CRM portalan; nace `PortalModalLayer` como plomería compartida |
| 2 | `Dialog.tsx:350` sin el z redundante |
| 3 | Veredicto de escalón de `apps/web` (§3ter): el z de `:196` no era un escalón |
| 4 | Cazadores de clic y menús en `--z-popover` |
| 5 | T1 condicionado a E1 (§4bis) |
| 6 | Fallo de `SchedulingClient`: test no aislado del reloj, corregido con reloj fijo |
| 7 | Stash `wip2` con criterio de baja (§3bis) |
| **M11** | Los tres diálogos de CRM difunden su estado modal al chrome (mismo defecto que M9); cubierto con test |

Suite final: `apps/portal` **237 suites / 2091 pasados + 1 skipped · 0 fallos**;
`packages/ui` 29; `apps/web` 229; typecheck y lint limpios en los tres.

## 3quinquies. Consolidaciones (2026-09-07)

### C1 — `ModalLayer` y velo unificado: **cerrada**

Ejecutadas las cuatro olas del contrato congelado
[`docs/specs/2026-09-07-contrato-modal-layer-velo.md`](../specs/2026-09-07-contrato-modal-layer-velo.md).
`PortalModalLayer` y `PortalModalDrawerLayer` eliminados; `portalModalDrawerVeilClassName`
retirado; `Dialog`, `OperationalSidePeek` y `PortalSidePeek` consumen `ModalLayer`. El token
`--color-veil` verificado en navegador en ambos temas (§7 del contrato).

### C2 — `ShellSearchSheet`: **cerrada en `apps/web`, detenida en el portal**

`packages/ui/src/components/ShellSearchSheet.tsx`: hoja de búsqueda del shell portalada a
`document.body`, en `--z-modal`, con `role="dialog"` + `aria-modal`, trampa de `Tab`, Escape,
foco inicial al campo, retorno del foco al disparador y cierre al cruzar a desktop. No lleva
velo —es superficie opaca, no panel sobre contenido— y por eso **no consume `ModalLayer`**.

`apps/web/src/components/layout/TopHeader.tsx` migrado: cierra el defecto medido en navegador
(hoja confinada a 68 px por el `backdrop-blur` del header).

**El portal NO se migró, y no por olvido.** Su
`apps/portal/src/components/layout/TopHeader.spec.tsx:84` afirma
`expect(screen.getAllByTestId('global-search')).toHaveLength(1)` **antes y después de abrir**,
y el caso se llama «abre la **misma instancia** de GlobalSearch». La instancia única es un
criterio de aceptación deliberado del portal: su hoja móvil es el mismo contenedor del buscador
de escritorio, expandido con `max-lg:fixed`, y la apertura la gobierna el propio `GlobalSearch`
vía `onOpenChange` + `openRequestId`.

Converger la anatomía exige **dos instancias** (la de escritorio oculta bajo `lg`, la móvil
dentro de la hoja), que es como funciona `apps/web`. Eso rompería ese criterio a conciencia.

**Decisión que corresponde al orquestador, no a FE-PLATFORM ni a DS-OWNER:** o el portal
renuncia a la instancia única —y entonces converge—, o `GlobalSearch` se refactoriza para
sobrevivir al cambio de contenedor sin remontar, o los dos gemelos divergen también en anatomía
y el portal cierra su déficit de a11y (`role`, `aria-modal`, trampa de foco) por su cuenta.
AI-DS-OWNER ordenó converger sin conocer este criterio.

## 3bis. Nota operativa — el stash `wip2`

`stash@{0}` («wip2») contiene las 37 modificaciones del árbol tal como estaban a las
14:18 del 2026-09-07, cuando una operación de stash retiró el trabajo no commiteado a
mitad de la ejecución de T1. El árbol se restauró con `git stash apply`, que conserva la
entrada.

Verificado: **ningún archivo del stash falta en el árbol**
(`comm -23 <(git stash show --name-only stash@{0} | sort) <(git diff --name-only | sort)`
devuelve vacío).

**No se elimina todavía a propósito**: mientras este trabajo siga sin commitear, esa
entrada es el único respaldo de 37 archivos modificados. Se retira con
`git stash drop stash@{0}` **después** del commit, no antes.

## 4bis. T1 queda condicionado a la aprobación de E1

El test estructural **nació verde y sin lista de excepciones**, pero lo consiguió
declarando los 33 sitios de apilamiento local *fuera de alcance* en su docblock, «a la
espera de la enmienda C-DS-04». Esa enmienda **no está aprobada**.

Es decir: T1 presupone hoy el punto 5 de E1 (la ampliación de §2 que saca el apilamiento
local de la prohibición de literales). Mientras E1 siga pendiente, el test es correcto
respecto a un contrato que aún no existe.

**Si el CTO aprueba E1** — nada que hacer: el docblock pasa de presuposición a cita.

**Si el CTO rechaza E1** — T1 debe reescribirse antes de considerarse un gate válido: esos
33 sitios pasarían a ser violaciones de §2 y el test estaría tolerándolas sin registrarlas.
La forma admisible en ese caso es la que ya especificó AI-DS-OWNER: lista claveada **por
fragmento de clase, nunca por línea**, más una segunda aserción que exija que la lista se
consuma por completo, de modo que solo pueda encoger.

## 5. Dependencias

```
E1 (enmienda: EM-ARCH → CTO) ── única vía abierta: sigue sin aprobar
 └── renombrado de tokens (6 sitios + specs)
 └── (el test T1 ya existe sin lista de excepciones: el punto 5 de E1
      formalizaría el apilamiento local que su docblock deja fuera de alcance)

M1, M2, M3, M6 ── hechos
M4, M5, M7, M8, M9 (visto bueno del orquestador), M10 ── hechos (2026-09-07)
T1 ── hecho: nació verde tras M4 y M5, sin excepciones
```
