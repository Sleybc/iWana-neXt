# Informe R4 — Refresco selectivo por mutación de la consola de OT (Ola 2b)

- **Versión:** 1.0
- **Fecha:** 2026-10-05
- **Agente:** AI-FE-PLATFORM (`fe-platform`)
- **Encargo:** `docs/prompts/PROMPT-MOD11-CONSOLA-OT-OLA2B-R4-FE-PLATFORM-v1.0.md`
- **Insumos:** informe B0 §5 y §6.4; dictamen G3 §4; UX `2026-10-05-mod11-consola-ot-requisito-ux.md` §11.2.5; spec base CA-12 (y CA-11 para la custodia).
- **Sin commit.** Rama `main`. No se tocó `apps/api`, `apps/worker` ni archivos de B0, R2, R3 o E4-portal.

## 1. Dictamen

**GO de R4 con una observación para B0 (§6).** El refresco por mutación es selectivo, conserva datos válidos ante fallos parciales y descarta lecturas de una OT que ya no está a la vista. No hubo `[BLOQUEO]` ni `[CONSULTA]` que detuviera el trabajo: la fachada del hook admitió el cambio sin editarla.

**Lo que no puede declararse verde hoy:** `jest components/operations` tiene 8 fallos en 3 suites. Ninguno es de R4 (§4): se reproducen idénticos con la política anterior y pertenecen a la mudanza de R2 (evidencia) y R3 (custodia bajo demanda) que están en curso sobre el mismo árbol.

## 2. Matriz acción → lecturas

Fuente única: `EXECUTION_ORDER_REFRESH_PLAN` en `use-execution-order-refresh.ts`. Antes, **toda** mutación llamaba a `openExecutionOrder` (detalle, actividades, consumos, evidencias, inventario y custodia).

| Mutación | Lecturas posteriores | Custodia |
| --- | --- | --- |
| Iniciar | detalle (1) | no |
| Registrar, modificar o eliminar actividad | detalle + actividades | no |
| Registrar consumo | detalle + consumos | solo si el acto MATERIAL sigue abierto (`activeConsumptionRequirement.current`), una vez, vía `refreshOpenCustody()` |
| Registrar evidencia | detalle + evidencias (recupera `evidenceState` a `available`) | no |
| Cerrar | detalle (1) | no |

- El detalle trae la evaluación publicada (`completion`): releerlo es lo que actualiza versión, `allowedActions` y checklist. El cliente no recalcula el completion ni amplía autorizaciones.
- Cada colección se lee completa página a página (`collectExecutionOrderCollectionPages`, igual que al abrir): una llamada por página.
- La mutación siguiente viaja con la versión refrescada (cubierto: `[4, 5]`).

## 3. Comportamiento y decisiones

1. **Datos válidos preservados.** Solo se reemplaza el recurso cuya lectura llegó. Si falla una lectura, el estado previo queda intacto y se informa por `setError` con el recurso nombrado: «No pudimos actualizar el historial de actividades. Lo que ves puede no estar al día.» (una cadena por combinación; 401/403/404 usan el copy vigente de `mapOperationsError`). Si el detalle falla pero el historial llegó, el historial se aplica.
2. **El refresco nunca rechaza.** El registro ya ocurrió; un rechazo haría que los manejadores lo mostraran como fallo del registro.
3. **Sin indicadores que vacíen lo mostrado.** `setLoadingDetail(true)` hace que `ExecutionOrderMomentContainer` sustituya la orden por un esqueleto, y `setLoadingActivities/ItemUsage/Evidence` son banderas de «cargar más» (spinner del paginador). `setEvidenceState('loading')` cambiaría el historial por un esqueleto. Ninguno se enciende durante un refresco; el estado ocupado lo cubre `isSubmitting`, que los manejadores mantienen hasta que el refresco termina. Un test lo exige para las cinco mutaciones.
4. **OT antigua sobre la vigente.** Tres guardas: (a) al empezar, solo se lee si `selectedExecutionOrder.id` es la OT refrescada; (b) al aplicar, `requestSequence` no cambió desde el inicio (abrir o cerrar la consola lo incrementa) y la OT a la vista sigue siendo la misma; (c) una ficha por recurso: entre dos refrescos solapados gana el último, y el fallo de uno superado no deja error sobre datos más nuevos. La custodia no se relee si el refresco se descartó.
5. **Cargas duplicadas.** Una lectura por recurso y por refresco; sin `openExecutionOrder`; la custodia, una vez y solo con el acto abierto. No se comparten lecturas en vuelo entre refrescos: tras una mutación nueva, una lectura previa estaría desactualizada.
6. **Reintento.** El reintento explícito del usuario («Actualizar detalle») sigue siendo la apertura completa de B0; es una acción deliberada, no una consecuencia de una mutación.
7. La función devuelta es referencialmente estable y lee siempre el último contexto (patrón de `use-execution-order-custody.ts`).

## 4. Archivos y comandos

| Archivo | Cambio |
| --- | --- |
| `apps/portal/src/components/operations/use-execution-order-refresh.ts` | Política (única edición de producción). El tipo `ExecutionOrderRefreshAdapter` no cambió: el adaptador de B0 no se tocó |
| `apps/portal/src/components/operations/use-execution-order-refresh.spec.ts` | Nuevo, 41 tests: matriz, custodia, fallo parcial, estados, navegación, solapamiento |
| `apps/portal/src/components/operations/use-execution-order-console.refresh.spec.ts` | Nuevo, 20 tests con fachada + adaptador + política reales (custodia sustituida por un doble porque su política es de R3) |

No se movió ni se borró ninguna prueba existente.

| Comando | Resultado |
| --- | --- |
| `pnpm --filter portal typecheck` | Verde (código de salida 0). Hubo un fallo transitorio en `use-execution-order-console.spec.ts` por el cambio de tipo de retorno de R2 en curso; desapareció solo, sin intervención mía |
| `eslint src/components/operations` y `prettier --check` de mis archivos | Sin hallazgos |
| `node .agents/skills/iwana-identity-ui-review/scripts/audit-ui.mjs apps/portal/src/components/operations` | «sin hallazgos» (no se tocó UI; el encargo lo pedía solo si aplicaba) |
| `jest src/components/operations --no-cache` (sin turbo; Jest no imprime `Cached`) | **38 suites, 606 tests: 598 pasan, 8 fallan.** Baseline B0: 35 suites, 507 tests. Mis dos suites suman 61 tests (+2 suites) y pasan; el resto del incremento es de R2/R3/E4 |

**Los 8 fallos no son de R4.** Se corrió el mismo trío de suites con el archivo de refresco de B0 restaurado y fallaron los mismos 8:

- `ExecutionOrdersClient.spec.tsx` › «custodia del ejecutor» (4): esperan custodia al abrir la OT; R3 la mueve a bajo demanda.
- `ExecutionOrderDrawer.spec.tsx` (3) y `ExecutionOrderMomentContainer.spec.tsx` (1): esperan `onUploadEvidence(file, key)` sin tercer argumento y el área de subida anterior; R2 cambia la firma y la superficie.

Esos casos pertenecen a B0 y son los que R2/R3 deben mover o reescribir; no los toqué. R5/orquestador debe repetir el conteo cuando R2 y R3 cierren.

**Verificación por mutación.** Se rompió la política de ocho maneras (la actividad lee todo, sin chequeo de secuencia, custodia siempre, enciende carga, sin ficha por recurso, sin chequeo de OT al empezar, sin chequeo de OT al aplicar, pisa datos al fallar) y cada una hace caer al menos un test. La del chequeo de OT al aplicar no caía; se añadió el caso y ahora cae.

## 5. Evidencia por criterio del encargo

| Exigencia | Dónde se prueba |
| --- | --- |
| Número exacto de llamadas por mutación | `use-execution-order-refresh.spec.ts` (matriz con `it.each`) y `…console.refresh.spec.ts` (por manejador: iniciar, registrar, modificar, eliminar, consumo, evidencia, cierre) |
| CA-12 | «registrar una actividad lee detalle y actividades, y nada más»: sin consumos, evidencias, inventario ni custodia |
| Fallo parcial y preservación | Historial falla, detalle falla, ambos fallan, 401/403/404, red caída |
| Navegación concurrente | Abrir otra OT, cerrar el drawer, apertura que aterriza durante el vuelo, refrescos solapados |
| Custodia abierta/cerrada | Hoja abierta (1 llamada), cerrada, cerrada tras abrirla, otras mutaciones con hoja abierta (0) |
| Regresión de payload y cierre | Payload de evidencia con `PHOTO`, `requirementKey`, `expiresAt` y versión; cierre con su payload y versión; versión refrescada en la mutación siguiente |
| Offline | Red caída durante el refresco: se informa y la consola sigue operable (`isSubmitting` en `false`, orden a la vista) |
| Storage | Ninguna escritura en `localStorage` ni `sessionStorage` durante iniciar, actividad y evidencia |

## 6. Observaciones y deuda

| Severidad | Observación | Dueño |
| --- | --- | --- |
| Media | **Mensaje de éxito sobre la OT equivocada.** Los manejadores de `use-execution-order-console-adapter.ts` hacen `await refreshExecutionOrder(...)` y luego `setExecutionOrderSuccess(...)` sin comprobar que la OT siga a la vista. Si se navega a otra OT mientras la mutación está en vuelo, la OT nueva muestra «El trabajo realizado fue registrado.». Reproducido en un test y retirado de la suite al ser un defecto del adaptador. Preexistente (la política anterior también lo permitía). Arreglo: capturar la secuencia al empezar la mutación y confirmar éxito solo si coincide | B0 |
| Baja | Ventana residual: si otra OT aterriza y su render aún no se confirmó cuando termina la lectura, el refresco la ve como la anterior. La guarda cubre el caso por identificador y secuencia; cerrar la ventana del todo exige que los manejadores pasen la secuencia de inicio de la mutación | B0 (mismo arreglo) |
| Baja | No hay indicador de «actualizando» por recurso: el contrato de la consola solo ofrece banderas que vacían lo mostrado (§3.3). Un indicador sutil exigiría una bandera nueva en el adaptador y su UI | B0 / ds-owner |
| Baja | El reintento tras un refresco fallido es la apertura completa (seis lecturas). Un reintento selectivo exigiría exponer la política desde la fachada | B0 |
| Baja | Un «cargar más» en vuelo durante un refresco puede duplicar filas al volver (la política reemplaza la colección completa). La colección se lee completa hasta 20 páginas, así que el caso exige más de 2000 registros | R4 si se prioriza |
| Info | Los tipos `setLoading*`/`setSuccess`/`openExecutionOrder` del contexto quedan sin uso en la política; se conservan porque el contrato B0 §6.4 los entrega y quitarlos obligaría a editar el adaptador | B0 |

## 7. Lo que no se verificó

- Navegador contra el dev server y el backend real: no se tocó UI y la política solo existe en la capa de hooks. Las suites cubren fachada + adaptador + política reales, no un drawer montado.
- La combinación real con la política de custodia de R3 (aquí un doble que registra `openAction`): cuando R3 cierre, `refreshOpenCustody` debe disparar su carga bajo demanda. El contrato (`custody.openAction(activeConsumptionRequirement.current)`) está probado en el adaptador de B0.
- `pnpm lint` y `pnpm typecheck` globales del monorepo: solo el portal.
- Jest completo del portal fuera de `operations/`.

**`[BLOQUEO]`:** ninguno. **`[CONSULTA]`:** ninguna bloqueante; la observación de severidad media de §6 es para B0.
