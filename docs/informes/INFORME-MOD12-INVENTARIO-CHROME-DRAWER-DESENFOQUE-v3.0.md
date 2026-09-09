# INFORME-MOD12-INVENTARIO-CHROME-DRAWER-DESENFOQUE-v3.0

**Fecha:** 2026-09-07
**Módulo:** MOD12 Inventario (transversal: chrome del portal, `@iwana/ui`, CRM, web)
**Tipo:** Corrección de UI / apilado de capas (ADR-075)
**Estado:** Ejecutado
**Sustituye a:** `INFORME-MOD12-INVENTARIO-CHROME-DRAWER-OPACO-v1.0.md` (nunca commiteado; su
decisión queda invertida por este informe). La v2.0 se actualiza in situ a v3.0
(documento vivo): incorpora el cierre ejecutado del plan ADR-075 (M4-M10 + T1, §3.6).

---

## 1. Contexto y corrección de interpretación

La v1.0 leyó «los menús deben quedar **opacos**» en su acepción CSS —sólidos, nítidos,
sobre el velo— y elevó el chrome (Sidebar, TopHeader y subnav del módulo) a
`--z-drawer` para que el velo no los tocara.

El usuario rechazó ese resultado con captura de
`/dashboard/inventory?tab=stock` con el drawer de detalle abierto y lo aclaró:
**«debe estar desenfocado cuando el drawer se acciona»**. «Opaco» estaba usado en su
acepción coloquial —apagado, atenuado—, no en la CSS. El requisito real es el
contrario del implementado en la v1.0:

> Con un drawer modal abierto, **todo el fondo** —contenido, Sidebar, TopHeader y
> subnav del módulo— queda atenuado y **desenfocado** bajo el velo. Solo el panel del
> drawer permanece nítido.

## 2. Decisión

Gramática del portal para drawers modales (ADR-075, sin z literales):

| Capa | Token | Comportamiento con drawer abierto |
| --- | --- | --- |
| Chrome (Sidebar, TopHeader, subnav) | `--z-sticky` (100) / sin posición en desktop | Queda **bajo** el velo: se atenúa y desenfoca |
| Velo del drawer | `--z-overlay` (200) | `bg-black/40‥45` + `backdrop-blur-sm` |
| Panel del drawer | `--z-modal` (400) | Nítido, con el foco confinado |

El chrome conserva `inert` + `aria-hidden` mientras el drawer está abierto: la
atenuación es visual y la inercia es de foco; ambas dicen lo mismo al usuario y al
lector de pantalla. Los diálogos de confirmación de Radix (`z-10000/10001` en
`@iwana/ui`) siguen pintando sobre el panel: el flujo de descarte/ajuste no cambia.

## 3. Cambios

| Archivo | Cambio |
| --- | --- |
| `apps/portal/src/components/layout/Sidebar.tsx` | `lg:relative` → `lg:static`: sin posición, el token `z-(--z-drawer)` no aplica en desktop y el velo lo cubre. Mobile sin cambios (`fixed` + `z-(--z-drawer)` para su propio velo) |
| `apps/portal/src/components/layout/TopHeader.tsx` | Con `modalDrawerOpen` ya no se eleva a `z-(--z-drawer)`: permanece en `z-(--z-sticky)`, bajo el velo. Conserva `inert` + `aria-hidden` |
| `apps/portal/src/components/shared/portal-ui.tsx` | `PortalModuleSubnav`: se elimina la prop `railElevated` y la sobrescritura `lg:z-(--z-drawer)`; el rail se suscribe al canal del portal (`usePortalModalDrawerOpen()`) y solo aplica `inert` + `aria-hidden` |
| `apps/portal/src/components/shared/use-portal-modal-drawer-broadcast.ts` | **Nuevo.** `usePortalModalDrawerBroadcast(open)` (el drawer difunde su propio estado, con identidad por dueño) y `usePortalModalDrawerOpen()` (el chrome lo consume) |
| `apps/portal/src/components/shared/portal-side-drawer-layers.ts` | `dispatchPortalModalDrawerState(open)` → `setPortalModalDrawerState(ownerId, open)` sobre un registro de dueños |
| `apps/portal/src/components/inventory/InventoryClient.tsx`, `StockWorkspace.tsx` | Se elimina el cableado manual (`stockDetailOpen`, `handleStockDetailOpenChange`, `onDetailOpenChange`): lo difunde el drawer |
| `StockItemDetailDrawer.tsx`, `InventorySideDrawerShell.tsx`, `SupplierFormDrawer.tsx`, `InventoryCreateProductDialog.tsx`, `AssuranceTicketDrawer.tsx` | Velo `z-(--z-overlay)` + `backdrop-blur-sm` (mismo desenfoque que ya usaba `DispatchDrawerPortal`) |

Se conservan de la v1.0: la migración de los literales `z-[1200]`/`z-[1201]` a tokens
(ADR-075 §2) y el par velo(`--z-overlay`)/panel(`--z-modal`).

Specs actualizados: `Sidebar.spec.tsx` (`lg:static`), `TopHeader.spec.tsx` (sigue en
`z-(--z-sticky)`), `layout.spec.tsx`, `portal-module-subnav.spec.tsx`,
`StockItemDetailDrawer.spec.tsx`, `InventoryCatalogDrawer.spec.tsx` e
`InventoryCreateProductDialog.spec.tsx` (`backdrop-blur-sm` en el velo).

### 3.1 Defectos corregidos en la misma pasada (hallazgos de AI-DS-OWNER y AI-SR-QA)

| Defecto | Corrección |
| --- | --- |
| **El estado modal era un booleano.** Con drawers anidados, cerrar el interior devolvía la interactividad al chrome con el exterior aún abierto: el foco escapaba a un chrome atenuado bajo el velo | `portal-side-drawer-layers.ts`: **registro por dueño** (`setPortalModalDrawerState(ownerId, open)` sobre un `Set`), que solo difunde en las transiciones reales ninguno↔alguno. Misma razón por la que `openDrawerLayers` ya era una pila |
| **El subnav se volvía inerte para 1 de 5 drawers.** `InventoryClient` cableaba la prop a mano contra `stockDetailOpen`, mientras Sidebar y TopHeader se alimentaban del evento global: con el drawer de catálogo, proveedor o alta de producto abiertos el rail quedaba bajo el velo pero **tabulable** | `PortalModuleSubnav` se suscribe al canal con `usePortalModalDrawerOpen()`. Se eliminan la prop y el cableado: una sola fuente de verdad |
| **La difusión la hacía el invocador**, no el drawer: `StockItemDetailDrawer` era el único de los cinco que dependía de que la pantalla se acordara de conectarlo (`StockWorkspace.onDetailOpenChange` → `InventoryClient`) | El drawer emite su propio estado con `usePortalModalDrawerBroadcast(open)`, como los otros cuatro. `onDetailOpenChange` y `stockDetailOpen` desaparecen |
| Los cinco `useEffect` de difusión estaban duplicados literalmente | Nuevo `use-portal-modal-drawer-broadcast.ts`: `usePortalModalDrawerBroadcast(open)` y `usePortalModalDrawerOpen()` |
| Ternario tautológico en `TopHeader` (tres ramas, dos valores) | `searchOpen && !modalDrawerOpen ? overlay : sticky` |
| El velo de `StockItemDetailDrawer` era el único de los cinco sin `tabIndex={-1}`: un `<button>` a pantalla completa dentro del orden de tabulación, fuera del diálogo | `tabIndex={-1}` añadido |
| Seis comentarios de producción seguían documentando la gramática rechazada («el chrome queda visible sobre el velo») | Reescritos: el próximo lector no reintroduce la elevación |

### 3.2 Segunda pasada — el velo no llegaba al chrome

Con §3 aplicado, el usuario reportó con captura que el contenido central sí se
atenuaba y desenfocaba, pero **el sidebar seguía nítido**, y el borde del desenfoque
coincidía exactamente con el borde derecho del sidebar.

Descartado que el sidebar se apilara por encima: `.lg\:static` sí está emitido en el
CSS servido por el dev server, y un elemento `static` no puede pintar sobre un `fixed`
posicionado. El síntoma es el contrario: **el velo estaba confinado al contenedor de
contenido**. Un `fixed inset-0` que vive dentro del árbol de la página se ancla al
primer ancestro que le cree bloque contenedor —`transform`, `filter`,
`backdrop-filter`, `contain`, `will-change`— y deja de cubrir el viewport; el chrome,
que es hermano de ese contenedor, queda fuera del velo.

Corrección: **la capa de velo + panel se monta en `document.body`** con `createPortal`,
el patrón que `DispatchDrawerPortal` (Programación) ya usaba. Anclado al `body`, el velo
cubre el viewport entero con independencia de lo que la pantalla monte por encima, hoy
o mañana.

| Archivo | Cambio |
| --- | --- |
| `apps/portal/src/components/shared/PortalModalDrawerLayer.tsx` | **Nuevo.** Velo + contenedor `--z-modal` del panel, montados en `document.body`. Exporta `portalModalDrawerVeilClassName`: la opacidad, el desenfoque y el escalón viajan juntos (recomendación (b) de AI-DS-OWNER) |
| Los 5 drawers migrados | Sustituyen su bloque velo + contenedor por `<PortalModalDrawerLayer>`. La opacidad del velo se unifica en `bg-black/45` (`StockItemDetailDrawer` usaba `/40`) |
| `apps/portal/src/components/layout/Sidebar.tsx` | Con `modalDrawerOpen` baja a `z-(--z-base)` en vez de `z-(--z-drawer)`: el velo lo cubre en cualquier viewport sin depender de que `lg:static` le quite el posicionamiento |

La propiedad concreta que creaba el bloque contenedor no se identificó en el árbol
—requiere DevTools sobre una sesión autenticada— y deja de importar: el portal hace al
drawer inmune a ella. Queda anotado como deuda de diagnóstico si reaparece en otro
punto del portal.

### 3.3 Tercera pasada — el sidebar tardaba en atenuarse

Con §3.2 aplicado, el sidebar sí se atenuaba, pero con un retardo visible respecto al
resto del chrome.

Causa: `z-index` **es una propiedad interpolable**, y el sidebar declaraba
`transition-all duration-200`. Al bajar de `--z-drawer` (300) a `--z-base` (0) el
navegador animaba el escalón: durante los primeros ~130 ms el sidebar seguía por encima
del velo (200) y se veía nítido mientras el contenido ya estaba atenuado.

Corrección: la transición se acota a lo que el sidebar anima de verdad —
`transition-[width,transform]`: el ancho al colapsar y el desplazamiento del drawer
mobile. El cambio de escalón pasa a ser instantáneo. `Sidebar.spec.tsx` fija ambas
condiciones (`transition-[width,transform]` presente, `transition-all` ausente) para que
no reaparezca al tocar el shell.

### 3.4 Cuarta pasada — alinear con el patrón que ya funcionaba

El usuario señaló que el drawer de despacho de `/dashboard/scheduling/pending-visits`
**nunca tuvo ninguno de estos defectos** y pidió alinear Inventario con ese ejemplo.

`DispatchDrawerPortal` acierta por una razón estructural: **no toca el chrome**. Monta
en `document.body` una sola capa `fixed inset-0` por encima del sidebar, con el velo
`absolute inset-0` dentro de ella y el panel como hermano. No difunde estado visual, no
degrada el escalón de nadie, no re-renderiza el layout — por eso su atenuación es
instantánea.

El enfoque de §3–§3.3 hacía lo contrario: velo en `--z-overlay` (200) y **descenso** del
Sidebar desde `--z-drawer` (300). Eso exige un viaje de evento, un re-render del layout
y un cambio de capa; el retardo era inherente al enfoque, y §3.3 solo quitó su
manifestación más visible.

Corrección — se adopta la gramática de `DispatchDrawerPortal`:

| Archivo | Cambio |
| --- | --- |
| `PortalModalDrawerLayer.tsx` | Una sola capa `fixed inset-0 z-(--z-modal) flex justify-end` con el velo `absolute inset-0` **dentro** y el panel como hermano. `portalModalDrawerVeilClassName` pierde el `fixed`/`z-` y queda como superficie del velo (opacidad + desenfoque) |
| `Sidebar.tsx` | El escalón vuelve a ser constante (`z-(--z-drawer)`): el chrome ya no cambia de capa. Se conserva la transición acotada a `width,transform` |
| `TopHeader.tsx` | El escalón vuelve a `searchOpen ? overlay : sticky`; `modalDrawerOpen` gobierna solo la inercia |

**Implicación para ADR-075, a elevar a AI-DS-OWNER:** con la escala vigente, un velo
alojado en `--z-overlay` (200) **no puede** cubrir el Sidebar, que ocupa `--z-drawer`
(300). La tabla del ADR describe `--z-overlay` como «velo que oscurece el contenido bajo
un panel», y eso solo se sostiene para el velo del sidebar móvil, cuyo panel *es* el
chrome. Para un drawer modal, el velo debe viajar dentro de la capa del panel. Es la
erosión semántica de `--z-drawer` que AI-DS-OWNER ya había señalado (P1-6): el escalón
significa a la vez «cajón» y «chrome móvil que sobrevive a su propio velo».

El chrome conserva `inert` + `aria-hidden` por el canal del portal — mejora sobre el
ejemplo de Programación, que no confina el foco — porque eso no depende del pintado.

### 3.5 Cierre del hallazgo de contrato

El hallazgo elevado en §3.4 se atendió con veredicto de AI-DS-OWNER (barrido exhaustivo,
no muestral) y quedó repartido en dos vías, registradas en
[`docs/plans/2026-09-07-adr075-cierre-contrato-capas.md`](../plans/2026-09-07-adr075-cierre-contrato-capas.md):

**Vía normativa — no ejecutable aquí.** La corrección de fondo es que la tabla §1 del
ADR-075 nombra los escalones por el mueble que los ocupa, no por su relación de
apilamiento; `--z-overlay` nombra una *parte* de una capa como si fuera un escalón. La
enmienda C-DS-04 (descripciones por relación de apilamiento, renombrado de
`--z-overlay`→`--z-shell-raised` y `--z-drawer`→`--z-shell-panel`, retiro de `--z-base`,
y §2bis con la regla de decisión de velos) queda redactada como
[**propuesta no aprobada**](../adrs/ADR-075-ENMIENDA-C-DS-04-PROPUESTA.md): los nombres son
la decisión del ADR, y AI-DS-OWNER propone, no aprueba. Ningún valor numérico cambia — con
siete emisores literales aún por encima de la escala, renumerar sería a ciegas.

**Vía ejecutable — hecha en esta rama.** Vaciar `--z-drawer` de cajones para que le quede
una sola semántica:

| # | Cambio | Resultado |
| --- | --- | --- |
| M6 | Docblock de `InventorySideDrawerShell.tsx:18-21`, que propagaba el modelo erróneo dentro del propio arreglo | Corregido |
| M2 | `DispatchDrawerPortal.tsx:31` → `--z-modal` | Hecho |
| M3 | `OperationalSidePeek`: `createPortal` al `body` + `backdrop-blur-[2px]`→`backdrop-blur-sm` | Hecho |
| M1 | `PortalSidePeek` → `--z-modal` + `createPortal`; `relative z-10` literal eliminado en ambos primitives | Hecho, con ampliación de alcance autorizada por el orquestador (12 consumidores) |

Estado verificado tras la ejecución: `--z-drawer` aloja **solo** los dos `Sidebar` (chrome
persistente); las cuatro capas de cajón portalado viven juntas en `--z-modal`.

Dos defectos de test aparecieron al portalar, y son la lección transferible de esta pasada:
portalar al `body` **vuelve vacuo** todo aserto que consulte por el `container` de render.
`ScheduleEventDrawer.spec.tsx:269` recorría `container.querySelectorAll('h2, h3')`, que
pasaba a devolver cero nodos; y `portal-ui.spec.tsx` tenía un caso **duplicado literalmente**
(dos bloques idénticos). El primero se reapuntó a `document.body`; el segundo se consolidó y
se endureció con `expect(container).toBeEmptyDOMElement()`, que falla si alguien revierte el
portal.

Quedaban abiertos al cerrar la v2.0: M4 (los siete literales de `@iwana/ui`), M5, M7,
M8, el test estructural T1 —secuenciado **después** de M4 y M5, para que no nazca con 19
excepciones— y dos hallazgos nuevos: `PortalSidePeek` no difunde el estado modal, así
que en sus 12 pantallas el chrome queda bajo el velo pero **no inerte** (M9), y
`VisitRequestRecommendationPanel.tsx:587` conserva un `relative z-10` literal (M10).
Todos se ejecutaron el mismo día en la quinta pasada (§3.6); del plan original solo
queda en pie E1 (enmienda C-DS-04, **no aprobada**).

### 3.6 Quinta pasada — ejecución del cierre del contrato (M4-M10 + T1)

Ejecutada el 2026-09-07 con subagentes implementadores y revisores independientes por
ítem (dos etapas: cumplimiento de especificación y calidad; los siete veredictos:
APROBADO). M9 contaba con el visto bueno del orquestador — cambia comportamiento en las
12 pantallas de módulos cerrados que consumen `PortalSidePeek` (el chrome pasa a inerte
con el peek abierto; era la mitad del contrato que faltaba).

| Ítem | Cambio | Resultado |
| --- | --- | --- |
| M4 | 7 emisores + `SearchablePicker.tsx:176` → tokens: `Dialog.tsx:321,350` → `z-(--z-modal)` (implementación propia, no Radix; overlay y content comparten capa y el content pinta encima por descendencia); `Popover.tsx:21` → `z-(--z-popover)`; `Select.tsx:292,653`, `DropdownMenu.tsx:228`, `DailyTimelineHoverHint.tsx:119` → `zIndex: 'var(--z-popover)'` | Hecho |
| M4+ | Rezagado detectado en la pasada: `apps/web/src/components/search/GlobalSearchOverlay.tsx:65` (`z-50`) → `z-(--z-popover)`, espejo del gemelo del portal | Hecho |
| M5 | CRM Suscriptores a capa única: `ContractDetailDrawer`, `ConvertExpedienteToContractDialog`, `CreateContractDialog` — contenedor único `fixed inset-0 z-(--z-modal)`, velo `absolute inset-0` (guardas de `onClick` intactas), panel hermano posterior sin z; roles/aria sobre el card visible | Hecho |
| M7 | web `TopHeader.tsx:119` → `z-(--z-sticky)`; `:196` (búsqueda móvil, `role="dialog"` + `aria-modal` + trampa de Tab) → `z-(--z-modal)` — el homólogo del portal es otro constructo (sin trampa; eleva el header), no se espeja; `portal-ui.tsx` barra sticky del pie → `z-(--z-sticky)` | Hecho |
| M8 | Cazadores de clic de dos capas sin literales: `ContractCard.tsx`, `CatalogPicker.tsx` ×2 — cazador `fixed inset-0` sin z + menú `absolute` hermano posterior; apilamiento por orden de documento | Hecho |
| M9 | `usePortalModalDrawerBroadcast(open)` en `PortalSidePeek` (`portal-ui.tsx:1722`) + caso punta a punta (peek real → evento → chrome inerte/cerrado) en `dashboard/layout.spec.tsx` | Hecho |
| M10 | `VisitRequestRecommendationPanel.tsx:587`: `relative z-10` → `relative` (pinta sobre el velo por orden de documento dentro de `DispatchDrawerPortal`) | Hecho |
| T1 | `apps/portal/src/components/shared/z-layer-contract.structure.spec.ts` con el molde de `aria-busy-contrast`: D1 (fixed + z literal), D2 (z ≥ 100), D3 (`zIndex:` sin `var(--z-…)`), canario `z-(--z-` ≥ 12 | Hecho: **nació verde, sin lista de excepciones** (canario real: 29) |

El apilamiento local (33 sitios, `z-<n>` con n < 100 sin `fixed`) queda **fuera de
alcance a la espera de la enmienda C-DS-04**, documentado en el docblock del test — no
como excepciones. Ambos revisores verificaron de forma independiente que el test muerde
(violación sintética inyectada → rojo con la ofensiva listada → revertida → verde).

**Incidente de sesión (resuelto):** a las 14:18 una operación externa al effort (stash
`wip2`) retiró las 37 modificaciones no commiteadas del árbol a mitad de la ejecución
de T1; el propio test estructural lo delató al listar 35 ofensas reales que mapean 1:1
con la tabla del plan. El coordinador restauró el árbol con `git stash apply` (el
stash queda conservado como respaldo) y el test volvió a verde **sin cambiar un
carácter**. El stash `wip2` puede eliminarse cuando este trabajo se commitee.

**Fallo preexistente, diagnosticado y corregido en la sexta pasada:**
`SchedulingClient.spec.tsx` «mantiene el rail de pendientes al soltar una solicitud en
la grilla diaria». La hipótesis de esta pasada —dependencia horaria— **quedó confirmada
por AI-SR-QA** con prueba experimental. Ver §3.7.

### 3.7 Sexta pasada — auditoría de la quinta y cierre

Auditoría de la ejecución de la quinta pasada contra la especificación. Siete desviaciones,
todas cerradas:

| # | Desviación detectada | Corrección |
| --- | --- | --- |
| 1 | **Los tres diálogos de CRM adoptaron la capa única pero no portalaban** (`grep createPortal` vacío en el directorio): la mitad visible del defecto §3.2 resuelta, la causa viva | Portalados. Se extrajo `PortalModalLayer({className, children})` —plomería sin opinión visual: guarda SSR + `createPortal`— para que ningún diálogo nuevo pueda adoptar la capa y olvidar el portal. No se delegó en `PortalModalDrawerLayer` porque su velo es un `<button>` con handler obligatorio y los tres usan `<div aria-hidden>` con guardas (`isEditing`, `saving`) que se habrían perdido |
| 2 | `Dialog.tsx:350` conservaba `relative z-(--z-modal)` donde la especificación decía **eliminar**: creaba un contexto de apilamiento que atrapa a los descendientes en `--z-popover` que no se portalan (`Popover`) | z retirado |
| 3 | `apps/web/TopHeader.tsx:196` en `--z-modal` sin portal, contra la Adenda A | Ver §3.8: el veredicto fue otro |
| 4 | Cazadores de clic dejados **sin z** en vez de consolidados sobre `--z-popover`: apilados por orden de documento, el contrato implícito que ADR-075 prohíbe | Cazador y menú en `--z-popover`; el cazador no reclama escalón propio, sube al del menú al que sirve |
| 5 | T1 nació verde **presuponiendo** el punto 5 de la enmienda C-DS-04, que no está aprobada | Condicionado explícitamente en el plan §4bis |
| 6 | El fallo de `SchedulingClient` estaba declarado preexistente sin diagnóstico cerrado | Diagnosticado y corregido. Ver abajo |
| 7 | El stash `wip2` seguía vivo | No se elimina: es el único respaldo del trabajo sin commitear. Criterio de baja documentado (plan §3bis) |

Además, un defecto del mismo tipo que M9, reportado de paso: **los tres diálogos de CRM no
difundían su estado al chrome**, así que con ellos abiertos el chrome quedaba bajo el velo
pero tabulable y el foco escapaba. Corregido con `usePortalModalDrawerBroadcast` y cubierto
con test.

**El fallo de scheduling: dependiente del reloj, no del código.** AI-SR-QA revirtió los 37
archivos a HEAD y corrió el archivo de spec completo: **falla igual**. Causa mecánica: el
slot objetivo son las 14:00 de *hoy*; `ScheduleCalendar.tsx:1350` descarta el drop sobre
franjas pasadas (`isScheduleDaySlotInPast`, contra `new Date()` real), así que
`onPendingVisitDrop` nunca corre, no se crea el borrador, y «Instalación GPON barrio norte»
—que es el título del **borrador**, no del rail— no existe en el DOM. Prueba decisiva:
mover el slot a las 17:00 pone el archivo en 22/22 verde con el mismo código. El caso era
**verde hasta las 14:00 locales y rojo el resto de la jornada**, y en CI (UTC) rojo cinco
horas antes — lo que explica el ciclo de parche y reversión de `a82fa562`/`a4ff09ea`.

Corrección aplicada: fijar el reloj en el propio caso con el patrón que el archivo ya usa
en su línea 574 (`jest.useFakeTimers()` + `setSystemTime`, con `useRealTimers()` en
`finally`). `findByText` **no** era la corrección: cambia un fallo inmediato por un timeout
de 1000 ms sin arreglar el determinismo, y por eso el commit que lo intentó fue revertido.

> **Corrección de una afirmación de esta misma sesión:** el coordinador declaró muerta la
> hipótesis horaria tras correr el caso con `TZ='Etc/GMT+12'`. Ese experimento **no midió
> nada**: Node en Windows lee la zona del sistema operativo e ignora la variable del shell
> (`sin TZ`, `Etc/GMT+12` y `Kiritimati` devuelven las tres la misma hora local). La
> hipótesis de la quinta pasada era correcta.

### 3.8 El escalón que no existía — veredicto de AI-DS-OWNER sobre `apps/web`

M7 puso la hoja de búsqueda móvil de `apps/web` (`TopHeader.tsx:196`) en `--z-modal`
argumentando que tiene `role="dialog"`, `aria-modal` y trampa de `Tab`. AI-DS-OWNER revocó
esa justificación: es correcta sobre la trampa de foco y **errónea sobre el escalón**.

La hoja es el último hijo de un `<header>` con `position: sticky`, que **crea contexto de
apilamiento siempre**, con o sin `z-index`. Por tanto ese `z-(--z-modal)` no es un escalón:
es ordenación entre hermanos. Frente al `Sidebar` (300) la hoja pinta en **100**, el escalón
del header — exactamente igual que cuando decía `z-50`. M7 sustituyó un literal por un token
y dejó intacto lo único que importaba. El gemelo del portal no comete el error porque eleva
**el raíz del contexto** (`TopHeader.tsx:90`), no la capa interior.

Ejecutado: `:196` pierde el z sin token sustituto; el header se queda en `--z-sticky` porque
`apps/web` **no tiene** el subnav de módulo con el que compite el gemelo del portal, con el
disparo falsable escrito en el código; comentario espejo en el portal para que nadie unifique
los números; y el estado de limpieza por cambio de breakpoint que faltaba (la hoja es
`lg:hidden`, y al cruzar a desktop el estado seguía abierto con la trampa de `Tab` viva sobre
un overlay no renderizado).

De aquí salió **§2ter** para la enmienda —*un escalón solo existe si el elemento que lo
declara compite en el contexto de apilamiento raíz*— y la corrección de su punto 5, que
eximía el apilamiento local por «sin `fixed`»: clave mal elegida, porque la hoja de web es
`fixed` y aun así es ordenación local. El detector D1 de T1 se apoyaba en esa definición.

**Hallazgo abierto, potencialmente un defecto vivo:** el header de `apps/web` lleva
`backdrop-blur` incondicional, lo que por Filter Effects L2 lo convierte en bloque
contenedor de descendientes `fixed`. Si el navegador lo aplica como especifica (Blink lo
hace), la hoja de búsqueda móvil cubre los ~60 px del header en vez del viewport. El gemelo
del portal no tiene `backdrop-blur`. Pendiente de verificación en navegador; si se confirma,
la corrección es del constructo (portalar la hoja) y obliga a reasignar escalón.

### 3.9 Enmienda C-DS-04 aprobada e incorporada

El CTO aprobó la enmienda el **2026-09-07**. Incorporada al ADR-075 con el molde de sus dos
enmiendas previas, y el código migrado en el mismo acto:

| Cambio | Alcance |
| --- | --- |
| `--z-overlay` → `--z-shell-raised` (200), `--z-drawer` → `--z-shell-panel` (300) | 6 consumidores + 7 specs |
| `--z-base` (0) retirado; `--z-toast` (600) marcado **reservado** | `globals.css` |
| Tabla §1 → Adenda A (escalones descritos por relación de apilamiento) | ADR-075 |
| §2bis (regla de decisión de velos) y §2ter (regla del contexto de apilamiento) | ADR-075 |
| §2 ampliado: el apilamiento local es el que **no compite en el contexto raíz** | ADR-075 |
| Docblock de T1: deja de presuponer la enmienda y **cita** §2 ampliado y §2ter | `z-layer-contract.structure.spec.ts` |

**Ningún valor numérico cambió**, y ningún elemento cambió de escalón: era un renombrado.

**Defecto de gate descubierto de paso.** `pnpm audit:adr-citations` estaba en **104
bloqueantes** desde antes de este effort, y los 104 eran el mismo defecto: `buildAdrIndex`
indexa por número (`^ADR-(\d{3})[-.]`), así que `ADR-075-ENMIENDA-C-DS-04-PROPUESTA.md`
**eclipsaba** a `ADR-075-Contrato-Capas-Z-Portal.md` en el índice, y la enmienda declaraba su
estado en una forma que el parser no reconoce — toda cita de ADR-075 del repo caía en
`adr-no-status`. Con la cabecera canónica: **0 bloqueantes**. Queda vivo el eclipse en sí (dos
archivos con el mismo número); desempatar por sufijo es trabajo de quien gobierne
`scripts/audit-adr-citations.mjs`.

**Sobre el detector D1 de T1**, que se decidió mantener sin matizar: el argumento definitivo no
es la indecidibilidad del análisis estático, sino que **el ancestro que crea contexto puede
vivir en otro componente** — ningún detector por archivo puede resolverlo, nunca. Y el caso vivo
lo confirma: la hoja de búsqueda de `apps/web` es `fixed` bajo un `sticky` y se emite **sin z**,
que es justo lo que §2ter obliga; no compite con D1, lo cumple.

## 4. Verificación

Ejecutada por AI-SR-QA sobre el working tree y repetida tras las correcciones de §3.1.
Jest directo, sin caché de turbo y sin `--passWithNoTests`:

| Comando | Resultado |
| --- | --- |
| `pnpm exec jest --ci` (`apps/portal`) | **233 suites / 2073 pasados + 1 skipped** tras §3.5 (baja de 2074 por la consolidación de un caso duplicado) |
| `pnpm exec jest --ci` (`packages/ui`) | 3 suites / 29 tests pasados |
| `pnpm exec tsc --noEmit` (`apps/portal`) | exit 0, sin salida |
| `pnpm exec eslint src --ext .ts,.tsx` (`apps/portal`) | 0 errores, 46 warnings preexistentes (ninguno introducido) |
| `node .agents/skills/iwana-identity-ui-review/scripts/audit-ui.mjs` sobre los archivos tocados | sin hallazgos |
| `pnpm exec jest --ci` (`apps/web`) | 36 suites / 229 tests pasados |

Verificación final tras la sexta pasada (§3.7), ejecutada por el coordinador sobre el
árbol completo. Jest directo por paquete, sin turbo y sin `--passWithNoTests`:

| Comando | Resultado |
| --- | --- |
| `pnpm exec jest --ci` (`apps/portal`) | **237 suites / 2091 pasados + 1 skipped · 0 fallos** |
| `pnpm exec jest --ci` (`packages/ui`) | 3 suites / 29 pasados |
| `pnpm exec jest --ci` (`apps/web`) | 36 suites / 229 pasados |
| `pnpm exec tsc --noEmit` (`apps/portal`, `packages/ui`, `apps/web`) | exit 0 en los tres |
| `pnpm exec eslint src --ext .ts,.tsx` (`apps/portal`) | 0 errores, 46 warnings preexistentes |
| `jest z-layer-contract.structure.spec.ts` | 4/4, canario 29 ≥ 12 |
| `audit-ui.mjs` sobre los archivos tocados | P0 0 · P1 0 · P2 0 · P3 2 (heurísticos `animate-spin` preexistentes, falsos positivos confirmados) |

La suite del portal queda **sin ningún fallo** por primera vez en este effort: el rojo de
`SchedulingClient` no era regresión sino un test no aislado del reloj, corregido en §3.7.

Apilado validado analíticamente: el contenedor de contenido es `relative` con
`z-index: auto` y **no** crea contexto de apilamiento, así que el velo (`fixed`, 200)
y el header (`sticky`, 100) compiten en el contexto raíz y gana el velo; el sidebar
en `lg:static` queda por debajo de todo elemento posicionado. Ningún ancestro del velo
tiene `filter`/`transform`/`opacity`/`will-change`, luego el *backdrop root* es el
documento y `backdrop-blur-sm` **sí** desenfoca sidebar, header y subnav.

**Pendiente:** verificación visual en `localhost:3002/dashboard/inventory?tab=stock`
a cargo del usuario (el portal exige sesión autenticada; el agente no manipula
credenciales) y `pnpm test:e2e:portal`. Riesgo E2E concreto: con el chrome
`aria-hidden` + `inert`, cualquier E2E que haga `getByRole` sobre sidebar, header o
subnav **con un drawer abierto** dejará de encontrarlo. Los selectores de cierre se
revisaron y no hay colisión de strict mode.

## 5. Alcance y pendientes

Veredicto de AI-DS-OWNER: **CONFORME CON CONDICIONES**. La inversión es coherente con
ADR-075 —el ADR define `--z-overlay` como «velo que oscurece el contenido bajo un
panel», que es justo lo que la v1.0 contradecía— y converge con `DispatchDrawerPortal`,
el único drawer del portal que ya desenfocaba. Condiciones abiertas:

1. **El velo no es un contrato.** 14 velos en el monorepo con 5 opacidades
   (`/30 /40 /45 /50 /55`), 3 estados de desenfoque y solo 7 declarando variante
   oscura. Ningún valor tokenizado. Recomendación de DS-OWNER: tokens
   `--color-portal-veil` (redefinido bajo `.dark`, para que el `dark:` desaparezca del
   código de aplicación), `--portal-veil-blur` y `--color-portal-veil-chrome` (el velo
   del sidebar móvil, donde el chrome *es* el panel y no debe desenfocarse), más una
   constante `portalOverlayVeilClassName` exportada desde `@iwana/ui` con el precedente
   de `interactiveFocusClassName`. **No** un primitive de velo aislado: el velo nunca
   viaja solo.
2. **~~`crm/subscribers` queda por debajo del TopHeader~~ — cerrado por M5 (§3.6):**
   los tres componentes migrados a capa única `--z-modal`; sin literales z en todo el
   directorio.
3. **`PortalSidePeek` atenúa pero no desenfoca** (`portal-ui.tsx:1740,1743`), con 12
   consumidores en Comercial, Settings y Usuarios: es la desviación de mayor superficie.
   `OperationalSidePeek` usa `blur-[2px]` (valor arbitrario) y vive en `--z-modal`
   mientras `PortalSidePeek` vive en `--z-drawer`: dos primitives con el mismo rol en
   escalones distintos. La consolidación en un solo drawer primitive cambia la API
   pública de `@iwana/ui` y **escala al orquestador**. *(Nota de §3.6: M1 ya unificó el
   escalón — ambos viven en `--z-modal` — y M9 cerró la difusión de inercia; la
   consolidación de primitive y el desenfoque del velo siguen abiertos.)*
4. **~~La regla estructural anti-z-literal de ADR-075 §4 nunca se implementó~~ —
   cerrado por T1 (§3.6):** `z-layer-contract.structure.spec.ts`, nacida verde y sin
   excepciones; causa directa de que hallazgos tipo (2) no sobrevivan.
5. **~~`Dialog.tsx:321`, `Select.tsx:292,653`, `DailyTimelineHoverHint.tsx:119`,
   `DropdownMenu.tsx:228` sin migrar~~ — cerrado por M4 (§3.6):** `--z-popover` ya
   tiene los consumidores para los que se creó (más `Popover`, `SearchablePicker` y el
   `GlobalSearchOverlay` de web).
6. `StockItemDetailDrawer.tsx`: el panel usa `bg-white` sin superficie oscura
   emparejada (ADR-056 §2).
7. **`apps/web` no se auditó en este acto** — parcialmente cerrado por M7 (§3.6):
   migrados los literales conocidos (`TopHeader.tsx:119,196`,
   `GlobalSearchOverlay.tsx:65`); la auditoría equivalente completa de web sigue
   pendiente.
8. **E1 (enmienda C-DS-04) sigue esperando a EM-ARCH y al CTO.** Mientras no se
   apruebe, los tokens conservan sus nombres actuales y el apilamiento local (33
   sitios, `z-<n>` con n < 100 sin `fixed`, p. ej. el sticky `z-30` de
   `ScheduleCalendar`) queda fuera del alcance del test estructural por diseño.
9. **Fallo preexistente `SchedulingClient.spec.tsx`** (§3.6): ajeno a este effort
   (probado por bisect contra HEAD); hipótesis de dependencia horaria. Dueños del
   módulo de Programación.
10. **El stash `wip2` queda como respaldo** del incidente de §3.6: eliminarlo cuando
    este trabajo se commitee.

**Nota técnica para la consolidación futura:** `backdrop-filter` crea bloque contenedor
para descendientes `fixed`. Hoy el panel es siempre **hermano** del velo, nunca
descendiente, así que no hay regresión; el primitive consolidado debe preservar esa
relación o los popovers de `Select` y los diálogos de confirmación dejarán de pintar
sobre el panel.
