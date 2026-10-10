# Plan de orquestación — MOD11 ↔ MOD12: reverso de un consumo de inventario de OT

**Versión:** 1.2
**Estado:** **G6 GO (2026-10-10)** sobre el árbol de trabajo. Falta el commit y G6.5 (CI sobre el SHA). G7 está condicionado (§1): V5-R ya tiene ratificación formal de `sec-eng`; quedan G6.5, p95 medido en un entorno compartido y monitoreo efectivo del worker.
**Cambio v1.1 → v1.2 (2026-10-10):** se registra la ratificación independiente V5-R de `sec-eng` (GO) y se corrige la lista vigente de condiciones G7. Se especifica la evidencia todavía ausente para p95 y salud del worker.
**Cambio v1.0 → v1.1 (2026-10-10):** se consolida G1, el CTO aprueba la spec v1.1 y se emite G4 con la matriz de V1 a V5.
**Fecha:** 2026-10-09
**Emitido por:** AI-EM-ARCH
**Spec:** `docs/specs/2026-10-09-mod11-mod12-reverso-consumo-ot-design.md` **v1.2** (aprobada por el CTO en su v1.1; la v1.2 es una fe de erratas de RA-03, RA-05 y RA-06)
**Origen:** deuda §8.1 de la spec de consumo v1.1. Condiciona G7 (`docs/plans/2026-10-09-mod11-mod12-deuda-g7.md`). Decisiones de producto P1 a P4 del CTO, del 2026-10-09.
**Norma aplicable:** un test integrado por motivo de rechazo en todo encargo MOD11↔MOD12 (CTO, 2026-10-08).

## 1. Gates

| Gate | Estado |
| --- | --- |
| **G1** | **CERRADO.** Revisión cruzada hecha (F1 GO, S1 GO condicionado, U1 GO) y consolidada en la v1.1; el CTO la aprobó el 2026-10-10. |
| G2 | El copy entra por U1. El diálogo de la consola reutiliza las primitivas existentes; si V3 necesita un componente nuevo, se consulta a `ds-owner`. |
| G4 | **Emitido el 2026-10-10:** `PROMPT-MOD11-MOD12-REVERSO-IMPL-v1.0.md`, con V1 a V5 y U2, y las adendas 1 a 3. |
| **G6** | **GO (2026-10-10).** V4-R3 17/17 contra el stack vivo, R-V5, R-LOG y R-LOG2 en GO, ratificación formal V5-R de `sec-eng` en GO (informe v1.2), y verificación en frío del orquestador. |
| G6.5 | Pendiente: CI Linux sobre el SHA del commit (ADR-069). |
| G7 | Condicionado a G6.5, p95 medido en entorno compartido con umbrales aprobados y monitoreo efectivo del worker. La ratificación `sec-eng` de V5-R está cerrada. |

### Evidencia necesaria para G7

- **G6.5:** commit en `main`; CI Linux verde en el SHA exacto que contiene el reverso y sus remediaciones. La CI histórica sobre `72d367a3` no verifica estos cambios posteriores.
- **V5-R:** **cerrado** por `sec-eng`, GO de lectura independiente en [`INFORME-MOD11-MOD12-REVERSO-V5-SEC-ENG-v1.2.md`](../informes/INFORME-MOD11-MOD12-REVERSO-V5-SEC-ENG-v1.2.md).
- **p95 compartido:** pendiente. El código expone `relay.lagDistributionSeconds.p95Seconds` y `lagThresholdStatus` en el health de plataforma; los umbrales `OUTBOX_RELAY_LAG_DEGRADED_SECONDS` y `OUTBOX_RELAY_LAG_STOPPED_SECONDS` no tienen valores predeterminados aprobados. Falta identificar el entorno compartido y aprobar el SLO que determinará GO.
- **Monitoreo del worker:** pendiente. El healthcheck `worker-prod` en `docker-compose.prod.yml` comprueba únicamente que exista PID 1; no detecta un worker bloqueado. Falta una señal de actividad efectiva y su comprobación/alerta operativa.

## 2. Secuencia

```
Ola G1 (paralelo, solo lectura): F1 sr-backend · S1 sec-eng · U1 prod-ux
   → CTO aprueba → G4
   V1 sr-backend (contrato v1.7 primero) ──┬──> V2 sr-backend (MOD12)
                                           └──> V3 fe-platform (consola)
   → V5 sec-eng ‖ V4 sr-qa (RA-01 a RA-11, integrados)
```

## 3. Matriz de dispatch (ola G1)

Skills verificadas en disco el 2026-10-09.

| Bloque | Subagente | Obligatorias | Apoyo (condición) | Descartadas y por qué | Gate ejecutable |
| --- | --- | --- | --- | --- | --- |
| **F1** | `sr-backend` | `architect-review`, `nestjs-expert`, `bullmq-specialist`, `postgresql` | — | `database-migration`: es un dictamen | Dictamen §F1 del encargo |
| **S1** | `sec-eng` | `security-auditor`, `backend-security-coder` | — | `testing-patterns`: es un dictamen | Dictamen §S1 del encargo |
| **U1** | `prod-ux` | `system-vocabulary-review` | `ui-ux-pro-max`, subordinada, para el diálogo | — | Tabla de copy cerrada |

## 3b. Matriz de dispatch de la implementación

Skills verificadas en disco el 2026-10-10.

| Bloque | Subagente | Obligatorias | Apoyo (condición) | Descartadas y por qué | Gate ejecutable |
| --- | --- | --- | --- | --- | --- |
| **V1** MOD11 | `sr-backend` | `nestjs-expert`, `bullmq-specialist`, `database-migration`, `postgresql`, `testing-patterns`, `backend-security-coder` | `iwana-matriz-motivos` (lista de motivos) | `architect-review`: la spec está aprobada | Typecheck **global** (cambia firmas públicas) · jest de `tasks` y worker con `Cached: 0` · migración 140 con `down` ejercitado |
| **U2** copy | `prod-ux` | `system-vocabulary-review` | — | `ui-ux-pro-max`: la superficie ya está contratada | Ratificación de los dos ajustes de la spec §9 |
| **V2** MOD12 | `sr-backend` | `nestjs-expert`, `bullmq-specialist`, `database-migration`, `postgresql`, `testing-patterns`, `backend-security-coder` | `iwana-matriz-motivos` | — | Typecheck global · jest de `inventory` con `Cached: 0` · migración 141 con `down` · carrera real · **4/4 integrados por motivo** |
| **V3** consola | `fe-platform` | `frontend-dev-guidelines`, `testing-patterns`, `wcag-audit-patterns` | `iwana-identity-ui-review` (gate visual) | `core-components`: el diálogo usa las primitivas existentes | `audit-ui.mjs` · jest de `operations/` con `Cached: 0` |
| **V4** QA | `sr-qa` | `e2e-testing-patterns`, `testing-patterns`, `postgresql`, `verification-before-completion`, `iwana-matriz-motivos` | `playwright-skill` (RA-04 y la UI) | — | RA-01 a RA-14 contra Postgres y Redis reales |
| **V5** seguridad | `sec-eng` | `security-auditor`, `backend-security-coder` | — | `testing-patterns`: es una auditoría | Dictamen sobre R5 (cada punto de extensión), R9 y RA-13 |

## 4. Bloqueos abiertos

Ninguno.

## 5. Registro

| Fecha | Origen | Hecho | Registro |
| --- | --- | --- | --- |
| 2026-10-09 | CTO | P1: solo supervisor. P2: también después del cierre, con acto explícito. P3: el equipo vuelve a la custodia y se cierra el comodato. P4: movimiento contrario con rastro | Spec v1.0, encabezado |
| 2026-10-10 | AI-EM-ARCH, consolidación de G1 | **F1: GO de factibilidad**, con dos consultas (enlace movimiento original/contrario y comodato ausente). **S1: GO condicionado** (el motivo se queda en MOD11, las garantías del pipeline se extienden de forma explícita, y una consulta sobre `safeTextField`). **U1: GO de copy.** La spec pasa a v1.1: índice parcial en R3, puntos de extensión en R5, operación de ledger y enlace en R6, `REVERSAL_LOAN_MISMATCH` en R7, los dos caminos del evaluador en R8, R9 y R10 nuevos, y 14 criterios RA. Queda registrada como deuda el `reason` en el evento de la anulación (ADR-090) | Spec v1.1 §9 · informes G1 F1, S1 y U1 |
| 2026-10-10 | AI-EM-ARCH, auditoría de la ola 3 | Las olas 1 y 2 (V1, U2, V2 y V3, todas en GO) se ejecutaron sin auditoría intermedia del orquestador; V4 y V5 las cubren. **V5: NO GO.** El P2 se confirma: la DLQ del consumidor del API usa `removeOnFail` numérico, que BullMQ trata como cantidad. El defecto viene heredado del consumo (`72d367a3`). El P3, `reversalRequestId` en el diagnóstico, se acepta. **V4: NO GO.** El bloqueo de Redis se **refuta**: `REDISCLI_AUTH` está en el contenedor, y sin esa variable la respuesta es `NOAUTH`. Los huecos de recorrido de RA-01 a RA-14 son reales, porque nada pasó por el api y el worker vivos; el encargo V2 no exigía los cuatro tramos (error de AI-EM-ARCH) | Adenda del 2026-10-10 en el encargo: R-V5 (`sr-backend`) en paralelo con V4-R (`sr-qa`), que escribe una spec E2E sobre el stack vivo. Launcher `PROMPT-MOD11-MOD12-REVERSO-OLA3B-LAUNCH-v1.0.md` |
| 2026-10-10 | AI-EM-ARCH, auditoría de la ola 3b | **R-V5: GO** (forma `{ age }`, `reversalRequestId`, `inventory` 805 tests, typecheck 8/8). **V4-R: GO funcional**, con 15/17 en la corrida completa: los cuatro motivos con sus cuatro tramos por HTTP, y RA-14 con D7 natural tras borrar una respuesta concreta con la autorización expresa del usuario. Los fallos de RA-03 (`updated_at`), RA-05 (`404`) y RA-06 (`400`) se resuelven con la **fe de erratas v1.2 de la spec** (§9b): son las convenciones vigentes y el código no cambia. Dos defectos heredados pasan a condiciones de G7: el `removeOnFail` numérico del relay para eventos que no son de inventario, y el logger de TypeORM que vuelca parámetros y el mensaje crudo (D11). Contraseña de Redis rotada | Adenda 2 del encargo: R-LOG (`sr-backend`) y V4-R2 (`sr-qa`) en paralelo; V5-R (`sec-eng`) después de R-LOG. Launcher `PROMPT-MOD11-MOD12-REVERSO-OLA3C-LAUNCH-v1.0.md` |
| 2026-10-10 | AI-EM-ARCH, auditoría de la ola 3c | **R-LOG: GO**, con el logger verificado en frío por el orquestador. **V5-R: GO, con salvedad de procedencia:** lo ejecutó un agente general en solo lectura porque `sec-eng` falló por infraestructura; la ratificación de `sec-eng` pasa a G7. **V4-R2: NO GO por entorno**, 16/17. El orquestador encontró tres procesos del worker vivos (PID 30536, 31064 y 30624) contra el mismo Redis y la misma base. La spec mata uno y los otros consumen la DLQ y borran el diagnóstico antes del poll. RA-03, RA-05 y RA-06 están en verde con la v1.2. El log saneado se confirmó en ejecución: 278 líneas `TYPEORM_QUERY_ERROR` y ninguna con parámetros. Se acepta la observación sobre `runner.ts:557` | Adenda 3: V4-R3 (`sr-qa`, un solo worker y precondición en la spec) en paralelo con R-LOG2 (`sr-backend`). Launcher `PROMPT-MOD11-MOD12-REVERSO-OLA3D-LAUNCH-v1.0.md` |
| 2026-10-10 | AI-EM-ARCH, **consolidación de G6** | **V4-R3: GO, 17/17** (exit 0) con un único worker, la precondición `EXPECTED_SINGLE_WORKER` y RA-11/RA-13 sobre la DLQ real con el log saneado. La primera corrida cayó a 5/17 porque el worker 7940 murió sin traza; no se reprodujo y queda como observación de entorno. **R-LOG2: GO** (`runner.ts:559`, `@iwana/db` 368 tests). **Verificación en frío del orquestador** sobre el árbol: typecheck `--force` **8/8**, `Cached: 0`; api `tasks` + `inventory` **1536/1544** (8 omitidas por gating); worker **159/159**; `@iwana/db` **368/368**; `@iwana/shared` **125/125**; portal `operations/` **779/779**. Comprobado que solo el api 31384 y el worker 32184 tienen conexiones a Redis. La CI solo ejecuta specs E2E explícitas (`scripts/e2e-provision-operational.mjs:1474`), así que la spec nueva, local y dependiente de Windows, no entra en el gate de CI. **Observaciones P3:** la spec depende de PowerShell; hay escombro D7 de reversos sintéticos `PENDING` en el tenant QA | Siguiente paso: commit y G6.5 |
| 2026-10-10 | `sec-eng`, ratificación V5-R | **GO independiente** para P2/P3, D11 y R9 sobre HEAD `7552c505` más el árbol local. Se confirma la DLQ con `{ age }`, el diagnóstico permitido, logger seguro en API/worker/data-source/runner y motivo confinado a MOD11. La salida directa de errores del runner queda como observación separada, fuera de V5-R/D11 auditado | `INFORME-MOD11-MOD12-REVERSO-V5-SEC-ENG-v1.2.md` |

## Lanzamiento

**La fuente vigente es `docs/prompts/PROMPT-MOD11-MOD12-REVERSO-OLA3B-LAUNCH-v1.0.md`: ola 3b, con R-V5 y V4-R. Si este espejo diverge, prevalece el archivo.** Las olas 1, 2 y 3 están cerradas; la 3 terminó en NO GO.
