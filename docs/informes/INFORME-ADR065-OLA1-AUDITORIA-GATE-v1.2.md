# INFORME — Tercera auditoría de gate: DEF-2 + Ola 1 de ADR-065

**Versión:** 1.2
**Fecha:** 2026-07-24
**Modo activo:** **Architect + EM** (auditoría de gate, sin ejecución de código)
**Autor:** AI-EM-ARCH
**Antecedentes:** [v1.0](INFORME-ADR065-OLA1-AUDITORIA-GATE-v1.0.md) (13 disposiciones) · [v1.1](INFORME-ADR065-OLA1-AUDITORIA-GATE-v1.1.md) (6 disposiciones)
**Re-gate del ejecutor:** [INFORME-ADR065-OLA1-REGATE-v1.3](INFORME-ADR065-OLA1-REGATE-v1.3.md) — GO / GO
**Clasificación:** Uso interno

---

## Veredicto

| Gate | v1.1 | **v1.2** |
| --- | --- | --- |
| **Contenido de la Ola 1** | NO-GO por R-1 | **GO** — confirmo el veredicto del re-gate v1.3 |
| **DEF-2 hotfix** | GO-CON-DEUDA, D-4 abierta | **GO** — D-4 cerrada con la migración 088 |
| **Escalaciones E-1…E-4** | Cerradas | **Cerradas y ejecutadas** (ADR-066 implementado) |
| **Merge de la rama** | — | **BLOQUEADO por R-6** |

Las seis disposiciones de v1.1 están cerradas. **El contenido de la fase está listo.** Lo que bloquea el merge no es deuda de Ola 1: es un defecto de integración que la propia remediación de R-3 introdujo en el pipeline de CI, y que ninguna de las compuertas locales puede ver.

---

## 1. Disposiciones de v1.1 — verificación

| # | Acción | Estado | Evidencia verificada |
| --- | --- | --- | --- |
| 1 | R-1 doble de prueba + aserción sobre el orden | **Cerrada** | `useful-life-alerts.service.spec.ts:57` añade `addOrderBy: jest.fn().mockReturnThis()`; `:121-122` afirman `orderBy('asset.updated_at','DESC')` **y** `addOrderBy('asset.id','DESC')` — el desempate DEF-1 queda cubierto, no solo silenciado |
| 2 | R-3 backfill como migración de datos idempotente | **Cerrada** | `088_backfill_expediente_document_number_hash.ts` — la opción (a) que decidí |
| 3 | R-2 renumerar la migración de índices | **Cerrada, mejor de lo pedido** | `089_pagination_ordering_indexes.ts` en plan padre `:64`, plan de escalaciones `:14`, ADR-065 `:318` y prompt de Fase 2 `:20`/`:61`, con «087 = hash, 088 = backfill» **reservado en línea** para que no vuelva a colisionar |
| 4 | §4 resolver el conflicto de artefactos | **Cerrada** | Cadena de supersesión limpia: v1.0→v1.1 marcada «documento histórico. No usar como veredicto actual», v1.2 marcada histórica, **v1.3 vigente**. Ningún veredicto contradictorio activo |
| 5 | R-5 stop/go de orden para la Ola 2 | **Cerrada** | Prompt de Fase 2 `:63` — «por cada recurso que publique `sortableFields` no vacío, un test debe verificar que un `sortBy` válido **cambia el ORDER BY emitido** y que `meta.sort` refleja el orden **aplicado**, no el pedido» |
| 6 | R-4 clamp fuera de la transacción | **Cerrada** | `party.service.ts:95`, `party-read.adapter.ts:62`, `visit-requests.service.ts:140`, `write-off.service.ts:256` — los cuatro antes de `runInTenantSchema` |

### Calidad de la migración 088 — verificada punto por punto

Idempotente (`WHERE document_number_hash IS NULL AND document_number_encrypted IS NOT NULL`); keyset por `id` que avanza aunque un descifrado falle, sin riesgo de bucle; `UPDATE` con reguarda `AND document_number_hash IS NULL`; cero PII en logs —solo el `id` de la fila ante fallo—; registrada en el runner (`:47`, `:169`); `transactional = true` correcto porque es DML.

**`down()` no-op no es una violación de reversibilidad**, y lo dejo dicho para que una auditoría futura no lo levante como hallazgo: revertir `087` elimina la columna, de modo que el par 087+088 sí es reversible en conjunto; anular los hashes por separado rompería la búsqueda sin ganancia alguna. La justificación está escrita en el propio archivo.

### Fuera del alcance pedido, verificado y correcto

**ADR-066 está ejecutado.** `runner.ts` y `revert.ts` bifurcan según `isTenantMigrationTransactional(migration)` con default `true` (`runner.ts:196-205, 230-232`; `revert.ts:230-232`). Era el primer entregable de la Ola 2 y la ejecución pendiente de E-1: la Ola 2 ya no arranca con esa dependencia encima.

---

## 2. Compuertas ejecutables

| Compuerta | Resultado |
| --- | --- |
| `pnpm --filter @iwana/api test` | **Verde** — 205 suites, 2.307 tests, 0 fallos (línea de resumen de Jest) |
| `pnpm --filter @iwana/api typecheck` | **Verde** |
| `pnpm --filter @iwana/db typecheck` | **Verde** |
| `pnpm --filter @iwana/db build` | **Verde** — relevante: las migraciones se ejecutan contra `dist/` |
| `pnpm --filter @iwana/api lint` | **Verde** — 0 errores, 1 warning preexistente |
| **Pipeline de CI (`ci.yml`)** | **ROJO por construcción** — ver R-6 |

---

## 3. Hallazgos abiertos

### R-6 · ALTA · La migración 088 rompe el pipeline de CI

`ci.yml:137-148` ejecuta `pnpm --filter @iwana/db migration:tenant:run` sobre un tenant recién creado. El `env:` del job (`ci.yml:40-52`) declara `LEAST_PRIVILEGE_MODE` y trece variables `DB_*` — **y ninguna `MFA_ENCRYPTION_KEY`**.

La migración 088 llama a `loadAesGcmKeysFromEnv()` de forma **incondicional y antes de la primera consulta**: `088_…ts:26` pasa solo `{ warn }`, así que `activeKey` queda `undefined` y `backfill-…util.ts:120-123` cae en la rama que lee el entorno; sin la variable, lanza `Error('MFA_ENCRYPTION_KEY es requerida para backfill de document_number_hash (migración 088)')`.

Ningún punto de `packages/database` carga `dotenv` —verificado en `data-source.ts` y en `cli/`—, así que la única fuente es el entorno ambiente. **El paso de migraciones tenant falla, y con él el pipeline, sobre una base donde `expediente_records` está vacía y no hay un solo hash que rellenar.**

**Salida — dos cambios, ambos esfuerzo S, y hacen falta los dos:**

1. **Carga perezosa de la clave** en `backfillExpedienteDocumentNumberHashes`: resolver las llaves **después** de comprobar que el primer lote no viene vacío. Es la corrección de fondo, no el parche: hoy cualquier schema sin filas legacy —CI, entorno de test, tenant recién provisionado— exige una clave de cifrado para no hacer absolutamente nada.
2. **Declarar `MFA_ENCRYPTION_KEY`** en el `env:` del job de CI, con un valor de laboratorio de 64 hex como el resto de credenciales desechables de ese bloque. Así el camino *con* datos también queda ejercitado y no depende de que el cambio 1 lo esconda.

Sin el cambio 1 queda además una dependencia operativa no declarada: `pnpm db:migrate:all` pasa a exigir una clave de cifrado que antes no necesitaba, y eso no está en ningún runbook.

**Impacto multi-tenant:** ninguno sobre datos. **Seguridad:** ninguno — la clave sigue sin viajar a logs. **Regulación:** sin cambio.

### R-7 · MEDIA · El backfill declara éxito cuando no logra hashear ni una fila

`backfill-…util.ts:176-181` captura **cualquier** fallo de descifrado y lo contabiliza en `skipped`. Es lo correcto para una fila corrupta suelta. No lo es para el modo de fallo global: con la clave equivocada, con un `MFA_ENCRYPTION_KEY_PREVIOUS` ausente tras una rotación, o con una deriva del formato en reposo, **todas** las filas caen al `catch`, la migración termina, imprime `processed=N updated=0 skipped=N` y el runner la marca como aplicada.

El resultado es el peor de los posibles: la búsqueda por documento queda rota exactamente igual que antes de 088, la migración figura como ejecutada —así que nadie la vuelve a correr— y no hay ningún error que lo delate.

Este escenario tiene fecha: hoy la API resuelve sus llaves con `MFA_ENCRYPTION_KEY` / `_PREVIOUS` (`aes-gcm.util.ts:101-102`), idéntico a lo que lee la migración, así que **no hay divergencia ahora mismo — lo verifiqué**. Pero [ADR-058](../adrs/ADR-058-Rotacion-Clave-Cifrado-PII-MFA.md) mueve la PII a `PII_ENCRYPTION_KEY` en su fase 2. El día que eso entre, 088 descifrará con la clave equivocada y fallará en silencio.

**Salida:** si `processed > 0 && updated === 0`, lanzar. Un backfill que no pudo hashear una sola fila es un backfill fallido, no uno completado. Convierte el fallo silencioso y permanente en uno ruidoso y reintentable —la migración es idempotente, así que reintentar es gratis—. **Esfuerzo: S.**

### R-8 · BAJA · El loteo del backfill no acota la transacción

`transactional = true` es la elección correcta (es DML). Su efecto es que **todo** el backfill corre dentro de la transacción única del runner: el loteo keyset acota la memoria, no la transacción. Se acumulan N bloqueos de fila y un `UPDATE` por fila —round-trip individual, `util:166-174`— en una TX cuya duración crece linealmente con la tabla.

Para `expediente_records` —tabla de pipeline CRM, cardinalidad de cientos a miles por tenant— es aceptable y **no lo bloqueo**. Lo dejo anotado porque el código batea, lo que sugiere una previsión de escala que el modo transaccional anula. **Decisión:** mantener `transactional = true`; registrar en el archivo el umbral (~50.000 filas) a partir del cual conviene conmutar a `transactional = false` con commit por lote — vía que ADR-066 ya habilita y que la idempotencia ya hace segura.

### R-9 · P3 · El contrato criptográfico está duplicado sin vector cruzado

`migrations/shared/backfill-…util.ts` reimplementa AES-256-GCM y `hashDocumentNumber`, duplicando `apps/api/src/common/crypto/aes-gcm.util.ts`. **El límite de paquetes lo justifica** —`packages/database` no puede importar de `apps/api`— y hoy los formatos coinciden exactamente: IV de 12 bytes, `aes-256-gcm`, `iv:tag:ciphertext` en hex (verificado en ambos lados).

El hueco es de prueba: `backfill-…migration.spec.ts` cifra y descifra **con la misma implementación**, así que valida su propia coherencia interna, no la compatibilidad entre las dos. Un cambio de formato en la API pasaría los dos conjuntos de tests y rompería el backfill en producción.

**Recomendación:** un vector fijo —ciphertext generado por la utilidad de la API, descifrado por la de `packages/database`— como único test de frontera. Diez líneas.

---

## 4. Disposición

| # | Acción | Severidad | Responsable | Momento |
| --- | --- | --- | --- | --- |
| 1 | **R-6.1**: carga perezosa de las llaves en el backfill (no exigir clave si no hay filas pendientes) | ALTA | AI-SR-FULL | **Bloqueante de merge** |
| 2 | **R-6.2**: `MFA_ENCRYPTION_KEY` en el `env:` del job de `ci.yml` | ALTA | AI-PLAT-OPS | **Bloqueante de merge** |
| 3 | **R-7**: fallar si `processed > 0 && updated === 0` | MEDIA | AI-SR-FULL | Mismo parche que 1 |
| 4 | **R-9**: vector criptográfico cruzado entre `apps/api` y `packages/database` | BAJA | AI-SR-QA | Con el parche 1 |
| 5 | **R-8**: anotar el umbral de conmutación a `transactional = false` | BAJA | AI-SR-FULL | Nota en `088_*` |
| 6 | Correr **el pipeline completo**, no solo las compuertas locales, antes de firmar el merge | — | quien haga el PR | Antes de merge |

Cerradas 1 y 2, el merge queda desbloqueado y el gate de Ola 1 cierra sin condiciones.

**Sin escalación al CTO.** La propuesta de HMAC con pepper para las dos columnas de hash de documento (`subscribers` y `expediente_records`) sigue anotada como decisión futura de una sola vez; no afecta este veredicto.

---

## 5. Nota de proceso

Tres rondas, tres hallazgos altos, y los tres compartían el mismo rasgo: **vivían fuera de la compuerta que se estaba mirando.**

- v1.0: `typecheck`, `lint` y suite verdes; los defectos eran de *efecto*, no de forma — código presente, resultado ausente.
- v1.1: el defecto sí lo veía la suite, pero la suite no se corrió — y las dos veces que se leyó, se leyó el código de salida de una tubería en vez de la línea de resumen de Jest.
- v1.2: las cinco compuertas locales están verdes y el defecto vive en `ci.yml`, que solo se ejercita al empujar la rama.

El patrón no es descuido del ejecutor: es que **el perímetro de verificación se quedó corto cada vez que el cambio cruzó una frontera** — de la forma al efecto, de la unidad a la integración, del repositorio al pipeline. La remediación de R-3 fue la primera de esta serie que tocó `packages/database` y el runner de migraciones, y por eso es la primera cuyo fallo aparece en CI.

Consecuencia operativa para las olas siguientes, que además de índices tocan migraciones tenant: **el stop/go de la Ola 2 debe incluir una ejecución real de `pnpm db:migrate:all` y su revert**, no solo `pnpm test` y `pnpm typecheck`. Su plan ya lo pide («`pnpm db:migrate:all` y revert verificados»); esta ronda demuestra por qué no es una formalidad.
