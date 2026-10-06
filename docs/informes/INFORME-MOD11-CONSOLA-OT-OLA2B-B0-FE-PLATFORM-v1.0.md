# Informe B0 — Seam y expediente por momento de la consola de OT (Ola 2b)

- **Versión:** 1.0
- **Fecha:** 2026-10-05
- **Agente:** AI-FE-PLATFORM (`fe-platform`)
- **Encargo:** `docs/prompts/PROMPT-MOD11-CONSOLA-OT-OLA2B-B0-FE-PLATFORM-v1.0.md`
- **Contratos consumidos:** UX `docs/specs/2026-10-05-mod11-consola-ot-requisito-ux.md` v1.1 (§3.2, §4, §4.1, §9) · componente `docs/specs/2026-10-05-mod11-consola-ot-requisito-contrato-componente.md` v1.0 (§2, §3.1, §3.2, §4, §5) · API `execution-orders.ts` v1.4 y `execution-orders-completion.ts` v1 · dictamen G3 §3, §7 y §8.
- **Sin commit.** Rama `main`, sin ramas ni worktrees. No se tocó `apps/api` ni `apps/worker`.

## 1. Dictamen

**GO** (§5 del encargo). Los seis criterios de GO se cumplen y ninguno de los dos de NO-GO se da. Hay **tres decisiones de contrato que el orquestador debe ratificar** (§7 de este informe); no condicionan el GO, pero dos de ellas cambian una expectativa de test existente y deben quedar a la vista.

| Criterio GO | Estado | Evidencia |
| --- | --- | --- |
| CA-10 se cumple | Cumple. Faltaba un tramo (copy de bloqueada y leyenda de desbloqueo); corregido | §3 |
| Checklist como índice con sus cuatro estados | Cumple | §4 |
| Acción `ACTIVITY` completa | Cumple | §4 |
| Slots de evidencia y consumo funcionan como antes | Cumple: el contenido de ambos se movió a sus archivos sin reescribirlo | §2.3 y §6 |
| Suites que no deben debilitarse, en verde | Cumple | §6 |
| El informe declara los archivos de R2, R3, R4 y E4-portal | Cumple | §5 |

| Criterio NO-GO | Estado |
| --- | --- |
| Se pierde funcionalidad existente | No. Las desviaciones deliberadas están listadas en §2.4 |
| R2, R3 o R4 tendrían que editar el shell o la fachada | **Era cierto al recibir el trabajo y ya no lo es.** §2.1 explica por qué y §2.2 qué cambió |

## 2. Evaluación del corte (problema 1)

### 2.1 Diagnóstico honesto

Al recibirlo, `ExecutionOrderDrawer.tsx` estaba vacío pero **el drawer entero se había movido a `ExecutionOrderMomentContainer.tsx` (2147 líneas)**. La extracción de `RequirementChecklist`, `RequirementActionSheet` y los archivos de slot existía, pero no cumplía el GO por tres razones verificadas en el código:

1. **Los slots eran un envoltorio vacío.** `ExecutionOrderEvidenceAction` y `ExecutionOrderMaterialAction` recibían `body: ReactNode`, y ese `body` lo fabricaban `renderEvidence` y `renderMaterial` **dentro del contenedor**. R2 y R3 habrían tenido que editar el contenedor para sacar su formulario de ahí. Es exactamente lo que el NO-GO prohíbe.
2. **El estado de cada formulario vivía en el contenedor** (actividad, material, cierre: unos 25 `useState`), y la hoja delegaba el submit en handlers del contenedor.
3. **El adaptador del hook conocía la política de custodia**: aplicaba él mismo los resultados de inventario y custodia y paginaba la custodia. R3 solo habría podido sustituirla fingiendo resultados vacíos (el test de costura lo hacía literalmente).

### 2.2 Qué se separó

El contenedor pasa de **2147 a 223 líneas** y solo compone. Cada slot es ahora un archivo con su contenido real:

| Responsabilidad | Archivo | Propietario |
| --- | --- | --- |
| Composición: estados de la vista, resumen, compromiso, índice, cierre | `ExecutionOrderMomentContainer.tsx` (223) | B0 |
| Índice: monta checklist, hoja y el slot que toca a cada tipo de requisito | `ExecutionOrderRequirementIndex.tsx` (154) | B0 |
| Momento y autorización de la acción (`admitsCapture`, `canInteract`, `resolveRequirementAction`) | `execution-order-moment.ts` (84) | B0 |
| Contrato de props de los slots | `execution-order-slots.ts` (69) | B0 |
| Bloque Compromiso y copy por lente | `ExecutionOrderCommitmentSection.tsx` (166) | B0 |
| Cierre y estado de su formulario | `ExecutionOrderCloseSection.tsx` (341) + `use-execution-order-close-form.ts` (250) | B0 |
| Actividad: captura e historial | `ExecutionOrderActivityAction.tsx` (357) | B0 |
| Evidencia: captura e historial | `ExecutionOrderEvidenceAction.tsx` (227) | **R2** |
| Consumo: captura, vista de custodia e historial | `ExecutionOrderMaterialAction.tsx` (493) | **R3** |
| Política de custodia e inventario | `use-execution-order-custody.ts` (216) | **R3** |
| Subida de evidencia y sondeo del análisis | `use-execution-order-evidence.ts` (137) | **R2** |
| Política de refresco | `use-execution-order-refresh.ts` (41) | **R4** |

Cambios de fondo, no solo de ubicación:

- **Los slots ya no reciben `body`.** Reciben un sobre uniforme `{ order, requirement, context, action?, bindSubmit?, onClose? }` donde `context` es el contrato público del drawer. Un slot que necesite un dato nuevo lo lee de `context` sin que el shell cambie.
- **El submit nativo de la hoja se enlaza con `bindSubmit`.** El estado del formulario vive en el slot y la hoja no conoce sus campos. Se conservó el comportamiento de `RequirementActionSheet` y su spec sin cambios.
- **El adaptador delega la política de custodia en dos fases:** `loadOnOpen(detalle)` carga y devuelve la función que aplica el resultado; el adaptador la ejecuta solo si la respuesta no es tardía y el detalle llegó, de modo que el estado se confirma en un único lote como antes. También delegan `markUnavailable`, `reset`, `openAction` y `loadMore`. Un slot sin carga al abrir devuelve `() => undefined`.
- **El borrador del cierre vive en un hook que monta el shell**, porque el cuerpo del drawer se desmonta mientras la orden se vuelve a leer y, sin esto, escribir en la actividad habría borrado un resumen de cierre a medio escribir.

**El adaptador sigue en 604 líneas** (703 antes). No es una omisión: es el cuerpo del hook que ya existía (756 líneas en `HEAD`) menos las políticas extraídas, y ningún bloque posterior lo edita (R4 sustituye `use-execution-order-refresh.ts`, no el adaptador). Queda deuda menor: los seis handlers de mutación repiten el mismo `try/catch` y admiten un auxiliar. No se hizo porque no es necesario para el contrato y tocaría la política de refresco que es de R4.

### 2.3 `[CONSULTA]`

**Ninguna.** Ningún formulario necesitó reescribirse: actividad, material, evidencia y cierre se movieron verbatim.

### 2.4 Desviaciones deliberadas respecto del comportamiento previo

1. Se retiró el botón «Ocultar» del formulario de actividad: llamaba a un estado (`setActivityFormExpanded`) que ya nadie leía, no hacía nada. La hoja ofrece «Cancelar».
2. Los avisos «Inicia la ejecución para registrar…» dentro de actividad, material y evidencia eran inalcanzables (la captura solo existe en progreso) y se retiraron. El aviso del compromiso («Inicia la ejecución para habilitar el checklist») se conserva.
3. El guardián de evidencia deja de depender del primer requisito `EVIDENCE` global: cada acto valida la clave de **su** requisito.
4. Con la hoja abierta y la red caída, el formulario queda visible y deshabilitado por la hoja (contrato de componente §5) en lugar de desaparecer.
5. El borrador del cierre se descarta al cambiar de orden o cerrar el drawer; antes se arrastraba a la OT siguiente.
6. Código muerto retirado: `requirementIcon`, `requirementsDegraded`, `activityType` de estado.

## 3. CA-10: matriz de 4 momentos × 3 lentes (problema 2)

La regla vive en un único punto, `execution-order-moment.ts`:

- `admitsCapture(order)`: solo en progreso, en sincronía y con `allowedActions` publicado.
- `resolveRequirementAction(order, requirement)`: la acción nace del requisito y solo si `admitsCapture` y `allowedActions` la autorizan.
- Defensa doble: aunque el descriptor existiera, el checklist en pre-inicio, bloqueada y terminal está en modo `readonly` y no pinta botones.

**Hallazgo corregido (CA-10, adenda A1).** El código aún mostraba los tres textos de bloqueada de OLA 1 que piden «revisar el motivo», que UX §2 y §5 sustituyen, y la leyenda «Desbloqueo no disponible» solo aparecía si el cliente cableaba un handler `onUnblock` que **en producción nunca se cablea**. Ahora:

| Lente | Copy de bloqueada (UX §5) |
| --- | --- |
| Ejecutor (con o sin asignación) | «La orden está bloqueada. Contacta a supervisión para acordar cómo continuar.» |
| Supervisión | «La orden está bloqueada. Coordina con el equipo de campo el siguiente paso.» |

Ningún texto alude a un motivo. «Desbloqueo no disponible» aparece si y solo si `allowedActions` incluye `UNBLOCK`, y no se crea captura de motivo.

**Pruebas añadidas** (no existían):

- `execution-order-moment.spec.ts` (34): los 9 estados del contrato caen en exactamente un momento; `admitsCapture` y `resolveRequirementAction` por estado; FIELD, MEASUREMENT y COMPLIANCE sin variante de captura; sin `allowedActions` o fuera de sincronía no hay captura. Se verificó por mutación: forzar `admitsCapture` a `true` hace caer 16 casos.
- `ExecutionOrderMomentContainer.spec.tsx` (56): las 12 celdas (cuatro momentos × tres lentes, con los 3 estados de pre-inicio y los 4 terminales). En cada una: índice de 5 requisitos, ningún `input[type=file]`, ningún formulario, ninguna custodia montada; en progreso con registro permitido, los 5 disparadores; aunque llegue un permiso de registro en pre-inicio, bloqueada o terminal, no se monta captura.

## 4. Checklist y ACTIVITY (problema 3)

**Checklist con cuatro estados.** `getRequirementChecklistItems` cruza la clave del snapshot con `completion.requirements[]`. Verificado en el drawer: «Cumplido» (también si es opcional), «Pendiente» con su razón, «Sin registrar» (opcional pendiente, con la ayuda fija de UX §5) y «Estado no disponible» (ausencia de evaluación o de `requirements`, sin convertirla en pendiente ni abrir acción). Orden y etiqueta literal del snapshot, incluido el «NO» en mayúsculas. La acción de cada fila existe solo si `allowedActions` la autoriza: con solo `REGISTER_EVIDENCE` hay 3 botones y ninguno de actividad ni de material.

**ACTIVITY completa.** La hoja abre con el tipo preseleccionado desde el requisito y bloqueado; registra con `{ activityType, description }` (más `measurements` si marca novedad) por botón y por Enter; cierra al éxito y conserva lo escrito si falla. El historial queda **bajo su requisito** y solo trae actividades de su tipo; modificar y eliminar solo se ofrecen con `REGISTER_ACTIVITY` y momento en progreso. Cubierto en `ExecutionOrderMomentContainer.spec.tsx`.

## 5. Propiedad de archivos para R2, R3, R4 y E4-portal

**R2** (evidencia y firma): `ExecutionOrderEvidenceAction.tsx`, `ExecutionOrderSignatureCapture.tsx` (nuevo), `use-execution-order-evidence.ts`, los wrappers de evidencia/media de `apps/portal/src/lib/api-client.ts` si hacen falta (el GET `getEvidenceAsset` ya existe) y sus pruebas propias.

**R3** (consumo y custodia): `ExecutionOrderMaterialAction.tsx`, `use-execution-order-custody.ts` y sus pruebas propias.

**R4** (refetch): `use-execution-order-refresh.ts` y sus pruebas propias.

**E4-portal** (ventana nula): `ExecutionOrdersTable.tsx`, `ExecutionOrderSummary.tsx`, `execution-order-window-copy.ts` si hace falta, y `ExecutionOrdersTable.spec.tsx` / `ExecutionOrderSummary.spec.tsx`. **Aviso:** B0 tocó `ExecutionOrderSummary.tsx` solo para la consolidación de copy (el import de `syncCopy` y `toSummarySyncState` desde `execution-order-sync-copy.ts` y `detailSyncState`). E4-portal debe partir de ese estado y limitarse a la presentación de la ventana.

**De B0, que nadie más edita** (un cambio aquí es `[CONSULTA]` a B0): `ExecutionOrderDrawer.tsx`, `use-execution-order-console.ts`, `use-execution-order-console-adapter.ts`, `ExecutionOrderMomentContainer.tsx`, `ExecutionOrderRequirementIndex.tsx`, `execution-order-slots.ts`, `execution-order-console-types.ts`, `execution-order-moment.ts`, `execution-order-actions.ts`, `RequirementChecklist.tsx`, `RequirementActionSheet.tsx`, `ExecutionOrderCommitmentSection.tsx`, `ExecutionOrderCloseSection.tsx`, `use-execution-order-close-form.ts`, `ExecutionOrderActivityAction.tsx`, `execution-order-sync-copy.ts`, `execution-order-requirements.ts` y `execution-order-commitment-copy.ts`.

**Ubicación de las pruebas.** Las de los flujos de evidencia y consumo siguen en `ExecutionOrderDrawer.spec.tsx` (integración a través del shell, que no cambió de contrato) y las de la subida/sondeo en `use-execution-order-console.spec.ts`. R2 y R3 crean sus pruebas unitarias y **pueden mover** los casos que correspondan a su archivo, no borrarlos.

## 6. Contrato de props de cada slot

Fuente: `apps/portal/src/components/operations/execution-order-slots.ts`. `context` es `Readonly<ExecutionOrderDrawerProps>`. Ninguna prop transporta usuario, rol ni responsable; el permiso ya viene resuelto en el descriptor.

```ts
// Todos los slots
{ order: ExecutionOrderDetailResponse;            // no nulo al montarse
  requirement: Extract<ExecutionOrderTemplateRequirement, { kind: K }>;
  context: ExecutionOrderSlotContext }

// Captura: se monta dentro de RequirementActionSheet solo con descriptor autorizado
& { action: Extract<RequirementActionDescriptor, { kind: A }>;
    bindSubmit: (handler: (() => void | Promise<void>) | null) => void;
    onClose: () => void }   // cierra la hoja y devuelve el foco al disparador
```

### 6.1 Slot de evidencia (R2)

| Export | Sobre | Se monta |
| --- | --- | --- |
| `ExecutionOrderEvidenceAction` | `CaptureSlotProps<'EVIDENCE','evidence'>`; `action = { kind:'evidence', requirementKey, evidenceType, action:'REGISTER_EVIDENCE' }` | En la hoja, solo en progreso con `REGISTER_EVIDENCE` |
| `ExecutionOrderEvidenceHistory` | `HistorySlotProps<'EVIDENCE'>` | Bajo el requisito, en todo momento posterior al inicio, también en lectura |

Lee de `context`: `onUploadEvidence`, `isSubmitting`, `isAnalyzingEvidence`, `offline`, `error`, `evidence`, `evidenceMeta`, `evidenceState`, `isLoadingMoreEvidence`, `onLoadMoreEvidence`, `onRefreshDetail`.

`onUploadEvidence` es `ExecutionOrderEvidenceUploadHandler = (file, requirementKey, options?: { evidenceType? }) => Promise<void | boolean>`, tipo exportado por `use-execution-order-evidence.ts`. **R2 es dueño de ese tipo**: el drawer lo importa de ahí, así que R2 puede ampliar `options` (por ejemplo, para reanudar el registro del mismo `mediaAssetId`) sin editar el tipo público. B0 no consume `options`: sigue derivando el tipo del MIME, que es un defecto que R2 debe cerrar para cumplir «ese `evidenceType`». La función que devuelve el hook debe ser asignable a ese tipo.

Estado «Analizando archivo»: lo provee el hook por `setIsAnalyzingEvidence` y llega al slot por `context.isAnalyzingEvidence`. El sondeo del hotfix (`f1348c64`) sigue intacto en el hook.

### 6.2 Slot de consumo (R3)

| Export | Sobre | Se monta |
| --- | --- | --- |
| `ExecutionOrderMaterialAction` | `CaptureSlotProps<'MATERIAL','consumption'>`; `action = { kind:'consumption', requirementKey, itemCategory, finalDisposition?, action:'REGISTER_ITEM_USAGE' }` | En la hoja, solo en progreso con `REGISTER_ITEM_USAGE` |
| `ExecutionOrderMaterialHistory` | `HistorySlotProps<'MATERIAL'>` | Bajo el requisito, también en lectura |

Lee de `context`: `itemOptions`, `itemsState`, `custodyOptions`, `executorCustodyState`, `executorCustodyName`, `executorCustodyAssets(+Meta)`, `executorCustodyBalances(+Meta)`, `isLoadingMoreExecutorCustody`, `onLoadMoreExecutorCustody`, `onRegisterItemUsage`, `isSubmitting`, `onRefreshDetail`, `itemUsage(+Meta)`, `isLoadingMoreItemUsage`, `onLoadMoreItemUsage`. El slot enlaza su formulario con `bindSubmit` desde un efecto (`bindSubmit(submit)` y limpieza con `bindSubmit(null)`).

**Política de custodia** (`use-execution-order-custody.ts`): `useExecutionOrderCustody(context)` recibe los setters de estado (`setInventoryState`, `setCustodyState`, `setCustodyName`, `setAssets`, `setAssetsMeta`, `setBalances`, `setBalancesMeta`, `setItemOptions`, `setCustodyOptions`, `setError`, `setLoadingMore`), los valores vigentes (`selectedExecutionOrder`, `assetsMeta`, `balancesMeta`, `isLoadingMore`, `requestSequence`) y devuelve `{ loadOnOpen, markUnavailable, reset, openAction, loadMore }`. **El objeto devuelto debe ser referencialmente estable** (el adaptador lo usa como dependencia de `useCallback`); la implementación de B0 lo hace con una referencia al último contexto. La carga bajo demanda de R3 nace en `openAction(action)`, que recibe `{ kind: 'consumption', ... }` al abrir la hoja y `null` al cerrarla.

### 6.3 Slot de actividad (B0, completo)

`ExecutionOrderActivityAction` y `ExecutionOrderActivityHistory`, mismo sobre. Nadie más lo posee.

### 6.4 Slot de refresco (R4)

`useExecutionOrderRefresh(context)` devuelve `(executionOrderId, mutation: 'start'|'activity'|'consumption'|'evidence'|'close') => Promise<void>`. El contexto incluye `openExecutionOrder`, `selectedExecutionOrder`, los setters por recurso (`setDetail`, `setActivities(+Meta)`, `setItemUsage(+Meta)`, `setEvidence(+Meta)`), los estados por recurso (`setLoadingDetail`, `setEvidenceState`, `setLoadingActivities`, `setLoadingItemUsage`, `setLoadingEvidence`), `setError`, `setSuccess`, `requestSequence`, `activeConsumptionRequirement` (descriptor del consumo abierto, o `null`) y `refreshOpenCustody()`. **B0 no cambió la política: el slot sigue llamando a `openExecutionOrder` (refresco completo).**

## 7. Decisiones de contrato que el orquestador debe ratificar

1. **Copy de bloqueada según UX §5.** Cambia `execution-order-commitment-copy.ts` y obliga a modificar `execution-order-commitment-copy.spec.ts`: la aserción previa (`/retoma la ejecución desde esta pantalla/`) pertenece al texto que UX v1.1 sustituye. La nueva es **más estricta**: compara las dos cadenas exactas y comprueba que ninguna menciona «motivo».
2. **«Desbloqueo no disponible» sin depender de `onUnblock`.** UX §4/§5 y la adenda A1 lo condicionan solo a `allowedActions`. El test `does not render block or unblock controls without real handlers` de `ExecutionOrderDrawer.spec.tsx` afirmaba lo contrario y se invirtió: ahora comprueba que con `UNBLOCK` ofrecido la leyenda aparece sin handler, que sin `UNBLOCK` no aparece y que nunca hay un botón ficticio. Si se prefiere el comportamiento anterior, es una condición en `ExecutionOrderCommitmentSection.tsx`.
3. **Una sola fuente para el copy de sincronización.** El drawer decía «Error de sincronización» para `FAILED` y el resumen «No pudimos sincronizar la orden». Quedó el segundo (`execution-order-sync-copy.ts`). Ningún test afirmaba el texto anterior. Lo hizo la sesión previa de B0; lo verifiqué y lo dejo a la vista.

Además, en `ExecutionOrderDrawer.spec.tsx` hay **10 casos retirados o reescritos** respecto de `HEAD` (89 bloques `it` antes, 91 ahora). Todos corresponden a lo que G3 §8 declara que cambia con el contrato: «renders the 6 blocks», el toggle de actividad replegada (4 casos), los hints de pre-inicio (2), la custodia visible en pre-inicio, y los dos de bloqueada de arriba. Cada uno tiene su sustituto en `ExecutionOrderDrawer.spec.tsx` o en `ExecutionOrderMomentContainer.spec.tsx`. Las suites de payloads, gate de cierre, offline y no-persistencia en storage no perdieron ningún caso.

## 8. Consolidación de copy (problema 4)

- **Tipo de requisito.** `REQUIREMENT_KIND_LABELS` seguía como mapa interno de `execution-order-requirements.ts`; **cumplía en el fondo, pero con tipo laxo** (`Record<string,string>`, consultado con `[kind] ??`, que ante un `kind` como `constructor` devolvía una función heredada de `Object.prototype`). Ahora es privado, tipado por `ExecutionOrderTemplateRequirement['kind'] | 'OTHER'`, y se accede **solo** por `requirementKindLabel`, que cae en «Requisito pendiente» ante cualquier clave ajena. La función de etiqueta visible `requirementLabel`, que vivía en el contenedor, pasó a ser `templateRequirementLabel` en el mismo módulo; el checklist y `productRequirementLabel` (errores de cierre) la consumen.
- **Sincronización.** `syncStateCopy` ya no existe; `syncCopy` y `toSummarySyncState` viven en `execution-order-sync-copy.ts` y los consumen el resumen y el drawer.
- **Formato de fecha.** El contenedor tenía su propio `dateFormatter`; ahora todo usa `formatTaskDateTime` de `operations-labels.ts`. Equivalente (`es-CO`, medio/corto, raya en vacío o inválido).
- **Garantía estructural.** `execution-order-copy-sources.structure.spec.ts` (4 casos) falla si alguien declara de nuevo un mapa paralelo: lee las fuentes de `operations/` y exige que cada texto exista en un único archivo.

## 9. Gates (problemas 5 y 8)

| Gate | Resultado |
| --- | --- |
| `pnpm --filter portal typecheck` | Verde |
| `eslint src/components/operations` | Sin hallazgos |
| `node .agents/skills/iwana-identity-ui-review/scripts/audit-ui.mjs apps/portal/src/components/operations` | «sin hallazgos» |
| Jest `components/operations --no-cache` | **35 suites, 507 tests, 0 fallidos, 0 omitidos** |
| Jest completo del portal `--no-cache` | 279 suites, 2646 pasados, 1 omitido, 0 fallidos |
| `pnpm sync:agents:check` | OK (8 agentes) |

- **Conteo.** La auditoría de hoy dio 383 (piso 372). Final: **507**. Suman: `execution-order-moment.spec.ts` 34, `ExecutionOrderMomentContainer.spec.tsx` 56, `ExecutionOrderSlots.contract.spec.tsx` 4, `execution-order-sync-copy.spec.ts` 6, `execution-order-copy-sources.structure.spec.ts` 4, más los casos nuevos de la costura (5, eran 3) y de `execution-order-requirements.spec.ts`. No hay reubicaciones que descontar: ningún test se movió a otro archivo.
- **`Cached: 0`.** Jest no imprime ese campo (es de turbo); se ejecutó con `--no-cache` directamente, sin turbo, de modo que el conteo es de ejecución real. Las tres fallas que aparecieron a mitad del trabajo (una prueba nueva de la costura sin `ApiError` en su doble, y las dos de contrato de §7) están resueltas.
- **Suites que no se debilitan**, en verde: `ExecutionOrderConsolaOtOla1Regression.spec.tsx` (7), `ExecutionOrderDrawerCommitment.spec.tsx` (12), `ExecutionOrderExperience.spec.tsx` (12). Sus únicas diferencias con `HEAD` son los nombres que el contrato cambia («Checklist de instalación» por «Requisitos», «Requerido» por «Obligatorio»), sin tocar una aserción de comportamiento.
- **`TaskForm.spec`:** no reapareció «UNKNOWN: unknown error, read» en ninguna de las corridas en frío (parcial, operations y portal completo).

## 10. Evidencia en navegador (problema 7)

- **Qué se hizo.** Playwright (chromium) contra el **dev server real del portal en `127.0.0.1:3002`** (el ya levantado; HMR aplicó los cambios) con la API **simulada** mediante `page.route` y las fixtures del propio E2E (`e2e/tests/helpers/consola-ot-fixtures.ts`). Los dos E2E de B0 y los dos de OLA 1 pasan (4 de 4).
- **Capturas** (`docs/quality/mod11-ola2b/`): `b0-navegador-preinicio.png` (OT `ASSIGNED`: «Iniciar ejecución», requisitos de lectura, sin formularios), `b0-navegador-en-progreso.png` (checklist con estado y acción por requisito) y `b0-navegador-actividad-abierta.png` (hoja inline de actividad con el tipo «Instalación» preseleccionado y bloqueado, un solo `dialog`).
- **No verificado:** contra el **backend real** con sesión iniciada. Hacerlo exige credenciales de un usuario del tenant y no las hay en las semillas del repo; no las introduje ni las busqué fuera de ellas. Las dos capturas `b0-real-*.jpg` que existían eran anteriores a este cierre y no verifican los cambios, así que se retiraron.

## 11. Artefactos temporales (problema 6)

Antes de borrar se confirmó, para cada objetivo, que lo generó B0:

| Objetivo | Prueba de que es de B0 | Acción |
| --- | --- | --- |
| `apps/portal-b0-browser/` | Copia de `apps/portal/src` (no enlace), nombre `@iwana/portal-b0-browser`, fechas 5-oct 17:42-17:56, sin referencia en `pnpm-lock.yaml`, `pnpm-workspace.yaml` ni `turbo.json`; solo la citaba `e2e/playwright.b0.local.config.ts`. Además contaminaba el `pnpm typecheck` global (lo cita `INFORME-MOD11-ORIGEN-OT-E4-DATOS-v1.0.md`) | Borrada |
| Enlaces `portal-b0-browser/node_modules` → `apps/portal/node_modules` y `…/public` → `apps/portal/public` | `find -type l` | **Desenlazados primero** con `rm` sin `-r` y sin barra final; después se verificó que los destinos seguían intactos (`node_modules` 22 entradas antes y después; `public` con `brand` y `leaflet`). Solo entonces se borró el resto |
| `e2e/playwright.b0.local.config.ts` | Untracked; su `cwd` apuntaba a la copia borrada | Borrado. El E2E de B0 pasa con `playwright.portal.config.ts` estándar |
| `apps/portal/drawer-b0-results.json`, `operations-b0-results.json` | Salida `--json` de las corridas de B0 (`"--outputFile=…-b0-results.json"` figura en el log) | Borrados |
| `drawer-b0-jest.log`, `operations-b0-jest.log` (raíz, ignorados por git) | Cabecera con los mismos comandos `jest … --outputFile=…-b0-results.json` | Borrados |
| `docs/quality/mod11-b0-preinicio.png`, `mod11-b0-progreso.png` | Los escribía el E2E de B0 con `page.screenshot` | Borrados y **retiradas las dos líneas** del spec para que no vuelvan a escribirse en `docs/` |
| `docs/quality/mod11-ola2b/b0-real-*.jpg` | Previas a este cierre | Borradas; el informe cita solo las tres capturas nuevas |

Efecto lateral corregido: correr el E2E de OLA 1 sobrescribe el archivo versionado `docs/quality/evidencia-OTE-20260828-001.png`. Lo restauré con `git checkout` y queda sin cambios.

## 12. Lo que no pude verificar

- Navegador contra backend real con sesión (§10).
- Que R2, R3 y R4 puedan cumplir su encargo: se demostró **el contrato** con `ExecutionOrderSlots.contract.spec.tsx` (los tres slots reemplazados por dobles que solo conocen el sobre, y el submit nativo llega al manejador que registra el slot) y con la costura del hook, pero no se ejecutó ningún bloque posterior.
- `pnpm lint` y `pnpm typecheck` globales del monorepo: se ejecutaron después en §14.
- Accesibilidad con lector de pantalla real: solo pruebas de rol, nombre accesible, foco y Escape en jsdom.

## 13. Observaciones y deuda nueva

| Severidad | Observación | Dueño sugerido |
| --- | --- | --- |
| Media | `requirementActionLabel` fija el copy de UX §3 por clave de requisito (`service-test`, `work-photo`); en otras plantillas cae en «Adjuntar evidencia». No afecta permisos | B0 si el copy pasa a depender de datos |
| Media | El tipo de evidencia se sigue derivando del MIME (una foto de `service-test` subida como PDF se registra como `DOCUMENT`) | R2 |
| Baja | El historial de evidencia repite la dirección del sitio bajo cada requisito de evidencia (comportamiento previo; el resumen ya la muestra) | R2 |
| Baja | El historial de consumos no se filtra por requisito (`ItemUsage` no trae clave) y se repite bajo cada requisito de material | R3 |
| Baja | `nonRealizationNote` se captura en el cierre pero no viaja en el payload (previo) | B0 / producto |
| Baja | `getRequirementStateText` quedó sin consumidores | B0 |
| Baja | Los handlers de mutación del adaptador repiten el `try/catch` | B0, tras R4 |
| Baja | En la captura, el encabezado «Requisitos» muestra el icono en un recuadro grande que desplaza el título; no es P1 | ds-owner / B0 |

**`[BLOQUEO]`:** ninguno. **`[CONSULTA]`:** ninguna; solo las tres ratificaciones de §7.

## 14. Correcciones posteriores (2026-10-06)

Se cerraron las tres consultas de comportamiento levantadas durante la integración:

| Consulta | Corrección | Evidencia |
| --- | --- | --- |
| Escape con un `Select` abierto cerraba también la hoja | `RequirementActionSheet` respeta `defaultPrevented`: el primer Escape cierra solo el popup y el siguiente cierra la hoja. | `RequirementActionSheet.spec.tsx` |
| Cambiar OT/estado limpiaba la acción local sin avisar al adaptador | El cambio de OT o estado limpia el descriptor y llama `onOpenRequirementAction(null)`. | `ExecutionOrderMomentContainer.spec.tsx` |
| Una mutación tardía publicaba éxito sobre otra OT | Las mutaciones capturan la secuencia de navegación y descartan éxito, error y limpieza tardíos. Evidencia aplica la misma guarda después de su refresco. | `use-execution-order-console.refresh.spec.ts`, `use-execution-order-evidence.spec.ts` |

También quedó corregido el encabezado que contradecía `planned_window_start_at DESC NULLS FIRST, id DESC`, y `ExecutionOrderRecord` admite id de evento y fechas de ventana nulos. `LinkTaskScheduleEventDto.scheduleEventId` sigue obligatorio.

Los límites de evidencia se centralizaron en `@iwana/shared`. La suite fría de `operations/` terminó con 44 suites y 751 tests; la auditoría focalizada de la consola dio cero hallazgos. También terminaron en verde `pnpm test -- --force -- --no-cache` (10 tareas, Cached: 0), `pnpm typecheck --force` (8 tareas, Cached: 0) y `pnpm lint` (8 tareas, cero errores; advertencias existentes en archivos no tocados).

La sesión autenticada del navegador no quedó disponible para esta revisión: el navegador expuesto por CUA no listó ninguna pestaña, aunque el contexto de la interfaz indicaba el portal abierto. No se inició otra sesión ni se modificaron datos. Siguen pendientes la comprobación contra backend real y el lector de pantalla.

Sigue abierta la deuda del historial MATERIAL: `listItemUsage` no devuelve `requirementKey`; el cliente no atribuye registros por inferencia. Resolverlo requiere persistencia y API aditiva, además de una decisión de Producto sobre registros históricos sin procedencia.
