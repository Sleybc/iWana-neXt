# INFORME-ADR065-REGATE-REMEDIACION-v1.0

**Programa:** ADR-065 (Olas 0-7) + DEF-2 — re-gate tras la remediación
**Modo:** AI-EM-ARCH Orchestrator · protocolo multiagente
**Fecha:** 2026-07-26
**Prompt ejecutado:** [PROMPT-ADR065-REMEDIACION-CIERRE-v1.0](../prompts/PROMPT-ADR065-REMEDIACION-CIERRE-v1.0.md)
**Contrato de auditoría:** [INFORME-ADR065-GATE-CIERRE-PROGRAMA-v1.0](./INFORME-ADR065-GATE-CIERRE-PROGRAMA-v1.0.md)
**Auditores:** AI-SR-QA · AI-SEC-ENG · AI-EM-ARCH (verificación propia + navegador)

---

## Veredicto

# NO-GO

| Auditor | Veredicto |
| --- | --- |
| AI-SR-QA | **NO-GO** — 7 de 13 condiciones levantadas; 4 bloqueantes |
| AI-SEC-ENG | **NO-GO** + `[ESCALACIÓN DE SEGURIDAD]` |
| AI-EM-ARCH | **NO-GO** — se adoptan ambos |

**La remediación mejoró de forma real y medible**, y conviene decirlo antes que los defectos: las tres suites unitarias pasaron de rojo a verde, `lint` de 6 errores a 0, `typecheck` y ambos builds de producción en verde. El trabajo de backend (S-1, S-2, A3, A7, G-4) está bien hecho.

Pero **la migración `089` está rota y rompe el aprovisionamiento de tenants nuevos**, y las dos verificaciones de aceptación que el informe de cierre fijó siguen rojas.

---

## Desempate entre auditores — condición 7 (S-4)

Los dos gates se contradicen y el conflicto es de método, no de criterio:

- **AI-SR-QA declaró la condición 7 CUMPLE** leyendo el código: existe la consulta sobre `pg_index.indisvalid = false` y el `DROP INDEX CONCURRENTLY` (`089:96-98`), y existe la verificación post-migración (`:121`).
- **AI-SEC-ENG declaró S-4 ABIERTO** ejecutando el `up()` compilado contra PostgreSQL 18: **cero índices creados**, aborta en el primer statement.

**Decisión: prevalece AI-SEC-ENG.** La ejecución empírica gana a la lectura de código, y AI-EM-ARCH confirmó el defecto de forma independiente leyendo el fuente: `dropInvalidIndexIfExists` es la **primera sentencia de `up()`** (`089:148`) y falla por tres razones independientes, todas visibles:

1. `$$…$$` es un literal entrecomillado con dólar; el `$1` de dentro **no es un placeholder de bind**, así que la sentencia externa declara cero parámetros y recibe uno.
2. Un bloque `DO` no admite parámetros.
3. `DROP INDEX CONCURRENTLY` no puede ejecutarse dentro de un bloque PL/pgSQL.

Es el caso ejemplar de por qué un gate no se firma leyendo: **la condición 7 se habría dado por cumplida sobre una migración que no crea ni un índice.**

---

## Correcciones a informes previos, incluido el mío

**1 · Atribución errónea del gate de cierre (mía).** El [informe de cierre](./INFORME-ADR065-GATE-CIERRE-PROGRAMA-v1.0.md) afirmó que los 3 fallos de `web-audit-logs-datepicker.spec.ts` confirmaban el P0 de B-1. **Era incorrecto.** AI-SR-QA verificó que `e2e/tests/helpers/web-api-mocks.ts:269-310` **ignora `fromDate` y `toDate`** y devuelve siempre el dataset completo: esos tests no podían pasar con ningún backend. El P0 era real —lo confirmé en código— pero **esa no era su prueba**, y al no corregirse el mock, B-1 se declaró cerrado sin criterio de aceptación alcanzable.

**2 · Matiz sobre cómo se arregló el lint (mía).** Informé que se resolvió «correctamente, cargando el plugin en vez de silenciar». El plugin sí se cargó, pero con `'react-hooks/exhaustive-deps': 'warn'` (`eslint.config.js:41`), lo que **expuso 39 dependencias faltantes reales** —`SchedulingClient.tsx:962` con cuatro, `useSchedulingDerivedState.ts:30`, `PendingVisitRequestsView.tsx:580,588,728`, y 34 más— **todas sin corregir**. El prompt decía: «cargar el plugin las expondrá — y entonces se corrigen, no se silencian». Se expusieron y quedaron en `warn`. Con `--max-warnings 0` el lint vuelve a rojo.

**3 · Declaración PASS no reproducible.** `INFORME-ADR065-OLA4-SR-QA-GATE-v1.0.md:34` declaró `portal-crm-subscribers-pagination.spec.ts` en PASS el 2026-07-25; hoy falla. Mismo patrón que el gate v1.5 con el lint.

---

## Estado ejecutable

| Compuerta | Resultado |
| --- | --- |
| `@iwana/api` test | **Verde** — 208/212 suites, 2345/2360 tests |
| `@iwana/portal` test | **Verde** — 165/165 suites, 900/901 |
| `@iwana/web` test | **Verde** — 19/19, 76/76 |
| `pnpm typecheck` | **Verde** — 8/8 |
| `pnpm lint --force` (sin caché) | **Verde** — 0 errores, **43 warnings** |
| `build` portal y web | **Verde** |
| E2E `web-audit-logs-datepicker` | **Rojo** — 3/3 (criterio de aceptación de B-1) |
| E2E `portal-pager-a11y` | **Rojo** — 5 de 6 (criterio de aceptación de G-7) |
| E2E `portal-crm-subscribers-pagination` | **Rojo** |
| E2E portal, suite completa | **Concluye** (41 min, 64 passed) pero roja |
| **R-14 estabilidad ×3 corridas** | **Cumple** — corridas 2 y 3 limpias; la 1 estaba contaminada |

---

## Bloqueantes

### BL-1 · CRÍTICO · La migración `089` no crea ningún índice y rompe el aprovisionamiento

Detalle en el desempate de arriba. Impacto operativo, sin atacante:

- `tenant-provisioning.processor.ts:315` aplica las migraciones al aprovisionar: **todo tenant nuevo falla** y queda a medias en estado `PROVISIONING`.
- Los tenants sin `089` se quedan sin índices y vuelven a resolver cada listado con ordenamiento completo — **reabre el vector que ADR-065 vino a cerrar**.

**No hay ni un solo spec para la migración `089`** en el repo. Una corrección de seguridad se entregó sin prueba que la ejercitara, y el defecto es invisible en dev porque `tenant_iwana` ya tenía la `089` registrada de una corrida anterior.

**Cierre:** `DROP INDEX CONCURRENTLY` como sentencia de primer nivel, con el nombre validado contra lista blanca (nunca interpolar entrada externa) y consulta parametrizada normal sobre `pg_index.indisvalid = false`. Más spec de integración que ejecute `up()` contra un schema real.

### BL-2 · GRAVE · G-6: los cinco casos DEF-2 siguen sin ejercer el clamp

`CrmListPagePipe` fija `MAX_PAGE = 100` y `clampLimit` fija `MAX_LIMIT = 100`. El producto máximo alcanzable es **exactamente 10 000**, que es `MAX_PAGE_OFFSET`, y la guarda es `page * limit > maxOffset` — **estrictamente mayor**. La rama de cota de offset de `clampPage` es **inalcanzable** a través de cualquier controlador protegido por el pipe.

Los cinco casos de `organization.controller.http.spec.ts:513-568` los satisface el pipe. **Si se borra `clampPage`, los cinco siguen verdes.** Es el mismo defecto que el informe de cierre describió, desplazado una capa.

**Cierre:** bajar `MAX_PAGE_OFFSET` por debajo de `MAX_PAGE × MAX_LIMIT`, o cubrir el clamp en un endpoint sin pipe, o declarar que el pipe es la cota real y dejar de anunciar `clampPage` como tal.

### BL-3 · ALTA · G-7 y el copy: dos specs nuevas nacen rojas por raya frente a guion

`portal-ui.tsx:625-630` emite **raya corta** (`–`); las specs nuevas asertan **guion ASCII**, siguiendo el copy congelado de la spec §3. Falla literal: `element(s) not found` sobre `'Mostrando 1-20 de 45 suscriptores'`.

La contradicción R2 que el gate de cierre reportó como G-3 —dos gramáticas conviviendo— **no se resolvió**: solo se volvió inalcanzable la rama del strip, y ahora produce fallos en E2E. Mientras siga, **v2-25 y v2-34 no tienen prueba**.

### BL-4 · MEDIA · B-1 sin criterio de aceptación alcanzable

`web-api-mocks.ts:269-310` ignora las fechas. Hay que implementar el filtrado en el mock o sustituir el criterio por uno alcanzable.

### BL-5 · MEDIA · G-2 §22-bis cláusula 3 sin ejecutar

Tres controladores siguen anunciando `sortBy` en OpenAPI con lista blanca vacía y `meta.sort: null` permanente: `assurance.controller.ts:114`, `subscribers.controller.ts:100`, `tasks.controller.ts:67`. Es una línea por archivo.

---

## Condición de cierre del programa (no de merge)

**N-3 de seguridad · ALTA · El patrón de S-1 sigue vivo en WFM.** `visit-requests.service.ts:185` hace `Promise.all` sobre las filas y `enrichVisitRequest` (`:880-887`) **ignora el `manager` que recibe**, llamando a `findDisplayNameById` que abre su propio `runInTenantSchema` por fila.

Peor que el de expedientes porque la adquisición es **anidada**: la conexión externa sigue tomada mientras se piden hasta 100 internas. Con `DB_POOL_MAX` default 10, diez peticiones concurrentes a `GET /wfm/visit-requests?originContext=CRM&limit=100` **interbloquean el pool**. No es degradación: es deadlock.

Es preexistente y estaba fuera del alcance del prompt, pero impide declarar cerrado el objetivo del programa. La corrección es idéntica a la de S-1: pasar el `manager` y resolver con `In(ids)`.

---

## Cerrado y verificado

- **S-1 · corrección estructural real, no mitigación.** `calculateBatch()` recibe el `EntityManager` del llamador y resuelve con `In(ids)`. Fan-out medido: **de 1+300 conexiones a una sola, independiente de `limit`**. Sin `p-limit` — no es la salida degradada que el prompt prohibía.
- **S-2** cerrado con defensa en profundidad (pipe + `clampLimit` + `clampPage`).
- **ADR-067 §5** implementado **sin filtrar PII**: el filtro de búsqueda se reduce a `'(aplicado)'`, el único que podía transportar un fragmento de documento. Tenant-scoped.
- **Nadie pobló listas blancas de orden** — ADR-065 v1.2 respetado; `applySort` sigue fail-closed, cero superficie de inyección.
- **B-1 en código:** `applyCreatedAtFilter` emite SQL real con parámetros escalares en los 4 sitios. Specs mejorados: detectan la regresión exacta (`expect.any(Date)` no matchea un `FindOperator`).
- **B-3:** producto corregido con borrador y debounce en las tres toolbars.
- **G-4:** desempate por `id` en el kárdex.
- **G-5:** `UsersTable.tsx:461` **migrado** — el caso motivador del programa, cerrado.
- **El bucle del runner ya no aborta:** acumula resultados por tenant y lanza error agregado al final.
- **Sin interpolación de entrada externa en SQL** introducida por la remediación.
- **Multi-tenancy intacto**, `COUNT` y página en la misma transacción, H-4 y H-5 siguen cerrados.

---

## Verificación en navegador (AI-EM-ARCH)

Sesión real sobre `localhost:3002`. Verificado:

- **v2-29** — Suscriptores vacío: sin pie, sin selector, sin navegación. Correcto.
- **v2-08** — en Usuarios los tres textos de conteo son de naturaleza distinta (subtítulo de página, badge del strip, y un `div.sr-only` para lector de pantalla): **un solo conteo visible**. Un grep lo habría reportado como triple violación.
- **Cero `aria-sort` y cero controles de orden** en toda la interfaz — el fail-closed de v1.2 funciona de extremo a extremo.
- Tablas de vista previa sin pager, según la excepción documentada.

**Limitación material:** ninguna tabla operativa de la base de dev tiene filas suficientes para renderizar el paginador. La única con volumen es `access_profile_permissions` (35 filas), que es la excepción de cardinalidad fija. Todo lo demás tiene 1 o 2 filas.

**Consecuencia para el programa:** el DoD exigía evidencia de navegador a 1280 px y 375 px por ola, y **este entorno no puede producirla**. Cualquier informe de ola que afirme haber aportado evidencia de navegador sobre paginación real merece revisión. Desbloquearlo exige sembrar >10 filas en una tabla operativa.

---

## Deuda registrada, no bloqueante

| # | Deuda |
| --- | --- |
| N-4 | **39 dependencias de hooks faltantes** expuestas y dejadas en `warn`. Sin dueño ni fecha. Con `--max-warnings 0` el lint vuelve a rojo |
| N-5 | `it.skip` nuevo en `InventoryClient.spec.tsx:1862` (DEBT-001, React 19 + jsdom). El fallback declarado es `portal-inventory-scm.spec.ts`, que **falla 41 de 41** en E2E: la cobertura compensatoria no está verificada |
| N-9 | **Ningún informe de remediación.** El prompt exigía por tramo la salida literal de `lint`, `typecheck` y la suite. No hay ninguna |
| N-10 | Código muerto: `AssetsWorkspace.tsx:22` importa `PortalResultsStrip` sin usarlo; la rama de copy con raya sobrevive muerta en los 5 workspaces; `applyCreatedAtFilter` sin test unitario |
| G-1 parcial | Auditoría, timeline, notificaciones y cola de visitas siguen sin emitir `randomAccess: false` |
| — | `TaxCatalogManager.tsx:512` y `PlanCatalogPanel` sin migrar ni declarar, contra lo que pedía B4 |
| — | La llamada de auditoría de ADR-067 §5 es `void` y `AuditService.log` traga errores: un control de cumplimiento que puede perderse en silencio |
| — | Suite E2E del portal: 41 min, con `portal-inventory-scm` (41 fallos) y `portal-wfm-scheduling` (18) consumiendo ~30 de esos minutos |

---

## Nota de proceso

Es el tercer gate consecutivo donde el problema no es el trabajo sino **la evidencia con la que se firma**:

1. El gate v1.5 declaró lint verde estando rojo.
2. El gate de la Ola 4 declaró PASS una spec que hoy falla.
3. Este re-gate resolvió un desempate donde una condición se habría dado por cumplida **leyendo** una migración que, **ejecutada**, no crea ni un índice.

Y mi propio informe de cierre atribuyó un P0 a una prueba que no podía pasar por un mock incompleto.

La regla que propongo elevar a norma: **ningún gate se firma sin adjuntar la salida literal de la corrida que lo sustenta, y ninguna migración se declara correcta sin ejecutarla contra un schema real.** Este re-gate se firma con esa salida adjunta.
