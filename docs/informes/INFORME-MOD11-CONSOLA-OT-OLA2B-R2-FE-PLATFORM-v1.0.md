# Informe R2 — Evidencia y firma de la consola de OT (Ola 2b)

- **Versión:** 1.0
- **Fecha:** 2026-10-05
- **Agente:** AI-FE-PLATFORM (`fe-platform`)
- **Encargo:** `docs/prompts/PROMPT-MOD11-CONSOLA-OT-OLA2B-R2-FE-PLATFORM-v1.0.md`
- **Contratos consumidos:** plan `docs/plans/2026-09-14-mod11-consola-ot-remediacion.md` v1.2 · informe B0 `INFORME-MOD11-CONSOLA-OT-OLA2B-B0-FE-PLATFORM-v1.0.md` §5 y §6 · UX `docs/specs/2026-10-05-mod11-consola-ot-requisito-ux.md` v1.1 §3.1, §5, §9 · componente `docs/specs/2026-10-05-mod11-consola-ot-requisito-contrato-componente.md` v1.0 §3, §5 · dictamen G3 `INFORME-MOD11-CONSOLA-OT-OLA2-G3-FE-PLATFORM-v1.0.md` §2.1–2.3 · API `execution-orders.ts` v1.4 y `execution-orders-completion.ts` v1.
- **Sin commit.** Rama `main`, sin ramas ni worktrees. No se tocó `apps/api`, `apps/worker`, `packages/*` ni `apps/portal/src/lib/api-client.ts` (el GET `getEvidenceAsset` ya existía y el transporte vigente alcanza).

## 1. Dictamen

**GO condicionado.** Todo lo que se puede verificar en este entorno está en verde. La condición del plan sobre el p95 del análisis se cumplió **solo en parte**: la medición es real (worker BullMQ, Redis, PostgreSQL y MinIO reales) pero de un stack local sin carga, no de un entorno compartido (§4). Se emite el `[BLOQUEO]` específico de §12. Aceptar la medición local como cumplimiento de la condición, o exigir la muestra compartida antes del GO final, lo decide AI-EM-ARCH.

| Criterio de GO del encargo | Estado | Evidencia |
| --- | --- | --- |
| CA-08: una evidencia subida desde un requisito queda con **esa** `requirementKey` y **ese** `evidenceType` | Cumple en el portal | `use-execution-order-evidence.spec.ts` (payloads PHOTO, DOCUMENT, SIGNATURE), `ExecutionOrderEvidenceAction.spec.tsx` y E2E en navegador con el cuerpo real del `POST /evidence` |
| CA-09: una firma capturada produce una evidencia `SIGNATURE` que el gate de cierre acepta | Cumple el lado del portal: el PNG real del lienzo se registra con `SIGNATURE` y `CUSTOMER_SIGNATURE`, y es la que `use-execution-order-close-form.ts` ofrece como artefacto de aceptación. **No se ejecutó el gate real del backend** (§13) | E2E y §4 (el PNG del lienzo supera el análisis del worker real 20 de 20) |
| Typecheck, Jest `operations/` sin caché con conteo real, `audit-ui.mjs` limpio, navegador | Cumple | §6 y §7 |
| Condición p95: medir, registrar muestra y método, calibrar el tope | **Parcial** | §4 |
| Sin P1 ni bloqueo pendiente | Sin P1. Un `[BLOQUEO]` abierto, el de §12 | §11 y §12 |

## 2. Entregables

| Archivo | Estado | Contenido |
| --- | --- | --- |
| `apps/portal/src/components/operations/use-execution-order-evidence.ts` | Reescrito | Carga, espera acotada, registro y reanudación por requisito. Tipos públicos del handler |
| `apps/portal/src/components/operations/ExecutionOrderEvidenceAction.tsx` | Reescrito | Slot de captura (foto, documento, firma) y slot de historial por requisito |
| `apps/portal/src/components/operations/ExecutionOrderSignatureCapture.tsx` | Nuevo | Lienzo nativo, PNG, «Limpiar» y «Guardar firma» |
| `apps/portal/src/components/operations/use-execution-order-evidence.spec.ts` | Nuevo | 35 pruebas |
| `apps/portal/src/components/operations/ExecutionOrderSignatureCapture.spec.tsx` | Nuevo | 18 pruebas |
| `apps/portal/src/components/operations/ExecutionOrderEvidenceAction.spec.tsx` | Nuevo | 27 pruebas, 4 de ellas **movidas** (§8) |
| `apps/portal/src/components/operations/execution-order-canvas.test-helper.ts` | Nuevo | Dobles del lienzo y del puntero para specs; no entra en código productivo |
| `e2e/tests/portal-operations-consola-ot-r2.spec.ts` | Nuevo | 5 E2E en Chromium real, backend simulado |
| `docs/quality/mod11-ola2b/r2-navegador-*.png` (5) y `r2-p95-analisis-evidencia.json` | Nuevos | Capturas y resumen de la medición |
| `ExecutionOrderDrawer.spec.tsx` y `ExecutionOrderMomentContainer.spec.tsx` | Editados (B0, solo por el movimiento de §8) | Se retiraron 3 y 1 casos y se ajustó 1 regex |

Sin tocar: drawer, checklist, contenedor, fachada, `use-execution-order-refresh.ts`, material, custodia ni ventana. Las ediciones ajenas del árbol (R3, R4, E4-portal, backend) se conservaron.

## 3. Qué hace ahora el slot

**La acción nace del requisito.** `ExecutionOrderEvidenceAction` llama a `onUploadEvidence(file, action.requirementKey, { evidenceType: action.evidenceType, signal, onOutcome, onRegistered? })`. No hay clave global hardcodeada. El sobre de props de B0 §6.1 no cambió.

**Foto y documento.** Selector de archivo, sin arrastre. `accept` por tipo (foto: solo imágenes; documento: imágenes y PDF). Un solo archivo por vez; tras registrar, el selector se limpia y la hoja sigue abierta (el requisito «Añadir fotos del trabajo» admite varias, una por vez).

**Firma.** Lienzo nativo con eventos de puntero y `canvas.toBlob('image/png')`, sin dependencias. El PNG sale como `File` (`firma-cliente.png`, 800x320, fondo blanco detrás del trazo). Sin trazo no hay firma: no existe campo de nombre escrito (ADR-088 §D4). Tras guardar, la hoja se cierra en cuanto el servidor acepta el registro (`onRegistered`), antes del refresco, porque el refresco puede desmontar el cuerpo del drawer. La captura **no** ejecuta el cierre ni sustituye el registro de conformidad de `close()`.

**Hook** (`useExecutionOrderEvidence`, manejador estable entre renders):

- Registra solo con el asset en `AVAILABLE`. Usa el `expiresAt` del recibo de **su propia** carga y la versión vigente de la orden al registrar.
- **Reanudación sin repetir la carga.** El recibo (`mediaAssetId`, `expiresAt`) se conserva por orden y requisito mientras no haya desenlace terminal. Si la espera se agota, o el registro falla tras `AVAILABLE`, repetir la llamada con el mismo archivo (mismo objeto `File`, o idénticos nombre, tipo, tamaño y fecha de modificación) registra el **mismo** `mediaAssetId`. Se descarta el recibo con `REJECTED`, `EXPIRED`, vencimiento, archivo distinto u otro requisito.
- **Resultados obsoletos ignorados.** Cambiar de OT, cerrar la hoja o cambiar de requisito (la señal que el slot aborta al desmontarse), desmontar la consola o lanzar una llamada más nueva detiene el sondeo y calla errores, avisos y el refresco. Solo la llamada vigente apaga `isSubmitting` y `isAnalyzingEvidence`. El recibo se conserva.
- Validación previa a la carga: archivo vacío, mayor de 25 MB (mismo límite del backend) y tipo que no corresponde al requisito.
- Sin tipo declarado conserva la derivación anterior por MIME, de modo que el contrato público de dos argumentos sigue valiendo.

**Accesibilidad de la firma** (UX §3.1, componente §3.2): instrucciones asociadas a la región y al lienzo por `aria-describedby`; «Limpiar» y «Guardar firma» son botones nativos de al menos 44 px, con foco visible, operables con Tab, Enter y Espacio; el estado del trazo se anuncia en una región `role="status"` y los errores locales en `role="alert"`; tras un guardado fallido el foco vuelve a «Guardar firma» y el trazo se conserva (el reintento reenvía el mismo archivo sin volver a exportar). «Cancelar» lo aporta `RequirementActionSheet` (B0): un segundo botón lo duplicaría. Solo el trazo libre queda exceptuado por WCAG 2.1.1.

**Respeta** permiso (el slot solo se monta con descriptor autorizado), momento (B0), sin conexión (botones deshabilitados) y límite de archivo.

## 4. Medición del análisis y calibración del tope (condición del plan v1.2)

**Qué se midió.** El tiempo que tarda el **worker real** (`EvidenceAnalysisProcessor`, cola `evidence-analysis`) en dejar un asset fuera de `QUARANTINED`, desde que la API respondería `202` hasta que el cliente podría leerlo `AVAILABLE`.

**Método.** Contra el stack de desarrollo local (Windows, Node 24.18) con el worker BullMQ en ejecución, Redis, PostgreSQL y MinIO reales. El arnés reproduce los tres pasos de `EvidenceAssetProvider.createEvidenceAsset`: `INSERT` en `public.media_assets` como `QUARANTINED`, `PUT` del objeto en MinIO y `queue.add('analyze-evidence-asset')` con las mismas opciones (jobId, 3 intentos, backoff exponencial de 1 s). El reloj arranca cuando `queue.add` resuelve y se sondea la base cada 5 ms. Un envío de calentamiento no cuenta.

**Muestra.** 60 cargas secuenciales (una a la vez, 300 ms entre ellas, 25 KB PNG, 0,5 MB, 2 MB y 5 MB JPEG a partes iguales), 5 rondas de 10 cargas simultáneas de 1 MB (50) y 20 cargas del PNG real que exporta `canvas.toBlob` en Chromium (800x320, 14,5 KB). Todas terminaron `AVAILABLE`; ninguna `REJECTED` ni agotó el tiempo.

| Escenario | n | p50 | p90 | p95 | p99 | máx. (ms) |
| --- | --- | --- | --- | --- | --- | --- |
| Secuencial | 60 | 30,2 | 61,6 | **62,4** | 69,5 | 69,5 |
| Secuencial, 5 MB | 15 | 61,1 | 65,9 | 69,5 | 69,5 | 69,5 |
| Ráfaga de 10 simultáneas | 50 | 107,6 | 161,3 | **167,9** | 192,4 | 192,4 |
| PNG real del lienzo | 20 | 18,7 | 21,2 | **22,4** | 38,1 | 38,1 |

Resumen y desglose por tamaño: `docs/quality/mod11-ola2b/r2-p95-analisis-evidencia.json`.

**Calibración.** El análisis es corto y determinista (lee el objeto, calcula SHA-256, comprueba la firma de bytes). Con p95 de 62 ms y máximo de 192 ms, el intervalo fijo de 500 ms del hotfix `f1348c64` hacía esperar medio segundo a un asset que ya estaba listo. Se sustituyó por un escalado de esperas `[150, 250, 400, 600, 900]` ms entre lecturas: **6 lecturas, 2,3 s de tope** (antes 6 lecturas y 2,5 s). Recoge el p95 local en la segunda lectura y deja el tope total donde estaba. El tope total no se amplió porque (a) el tope equivale a doce veces el máximo local y (b) agotarlo ya no pierde nada: el recibo se conserva y el registro se reanuda. La política vive en `EVIDENCE_ANALYSIS_POLICY` (`retryDelaysMs`).

**Limitaciones declaradas.**

- Es un entorno **local y sin carga**: no hay contención de worker, cola con backlog, latencia de red a un MinIO remoto ni arranque en frío. El p95 de un entorno compartido puede ser mayor; ese dato falta y es el `[BLOQUEO]` de §12.
- No pasa por HTTP ni por la autenticación de la API: no se dispuso de credenciales utilizables. Una sonda de sesión con los valores por defecto del fixture E2E del repo contra el API local respondió 404 (el tenant del fixture no existe en este desarrollo); no se probó nada más ni se tocaron credenciales de otros usuarios. La latencia de lectura por la API (`GET evidence-assets`) no está incluida.
- Los datos son sintéticos y estaban bajo el tenant ficticio `tenant_r2_p95_probe`. Se eliminaron al terminar: filas, objetos de MinIO y cola verificados en cero (111 y 21 filas creadas y borradas; cola sin trabajos en espera, activos, fallidos ni demorados).

## 5. Contrato del slot (B0 §6.1)

- Sobre de props y exports (`ExecutionOrderEvidenceAction`, `ExecutionOrderEvidenceHistory`) sin cambios; el shell no se editó.
- `ExecutionOrderEvidenceUploadHandler` y `ExecutionOrderEvidenceUploadOptions` siguen exportados por `use-execution-order-evidence.ts`. Se amplió `options` (opcional): `evidenceType`, `signal`, `onOutcome`, `onRegistered`. El retorno sigue siendo `Promise<void | boolean>`, así que los dobles de B0 (`jest.fn().mockResolvedValue(undefined)`) siguen válidos.
- El adaptador de B0 (`useExecutionOrderEvidence({...})`) compila sin cambios: la interfaz `ExecutionOrderEvidenceAdapter` es la misma.

## 6. Gates

Comandos desde `C:\appiw` salvo indicación.

| Gate | Comando | Resultado |
| --- | --- | --- |
| Typecheck | `pnpm --filter portal typecheck` | Verde, sin errores (también con las ediciones de R3, R4 y E4 en el árbol) |
| Jest `operations/` sin caché | `npx jest src/components/operations --no-cache` (desde `apps/portal`) | **44 suites, 745 tests, 0 fallidos, 0 omitidos** |
| ESLint | `npx eslint src/components/operations` (desde `apps/portal`) | Sin hallazgos |
| audit-ui | `node .agents/skills/iwana-identity-ui-review/scripts/audit-ui.mjs apps/portal/src/components/operations` | «sin hallazgos en las rutas analizadas» |
| E2E de R2 | `pnpm exec playwright test e2e/tests/portal-operations-consola-ot-r2.spec.ts --config e2e/playwright.portal.config.ts` | 5 de 5 |

**`Cached: 0`.** Jest no imprime ese campo (es de turbo); se ejecutó directamente con `--no-cache` y sin turbo, así que el conteo es de ejecución real. Las cifras por suite se obtuvieron con `--no-cache --silent` archivo por archivo.

**Conteo.** Las 745 incluyen lo que R3, R4 y E4-portal añadieron en paralelo, así que no son comparables con las 507 de B0. Lo propio de R2: `use-execution-order-evidence.spec.ts` 35, `ExecutionOrderSignatureCapture.spec.tsx` 18 y `ExecutionOrderEvidenceAction.spec.tsx` 27 (80 en total, de los cuales 4 son casos movidos, §8). Las suites de B0 que no deben debilitarse siguen en verde: `ExecutionOrderSlots.contract.spec.tsx` 4, `ExecutionOrderMomentContainer.spec.tsx` 55 (56 antes, §8), `ExecutionOrderDrawer.spec.tsx` 122 (125 antes, §8), `use-execution-order-console.spec.ts` 5 (los tres casos de subida y sondeo conservados, sin tocar).

**Las pruebas no son vacuas.** Por mutación sobre el hook: sin la comprobación de obsolescencia caen 6 casos; sin conservar el recibo, 6; con `expiresAt` fijo en lugar del recibo, 5; derivar el tipo del MIME deja de compilar.

**Fallos ajenos.** A mitad del trabajo, `ExecutionOrderMaterialConsole.spec.tsx` (R3, en edición) falló 2 casos de custodia por categoría. No tocan evidencia; en la corrida de cierre, repetida pasado un rato, esa suite está en verde.

## 7. Evidencia en navegador

**Qué es real.** El portal del dev server en `127.0.0.1:3002`, un Chromium auténtico (el lienzo, `toBlob` y los eventos de puntero son los del navegador) y el PNG que exporta el lienzo, inspeccionado byte a byte.

**Qué está simulado.** El backend, con `page.route` y las fixtures de `e2e/tests/helpers/consola-ot-fixtures.ts`: carga, sondeo del análisis y registro. Esto **no** mide la latencia real del análisis.

| E2E | Verifica |
| --- | --- |
| Firma: lienzo, análisis y registro | Instrucciones y controles; sin trazo no se envía nada; «Analizando archivo» visible; el `POST` lleva `filename="firma-cliente.png"`, `Content-Type: image/png`, firma de bytes PNG y dimensiones 800x320; 3 lecturas del recibo; el registro es exactamente `{ mediaAssetId, evidenceType: 'SIGNATURE', requirementKey: 'CUSTOMER_SIGNATURE', expiresAt }` con el `expiresAt` del recibo; la hoja se cierra, el foco vuelve al disparador y aparece «Firma guardada» |
| Firma: teclado y foco | Orden Tab «Limpiar», «Guardar firma», «Cancelar»; Enter limpia y anuncia; Escape cierra solo la hoja, devuelve el foco y el drawer sigue abierto |
| Firma: el análisis no termina | Tras 6 lecturas pendientes: aviso «sigue en revisión», trazo conservado, sin registro; al volver a pulsar «Guardar firma» hay **1 sola carga** y 1 registro con el mismo `mediaAssetId` |
| Foto | Clave `work-photo` y tipo `PHOTO` en el registro; «Selecciona una foto.», sin promesa de arrastre y sin lienzo |
| Firma en móvil (375 px) y tema oscuro | Sin desborde horizontal, botones de al menos 44 px de alto, lienzo blanco con trazo visible |

Capturas (`docs/quality/mod11-ola2b/`): `r2-navegador-firma-trazo.png`, `r2-navegador-firma-analizando.png`, `r2-navegador-firma-en-revision.png`, `r2-navegador-firma-guardada.png`, `r2-navegador-firma-movil-oscuro.png`. Se escriben solo si se define `R2_SCREENSHOT_DIR`.

**Complemento con el worker real** (§4): el PNG que produce el lienzo de Chromium (14,5 KB) superó la validación de MIME, tamaño, SHA-256 y bytes del `EvidenceAnalysisProcessor` real en 20 de 20 cargas.

## 8. Pruebas movidas (trazabilidad del baseline B0)

Cuatro casos de B0 afirmaban `onUploadEvidence(file, key)` con dos argumentos, o el botón «Seleccionar archivos», que el slot cambia por contrato de R2. B0 §5 autoriza moverlos, no borrarlos. Se retiraron de su origen y existen en `ExecutionOrderEvidenceAction.spec.tsx` con la aserción actualizada:

| Origen (B0) | Destino |
| --- | --- |
| `ExecutionOrderDrawer.spec.tsx` «conserva el requirementKey real y selecciona un solo archivo al subir evidencia» | «conserva el requirementKey real y el evidenceType del requisito, con un solo archivo» |
| `ExecutionOrderDrawer.spec.tsx` «mantiene el archivo seleccionado y muestra el error si la carga no termina» | mismo nombre |
| `ExecutionOrderDrawer.spec.tsx` «shows upload area when allowed» | «muestra el selector de archivo asociado a su requisito y no ofrece arrastre» |
| `ExecutionOrderMomentContainer.spec.tsx` «cada requisito de evidencia sube con su propia requirementKey» | «cada requisito de evidencia sube con su propia clave y su propio tipo» |

Cada origen conserva un comentario que remite al destino. Además, en `ExecutionOrderDrawer.spec.tsx` la aserción negativa `queryByRole('button', { name: 'Seleccionar archivos' })` pasó a `/^Seleccionar (foto|documento)$/` para que no quede vacua tras el cambio de copy. «muestra el estado mientras analiza el archivo» no cambia y sigue en su sitio.

## 9. Desviaciones deliberadas respecto del comportamiento previo

1. El botón «Seleccionar archivos» (plural, aunque el selector admite uno) pasa a «Seleccionar foto» o «Seleccionar documento».
2. Se retira el encabezado interno «Adjuntar evidencia» del formulario (repetía el de la hoja) y la ayuda genérica «Selecciona un archivo relacionado con este requisito»; la ayuda ahora depende del tipo.
3. El selector ofrece solo los tipos del requisito (antes, todos).
4. Validación previa a la carga: vacío, mayor de 25 MB y tipo ajeno al requisito.
5. Espera del análisis: escalado `[150, 250, 400, 600, 900]` ms en lugar de 6 x 500 ms (§4). Mismo número de lecturas.
6. Errores y éxito de la firma con el copy cerrado de UX §5 («No pudimos guardar la firma. Intenta de nuevo.», «Firma guardada»); sesión y permiso (401, 403, 404) conservan su mensaje.
7. La firma guardada cierra la hoja; la foto no (admite varias).
8. La región «Analizando archivo» existe siempre (vacía e invisible si no hay análisis) para que el anuncio no se pierda (SC 4.1.3). El texto y el `role="status"` son los mismos.
9. El vacío del historial dice qué aparecerá según el tipo del requisito.

## 10. Copy nuevo que no estaba cerrado en UX v1.1 (a ratificar por `prod-ux`)

No bloquea. Se usó el sentence case y el vocabulario ya vigente.

| Texto | Dónde |
| --- | --- |
| «Selecciona un documento en PDF o una imagen.» · «Seleccionar foto» · «Seleccionar documento» · «Archivo seleccionado: {nombre}» · «Reintentar registro» | Selector de foto y documento |
| «Dibuja la firma dentro del recuadro con el dedo, un lápiz o el ratón.» (segunda frase de la instrucción) · «Todavía no hay firma dibujada.» · «Firma dibujada. Puedes guardarla o limpiarla.» · «Firma limpiada. Puedes volver a firmar.» · «Dibuja la firma antes de guardarla.» · «Captura de firma del cliente» · «Área de firma» | Superficie de firma |
| «La firma sigue en revisión y aún no se guardó. Puedes volver a intentarlo en unos minutos.» | Espera agotada de una firma |
| «Selecciona una foto en formato JPG, PNG, WebP o GIF.» · «Selecciona un documento en PDF o una imagen en formato JPG, PNG, WebP o GIF.» · «El archivo está vacío.» · «El archivo supera el tamaño máximo de 25 MB.» | Validación previa (los dos últimos son los del backend) |
| «Las fotos que añadas aparecerán aquí.» · «Los documentos que adjuntes aparecerán aquí.» · «La firma del cliente aparecerá aquí cuando se guarde.» | Vacío del historial |

## 11. Deuda y observaciones

| Severidad | Observación | Dueño sugerido |
| --- | --- | --- |
| Media | El historial de evidencia sigue repitiendo la dirección del sitio bajo cada requisito de evidencia. Se **conservó**: quitarla borraría la única vez que el drawer muestra la dirección (el resumen solo muestra el sitio, y `shows geo-reference display` lo afirma). Debe pasar al resumen | B0 |
| Media | Resuelto en §14 (2026-10-06): tamaño y MIME permitidos ahora provienen de `EXECUTION_ORDER_EVIDENCE_UPLOAD_CONSTRAINTS` en `@iwana/shared` | — |
| Media | No hay alternativa de firma para quien no puede usar puntero (deuda de producto ya declarada por R0 y R1). Solo el trazo está exceptuado por WCAG 2.1.1 | prod-ux |
| Baja | La hoja bloquea «Cancelar» mientras envía. Con 2,3 s de espera máxima es aceptable; si un p95 compartido obliga a ampliar el tope, conviene permitir cancelar durante el análisis | B0 |
| Baja | Si la persona cierra la hoja y elige un archivo distinto, el asset anterior queda en cuarentena sin reconciliar (el orfanato lo expira a las 24 h). Volver a elegir el **mismo** archivo sí reanuda | R2 |
| Baja | Los tres casos de subida y sondeo de `use-execution-order-console.spec.ts` usan temporizadores reales (unos 2,3 s) y podrían pasar a falsos | B0 |
| Baja | `onUploadNonRealizationEvidence` existe en el contrato del drawer pero `ExecutionOrdersClient` no lo cablea; no es de R2 | B0 |

## 12. `[BLOQUEO]` y `[CONSULTA]`

**`[BLOQUEO-P95-ENTORNO-COMPARTIDO]`.** La condición del plan v1.2 («medir el p95 del análisis en el entorno real y calibrar el tope con ese dato») se cumplió contra el stack local con el worker real, pero **no existe muestra de un entorno compartido** (staging o producción): no hay acceso a uno desde esta sesión ni credenciales de API utilizables. Qué falta: p95 y p99 del análisis, con carga y con MinIO y Redis remotos. Qué hace falta para cerrarlo: ejecutar contra ese entorno el mismo arnés (o una carga real por la API) y, si el p95 supera unos 1,5 s, ampliar `retryDelaysMs`. El cambio es de una línea y las pruebas lo siguen (derivan los tiempos de la política). Hasta entonces el riesgo está acotado: agotar el tope conserva el recibo y la persona reanuda sin volver a subir.

**`[CONSULTA]` a `prod-ux` (no bloqueante):** ratificar el copy de §10.

**`[CONSULTA]` a B0 (informativa):** (1) se editaron `ExecutionOrderDrawer.spec.tsx` y `ExecutionOrderMomentContainer.spec.tsx` solo para mover los casos de §8; (2) la firma se apoya en el «Cancelar» de `RequirementActionSheet` y no trae el suyo; (3) la deuda de la dirección repetida de §11.

## 13. Lo que no pude verificar

- El **gate de cierre real** aceptando la firma, y el flujo completo contra el backend con sesión iniciada: no hay credenciales utilizables y no se crearon cuentas. Lo cubren, por separado, la lectura de código del dictamen G3 §2.1 y el E2E de API existente (`e2e/tests/api/execution-orders-operational.spec.ts`), que no se ejecutó.
- La latencia del análisis en un entorno compartido (§12) y la latencia de lectura por la API.
- Lector de pantalla real: solo roles, nombres y descripciones accesibles, foco, `jest-axe` y teclado en Chromium. El trazo con lápiz o dedo en un dispositivo táctil físico: se verificó con ratón y con eventos de puntero.
- Verificación global actualizada en §14: `pnpm lint`, `pnpm typecheck --force` y Jest del monorepo sin caché terminaron en verde.

## 14. Correcciones posteriores (2026-10-06)

Se eliminó la duplicación del límite de 25 MB y del conjunto de MIME permitidos: `use-execution-order-evidence.ts` y `EVIDENCE_ASSET_CONSTRAINTS` consumen ahora `EXECUTION_ORDER_EVIDENCE_UPLOAD_CONSTRAINTS` de `@iwana/shared`. Las reglas por tipo (foto, documento y firma PNG) permanecen en el portal.

La espera y el registro conservan la secuencia de navegación. Si se abre otra OT mientras el refresco posterior sigue pendiente, no se publica el éxito en el nuevo expediente. Regresión en `use-execution-order-evidence.spec.ts`.

El bloqueo de muestra compartida de §12 sigue vigente: el p95 local informado en §4 no sustituye staging o producción. El copy nuevo de §10 continúa pendiente de ratificación de `prod-ux`. `pnpm test -- --force -- --no-cache` terminó con 10 tareas exitosas y Cached: 0; `pnpm typecheck --force` pasó 8 tareas con Cached: 0; el lint global terminó sin errores.
