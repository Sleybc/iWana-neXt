# INFORME-PORTAL-PAGINACION-NUMERADA-v1.0

**Módulo:** Portal + Web — norma transversal DataTable
**Fase:** Ola 0 (gobierno) **cerrada y aprobada** · Ola 1 **desbloqueada**
**Modo:** AI-EM-ARCH Architect + Orchestrator · protocolo multiagente
**Fecha:** 2026-07-24
**ADR:** [ADR-065](../adrs/ADR-065-Paginacion-Numerada-Tablas-Operativas.md) v1.1 (**Aprobado** CTO 2026-07-24) — supersede [ADR-064](../adrs/ADR-064-Paginacion-Tablas-Operativas-Portal.md) §§2/3/5/9
**Plan:** [2026-07-24-paginacion-numerada-adopcion.md](../plans/2026-07-24-paginacion-numerada-adopcion.md)
**Specs:** [UX](../specs/2026-07-24-paginacion-numerada-ux.md) · [contrato DS](../specs/2026-07-24-paginacion-numerada-ds-contrato.md)
**Antecesor:** [INFORME-PORTAL-PAGINACION-TABLAS-UNIVERSAL-v1.0](INFORME-PORTAL-PAGINACION-TABLAS-UNIVERSAL-v1.0.md) — programa de ADR-064, cerrado el mismo día

---

## Origen

Instrucción del CTO (2026-07-24): portar el sistema de paginación de la referencia TailAdmin (`nextjs-demo.tailadmin.com/data-tables`) — selector de tamaño de página, conteo de rango en el pie y navegación numerada.

La instrucción **contradice cuatro cláusulas de ADR-064**, aprobado ese mismo día y cuyo programa de adopción se acababa de cerrar en 4 olas y 28 componentes. Por eso la respuesta no fue implementar, sino emitir ADR-065.

## Enmienda de alcance — orden por columna (mismo día)

El CTO señala que la v1.0 del ADR **omitió el orden por encabezado de columna**. La observación es correcta y la omisión era sustantiva: sin orden por columna el operador puede llegar a la página 7 pero no puede decidir qué contiene. Se resuelve como **ADR-065 v1.1**, no como ADR nuevo, porque el documento aún no había entrado en vigor.

Línea base verificada, y explica por qué es alcance nuevo y no ajuste de interfaz:

| Hecho | Evidencia |
| --- | --- |
| **Un solo endpoint de 35 acepta `sort`** | `commercial/dto/catalog-query.dto.ts:93-101`; los otros 34 tienen `ORDER BY` fijo |
| El modelo vigente es preset de negocio, no columna + dirección | `CATALOG_SORT_VALUES` (`:15-19`), expuesto con un `<Select>` en `AdditionalProductsPanel.tsx:619` |
| **`aria-sort` no aparece ni una vez en el repo** | también ausentes `onSort`, `sortable`, `toggleSort` |
| Punto de extensión correcto ya existe | `PortalDataTableHead` (`portal-ui.tsx:49-65`) con `scope="col"` por construcción |

Decisiones añadidas (ADR-065 §Decisión 17-22): contrato `sortBy` + `sortDir` con lista blanca por recurso · `sortableFields` declarado por el servidor · **tope de 3-5 columnas ordenables por tabla, cerrado con medición de índices en la Ola 2** · orden solo donde `randomAccess: true` · ciclo de tres estados con retorno al orden por defecto · orden fuera del encabezado en mobile, reutilizando el `<Select>` de Comercial como variante · `aria-sort` resuelto en el primitive.

**DEF-1 queda agravado:** con orden fijo el defecto del desempate era latente; con orden por columna el operador lo provoca a voluntad ordenando por estado, categoría o tipo. El desempate por `id` pasa de buena práctica a condición de publicación de cada columna.

**Duplicación adicional detectada:** `SeguimientoTab.tsx:246-281` ya implementa un paginador numerado completo en cliente sobre un array en memoria. No apareció en el inventario inicial porque no consume `PortalTablePagination`. Entra en la Ola 5; su opción «todos» requiere decisión aparte por ADR-064 §8.

## Decisiones del CTO en sesión

| Pregunta | Decisión |
| --- | --- |
| Alcance | Universal — la paginación numerada es el default de las tablas operativas |
| Conteo | Al pie, como TailAdmin; un solo conteo visible por tabla |
| Superficies | `apps/portal` y `apps/web` |

## Consulta multiagente

| Agente | Veredicto | Aportación decisiva |
| --- | --- | --- |
| AI-PROD-UX | GO-CON-ENMIENDAS (13) | El dolor real no es el control sino que **la página no vive en la URL**. Objeción E1 al alcance universal en feeds cronológicos |
| AI-DS-OWNER | GO-CON-ENMIENDAS (10) | Primitive hermano, no `variant`. Rechazo de tres detalles del demo por WCAG y por rol del lima. **Cero tokens nuevos** |
| AI-FE-PLATFORM | GO-CON-ENMIENDAS (4) | Inventario de 28+4 superficies y reparto 14 keyset / 14 offset. Costo ~79 días-persona. Big-bang NO-GO |
| AI-SR-FULL | GO-CON-ENMIENDAS (7) | **16 de 35 endpoints ya son offset** y el `COUNT` ya se paga: la decisión es más barata de lo que aparentaba. Y cuatro defectos preexistentes que la numeración vuelve visibles |

## Desempates emitidos

**[DESEMPATE] Ubicación del conteo.** DS-OWNER sostenía conteo exclusivo en `PortalResultsStrip` con el pie limitado a `Página 3 de 12`; el CTO y PROD-UX (E3) coincidían en llevarlo al pie. **Prevalece el conteo al pie**, preservando el principio de DS de un solo conteo visible por tabla, enmendando su ubicación. Registro en ADR-065 §Decisión 4.

**[DESEMPATE] Alcance universal frente a la objeción E1.** PROD-UX y SR-FULL coinciden en que numerar feeds de alto volumen es técnicamente insostenible. **Acogida en sustancia, reformulada en forma:** se implementa como `meta.capabilities.randomAccess` declarado por el servidor, no como lista de excepciones por módulo. Así el default sigue siendo numerado —instrucción del CTO— y la degradación es explícita y auditable en vez de negociada. Registro en ADR-065 §Decisión 2.

## Hallazgo dominante

La paginación numerada **no crea** los problemas: los **revela**. Cuatro defectos preexistentes que el «Cargar más» disimula, dos de correctitud y uno de seguridad:

| ID | Defecto | Severidad |
| --- | --- | --- |
| DEF-1 | Siete listados ordenan sin desempate único → con offset, filas duplicadas u omitidas entre páginas | Alta — correctitud |
| DEF-2 | `page` sin techo en 16 endpoints → agotamiento del pool, **explotable hoy** | Media-alta — seguridad |
| DEF-3 | Keyset de auditoría filtra `id < cursor` sobre UUID aleatorio → salta y repite registros en el log de cumplimiento | Alta — correctitud |
| DEF-4 | Seis tablas filtran en cliente sobre el buffer → con reemplazo de página, el pie miente al usuario | Alta — bloqueante de UI |

Deuda adicional registrada: assurance materializa la tabla completa en memoria; expedientes pagina con `slice` sobre PII descifrada; 9 endpoints sin cota alguna (ADR-064 §8 vigente); usuarios ordenados por UUID aleatorio; 6 formas de envelope conviviendo con `@iwana/shared` sin contrato de listado usado por nadie.

## Ola 0 — Gobierno · cerrada

| Entregable | Estado |
| --- | --- |
| ADR-065 v1.1 | **Aprobado por el CTO (2026-07-24)** — paginación numerada + orden por columna |
| ADR-064 marcado superado en §§2/3/5/9, con aviso de vigencia parcial | Actualizado |
| Spec UX (CA-PAG v2-01…v2-36 + CA-ORD-01…14, copy congelado, mobile, casos límite) | Escrita |
| Contrato DS (`PortalTablePager`, `PortalPageSizeSelect`, `PortalDataTableSortableHead`) | Escrito |
| Plan de adopción con olas y RACI | Escrito |
| Prompts de ejecución fases 1-6 | Escritos |
| `portal.instructions.md` | Actualizado |
| `component-recipes.md` §2 + reglas duras de `SKILL.md` | Actualizados |
| Firma iWana §2.3 | Actualizada |

## Costo declarado

Backend 5-7 semanas-persona · Frontend ~79 días-persona (65-90) · **9-16 semanas de calendario**; 9-10 con dos ingenieros de FE en paralelo y backend adelantado. El grueso no es la paginación: es la normalización de envelopes, los índices que no existen y los cuatro defectos.

**La enmienda del orden por columna crece sobre esa cifra** en las Olas 1 y 2: 34 de los 35 endpoints no aceptan `sort` hoy, y cada columna ordenable publicada cuesta un índice por tenant. La cifra revisada se cierra en la Ola 2, cuando la medición fije la lista blanca definitiva — no se estima aquí.

## Veredicto

**GO.** El CTO aprobó ADR-065 v1.1 el **2026-07-24**, cubriendo paginación numerada y orden por columna en una sola decisión. La Ola 0 queda cerrada y la norma es efectiva.

El merge gate se invierte desde hoy: lo que antes se rechazaba —tabla operativa con paginación numerada— es ahora el default exigido, y lo que antes era norma —«Cargar más» como default— queda reservado a los recursos que el contrato declare con `capabilities.randomAccess: false`.

## Estado de las olas

| Ola | Responsable | Estado |
| --- | --- | --- |
| 0 · Gobierno | AI-EM-ARCH | **Cerrada y aprobada** |
| 1 · Contrato de API + orden + deuda crítica | AI-SR-FULL | **Desbloqueada** — prompt listo, bloquea a todas las demás |
| 2 · Índices y cierre de la lista blanca | AI-SR-FULL + AI-PLAT-OPS | Bloqueada por Ola 1 **y por la decisión sobre `runner.ts`** |
| 3 · Infraestructura y primitives FE | AI-FE-PLATFORM | Bloqueada por Ola 1 |
| 4 · Piloto (Suscriptores) | AI-FE-PLATFORM + gate AI-SR-QA | Bloqueada por Ola 3 |
| 5 · Cosecha de superficies offset | AI-FE-PLATFORM | Bloqueada por el gate de la Ola 4 |
| 6 · Superficies keyset | AI-SR-FULL → AI-FE-PLATFORM | Bloqueada por Ola 5 |
| 7 · Grupo sin cota + gate final | AI-SR-FULL + AI-SR-QA | Bloqueada por Ola 6 |

## Escalaciones

**Cerrada.** Aprobación de ADR-065 — resuelta por el CTO el 2026-07-24.

**Plan de resolución:** [2026-07-24-escalaciones-abiertas-paginacion.md](../plans/2026-07-24-escalaciones-abiertas-paginacion.md) — quién decide cada una, qué dato falta y qué ola bloquea.

**DEF-2 se saca del camino crítico** por decisión del CTO (2026-07-24): se remedia como parche independiente, sin esperar a la Ola 1. Prompt: `docs/prompts/PROMPT-API-DEF2-COTA-PAGE-v1.0.md`. Verificado en sesión: `assurance/dto/index.ts:359-361` declara `page` con `@Allow()` —sin `@IsInt`, sin `@Min`, sin tope— y `list-visit-requests-query.dto.ts:89-93` tiene `@Min(1)` pero ningún máximo. Severidad media-alta: exige cuenta autenticada, pero el pool de pgBouncer es compartido, así que la degradación cruza tenants.

**Abiertas:**

1. **`migrations/tenant/runner.ts:225`** — `CREATE INDEX CONCURRENTLY` no puede correr dentro de la transacción que envuelve cada migración. Decisión de plataforma con AI-PLAT-OPS, **necesaria antes de la Ola 2, no de la Ola 1**; posiblemente ADR hermano.
2. **`TasksTable`** — clasificación feed o directorio, pendiente del PRD del módulo. Necesaria antes de la Ola 5.
3. **DEF-2** — la cota de `page` remedia un vector de agotamiento del pool **vigente hoy**; entra en la Ola 1 y debería cerrarse aunque el programa se detuviera.
4. **Pickers con soft-cap silencioso** — deuda P1 independiente; ninguna variante de paginación los arregla, necesitan búsqueda tipo-ahead.
5. **`SeguimientoTab.tsx:246-281`** — paginador numerado a mano; su opción «todos» requiere decisión antes de portarla (ADR-064 §8 sigue vigente).
