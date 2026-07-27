# INFORME — Re-auditoría de gate: DEF-2 + Ola 1 de ADR-065 (post-remediación)

**Versión:** 1.1
**Fecha:** 2026-07-24
**Modo activo:** **Architect + EM** (auditoría de gate, sin ejecución de código)
**Autor:** AI-EM-ARCH
**Antecedente:** [INFORME-ADR065-OLA1-AUDITORIA-GATE-v1.0](INFORME-ADR065-OLA1-AUDITORIA-GATE-v1.0.md) — 13 disposiciones
**Artefacto en conflicto:** [INFORME-ADR065-OLA1-REGATE-v1.0](INFORME-ADR065-OLA1-REGATE-v1.0.md) — ver §4
**Clasificación:** Uso interno

---

## Veredicto

| Gate | v1.0 | **v1.1** |
| --- | --- | --- |
| **Ola 1 de ADR-065** | NO-GO | **NO-GO por R-1** — mecánico, esfuerzo S. Cerrada R-1 → **GO-CON-DEUDA** |
| **DEF-2 hotfix** | GO-CON-DEUDA | **GO-CON-DEUDA**, con **D-4 reabierta** (R-3) |
| **Escalaciones E-1…E-4** | Cerradas con reparos | **Cerradas** — reparos resueltos |

La remediación es buena y en D-4 es **mejor que lo pedido**. Lo que impide firmar es una compuerta, no el trabajo.

---

## 1. Disposiciones del gate v1.0 — verificación

| # | Acción | Estado | Evidencia verificada |
| --- | --- | --- | --- |
| 1 | O-7(b) `applySort` tras el default + `meta` desde el retorno | **Cerrada** | Default primero en `tickets:373`, `subscribers:317`, `party:117`, `tasks:230`; `buildPageMeta` alimentado de `sortResult.appliedSortBy/Dir` en los cuatro (`:401`, `:338`, `:132`, `:291`) |
| 2 | DEF-1 desempate por `id` en las 7 órdenes | **Cerrada** | `tasks:231`, `expediente:661` y `:1180`, `asset-lifecycle:53`, `serialized-asset:250`, `party-read.adapter:84`, `tenant:279` |
| 3 | D-2 / H-1 tope de `limit` en CRM | **Cerrada** | `CrmListLimitPipe` (→ `Math.min(parsed, MAX_LIMIT)`) y `CrmListPagePipe` (≥1) en el boundary HTTP de los 3 endpoints, con spec propio. `?limit=10000` ahora sirve 100 |
| 4 | D-1 tests de `slaBreachStatus` | **Cerrada** | `assurance/tests/tickets.service.spec.ts`, 24 referencias |
| 5 | C-1 informe de escalaciones v1.2 | **Cerrada** | v1.2 con changelog explícito; contradicción con ADR-066 resuelta |
| 6 | O-7(d) contrato de `sortableFields` en ADR-065 | **Cerrada** | §18 «Contrato de nombres (fijado 2026-07-24, gate Ola 1)» — incluye que `buildPageMeta` se alimenta del retorno, «de lo contrario `ListMeta.sort` miente» |
| 7 | D-4 rama `documentNumber` | **Rediseñada — ver R-3** | Hash determinista + migración 087 + índice parcial; elimina el full-scan y el decrypt masivo |
| 8 | C-3 reformular el cierre de E-1 | **Cerrada** | Plan e informe: «cerrada en decisión, pendiente ejecución en `runner.ts`/`revert.ts`» |
| 9 | D-3 verificar consumidores de `offset` en `apps/web` | **Cerrada** | `PICKER_SOFT_CAP = 100`; `tenants/page.tsx:127` acumula `offset = tenants.length` en múltiplos de `TENANTS_PAGE_SIZE`. El redondeo a frontera de página no se activa |
| 10 | D-7 `minimum: 1` + specs de los helpers | **Cerrada** | `minimum: 1` en los 5 `@ApiQuery` de `page`; `apply-sort.spec.ts` y `clamp-limit.spec.ts` creados |
| 11 | UI a11y del pie del timeline | **Cerrada** | `min-h-11`/`min-w-11`, `interactiveFocusClassName`, `aria-current="page"`, `aria-label={Página N}`. `pnpm --filter @iwana/portal typecheck` verde |
| 12 | C-2 / C-4 declarar supuestos como supuestos | **Cerrada** | «Supuesto (no medicion)… medicion diferida»; E-3 «excepción de preview **por criterio** (p95 no medido)» |
| 13 | D-6 nota sobre validación Zod en assurance | **Cerrada** | `assurance/dto/index.ts:125` |

**Doce de trece cerradas y verificadas.** La restante (7) no está incompleta: está **rediseñada al alza** y le falta el último tramo (R-3).

Cobertura del envelope: de 4 a **6 endpoints** (se sumaron los dos de expedientes).

---

## 2. Compuertas ejecutables

| Compuerta | Resultado |
| --- | --- |
| `pnpm --filter @iwana/api typecheck` | **Verde** |
| `pnpm --filter @iwana/portal typecheck` | **Verde** |
| `pnpm --filter @iwana/api lint` | **Verde** — 0 errores, 1 warning preexistente |
| `pnpm --filter @iwana/api test` | **ROJO** — 2 suites, 5 tests fallando (R-1) |

**Corrección al registro de esta sesión.** Dos lecturas previas de la suite se dieron por verdes leyendo el código de salida de un comando *entubado* (`| tail`), que es el de `tail`, no el de jest. La lectura válida es la línea de resumen. Con ella: la auditoría v1.0 fue **genuinamente verde** (199 suites, 0 fallos) y el árbol post-remediación está **rojo**.

---

## 3. Hallazgos abiertos

### R-1 · ALTA · La suite está en rojo — el stop/go de la Ola 1 no se cumple

```
Test Suites: 2 failed, 4 skipped, 202 passed, 208 total
Tests:       5 failed, 15 skipped, 2299 passed, 2319 total
```

Causa única: `inventory/tests/useful-life-alerts.service.spec.ts:56` declara `orderBy: jest.fn().mockReturnThis()` y **no declara `addOrderBy`**. El desempate DEF-1 añadido en `serialized-asset.service.ts:250` encadena `.addOrderBy('asset.id','DESC')` → `TypeError: qb.orderBy(...).addOrderBy is not a function`. Arrastra los 4 tests de esa suite más `useful-life-alerts.isolation.spec.ts`.

**No hay defecto de producción**: el `SelectQueryBuilder` real devuelve `this` y expone `addOrderBy`. Es un doble de prueba que no se actualizó con el cambio que lo atraviesa.

Lo relevante no es el fallo, es que el re-gate declaró GO-CON-DEUDA sin correr la compuerta que su propio plan exige («suite de API verde»).

**Salida:** añadir `addOrderBy: jest.fn().mockReturnThis()` **y**, ya que se toca el doble, afirmar sobre el orden emitido: hoy ninguno de esos 5 tests verifica el `ORDER BY`, de modo que el desempate DEF-1 seguiría sin cobertura aun con el mock arreglado. **Esfuerzo: S.**

### R-2 · MEDIA · Colisión de numeración de migración

`087_add_expediente_document_number_hash.ts` ocupa el número que tres artefactos vigentes reservan para los índices de la Ola 2:

- `docs/plans/2026-07-24-paginacion-numerada-adopcion.md:64` — «Migración tenant `087_pagination_ordering_indexes.ts`»
- `docs/adrs/ADR-065-…:318` — «antes de escribir la migración `087_*`»
- `docs/prompts/PROMPT-ADR065-OLA2-INDICES-v1.0.md:20` y `:61`

El ejecutor de la Ola 2 escribirá un `087_` que ya existe. **Acción (coordinada con R-3):** backfill = `088_*`; índices Ola 2 = **`089_pagination_ordering_indexes.ts`**. (La v1.1 borrador decía 088 para índices; el desempate con disposición 2 reserva 088 al dato.)

### R-3 · ALTA en producto (Baja en seguridad) · D-4 no está cerrada: está a medias

El rediseño de D-4 es correcto y elimina el vector que motivó el hallazgo. Pero introduce una dependencia de datos que **nadie recogió**:

- Tras aplicar `087`, `GET /crm/expedientes?documentNumber=X` devuelve **cero resultados para todo expediente preexistente** —sin error, sin aviso— porque `document_number_hash` es `NULL` en las filas legacy y la consulta filtra por igualdad de hash (`expediente.service.ts:653`).
- `backfillDocumentNumberHashes()` (`:702`) existe y está testeado, pero **no tiene ruta de invocación**: ni controlador, ni job BullMQ, ni paso de migración, ni CLI. Verificado por grep: sus únicas referencias son su definición y su spec.
- El dictamen de AI-SEC-ENG es correcto **en su alcance** y lo dice explícitamente: «ops debe ejecutar backfill por tenant para filas legacy» = «completitud **funcional**», es decir, fuera de AppSec. Lo clasifica D-4-R-P3a, Baja. En riesgo de seguridad, Baja es la calificación justa. En producto no lo es: es la pérdida silenciosa de una búsqueda primaria de CRM en todos los tenants.
- El re-gate lo absorbió como «deuda aceptada / ticket propio». **Una migración de esquema cuyo dato correspondiente no tiene mecanismo de ejecución no es deuda; es un despliegue incompleto.**

**Decido la salida (no la dejo al ejecutor):** **opción (a)** — backfill como migración de datos `088_*` idempotente, inmediatamente posterior a la de esquema, para que el dato viaje acoplado al despliegue y sea reversible y auditable por el mismo runner. Descartadas: (b) job BullMQ por tenant —añade una pieza operativa y una ventana de inconsistencia sin ganar nada—; (c) fallback a la rama cifrada mientras haya hashes nulos —reintroduce exactamente el full-scan que D-4 vino a eliminar—.

**Impacto multi-tenant:** el backfill recorre todos los schemas de tenant; debe ser idempotente (`WHERE hash IS NULL`), por lotes con keyset —el método ya lo es— y sin PII en logs —ya cumple—. **Regulación:** sin cambio; el hash no se expone (la respuesta lo anula en `:681`).

**Residual informativo que confirmo y acepto:** `hashDocumentNumber` es SHA-256 sin pepper, en paridad con `subscribers.document_number_hash` (migración 014). Con el espacio de cédulas colombianas, un hash sin pepper es reversible por fuerza bruta si la columna se filtra. **No lo abro como hallazgo de esta ola** —sería penalizar un patrón ya canónico por extenderlo con coherencia— pero queda anotado: la migración a HMAC con pepper de servidor es una decisión de una sola vez que debe tomarse para **ambas** columnas a la vez, no para una.

### R-4 · BAJA · D-5 se cayó del libro mayor

`clampPage` sigue ejecutándose dentro de `runInTenantSchema` en `party.service.ts:96`, `party-read.adapter.ts:63`, `visit-requests.service.ts:175` y `write-off.service.ts:293`: la petición rechazada ocupa un slot del pool durante el round-trip.

**La omisión es mía**: lo reporté en v1.0 §2 como abierto y no lo llevé a la tabla de disposiciones, así que el re-gate no tenía cómo recogerlo — no aparece ni entre las cerradas ni entre la deuda aceptada. Lo reincorporo aquí: **BAJA, absorber en la Ola 2**.

### R-5 · BAJA · La corrección de O-7(b) queda hecha pero no guardada

`apply-sort.spec.ts` cubre bien el helper —lista blanca, prefijo por `qb.alias`, desempate, lista vacía— pero con un QB falso. **Ningún test detecta si alguien vuelve a colocar `applySort` antes del `.orderBy` por defecto**, que es literalmente el defecto que originó el hallazgo. Hoy es inocuo porque `SORTABLE_FIELDS` está vacío en los cuatro servicios.

**Requisito que fijo para el stop/go de la Ola 2:** por cada recurso que publique `sortableFields`, un test que verifique que un `sortBy` válido **cambia el `ORDER BY` emitido** y que `meta.sort` refleja el orden aplicado, no el pedido.

---

## 4. Resolución del conflicto con el re-gate

[INFORME-ADR065-OLA1-REGATE-v1.0](INFORME-ADR065-OLA1-REGATE-v1.0.md) declara **GO-CON-DEUDA** para la Ola 1. Este informe declara **NO-GO por R-1**. No pueden quedar ambos vigentes — es el anti-patrón que este mismo gate señaló en C-1.

Como responsable **A** del gate de Ola 1 (RACI del plan padre), **resuelvo:**

1. El veredicto vigente es el de este informe: **NO-GO hasta R-1**, que es esfuerzo S.
2. El re-gate v1.0 debe emitir **v1.1** con dos correcciones: veredicto condicionado a R-1, y D-4 movida de «deuda aceptada» a **abierta** por R-3.
3. Su tabla de cierres 1-6 y 8-13 es **correcta y la confirmo con evidencia propia**; lo que falla es la compuerta que no se corrió y la clasificación de D-4.

---

## 5. Disposición

| # | Acción | Severidad | Responsable | Momento |
| --- | --- | --- | --- | --- |
| 1 | **R-1**: `addOrderBy` en el doble de `useful-life-alerts.service.spec.ts` + aserción sobre el orden emitido | ALTA | AI-SR-FULL | **Bloqueante del gate** |
| 2 | **R-3**: backfill de `document_number_hash` como migración de datos `088_*` idempotente | ALTA (producto) | AI-SR-FULL · AI-PLAT-OPS informado | **Bloqueante del cierre de D-4** |
| 3 | **R-2**: renumerar índices a `089_pagination_ordering_indexes.ts` en plan, ADR-065, ADR-066 y prompt Fase 2 (088 = backfill R-3) | MEDIA | AI-EM-ARCH | Hoy |
| 4 | **§4**: re-gate a v1.1 | MEDIA | AI-EM-ARCH | Hoy |
| 5 | **R-5**: incorporar al stop/go de la Ola 2 el test de orden por recurso | BAJA | AI-EM-ARCH | Con el prompt de la Ola 2 |
| 6 | **R-4**: mover el clamp fuera de `runInTenantSchema` en los 4 sitios | BAJA | AI-SR-FULL | Ola 2 |

Cerradas 1 y 2, la Ola 1 pasa a **GO-CON-DEUDA** y DEF-2 cierra limpio.

**Actualización 2026-07-24 (post-remediación):** R-1 y R-3 **cerradas** — ver [INFORME-ADR065-OLA1-REGATE-v1.2](INFORME-ADR065-OLA1-REGATE-v1.2.md). Veredicto vigente: Ola 1 **GO-CON-DEUDA**; D-4 **cerrada**.

**Sin escalación al CTO.** La decisión sobre el pepper de los hashes de documento (R-3, residual) se registrará como propuesta cuando se aborden ambas columnas; hoy no cambia el veredicto.

---

## 6. Nota de proceso

El gate v1.0 cerró con la observación de que las tres compuertas verdes no habían detectado ninguno de los tres hallazgos altos. Esta ronda invierte el patrón y confirma la otra mitad de la lección: **la compuerta detectó a la primera el único defecto que la remediación introdujo (R-1) — pero sólo porque se corrió.**

Las dos veces que se leyó como verde en esta sesión, se leyó mal: el código de salida venía de la tubería. Un stop/go que dice «suite verde» necesita decir **cómo se lee** — la línea de resumen de jest, no el `$?` de un comando entubado. Es la clase de detalle que convierte una compuerta en un ritual.
