# INFORME — PLAT-OPS · Capacidad de backup y restore por tenant · Fase 01

**Versión:** 1.1
**Estado:** Cerrado — **GO de la fase** (G6 cumplido; H-1 pagada con micro-ensayo end-to-end) y **GO del delta DRY posterior** (re-verificado por SR-QA y SEC-ENG, 2026-09-12). G6.5 **pendiente** de la corrida Linux por SHA al momento del merge (cambios sin commit). G7 **no se solicita**: esta fase acredita **una** de las cinco condiciones.
**Fecha:** 2026-09-12
**Cambio v1.0 → v1.1 (2026-09-12):** el refactor DRY posterior al cierre (`scripts/db/lib/tenant-tooling.mjs` + ambos scripts) fue re-verificado de forma independiente — **GO del delta**: 5/5 hashes, 44/44 y 124/124, CA-7/CA-8/H-1 repetidos con datos sintéticos propios, segunda lectura de SEC-ENG sin bloqueantes. §1 actualiza los hashes del artefacto verificado (los de v1.0 quedan invalidados por el refactor), §3.1 registra el delta y §5 suma las observaciones SEC-6/SEC-7/SEC-8 (esta última, segunda lectura de AI-SEC-ENG sobre `lib/tenant-tooling.mjs`).
**Cambio v1.1 → v1.2 (2026-09-12):** cierra SEC-6, SEC-7 y SEC-8 (§5, todas **Pagadas**) y aplica dos mejoras adicionales encontradas en una nueva pasada de auditoría sobre el mismo código: (a) en modo docker, `runPgRestoreList`/`runPgRestore` copiaban el mismo dump al contenedor por separado — dos `docker cp` del mismo archivo para una sola operación de restore; ahora comparten una única copia (`prepareEffectiveDumpPath`/`cleanupEffectiveDumpPath`), verificado sin residuos en `/tmp` del contenedor tras el ensayo; (b) si el comando creaba la base destino y `pg_restore` fallaba después, el mensaje no distinguía esa base —recién creada, sin datos previos— de una base preexistente que exige el procedimiento con ventana del runbook §6.3; extraído a `buildRestoreFailureMessage`, función pura con dos tests nuevos (46 → suite de 46, antes 44). `backup-tenant.mjs` gana `await finished(out)` tras el `close` del proceso (SEC-6: el hash se calculaba sin garantía de que el stream local hubiera vaciado su buffer) y distingue error de apertura de error de escritura a mitad de dump (SEC-7: antes ambos limpiaban con el mismo mensaje de "archivo preexistente", incluso cuando el archivo sí se había creado y el fallo era de escritura). Re-verificado: 126/126 (`pnpm test:tooling`), CA-7/CA-8/H-1 repetidos una vez más con datos sintéticos nuevos, lint limpio.
**Modo activo:** Orchestrator + EM
**Autor:** AI-EM-ARCH
**Agentes ejecutores:** AI-PLAT-OPS (T1 — produce) · AI-SR-QA (T2 — verifica; el aprobador no es el productor) · AI-SEC-ENG (dictamen de seguridad, solo lectura)
**Plan ejecutado:** [2026-09-12-plat-ops-restore-por-tenant.md](../plans/2026-09-12-plat-ops-restore-por-tenant.md)
**Prompts ejecutados:** [PROMPT-PLAT-OPS-RESTORE-TENANT-FASE-01-v1.0.md](../prompts/PROMPT-PLAT-OPS-RESTORE-TENANT-FASE-01-v1.0.md) · [PROMPT-SR-QA-RESTORE-TENANT-FASE-01-v1.0.md](../prompts/PROMPT-SR-QA-RESTORE-TENANT-FASE-01-v1.0.md) · [PROMPT-SR-QA-RESTORE-TENANT-FASE-01-DELTA-v1.0.md](../prompts/PROMPT-SR-QA-RESTORE-TENANT-FASE-01-DELTA-v1.0.md)
**Contrato congelado:** [SPEC-PLAT-OPS-RESTORE-POR-TENANT-v1.0.md](../specs/SPEC-PLAT-OPS-RESTORE-POR-TENANT-v1.0.md) (v1.0, 2026-09-12) — sin cambios durante la fase
**ADRs de referencia:** [ADR-069](../adrs/ADR-069-Gates-G6.5-Merge-Readiness.md) (Aprobado 2026-08-02) · [ADR-078](../adrs/ADR-078-Reapertura-Dominio-Productivo-Por-PII-Real.md) (Aprobado 2026-09-12)

---

## 1. Resultado de la fase

**GO de la fase.** Los ocho criterios de aceptación de la spec §4 fueron verificados por AI-SR-QA con ensayo ejecutado sobre bases desechables (dos tenants sembrados, checksum antes/después del no afectado), y el artefacto pasó además revisión de seguridad independiente y una re-verificación delta tras el endurecimiento. No ocurrió ninguna de las cuatro condiciones STOP del plan §5 (§4.2 de este informe).

**Qué significa para G7.** De las cinco condiciones de G7, «restore por tenant» era la única sin capacidad alguna y la de mayor camino crítico. Pasa a **capacidad construida, probada y documentada**. Las otras cuatro (restore global en entorno objetivo, backup/restore de MinIO, política de Redis, registro de imágenes) y las seis definiciones de F0.2 siguen abiertas, con su track propio en el [plan de las cinco condiciones](../plans/2026-09-12-plat-ops-g7-cinco-condiciones.md).

**Artefacto final verificado** (working tree, sin commit; hashes vigentes tras cerrar SEC-6/7/8 y aplicar las dos mejoras de v1.2 — recalculados por AI-EM-ARCH y re-verificados con CA-7/CA-8/H-1 en vivo): `scripts/db/backup-tenant.mjs` `185ba70c…dbe0e` · `scripts/db/restore-tenant.mjs` `4d63991b…e5612` · `scripts/db/lib/tenant-tooling.mjs` `3ef8590b…e32a42c` · `scripts/db/backup-tenant.test.mjs` `1db041c4…31756` (sin cambios en esta ronda) · `scripts/db/restore-tenant.test.mjs` `5c39ecd4…54b3f0181` (+2 tests). *(Hashes v1.0 `F278A479…`/`B482799C…` y v1.1 `22a05260…`/`1b7d93a6…`/`dcb9d1ec…` invalidados por esta ronda.)*

## 2. Entregables

| Artefacto | Ruta | Estado |
| --- | --- | --- |
| Comando de backup por tenant | `scripts/db/backup-tenant.mjs` + `db:backup:tenant` en `package.json` | Entregado |
| Comando de restore por tenant | `scripts/db/restore-tenant.mjs` + `db:restore:tenant` en `package.json` | Entregado |
| Tests de resolución, validación y rutas de fallo | `scripts/db/backup-tenant.test.mjs` · `scripts/db/restore-tenant.test.mjs` | Entregados — 44 tests |
| Suite de tooling autosuficiente | `test:tooling` compila `@iwana/db` y ejecuta ambas suites | Entregado |
| Runbook de backup/restore por tenant | [RUNBOOK-RELEASE-ROLLBACK-v1.0.md](../runbooks/RUNBOOK-RELEASE-ROLLBACK-v1.0.md) §6.2–§6.3 (**v1.4**) | Entregado |
| Este informe de fase | `docs/informes/INFORME-PLAT-OPS-RESTORE-TENANT-FASE-01-v1.0.md` | Entregado |

## 3. Evidencia de gates — G6 · G6.5 · G7 registrados por separado

### 3.1 G6 — calidad aceptada (cumplido)

| Verificación | Comando / modo | Resultado | Verificado por |
| --- | --- | --- | --- |
| Suite de la capacidad | `node --test scripts/db/backup-tenant.test.mjs scripts/db/restore-tenant.test.mjs` (**runner directo, sin turbo**) | **44 / 44 · 0 fallos · 0 skips** | EM-ARCH y SR-QA (corridas propias) |
| Suite de tooling completa | `pnpm test:tooling` (compila `@iwana/db` y corre las 6 suites de scripts) | **124 / 124 · 0 fallos · 0 skips** | EM-ARCH (corrida propia) |
| Criterios de aceptación | Ensayo T2 con bases desechables y datos sintéticos | **CA-1 a CA-8 PASS** (§4) | AI-SR-QA |
| Re-verificación delta DRY (posterior al GO) | Refactor `lib/tenant-tooling.mjs` verificado por SR-QA + segunda lectura de SEC-ENG (prompt DELTA) | **GO del delta** — 5/5 hashes coincidentes, 44/44 y 124/124, CA-7/CA-8/H-1 repetidos con datos propios; 0 hallazgos bloqueantes o importantes | AI-SR-QA + AI-SEC-ENG |
| Invariantes de seguridad (spec §3.3) | Dictamen read-only de AI-SEC-ENG sobre los dos scripts | **APROBADO CON OBSERVACIONES** — 0 bloqueantes, 0 importantes; 5 observaciones bajas, **5/5 aplicadas y re-verificadas** | AI-SEC-ENG + delta SR-QA |
| Multi-tenancy respetada | `schema_name` solo desde `public.tenants`/sidecar + validador de `@iwana/db`; sin interpolación sin validar; psql con `:'var'` por stdin | Verificado por lectura y por intentos de rotura de T2 | EM-ARCH + SR-QA + SEC-ENG |
| Sin `DROP SCHEMA ... CASCADE` / `--clean` | grep sobre ambos scripts + re-restore sobre schema existente | 0 ocurrencias; aborta indicando runbook §6.3 | SR-QA |
| Logs, código y fixtures sin PII real ni credenciales | Inspección de resúmenes y evidencia; datos sintéticos de dominio `.test` | Sin PII en evidencia ni en salidas | SR-QA + SEC-ENG |
| Citas normativas | `pnpm audit:adr-citations` | **`BLOQUEANTE: 0` final.** La primera corrida destapó **175 bloqueantes preexistentes**: estado no canónico de ADR-070 (superado) tras la aprobación de ADR-078, y 5 citas de ADR-073 (propuesto) sin marcador; EM-ARCH remedió el corpus en el mismo acto — ver §11 | EM-ARCH |
| Artefactos en carpeta canónica | `pnpm audit:doc-locations` | Sin hallazgos nuevos (ver §11) | EM-ARCH |
| Subagentes sincronizados | `pnpm sync:agents:check` | Sin cambios (ver §11) | EM-ARCH |
| Lint / typecheck | No aplica a la superficie: esta fase no tocó `apps/*` ni `packages/*` (verificado por `git status`); los artefactos son `.mjs` + docs + `package.json` raíz | — | EM-ARCH |

**Duración (medida, no evaluada).** Backup 0.2–0.3 s; restore en base aislada 0.9–1.0 s; restore en base con registro 1.6 s. **No se declara cumplimiento temporal**: no hay RTO definido contra el cual comparar (spec §7).

**Dictamen de seguridad.** El vector de inyección de `schema_name` queda cerrado por diseño (resolución en `public.tenants`, validador reutilizado de `@iwana/db`, sin `shell:true`/`eval`, psql con variables server-safe). Las 5 observaciones del dictamen — checksum obligatorio en restore, dump con `wx` (no trunca backups), limpieza del dump si falla el hash, limpieza de `/tmp` en `docker cp` fallido y recordatorio de grants en el resumen — fueron aplicadas con tests y re-verificadas por SR-QA sobre los artefactos finales.

### 3.2 G6.5 — merge readiness (pendiente)

La corrida Linux de GitHub Actions identificada por **SHA** corresponde al momento del merge; los cambios están **sin commit** al cierre de esta fase. Un GO de G6 **no se reporta como avance hacia G6.5** (ADR-069): la calidad está aceptada en local y en el contenedor dev, el permiso de merge espera la corrida Linux.

### 3.3 G7 — producción (no solicitado)

Esta fase **no despliega nada**. Acredita una de las cinco condiciones; el cierre de G7 exige además el resto de condiciones y los targets RPO/RTO, y su aprobación es del CTO.

## 4. Criterios de aceptación

### 4.1 Los ocho CA (spec §4) — veredicto T2: PASS, sostenido tras el delta

| # | Criterio | Estado | Evidencia ejecutada (sanitizada) |
| --- | --- | --- | --- |
| CA-1 | `pg_restore` termina en `0` sin errores ocultos | **PASA** | `exit 0` en base aislada y poblada; 0 ocurrencias de `error:` en la salida capturada |
| CA-2 | En la base de ensayo existe `public` y únicamente el schema objetivo | **PASA** | `public`, `tenant_qa_uno` — exactamente 2 filas en `pg_namespace` |
| CA-3 | Tablas de migraciones y estado esperado presentes | **PASA** | 3 tablas; `typeorm_migrations`=2 (`000_qa_init`,`001_qa_add_marker`) idéntico a origen; marcadores 2/1 |
| CA-4 | La API conecta con el usuario de runtime, sin privilegios de migración | **PASA** | Conexión `iwana_app` `exit 0`; `CREATE TABLE` denegado. Matiz H-1: la lectura exige el paso post-restore de grants (§5) |
| CA-5 | Transacción con `SET LOCAL search_path` al schema restaurado y rollback al fallar | **PASA** | `current_schema=tenant_qa_uno`; rollback insert+throw → filas 2→2; `SET LOCAL` no persiste fuera de la transacción |
| CA-6 | Duración, checksum, base destino y operador, sin datos de negocio | **PASA** | Resumen con duración, sha256, base destino, schema, tablas, reinyección y operador; 0 ocurrencias de datos sintéticos de negocio |
| **CA-7** | No-afectación: restaurar un tenant deja el otro **byte a byte idéntico** | **PASA** | Checksums md5 por tabla del tenant no afectado idénticos antes/después (4 valores); fila de `public.tenants` sin update |
| CA-8 | Restore de un dump **sin** sidecar falla con mensaje accionable | **PASA** | `exit 2`, mensaje accionable; base destino **no creada**; re-verificado en el delta |

### 4.2 Condiciones STOP del plan §5

| STOP | ¿Ocurrió? | Evidencia |
| --- | --- | --- |
| 1. Schema interpolado sin provenance/validación | **No** | Intentos de inyección por argumento y por fila maliciosa en BD rechazados antes de `pg_dump`; re-ejecutados sobre el artefacto final |
| 2. Ensayo de CA-7 con un solo tenant | **No** | Ensayo con tenant tercero preexistente y checksums antes/después |
| 3. PII en la evidencia archivada | **No** | Datos 100 % sintéticos (dominio `.test`); evidencia solo con conteos, checksums y duraciones |
| 4. `DROP SCHEMA ... CASCADE` propuesto como atajo | **No** | 0 ocurrencias en código; re-restore sobre schema existente aborta con el procedimiento §6.3 |

### 4.3 Intentos de rotura (prompt T2 §4) — todos resistieron

Identificador ambiguo (uuid de uno = slug de otro) · argumentos de inyección (`tenant_x; DROP SCHEMA public`, `public`, mayúsculas, prefijo ajeno) · schema malicioso en BD · tenant fantasma con schema válido inexistente · bypass del modo ensayo (`--into == DB_NAME` sin bandera) · `--force-same-database` sin TTY · re-restore con schema existente · dump sin sidecar · dump truncado (55 %) y corrupto en 6 offsets (7/7 abortes en el preflight, antes de crear base) · par dump/sidecar cruzados · sidecar sin `dump_sha256` (delta). Ninguno logró inyectar un schema sin validar ni dejar artefactos o estados no deseados.

## 5. Deuda por severidad

| Id | Descripción | Severidad | Estado | Dueño | Plan de pago |
| --- | --- | --- | --- | --- | --- |
| **H-1** | Tras el restore, el schema no recibe ACLs de runtime (dump `--no-privileges`); el operador podía declarar OK sin re-grant | Importante | **Pagada** | AI-PLAT-OPS / AI-SR-QA | Runbook v1.4 §6.3 (paso post-restore) + micro-ensayo E2E con rol de runtime — cerrado 2026-09-12 |
| SEC-1…5 | Observaciones del dictamen SEC-ENG (checksum obligatorio, `wx` del dump, dump huérfano sin hash, limpieza `/tmp`, recordatorio post-restore) | Baja | **Pagadas** | AI-PLAT-OPS | 5/5 aplicadas con tests; delta re-verificado por SR-QA |
| SEC-6 | `backup-tenant.mjs`: la promesa resolvía en `close` del child sin esperar el `finish` del stream; el sha256 podía capturar un flush pendiente | Baja | **Pagada** | AI-PLAT-OPS | `runPgDump` ahora hace `await finished(out)` (`node:stream/promises`) tras el `close` del proceso, antes de que `main()` calcule el sha256 — v1.2 |
| SEC-7 | `backup-tenant.mjs`: error de escritura a mitad de stream dejaba un `.dump` parcial con mensaje que sugería solo «archivo preexistente» | Baja | **Pagada** | AI-PLAT-OPS | El stream distingue por el evento `open`: sin él es fallo de apertura (mensaje sin cambios); con él, fallo de escritura a mitad de camino — limpia el parcial y el mensaje lo dice — v1.2 |
| SEC-8 | `lib/tenant-tooling.mjs`: el comentario de `runPsqlQuery` («ningún dato del tenant toca la línea de comandos») describía correctamente la garantía de `vars`, pero no aclaraba que no cubre el `sql` libre que algunos llamadores interpolan (p. ej. `CREATE DATABASE ${name}` en `restore-tenant.mjs`). Sin riesgo real — `name` ya pasa por `isValidDatabaseName` antes de llegar ahí | Baja | **Pagada** | AI-PLAT-OPS | Comentario aclarado: la garantía cubre solo `vars`; la responsabilidad de validar `sql` libre sigue siendo del caller — v1.2 |
| SEC-9 | `restore-tenant.mjs`: en modo docker, `runPgRestoreList`/`runPgRestore` copiaban el mismo dump al contenedor por separado (dos `docker cp` del mismo archivo para una sola operación) | Baja | **Pagada** | AI-PLAT-OPS | Copia única compartida por ambas llamadas (`prepareEffectiveDumpPath`/`cleanupEffectiveDumpPath`); verificado sin residuos en `/tmp` del contenedor — v1.2 |
| SEC-10 | `restore-tenant.mjs`: si el comando creaba la base destino y `pg_restore` fallaba después, el mensaje no distinguía esa base —recién creada, sin datos previos— de una preexistente que exige el procedimiento con ventana del runbook §6.3 | Baja | **Pagada** | AI-PLAT-OPS | `buildRestoreFailureMessage` (función pura, con 2 tests) declara explícitamente si la base la creó este comando — v1.2 |
| D-1 | Fallo mid-restore no provocado (la corrupción se detecta en el preflight `pg_restore --list`; 7/7) | Baja | Aceptada | AI-SR-QA | Si se desea cobertura, fabricar una falla mid-restore no detectable por TOC en un ensayo futuro |
| D-2 | Confirmación interactiva positiva de `--force-same-database` no ejercitada (requiere TTY); el abort sin TTY sí está verificado | Baja | Aceptada | AI-SR-QA | Ejercitar con TTY si el procedimiento sobre origen llega a usarse |
| DB-1 | Cifrado en reposo, destino remoto y retención de dumps con PII (spec §6; ADR-078) | **Alta** (heredada) | Abierta | AI-SEC-ENG propone; CTO decide | ADR de seguridad con opciones — fuera de contrato de esta fase; escala en §7 |
| DB-2 | Grants preexistentes de SEC-04 otorgan `CREATE ON DATABASE` + `USAGE, CREATE ON public` al rol de runtime (observado por T2; no lo introduce esta fase) | Baja | Abierta | AI-SEC-ENG | Pronunciamiento en el track de seguridad |
| DB-3 | No existe CLI schema-scoped de re-grant; se usa el comando DB-scoped idempotente ya documentado | Baja | Abierta | AI-PLAT-OPS | Solo si la operación lo pide; el paso actual está verificado E2E |

Nota: **no existen sidecars pre-delta** en ningún entorno — la herramienta nace en esta fase y nunca fue liberada.

**Deuda crítica al cierre: 0.** La única deuda alta (DB-1) es heredada, tiene dueño y plan, y está escalada al CTO.

## 6. Bloqueos, consultas y desempates emitidos

**Ninguno.** El track corrió sin `[BLOQUEO]`, `[CONSULTA]` bloqueante ni `[DESEMPATE]`. La única precisión de alcance fue de EM-ARCH hacia la ejecución: la instrucción «jest directo» del prompt T1 se resolvió a runner directo (`node --test`) porque esa es la convención real del repo para `scripts/` — registrada en la delegación y documentada por el ejecutor, no fue una disputa entre agentes.

## 7. Decisiones que requieren CTO

```text
[ESCALACION AL CTO] Prioridad: Alta
Contexto: la condición G7 «restore por tenant» ya tiene capacidad verificada; su operación real
(backups con PII de ADR-078 en disco local, sin cifrar ni política de retención) no puede
declararse lista sin decisión.
Opciones (máx. 3): (1) decidir en un solo acto F0.2 los targets RPO/RTO y la política de
cifrado/retención/destino remoto de backups; (2) decidir RPO/RTO ahora y diferir cifrado/custodia;
(3) diferir ambas al release real.
Recomendación: (1) — sin RTO la duración queda «medida, no evaluada», y sin cifrado los dumps
quedan fuera de una custodia acorde a ADR-078.
Decisión requerida antes de: cierre definitivo de G7 y del primer backup con PII real fuera de dev.

[ESCALACION AL CTO] Prioridad: Media
Contexto: hallazgo DB-2 — el bloque SEC-04 otorga `CREATE ON DATABASE` y `USAGE, CREATE ON public`
al rol de runtime (preexistente, no de esta fase). AI-SEC-ENG puede proponer acotarlo.
Opciones (máx. 3): (1) mantenerlo documentado como riesgo aceptado; (2) emitir propuesta de ajuste
de grants sin urgencia; (3) revisarlo en el próximo ciclo de seguridad.
Recomendación: (3) — no hay exposición inmediata; requiere dictamen de SEC-ENG antes de tocar
grants compartidos.
Decisión requerida antes de: próximo ciclo de endurecimiento de plataforma.
```

## 8. Artefactos que esta fase deja superados

**Ninguno.** La spec v1.0 sigue vigente como contrato; el runbook se actualizó en sitio con bump de versión (v1.2 → v1.3 → v1.4). No quedan dos artefactos contradictorios vigentes.

## 9. Campos contables de KPI

| Campo | Valor |
| --- | --- |
| Reescrituras mayores de PRD/HLD provocadas por esta fase | 0 |
| Conflictos entre agentes emitidos | 0 |
| Desempates requeridos | 0 |
| Deuda crítica al cierre | 0 |
| Deuda alta al cierre | 1 — heredada (DB-1), con dueño, plan y escalación (§7) |
| Hallazgos posteriores al merge atribuibles a esta fase | Sin instrumentar — no hay merge aún (G6.5 pendiente) |
| Latencia del gate de esta fase (sesiones desde solicitud a resolución) | 0 — prompts emitidos y fase cerrada el 2026-09-12 |
| Violaciones de boundary detectadas | 0 — `git status`: solo `scripts/db/*`, `package.json` raíz, runbook, informe; `packages/*` y `apps/*` intactos |

## 10. Recomendación de gate

- **Gate solicitado:** cierre de la fase «capacidad de backup y restore por tenant» (calidad = **G6**; G6.5 y G7 registrados por separado en §3).
- **Recomendación:** **GO de la fase** con la evidencia de este informe; H-1 pagada; dictámenes SEC-ENG (original y delta DRY) sin bloqueantes.
- **Aprueba:** AI-EM-ARCH (fase). G6.5 queda para la corrida Linux por SHA al merge; G7 requeriría CTO.
- **Justificación:** los 8 CA pasan con evidencia ejecutada por el verificador (no por el productor), las condiciones STOP no ocurrieron y ninguna deuda crítica queda abierta.

## 11. Actualizaciones realizadas en documentos vivos

- [x] Plan de fase con estado de ejecución actualizado: [2026-09-12-plat-ops-restore-por-tenant.md](../plans/2026-09-12-plat-ops-restore-por-tenant.md)
- [x] Runbook §6.2–§6.3 actualizado a **v1.4** (sidecar parte del artefacto, comandos versionados, paso post-restore de grants)
- [x] `AGENTS.md` — tabla de comandos «Caso puntual» ampliada con `db:backup:tenant` y `db:restore:tenant`
- [x] `pnpm audit:doc-locations` sin hallazgos nuevos · `pnpm sync:agents:check` sin cambios
- [x] **Remediación de corpus (gate 11 — preexistente, ajena a esta fase, bloqueante de CI):** `pnpm audit:adr-citations` reportó **175 bloqueantes** en HEAD — ADR-070 (superado) quedó con estado no canónico («Superado por [ADR-078]») al aprobarse ADR-078, y 5 citas de ADR-073 (propuesto) no llevaban marcador. EM-ARCH remedió en el mismo acto: estado canónico de ADR-070 + marcadores `(superado)` / `(propuesto)` en 38 documentos. Corrida final: **`BLOQUEANTE: 0`**. Seguimiento semántico declarado (fuera de esta fase): documentos escritos cuando ADR-078 estaba *Propuesto* que aún lo describen así (marcadores `(propuesto)`, §1 del plan de las cinco condiciones) — dueño EM-ARCH
- [x] **Re-verificación delta del refactor DRY (posterior al cierre):** prompt [PROMPT-SR-QA-RESTORE-TENANT-FASE-01-DELTA-v1.0.md](../prompts/PROMPT-SR-QA-RESTORE-TENANT-FASE-01-DELTA-v1.0.md) ejecutado — **GO del delta**: 5/5 hashes, 44/44 y 124/124, CA-7/CA-8/H-1 repetidos con datos sintéticos propios; segunda lectura de `lib/tenant-tooling.mjs` por AI-SEC-ENG sin bloqueantes. Hashes del artefacto verificado actualizados en §1; observaciones SEC-6/SEC-7/SEC-8 en §5
- [x] **Cierre de SEC-6/7/8 + auditoría adicional (v1.2):** SEC-6/7/8 pagadas (§5); dos hallazgos nuevos de una nueva pasada de código (copia única del dump en modo docker — SEC-9; mensaje explícito cuando el restore falla sobre una base recién creada — SEC-10) también pagados, con 2 tests nuevos. Re-verificado: 126/126 (`pnpm test:tooling`), CA-7/CA-8/H-1 en vivo con datos sintéticos nuevos, lint limpio. Hashes del artefacto verificado actualizados en §1
