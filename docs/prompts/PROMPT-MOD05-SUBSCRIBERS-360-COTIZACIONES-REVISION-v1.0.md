# PROMPT-MOD05 — Suscriptores · Cotizaciones en la ficha 360° · Revisión y evidencia

**Versión:** 1.0 · **Fecha:** 2026-10-31 · **Emisor:** AI-EM-ARCH
**Historial:** el 2026-10-31, tras el NO-GO de la Ola 1 ([INFORME v1.0](../informes/INFORME-MOD05-360-COTIZACIONES-REVISION-v1.0.md), hallazgo P2 de R2), se añadió §Ola 2 (R4, R5, R6). El CTO eligió cumplir RF-S404-50 **completo** para la 360°, no solo para las cotizaciones. R1 a R3 ya cerraron y no se re-despachan.
**Origen:** un cambio escrito el 2026-10-31 en una sesión de AI-EM-ARCH, **fuera de su perfil** (el perfil no produce código). Se conserva por decisión del CTO del mismo día, con la condición de que lo revise y certifique quien sí es dueño del área. **Ninguna evidencia producida en esa sesión cuenta para el gate.**
**Requisito:** [PRD MOD05 Fase 04](../prds/PRD-MOD05-CRM-SUBSCRIBERS-FASE-04-v1.0.md) RF-S404-25 y CA-S404-06: el payload 360° deja de devolver las cotizaciones codificadas como vacías.
**Límite vigente:** decisión D-CONT del CTO (2026-10-15, [INFORME-MOD05-G7-D-CONT](../informes/INFORME-MOD05-G7-D-CONT-v1.0.md)). `contacts: []` en la 360° es **intencional** y no se toca.
**Referencia:** [REFERENCIA-UISP-CRM-MOD05-v1.1](../referencias/REFERENCIA-UISP-CRM-MOD05-v1.1.md) §10.3 y §10.8 describen el cambio. Si la revisión lo corrige, AI-EM-ARCH actualiza esas secciones.

## Alcance exacto del cambio a revisar

| Archivo | Cambio | Estado en el árbol |
| --- | --- | --- |
| `apps/api/src/modules/crm/subscribers/subscribers.service.ts` | Tipo exportado `Subscriber360Quote`; método privado `loadSubscriberQuotes(subscriber, schemaName)`; `get360View` devuelve `quotes` en lugar de `[]`; imports de `FindOptionsWhere`, `Quote` y `QuoteStatus` | Modificado; el diff del archivo es solo este cambio (+46/−3) |
| `apps/api/src/modules/crm/subscribers/tests/subscribers.service.spec.ts` | Dos pruebas nuevas en `describe('get360View')` | Modificado; el diff es solo este cambio |
| `apps/api/src/modules/crm/subscribers/subscriber-360-quotes.postgres.integration.spec.ts` | Prueba nueva: crea `quotes` con la migración real `028` en un schema efímero | Nuevo |
| `apps/portal/src/lib/api-client.ts` | Interfaz `Subscriber360Quote`; `Subscriber360Response.quotes` deja `unknown[]`; comentario sobre `contacts` (D-CONT) | **Mezclado** con cambios sin commitear de otras olas: revisar solo esas líneas |

**Comportamiento implementado:**
- Lee las cotizaciones donde `subscriber_id` es el suscriptor **o** `expediente_id` es su expediente de origen, ordenadas por `created_at` descendente. Excluye las borradas lógicamente.
- Expone solo el resumen comercial: `id`, `expedienteId`, `status`, `planId`, `monthlyAmount` como número, `expiresAt` y `createdAt`. **Nunca** `plan_snapshot_json`.
- Para un titular anonimizado (`anonymizedAt` no nulo) devuelve `[]` sin consultar.

## Reglas comunes

1. Lee `AGENTS.md`, este prompt y los `SKILL.md` de tu bloque **antes** de actuar.
2. Se trabaja en `main`. Hay muchas rutas sin commitear de otras olas: no las toques. **No commitees**: el commit lo hace AI-EM-ARCH tras el cierre.
3. Solo `pnpm`. Las pruebas corren sin caché de turbo y con conteo real de suites y pruebas (`iwana-test-evidence`). Un verde sin cifras no cuenta; una integración omitida (`skipped`) tampoco.
4. Si un hallazgo exige cambiar el comportamiento descrito arriba, emite `[BLOQUEO] <punto> — <motivo>` y para. No rediseñes.

---

## R1 · `sr-backend` — Revisión de código y corrección acotada

**Skills obligatorias:** `nestjs-expert`, `backend-security-coder`, `architect-review`, `test-driven-development`. **De apoyo:** `postgresql`, para el `OR` con TypeORM y el índice `idx_quotes_expediente`. **Descartadas:** `openapi-spec-generation`, porque la 360° no declara un esquema de respuesta propio; si lo declara, pasa a obligatoria.

Revisa y responde cada punto con «conforme» o con el hallazgo y su corrección:

1. **Frontera.** `SubscribersService` lee la entidad `Quote` directamente con `qr.manager.find`, igual que ya hace con `Contract`. ¿Es aceptable dentro del bounded context CRM, o debe ir por un puerto (`CrmQuoteReadPort` con un método por suscriptor)? Decide con `architect-review` y justifica.
2. **Privacidad.** Titular **anonimizado**: devuelve `[]`. Titular **bloqueado** (`DATOS_BLOQUEADOS`) sin permiso de ver bloqueados: hoy devuelve las cotizaciones completas. Compáralo con lo que hace `projectContractsForRead` con los contratos de un titular bloqueado y con `redactExpedienteSummary` en el controlador. Si deben redactarse, corrígelo con prueba.
3. **Tenancy.** La consulta corre en `runInTenantSchema` y no filtra por `tenant_id`. Confirma que es coherente con el resto de lecturas de la 360°.
4. **Exactitud del monto.** `Number(quote.monthlyAmount)` sobre `numeric(14,2)`. ¿Aceptable para un resumen de lectura, o el contrato debe devolver el string como el resto del CRM?
5. **Pruebas.** Las dos pruebas unitarias simulan el acceso a datos. La integración usa la migración real `028`. Confirma que la integración se **ejecuta** (no `skipped`) con `IWANA_DB_INTEGRATION_AVAILABLE=true` y `DB_NAME` permitido, y que cubre: suscriptor, expediente, ajena, borrada y orden.
6. **Regresión.** La suite completa de `@iwana/api` sigue en verde.

**Entrega:**
- informe en `docs/informes/INFORME-MOD05-360-COTIZACIONES-REVISION-v1.0.md`, verificando antes que la ruta esté libre;
- cada punto con su veredicto y los archivos que corregiste;
- evidencia con comandos y conteos;
- deuda nueva clasificada de P0 a P3.

## R2 · `contract-drift-reviewer` — Deriva de contrato API ↔ portal

**Skills obligatorias:** `architect-review`.

La interfaz `Subscriber360Quote` se declara dos veces: en la API (`subscribers.service.ts`) y en el portal (`api-client.ts`). No hay tipo en `@iwana/shared`. Verifica:
- que los campos y tipos coinciden;
- que `status` en el portal coincide con `QuoteStatus` de la API;
- si el patrón vigente para la 360° (tipos locales del portal) admite esta duplicación o exige mover el tipo a `@iwana/shared`.

Solo lectura: reporta con `archivo:línea`.

## R3 · `gate-verifier` — Evidencia de gates (tras R1 y R2)

**Skills obligatorias:** `iwana-test-evidence`, `verification-before-completion`, `turborepo-caching`.

Sobre los cuatro archivos del alcance, más lo que R1 haya corregido:
- typecheck de `@iwana/api` y `@iwana/portal`;
- lint de las rutas tocadas;
- suite unitaria completa de `@iwana/api` sin caché;
- la integración `subscriber-360-quotes` con conteo y **sin omisiones**.

Entrega la tabla de gates con comandos, conteos y veredicto GO/NO-GO. No corrige código.

## Cierre (AI-EM-ARCH)

**GO** solo si se cumplen las tres condiciones:
- R1 sin hallazgos P0/P1 abiertos;
- R2 sin deriva no justificada;
- R3 en GO con conteo real.

Con GO, AI-EM-ARCH:
1. commitea **solo** las rutas del alcance, más lo que R1 haya corregido, y separa las líneas de `api-client.ts` de los cambios ajenos;
2. actualiza la referencia UISP §10.3 y §10.8;
3. deja la constancia en el informe de R1.

**Resultado de la Ola 1 (2026-10-31): NO-GO.** R1 y R3 en GO, con la privacidad de titulares bloqueados corregida. R2 detectó que la duplicación de tipos incumple RF-S404-50. Al consolidar, AI-EM-ARCH verificó que la deuda es más amplia que la cotización: **todo el contrato de la 360°** vive solo en el portal y ya diverge de la API. Eso se resuelve en la Ola 2.

---

## Ola 2 · Contrato de lectura de la ficha 360° en `@iwana/shared` (RF-S404-50 completo)

**Antecedente:** las olas B-BE1 y B-FE1 de la Fase 04 ([plan](../plans/2026-09-04-mod05-subscribers-fase-04-orquestacion.md)) publicaron en `@iwana/shared` el listado y el detalle (`SubscriberListItem`, `SubscriberDetail` en `packages/shared/src/schemas/subscriber.schema.ts`), pero dejaron la 360° en el portal.

**Estado verificado por AI-EM-ARCH, solo lectura:**

| Pieza | Dónde vive hoy | Problema |
| --- | --- | --- |
| `Subscriber360Response` | Solo `apps/portal/src/lib/api-client.ts` | Duplicado a mano. La API devuelve `provisioningReadiness` y el tipo del portal **no lo declara**: es deriva real |
| `SubscriberRecord` | Solo el portal: `Pick<SubscriberDetail, …>` más ~40 campos | Es el sujeto de la 360° y del detalle. La API no comparte su forma |
| `Subscriber360Quote` | Declarado en la API y en el portal | Hallazgo de R2 |
| `expedienteSummary` | La API lo tipa como `Record<string, unknown>`; el portal, como objeto literal | Sin contrato; además se redacta para el titular bloqueado (`redactExpedienteSummary`) |
| `timelineSeed` | La API usa `Array<Record<string, unknown>>` | `type` es texto libre, aunque hoy solo hay dos valores |
| `ProvisioningReadinessSummary` | `apps/api/src/modules/crm/provisioning-readiness.ts` | Tipo de respuesta fuera de `@iwana/shared` |
| `contacts` | `unknown[]` | Siempre vacío por D-CONT |

**Restricción de alcance:** **cero cambios de comportamiento en tiempo de ejecución.** Solo se mueven y tipan contratos. Si alinear un tipo exige que la API cambie lo que devuelve (salvo que el portal empiece a *declarar* un campo que la API ya envía), emite `[BLOQUEO]` y para.

### R4 · `sr-backend` — Publicar el contrato en `@iwana/shared` y tipar la API contra él

**Skills obligatorias:** `typescript-expert`, `nestjs-expert`, `architect-review`, `test-driven-development`. **De apoyo:** `typescript-pro`, para los tipos «tal como viajan en JSON». **Descartadas:** `database-migration` y `postgresql`, porque no hay cambios de datos.

1. **Ubicación:** crea `packages/shared/src/contracts/crm/subscriber-360.ts`, sigue el patrón de `contracts/network` y exporta desde el índice. Publica:
   - `Subscriber360Response`;
   - el sujeto de la 360° y del detalle, con el nombre `SubscriberRecord` para no romper a los consumidores. Debe reutilizar `SubscriberDetail` en lugar de volver a declarar sus campos;
   - `Subscriber360Quote`, junto con `SUBSCRIBER_360_QUOTE_STATUSES` (lista `as const`) y su tipo;
   - `Subscriber360ExpedienteSummary`;
   - `Subscriber360TimelineSeedItem`, con `type` como unión cerrada de los valores que la API emite hoy;
   - `ProvisioningReadinessSummary`, que se mueve a shared. La lógica de `provisioning-readiness.ts` no se mueve: solo el tipo, y la API lo importa de shared;
   - `contacts`, tipado como lista siempre vacía y documentado con D-CONT.
2. **Forma de los datos:** los tipos describen **lo que viaja en JSON**: fechas como `string` ISO y montos como hoy. Documenta en `Subscriber360ExpedienteSummary` qué campos llegan en `null` cuando el titular está bloqueado: los que `redactExpedienteSummary` no conserva.
3. **API:**
   - `get360View` (servicio y controlador) y el detalle `GET /crm/subscribers/:id` declaran su respuesta con los tipos de shared, de modo que el compilador detecte cualquier desalineación futura.
   - Sin `as unknown as` ni `any`. Si hace falta convertir `Date` a texto, se hace de forma explícita y probada, sin cambiar el JSON que ya sale hoy.
   - Retira de `subscribers.service.ts` la declaración local de `Subscriber360Quote`.
4. **Pruebas:**
   - Paridad entre `SUBSCRIBER_360_QUOTE_STATUSES` y el enum `QuoteStatus` de la API, con el patrón de `subscriber-enum-parity.postgres.integration.spec.ts` o una prueba unitaria equivalente.
   - Una prueba del controlador que compare la respuesta de la 360° con el contrato en tres casos: titular normal, titular bloqueado sin permiso y titular anonimizado.
5. **No toques `apps/portal`:** eso es R5.

### R5 · `fe-platform` — Reapuntar el portal y borrar el duplicado (después de R4)

**Skills obligatorias:** `typescript-expert`, `frontend-dev-guidelines`, `nextjs-app-router-patterns`. **Descartadas:** `core-components`, `iwana-identity-ui-review` y `tailwind-patterns`, porque no hay cambios visuales.

1. En `apps/portal/src/lib/api-client.ts` **borra** las declaraciones locales de `SubscriberRecord`, `Subscriber360Quote` y `Subscriber360Response`, y vuelve a exportarlas desde `@iwana/shared` **con los mismos nombres**. Así los ~20 consumidores de `components/crm/subscribers/` no cambian sus imports.
2. El archivo tiene **cambios sin commitear de otras olas**: toca solo esas declaraciones y sus imports, sin reordenar ni formatear el resto.
3. Si un consumidor deja de compilar por la tipificación más estricta (`timelineSeed.type`, `expedienteSummary`, `provisioningReadiness`), corrígelo con el cambio mínimo, sin cambios visuales, y cada archivo tocado consta en tu entrega. **No muestres `provisioningReadiness` en la UI**: solo se declara.
4. Las pruebas del portal que construyen objetos `Subscriber360Response` a mano se ajustan solo en lo que exija el tipo.

### R6 · Verificación (después de R5; R6a y R6b en paralelo)

- **R6a · `contract-drift-reviewer`** (`architect-review`, solo lectura). Verifica:
  - que no queda ninguna declaración duplicada de los tipos de la 360° fuera de `@iwana/shared`;
  - que la API los usa como tipo de retorno;
  - que el JSON real de `get360View` y del detalle coincide con el contrato.

  Reporta con `archivo:línea`.
- **R6b · `gate-verifier`** (`iwana-test-evidence`, `verification-before-completion`, `turborepo-caching`):
  - typecheck de `@iwana/shared`, `@iwana/api` y `@iwana/portal`;
  - lint de las rutas tocadas;
  - suites unitarias completas de `@iwana/shared`, `@iwana/api` y `@iwana/portal`, sin caché y con conteo;
  - la integración `subscriber-360-quotes` sin omisiones.

  Escribe la evidencia consolidada de la Ola 2 en `docs/informes/INFORME-MOD05-360-COTIZACIONES-REVISION-v1.1.md`, tras verificar que la ruta está libre, con veredicto GO/NO-GO. No corrige código.

### Cierre de la Ola 2 (AI-EM-ARCH)

**GO** solo si se cumplen las tres condiciones:
- R6a sin duplicados ni deriva;
- R6b en GO con conteo real, sin omisiones en la integración;
- ningún `[BLOQUEO]` abierto.

Con GO, AI-EM-ARCH:
1. commitea las rutas de las dos olas, en un commit separado para `api-client.ts` con solo sus líneas;
2. marca RF-S404-50 como cumplido para la 360° en el informe v1.1;
3. actualiza la referencia UISP §10.3 y §10.8.

**Resultado de la Ola 2 (2026-10-31): GO de R6, revocado por AI-EM-ARCH al consolidar.** El [informe v1.1](../informes/INFORME-MOD05-360-COTIZACIONES-REVISION-v1.1.md) es correcto en sus cifras, pero la Ola 2 **sí cambió el comportamiento en tiempo de ejecución**, contra la restricción de alcance:

- `subscribers.controller.ts`, en `sanitizeResponse`, ahora pasa `birthDate` por `toIsoOrNull`. Antes salía tal cual.
- `birth_date` es una columna `date` (`subscriber.entity.ts:92`), y TypeORM la hidrata como texto `YYYY-MM-DD`. El JSON pasa de `"1990-05-01"` a `"1990-05-01T00:00:00.000Z"`.
- `NaturalPersonFields.tsx:14-18` parte el valor por `-` y obtiene un día `NaN`. **El selector de fecha de nacimiento queda vacío al editar un suscriptor.** No se pierden datos: el valor se reenvía sin cambios si no se toca el campo.
- Las pruebas no lo detectaron porque sus fixtures usan objetos `Date`, no el texto que entrega TypeORM.

Severidad: **P1**, porque es una regresión visible en un flujo vigente y rompe el contrato. Los demás campos convertidos son `timestamptz` y su JSON no cambia.

---

## Ola 3 · Corrección de fechas solo-día (R7 → R8)

### R7 · `sr-backend` — Restaurar `YYYY-MM-DD` en las fechas solo-día

**Skills obligatorias:** `nestjs-expert`, `typescript-expert`, `test-driven-development`. **De apoyo:** `postgresql`, para la hidratación de columnas `date` en TypeORM. **Descartadas:** `database-migration`, porque no hay cambios de datos.

1. **Primero la prueba (TDD):** escribe una prueba de integración contra Postgres real que lea un suscriptor con `birth_date` **a través de la entidad**, es decir, con la hidratación real de TypeORM. La prueba exige que `sanitizeResponse` y la 360° devuelvan exactamente `YYYY-MM-DD`. Puede extender `subscriber-360-quotes.postgres.integration.spec.ts` o ser una prueba nueva con el mismo patrón. Debe fallar antes de la corrección.
2. **Corrección:** las columnas `date` se serializan como `YYYY-MM-DD`.
   - Si llega texto `YYYY-MM-DD`, pasa tal cual.
   - Si llega `Date`, por ejemplo en la ruta de creación, se toma su parte de fecha **en UTC**.
   - Nada de conversión a instante.
   - Documenta en `packages/shared/src/contracts/crm/subscriber-360.ts` que `birthDate` es fecha solo-día `YYYY-MM-DD` y no instante ISO.
3. **Barrido:** revisa todo campo que la Ola 2 empezó a convertir en el detalle y en la 360°, tanto en `subscribers.controller.ts` como en `subscribers.service.ts`, contra el tipo de su columna. Cualquier otra columna `date` se trata igual. Reporta la lista con `archivo:línea` y su tipo de columna.
4. Las fixtures unitarias que usan `Date` para columnas `date` se ajustan al texto real que entrega TypeORM, sin debilitar las aserciones.
5. No toques el portal: con el formato restaurado, el formulario vuelve a funcionar sin cambios.

### R8 · `gate-verifier` — Evidencia de la Ola 3 (después de R7)

**Skills obligatorias:** `iwana-test-evidence`, `verification-before-completion`, `turborepo-caching`.

1. Typecheck de `@iwana/shared` y `@iwana/api`, y lint de las rutas tocadas.
2. Suites completas de `@iwana/shared`, `@iwana/api` y `@iwana/portal`, sin caché y con conteo.
3. Las integraciones de R7 y `subscriber-360-quotes`, sin omisiones.
4. Una comprobación de JSON real, `GET /crm/subscribers/:id` y `GET …/360`, contra la API de desarrollo, con un suscriptor sintético que tenga fecha de nacimiento: `birthDate` debe responder `YYYY-MM-DD`.
5. Escribe `docs/informes/INFORME-MOD05-360-COTIZACIONES-REVISION-v1.2.md`, tras verificar que la ruta está libre, con veredicto GO/NO-GO.

### Cierre de la Ola 3 (AI-EM-ARCH)

**GO** si se cumplen las tres condiciones:
- R8 en GO con conteo real;
- la integración de R7 falló antes de la corrección y pasa después;
- el JSON real devuelve `YYYY-MM-DD`.

Con GO aplican los tres pasos del cierre de la Ola 2, sobre el informe v1.2.

**Resultado de la Ola 3 (2026-10-31): GO, consolidado por AI-EM-ARCH.** Ver el [informe v1.2](../informes/INFORME-MOD05-360-COTIZACIONES-REVISION-v1.2.md).

- Las tres condiciones se cumplen.
- R7 amplió el alcance a la **escritura** porque R8 encontró un fallo real: guardar `1990-05-01` dejaba `1990-04-30`. La causa era el `new Date(...)` previo en una columna `date`, formateado con la hora local del servidor. Se acepta la ampliación: es una corrección de integridad, probada en rojo y luego en verde, y sin migración.

**Deuda nueva, fuera de este cierre:**

| # | Hallazgo | Severidad | Destino |
| --- | --- | --- | --- |
| DT-1 | El mismo error en MOD08 Parties: `party.service.ts:246` (`birth_date`) y `:249` (`incorporation_date`) guardan `new Date(dto.…)` en columnas `date` | P2 | Bloque propio de `sr-backend` en Parties, con prueba de integración que lea la fecha a través de la entidad |
| DT-2 | Fechas de nacimiento de suscriptores, y de Parties por DT-1, guardadas antes de la corrección con la API en UTC-5: pueden estar un día atrás. No hay producción (ADR-095) | P3 | Inventariar y corregir en desarrollo, si se decide; en la checklist de G7, confirmar que no hay datos productivos afectados |
