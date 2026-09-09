# Contrato — borde del panel modal en oscuro

**Fecha:** 2026-09-07
**Emisores:** AI-DS-OWNER (veredicto normativo) + AI-PROD-UX (dirección visual), por separado y
convergentes
**Persistido por:** coordinador — el rol de DS-OWNER no escribe archivos y el contrato no está
congelado hasta existir como artefacto localizable.
**Cierra:** §6.1 de [`2026-09-07-contrato-modal-layer-velo.md`](2026-09-07-contrato-modal-layer-velo.md)
**Estado:** congelado y **EJECUTADO** el 2026-09-07. Enmienda de ADR-056 §2 (filas 1 y 3)
**aprobada por el CTO** e incorporada al ADR. Verificación al pie.

---

## 1. El problema, medido en la app real

Portal en tema oscuro, `PortalSidePeek` de Comercial abierto (medición en navegador, Chrome 148):

| Medida | Valor |
| --- | --- |
| Panel | `#222222` (`dark-surface-2`) |
| Borde | `#2E2E2E` (`dark-border`), 0.8 px |
| Fondo velado | `#0A0A0A` |
| **Panel vs fondo velado** | **1.24:1** |
| **Borde vs panel** | **1.17:1** |
| `box-shadow` del panel | `rgba(0,0,0,0)` — **transparente en oscuro** |

## 2. Lo que la aritmética descarta — antes de elegir

Ninguna de estas vías puede funcionar, y no por preferencia:

| Vía | Techo real | Por qué muere |
| --- | --- | --- |
| Subir la opacidad del velo | **1.32:1 con velo negro al 100%** | Oscurecer un fondo ya casi negro no lo separa de un panel casi negro |
| Elevar la superficie del panel | `surface-3` 1.38:1 · `surface-4` 1.57:1 | Para 3:1 la superficie tendría que llegar a ≈`#5D5D5D`: el panel tomaría valor de borde y dejaría de ser modo oscuro |
| Sombra / halo | invisible | Las cinco sombras derivan de `rgba(23,22,58,…)`: sobre casi-negro no existen. Y un degradado difuso no produce límite medible |
| Anillo blanco sutil | `ring-white/24` = 2.20:1 | Para 3:1 haría falta blanco al ~47%, que ya no es un anillo. **Precedente vivo del fallo:** `Select.tsx:553` tiene `dark:ring-white/10`, presente y sin efecto |
| Glass | — | `.iwana-glass` es `#ffffff 80%` sin definición dark: volvería el panel casi blanco |
| Filo de acento lima | — | Rechazado **por semántica**: lima = avance/éxito/completitud/interacción. El límite de una capa no es ninguna. Competiría con la barra lima del nav y con el foco |

Queda **una sola familia**: el filo.

## 3. El reencuadre que corrige el planteamiento

> El borde del panel modal se especifica **contra la superficie del panel**, nunca contra el
> fondo velado.

El fondo velado **no es un color**: es contenido arbitrario atenuado al 60%, con rango real
`#0A0A0A` (superficie detrás) a `#666666` (texto blanco detrás). Contra ese rango, `neutral-600`
da 5.73:1 en un extremo y **1.66:1** en el otro. **Ningún gris fijo cumple 3:1 contra el rango
completo** — la misma imposibilidad estructural del velo, un nivel más abajo.

Lo especificable es el par cuyos dos términos son tokens fijos: **borde vs superficie del
panel**, donde `neutral-600` da **4.61:1 siempre**. Una línea a 4.61:1 contra el interior marca
dónde acaba el panel; el observador percibe el canto por su lado interno aunque el externo se
pierda.

**Corolario, y es lo que hace coherente la asimetría entre temas:** al menos un par debe llegar
a 3:1, y cuál de los dos depende del sustrato. En claro el portador es *superficie vs fondo
velado* (3.36:1) y el borde queda decorativo. En oscuro la superficie no puede serlo (1.24:1) y
el portador pasa a ser *borde vs superficie*. Por eso **el tema claro no cambia**.

Precedente normado del mismo patrón: `globals.css:126` — «Lima: en dark el mínimo es
`iwana-secondary-400` (la regla `-700` es exclusiva de claro)». Misma regla, token distinto por
sustrato.

## 4. La decisión

**Valor: `iwana-neutral-600` = `#8A8A8A`.** 1 px, solo en el **borde exterior** del panel.

| Candidato | vs panel `#222222` | Veredicto |
| --- | --- | --- |
| `dark-border` `#2E2E2E` (hoy) | 1.17:1 | insuficiente |
| `dark-border-2` `#383838` | 1.36:1 | insuficiente |
| mínimo teórico `#6C6C6C` | 3.03:1 | (`#6B6B6B` da 2.99:1 — **falla por un pelo**) |
| `iwana-neutral-700` `#6F6F6F` | 3.17:1 | pasa, pero **frágil**: 2.86:1 sobre `surface-3`, 2.51:1 sobre `surface-4` |
| **`iwana-neutral-600` `#8A8A8A`** | **4.61:1** | **elegido** |
| `iwana-neutral-500` `#AEAEAD` | 7.17:1 | innecesariamente fuerte |

Por qué `-600` y no el mínimo `-700`: (a) 3.17 no tiene margen frente al antialiasing de 1 px en
DPR fraccional — el valor del token no es el valor percibido; (b) es el **único escalón que
cumple 3:1 contra las cuatro superficies dark** (5.14 / 4.61 / 4.16 / 3.66); (c) **ya es la norma
del repo**: `globals.css:127`, ratificado por DS-OWNER bajo ADR-056 §2.

**Mecanismo: un class-token, no un token de color nuevo.**

- **Nombre:** `modalPanelEdgeClassName`
- **Valor:** `'border-gray-200 dark:border-iwana-neutral-600'` — solo el par de color; la
  geometría (`border-l` vs `border`, `rounded-2xl`) queda en el consumidor
- **Ubicación:** `packages/ui/src/components/ModalLayer.tsx`, exportado desde `@iwana/ui`
- **`globals.css` no cambia. Cero líneas.** Es la prueba de que no hay token nuevo

Descartados, con razón: **`--color-modal-border-dark`** embebe dos accidentes en el nombre
(`modal` lo inhabilita para el arreglo no-modal futuro; `dark` mete un tema en el nombre, la
deriva que `--color-veil` eliminó resolviendo por redefinición). **Redefinir `dark-border` por
capa** retargetearía en silencio **611 ocurrencias** y borraría su rol normado de «divisor
decorativo». Y un token de color no puede expresar la regla, porque la regla es un **par** que
difiere por tema.

**Lo que no cambia:** superficie del panel (`dark-surface-2`), filos internos (`dark-border` — la
jerarquía «exterior fuerte / interiores tenues» es lo que evita el efecto wireframe), tema claro,
y `--color-veil`.

## 5. Alcance, y la tensión resuelta

**Aplica a los paneles que consumen `ModalLayer`. No aplica a tarjetas ni paneles en flujo.**

> **Regla de delimitación:** el filo se paga donde hay **superposición**, no donde hay
> **composición**. Una superficie que cubre contenido inerte debe declarar su límite. Una
> superficie que convive en el flujo se separa por layout, espacio y tipografía, y conserva
> `dark-border`.

La justificación no es la aritmética, porque **la aritmética no distingue los casos**: una card
`dark-surface-2` sobre página `dark-surface` **sin velo** da **1.12:1**, *peor* que el 1.24:1 del
caso velado. Lo que distingue es la función:

- WCAG 1.4.11 no cubre literalmente ninguno de los dos: un *UI component* es «una parte percibida
  como un **control único**», y ni el panel ni la card lo son. Aplicarlo al velo ya fue analogía.
- Lo que sí entra literalmente es **«y estados»**: el modal impone estado a los controles de
  fuera, que quedan inertes. Esos sí son componentes en sentido literal, y la única información
  visual de esa inertidad es el velo más el canto del panel. Una card no impone estado a nada.
- 1.4.11 **nunca exige que exista un borde**: exige 3:1 al borde *del que se depende*. Escalar las
  611 ocurrencias produciría un wireframe — un filo a 4.61:1 alrededor de cada tarjeta grita más
  que el contenido que agrupa, y eso viola la regla de hierro por exceso.

**Lo que se sacrifica, explícito:** las cards en flujo se quedan en 1.12:1. Es un defecto real del
sistema —el escalón `surface` → `surface-2` es demasiado pequeño— pero su remedio es la **escala
de elevación**, no escalar bordes. Va en su propio carril a EM-ARCH y **no se contrabandea aquí**.

### Divergencia entre los dos emisores — RESUELTA a favor de extender (2026-09-07)

AI-PROD-UX proponía extender la regla a las superficies flotantes ancladas; AI-DS-OWNER limitó
su veredicto a los paneles de `ModalLayer`. El dato que dirime no lo midió ninguno de los dos:

**Los tres flotantes declaran `dark:bg-dark-surface-2` — el mismo token que el panel modal.**
Cuando un `Select` o un `DropdownMenu` se abre **dentro de un drawer o un diálogo** —el caso
normal, porque viven en formularios— el contraste superficie/fondo es **1.00:1**. Literalmente
el mismo color. El flotante no se distingue del panel que lo contiene, y **no hay velo que
ayude**, porque el velo está debajo del panel, no debajo del menú.

| Caso | Contraste superficie/fondo |
| --- | --- |
| Panel modal sobre fondo velado (el caso que este contrato corrige) | 1.24:1 |
| Flotante sobre página | 1.12:1 |
| **Flotante dentro de un panel modal** | **1.00:1** |

Sus bordes actuales tampoco portan el límite: `Popover` usa `dark-border-2` (**1.36:1**) y
`DropdownMenu` usa `dark:border-gray-700` (**1.54:1**, y además un `gray-*` fuera de la escala
del sistema, contra ADR-056 §2).

**Veredicto: la regla se extiende.** Encaja en la regla de delimitación sin forzarla —un menú
flotante es superposición, no composición— y su caso es *peor* que el que motivó el contrato.
Extenderla es más barato que justificar por qué el caso peor queda fuera.

> **Corrección del 2026-09-07:** se afirmó que el menú de `Select` no tenía variantes dark y era
> blanco en oscuro. **Es falso**: declara `dark:bg-dark-surface-2/98` y `dark:border-dark-border`.
> El error vino de una inspección truncada de la línea. No hubo prerrequisito: fue una
> sustitución más. Lo que sí conserva es `dark:ring-white/10`, el anillo sin efecto medible que
> AI-PROD-UX citó como precedente vivo del fallo del «anillo sutil» (compone `#575757`, 2.20:1).

## 6. Gobernanza

- **Carril rápido de DS-OWNER, congelado aquí:** el emparejamiento, el class-token, su ubicación
  y la lista de migración. Cero valores nuevos, cero tokens de marca tocados.
- **EM-ARCH → CTO:** el texto de la fila 3 de ADR-056 §2, que hoy dice «borde que identifica un
  **control**». Extenderlo a **capas** amplía el alcance de la fila. Enmienda ligera, no ADR
  nuevo: el valor no cambia. Texto propuesto en el veredicto de DS-OWNER, listo para pegar.
- **Nota para EM-ARCH:** la regla 1 de esa misma tabla prohíbe `neutral-600` sobre `surface-3` y
  `-4`, pero es una prohibición **de texto** (umbral 4.5:1; da 4.16:1). Para **borde** el umbral
  es 3:1 y pasa. Conviene que la fila 1 diga «texto» explícitamente para que no se lea como
  conflicto.

## 7. Ejecución

### Prerrequisito bloqueante — paneles rotos antes que su borde

No migrar hasta corregir: especificar un borde sobre una superficie inexistente no arregla nada.
**Verificado por grep: `--color-dark-bg` y `--color-dark-surface-1` no existen en `globals.css`**
(6 usos en código). En Tailwind v4 CSS-first la clase no se emite, así que el panel queda
**blanco en modo oscuro** — confirmado por medición en navegador en el drawer de Inventario.

| Ruta | Defecto |
| --- | --- |
| `inventory/StockItemDetailDrawer.tsx:128` | `bg-white` **sin ninguna variante dark**, sin borde |
| `crm/subscribers/ContractDetailDrawer.tsx:412` | `dark:bg-dark-bg` — token inexistente |
| `scheduling/PendingVisitRequestDetailPanel.tsx:529` | `dark:bg-dark-surface-1` — inexistente. Además `relative z-10`: **z literal en capa modal, prohibido por ADR-075 §2** |
| `scheduling/VisitRequestRecommendationPanel.tsx:588` | `dark:bg-dark-surface-1` |

Más 3 usos no modales del token fantasma (`VisitRequestRecommendationPanel.tsx:1193`,
`WeeklyTechnicianMatrix.tsx:380` y `:419`). **Es un ticket propio, P1, no parte de este contrato.**

Que `audit-ui.mjs` no lo detectara —una clase `dark:bg-*` que no resuelve a ningún token— es una
regla determinista que hay que añadirle, junto con la de este contrato (panel con `role="dialog"`
+ `aria-modal` cuyo root declare `dark:border-dark-border` o carezca de borde).

### Grupo A — sustitución directa (`dark:border-dark-border` → class-token)

`OperationalSidePeek.tsx:148` (empezar aquí: valida el patrón) · `portal-ui.tsx:1782`
(`PortalSidePeek`) · `InventorySideDrawerShell.tsx:75` · `InventoryCreateProductDialog.tsx:334` ·
`SupplierFormDrawer.tsx:472` · `AssuranceTicketDrawer.tsx:186` · `Dialog.tsx:365`
(**último: 46 consumidores**).

### Grupo B — el panel no tiene borde; hay que añadirlo

`CreateContractDialog.tsx:290` y `ConvertExpedienteToContractDialog.tsx:118`. Riesgo medio:
cambio visible **también en claro**, porque hoy no hay línea. Y `Sidebar.tsx:430` declara
`dark:border-transparent` explícito.

### Dónde se nota peor — el hallazgo de diseño

**Los diálogos centrados están peor que los drawers laterales, con la misma aritmética.** Un
drawer va a hueso contra tres bordes del viewport y ocupa el alto completo: su silueta se lee por
posición, y el marco del monitor hace de límite implícito. Un diálogo centrado es una **isla** que
necesita cuatro cantos, y sus esquinas `rounded-2xl` son justo donde el ojo busca el límite: sin
contraste, la esquina se lee como mancha y el panel «sangra» hacia el fondo.

Orden por módulo: **CRM (diálogos centrados sin borde) › Inventario › Comercial/Aseguramiento** —
no el que sugería el planteamiento inicial.

> Nota de nomenclatura, para no repartir mal el trabajo: `InventoryCreateProductDialog`
> **no es un diálogo**; es un drawer lateral (`border-l`, `align="end"`).

## 8. Criterios de aceptación visual

- El límite del panel es discernible sin mover el ratón, en oscuro, en monitor no calibrado a
  brillo bajo.
- Ningún filo interno del panel compite con el exterior.
- Ninguna superficie fuera de una capa modal cambia de aspecto.
- El panel sigue leyéndose como superficie oscura, no como plancha gris.
- Captura en navegador de **al menos un diálogo centrado y un drawer**, en ambos temas, antes de
  cerrar.


---

## 9. Ejecución — cerrada el 2026-09-07

### El class-token se renombró al ejecutar

`modalPanelEdgeClassName` → **`overlayEdgeClassName`**. Al extender la regla a los flotantes, el
nombre anterior pasaba a nombrar **un mueble** (`modalPanel`) para una regla que gobierna una
**relación** (superposición). Es exactamente el defecto que la enmienda C-DS-04 corrigió en la
escala `--z-*` unas horas antes; repetirlo aquí habría sido no aprender nada. 11 archivos.

### Lo aplicado

| Fase | Alcance |
| --- | --- |
| Prerrequisito — superficies rotas | 4 paneles modales + 3 controles. **Cero** usos de `--color-dark-bg` y `--color-dark-surface-1` en el árbol |
| `relative z-10` en capa modal (`PendingVisitRequestDetailPanel`) | retirado — violaba ADR-075 §2 |
| Class-token | `overlayEdgeClassName` en `ModalLayer.tsx`, exportado desde `@iwana/ui`. **`globals.css`: cero líneas de token** |
| Grupo A — 7 paneles con borde | migrados; `Dialog` (46 consumidores) el último |
| Grupo B — 3 paneles sin borde | ganan la clase: `border` en los diálogos centrados, `border-l` en el drawer |
| **Flotantes** — `Popover`, `DropdownMenu`, `Select` (menú) | migrados. `DropdownMenu` además abandona `dark:border-gray-700`, que estaba fuera de la escala del sistema |

**Geometría por tipo, no uniforme:** diálogos centrados y menús llevan borde completo; los
drawers laterales solo `border-l`. Es la lectura del hallazgo de AI-PROD-UX — un drawer se lee
por posición contra los bordes del viewport; una isla necesita sus cuatro cantos.

**Los controles con token fantasma fueron a `dark-surface-3`, no a `-2`:** la escala asigna `-2`
a paneles y `-3` a inputs, botones y dropdowns. Con `-2` habrían quedado al mismo valor que el
panel que los contiene — el mismo 1.00:1 que motivó extender la regla a los flotantes.

### Documentos actualizados

| Documento | Cambio |
| --- | --- |
| `docs/adrs/ADR-056-Integridad-Base-Normativa-Diseno.md` | Fila 3 reescrita por relación; fila 1 precisada («prohibición **de texto**», umbral 4.5:1, frente al umbral 3:1 del borde — sin eso las dos filas se leían como contradictorias); nota de enmienda con el molde de las de ADR-075 |
| `packages/ui/src/styles/globals.css` | La nota del bloque dark cita la regla ampliada y el vehículo |
| `packages/ui/src/components/ModalLayer.tsx` | Docblock del class-token, con la aritmética de los dos casos |

### Verificación

| Gate | Resultado |
| --- | --- |
| `pnpm exec jest --ci` (`apps/portal`) | 238 suites / **2102 pasados + 1 skipped** |
| `pnpm exec jest --ci` (`packages/ui`) | 4 suites / 30 pasados |
| `pnpm exec jest --ci` (`apps/web`) | 36 suites / 229 pasados |
| `tsc --noEmit` en los tres paquetes | exit 0 |
| `eslint` (`apps/portal`) | 0 errores, 46 warnings preexistentes |
| `pnpm audit:adr-citations` | **0 bloqueantes** |
| `audit-ui.mjs` sobre lo tocado | P0 0 · P1 0 · P2 0 |

### Criterio de aceptación visual — cerrado el 2026-09-08

Verificado en navegador (Chrome 148), sesión autenticada real, `localhost:3002`:

| Caso | Verificación |
| --- | --- |
| **Menú `Select` abierto dentro de un drawer** (Comercial → Nuevo plan → Tecnología) — el caso de 1.00:1 que motivó extender la regla a los flotantes | Borde computado `rgb(138, 138, 138)` = `#8A8A8A` exacto. **Contraste real medido: 6.08:1** contra la superficie del propio menú (supera el 4.61:1 teórico porque la opacidad `/98` reduce la luminosidad de fondo). El menú se distingue con claridad del panel que lo contiene |
| **Diálogo centrado sin borde previo** (`ConvertExpedienteToContractDialog`, CRM → Convertir a contrato) — el peor caso identificado por AI-PROD-UX | Ahora `border` completo + `dark:border-iwana-neutral-600`. Se lee como una isla nítida sobre el fondo velado; antes sus esquinas `rounded-2xl` sangraban hacia el fondo |
| **Mismo diálogo en tema claro** | Borde computado en gris muy claro (`lab(91.6 …)`, equivalente a `border-gray-200`) — remate suave, sin cambio visual perceptible respecto al comportamiento anterior. Confirma que el par portador en claro sigue siendo superficie/fondo velado, no el borde |

Los tres casos cubren la matriz completa: panel modal + flotante anidado, diálogo centrado
migrado desde cero borde, y verificación de que claro permanece intacto.
