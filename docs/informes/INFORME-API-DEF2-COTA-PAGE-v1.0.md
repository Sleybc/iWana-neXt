# INFORME-API-DEF2-COTA-PAGE-v1.0

**Módulo:** API — cota de `page` en endpoints de listado (DEF-2)
**Fase:** Auditoría de gate post-ejecución
**Modo:** AI-EM-ARCH Orchestrator · protocolo multiagente
**Fecha:** 2026-07-24
**Prompt ejecutado:** [`PROMPT-API-DEF2-COTA-PAGE-v1.0.md`](../prompts/PROMPT-API-DEF2-COTA-PAGE-v1.0.md)
**Origen del defecto:** [ADR-065](../adrs/ADR-065-Paginacion-Numerada-Tablas-Operativas.md) §DEF-2 — remediación sacada del camino crítico por decisión del CTO
**Auditores:** AI-SEC-ENG (completo) · AI-SR-QA (**detenido antes de reportar**) · AI-EM-ARCH (verificación propia)

---

## Veredicto

# NO-GO para merge

Un solo bloqueante, acotado a un archivo. El helper está bien construido y el vector de `OFFSET` queda cerrado en 14 de 15 sitios — pero el parche **no cumple su propio objetivo** en CRM, e introdujo una regresión funcional que el prompt prohibía expresamente.

---

## Qué se verificó y qué no

| Dimensión | Estado |
| --- | --- |
| Seguridad — aplicación efectiva del clamp, bypass, superficie residual | **Verificada** (AI-SEC-ENG, sitio por sitio) |
| Suite de API | **Verde**: 197 suites, 2222 tests, 36,8 s |
| ESLint sobre los archivos de paginación tocados | Limpio |
| Cumplimiento de alcance del prompt | **Verificada** (AI-EM-ARCH + AI-SEC-ENG) — incumplido, ver H-2 |
| **Cobertura de tests por endpoint** | **NO VERIFICADA** — el auditor de QA fue detenido antes de producir la matriz |
| `pnpm typecheck` / `pnpm lint` completos | **NO VERIFICADOS** — correspondían a QA |

La suite verde **no es evidencia de corrección aquí**: H-2 es una regresión viva que ningún test cubre. La dimensión que habría medido exactamente eso —cobertura de los cinco casos exigidos por endpoint, no solo en el helper— es la que quedó sin verificar.

---

## Hallazgos

### H-2 · ALTA · **BLOQUEANTE** — regresión del filtro `slaBreachStatus` y violación de alcance

`assurance/services/tickets.service.ts:270-333`. El parche convirtió la paginación en memoria en paginación SQL: antes filtraba por SLA sobre el conjunto completo y luego cortaba; ahora corta en SQL (`:311`) y filtra después, sobre las 20 filas de la página (`:325-327`).

Con `slaBreachStatus` activo, la página devuelve menos filas de las debidas —posiblemente cero— aunque existan cientos de tickets incumplidos más adelante, y el `total` (`:333`) cuenta **sin** el filtro, de modo que el paginador ofrece páginas vacías.

El portal usa ese filtro (`apps/portal/src/components/assurance/AssuranceClient.tsx:179`) y **ningún test lo cubre**.

Incumple la restricción literal del prompt: «Sin cambio de contrato de respuesta… un `page` válido devuelve exactamente lo que devuelve hoy». Es adelanto de la Ola 1 de ADR-065 dentro de un hotfix que lo vetaba.

**Matiz que corresponde reconocer:** el estado anterior —`getMany()` sin límite, materializando la tabla completa— era peor en seguridad, y corregirlo es acertado. El defecto es de proceso: debía ir en su propio parche, con su test.

**Salida:** revertir `list()` a su semántica previa y mover el cambio de paginación a un parche propio, **o** llevar `slaBreachStatus` al SQL con un test que lo cubra.

### H-1 · ALTA · El parche no cumple su objetivo en CRM

`clampPage` acota el producto `page * limit`, **no `limit`**. Los cuatro endpoints de CRM no tienen `@Max` en ninguna capa —ni DTO ni Zod, solo `Number()` en el controlador—: `crm/expedientes/expedientes.controller.ts:108-120` y `:355-361`, `crm/subscribers/subscribers.controller.ts:99-109`.

`GET /crm/expedientes?page=1&limit=9999` → `1 × 9999 ≤ 10_000` → **pasa**. Devuelve 9.999 filas y a continuación `expediente.service.ts:671-673` ejecuta un `Promise.all` que, por fila, abre **dos** `runInTenantSchema` (`completeness-calculator.service.ts:59` y `:74`): ~20.000 adquisiciones concurrentes contra un pool de ~8 conexiones útiles. **Amplificación superior al `OFFSET` que DEF-2 vino a remediar**, con el mismo modelo de amenaza —cuenta autenticada, degradación cruzada entre tenants— y sobreviviendo intacta al parche.

`GET /crm/subscribers?page=1&limit=10000` cae justo en el borde y devuelve 10.000 registros con documento, teléfono y correo en una sola respuesta: amplificador de extracción masiva de datos personales, relevante a Ley 1581.

Incumple el entregable 3 del prompt: «`limit` con tope donde no lo tenga: default 20, máximo 100».

### H-3 · MEDIA · `tenant.service.ts` no usa el helper

`tenant/tenant.service.ts:16` importa `clampPage` y **nunca lo invoca**; inlinea en `:269-271` un `if (offset > 10_000)`. No cubre negativos, no enteros, `NaN` ni el producto. Combinado con `tenant.controller.ts:748-749` (`parseInt(...) || 0`, sin filtrar negativos):

- `?offset=-5` → el `if` no dispara → `.skip(-5)` → PostgreSQL rechaza el `OFFSET` negativo → **500 con traza en logs, en vez de 400**.
- `?limit=-5` → `.take(-5)` → mismo resultado.

Incumple el entregable 4 («un solo helper compartido, no una copia por módulo») y deja la ruta de plataforma fuera de la cota real. **ESLint no detecta el import muerto** — verificado.

### H-4 · MEDIA · Superficie residual: `documentNumber` sin paginar

`crm/expedientes/expediente.service.ts:645-668`. Cuando llega `documentNumber`, la rama **omite `skip`/`take`**: `getMany()` sobre la tabla completa (`:653`), descifrado AES-256-GCM fila a fila (`:660`) y paginación en memoria (`:665-667`). El clamp no muerde porque ni `page` ni `limit` alcanzan la consulta. Vector equivalente al remediado, intacto y además CPU-bound.

### H-5 · BAJA · El clamp corre dentro de la transacción de tenant en 4 sitios

`parties/services/party.service.ts:82`, `parties/adapters/party-read.adapter.ts:63`, `wfm/services/visit-requests.service.ts:175`, `inventory/services/write-off.service.ts:292`. La petición rechazada ocupa un slot del pool durante el round-trip. Contradice la restricción 4 del prompt («el clamp se valida antes de tocar la base de datos»). Los otros 10 sitios sí cumplen.

### H-6 · BAJA · La corrección del DTO de assurance no era el cierre real

`assurance/dto/index.ts:361-372` sustituyó el `@Allow()` por la cadena completa, como pedía el prompt. Pero ese controlador valida con `ZodValidationPipe` (`assurance.controller.ts:103`), no con el `ValidationPipe` global: quien validaba en runtime era el Zod de `dto/index.ts:108-109`, que **ya estaba correcto antes del parche**.

**Corrección al diagnóstico original:** el `@Allow()` que este informe y el prompt señalaron como el peor caso **no era el hueco explotable en esa ruta**. La corrección sirve para OpenAPI y para el día en que se cambie el pipe.

---

## Verificado sin hallazgo

- **Bypass del clamp: ninguno.** Ningún llamador interno alcanza un `.skip(` sin pasar por el helper. Los consumidores server-to-server (`supplier-party.port.ts:164`, `visit-requests.service.ts:943-957`) usan cursor o atraviesan el adaptador acotado. Ningún job de BullMQ toca estos métodos. Sin `OFFSET` en SQL crudo.
- **`maxOffset` sobreescrito: ninguno.** Los 14 call sites llaman con dos argumentos; el único uso del tercero está en el spec, con un valor menor.
- **Sitios que no usan `page` como variable:** verificados — en `party.service.ts`, `party-read.adapter.ts` y `serialized-asset.service.ts` el `skip` se deriva de los valores ya acotados. El único donde la variable del `skip` no pasa por el helper es `tenant.service.ts` (H-3).
- **Multi-tenancy:** sin cambios en `runInTenantSchema`, `SET LOCAL search_path` ni `TenantContext`. Sin PII nueva en logs ni mensajes.
- **Consumidores del frontend:** ninguna pantalla depende de valores por encima del tope. `drainInventoryBalances` drena por cursor, no por `page`. **No hay presión para subir la cota.**
- **`packages/shared` no se tocó:** no se adelantó el contrato de la Ola 1 por esa vía.
- **Mensajes de error:** sin fuga de tabla, columna, valor recibido ni PII. El tope es derivable por búsqueda binaria, pero es un parámetro de escala, no un secreto. Riesgo aceptado.

---

## Disposición

| # | Acción | Severidad | Momento |
| --- | --- | --- | --- |
| 1 | Cerrar **H-2**: revertir `list()` de assurance o llevar `slaBreachStatus` al SQL con test | ALTA | **Bloqueante de merge** |
| 2 | Cerrar **H-1**: `@Max(100)` en `limit` de los cuatro endpoints CRM | ALTA | Continuación inmediata del hotfix, no backlog — sin esto DEF-2 no cumple su objetivo |
| 3 | **H-3**: sustituir la cota manual de `tenant.service.ts` por `clampPage`; sanear el parseo negativo del controlador | MEDIA | Mismo parche que 2 |
| 4 | **H-4**: acotar la rama `documentNumber` de expedientes | MEDIA | Ticket propio |
| 5 | **H-5**: mover el clamp fuera de `runInTenantSchema` en los 4 sitios | BAJA | Se absorbe en la Ola 1 |
| 6 | **H-6**: documentar que la validación efectiva de assurance es Zod | BAJA | Nota en el módulo |
| 7 | **Completar la auditoría de QA**: matriz de cobertura de los cinco casos por endpoint, `typecheck` y `lint` completos | — | Antes de declarar el gate cerrado |

Con 1 cerrado, el veredicto pasa a **GO-CON-DEUDA**. Con 1 y 2 cerrados, DEF-2 queda efectivamente remediado.

---

## Hallazgo de proceso

El prompt declaraba tres restricciones de alcance —sin cambio de contrato de respuesta, sin adelantar la Ola 1, cambio de comportamiento nulo para un `page` válido— y **las tres se incumplieron en el mismo archivo** (H-2), en un parche cuyo valor era precisamente ser pequeño, aislado y mergeable sin esperar al programa de 9-16 semanas.

Para las olas de ADR-065, donde el alcance por fase es la principal defensa contra una rama de meses sin merge, conviene que el stop/go incluya una verificación explícita de alcance —un diff acotado a los archivos previstos— y no solo la suite verde. La suite verde no detectó ninguno de los dos hallazgos altos.
