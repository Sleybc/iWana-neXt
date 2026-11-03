# Plan de orquestación — `privacy` · O-1: reloj de retención

**Versión:** 1.0
**Estado:** Listo para lanzar. G0 del CTO el 2026-11-02
**Fecha:** 2026-11-02
**Emitido por:** AI-EM-ARCH
**Spec:** [2026-11-02-privacy-o1-reloj-retencion-spec.md](../specs/2026-11-02-privacy-o1-reloj-retencion-spec.md) v1.0
**Prompt de ejecución:** [PROMPT-PRIVACY-O1-RETENCION-v1.0](../prompts/PROMPT-PRIVACY-O1-RETENCION-v1.0.md) · **Launcher:** [PROMPT-PRIVACY-O1-RETENCION-LAUNCH-v1.0](../prompts/PROMPT-PRIVACY-O1-RETENCION-LAUNCH-v1.0.md)
**Origen:** [cierre de DT-3](../informes/INFORME-PRIVACY-DT3-RER-CIERRE-v1.0.md) §6.

## 1. Precondiciones

| # | Precondición | Estado al 2026-11-02 |
| --- | --- | --- |
| P1 | G0 del CTO (spec §8), incluido el ascenso a P1 | ✅ Aprobado el 2026-11-02 |
| P2 | `main` limpio en las rutas de B1 y B2. DT-3 y MOD05 ya están commiteados (`317bbc72`) | Se comprueba con `git status` al lanzar |
| P3 | Docker y Postgres de desarrollo en marcha (`127.0.0.1:5433`) | Se comprueba al lanzar |

### Estado tras la Ola 1 (2026-11-02)

- **B2: verde en su alcance.** Migración 170 con columna, trigger, backfill (1/1/1/1 por candidato; anonimizado en `NULL`) y `up → down → up`. DB 77 suites y 423 tests. **Defecto encontrado en la revisión:** el sufijo `1700000000000` repite el de la migración 000, único duplicado de la cadena. Lo corrige B2-R, con una prueba invariante.
- **B1: rojo por gates.** Inventario de escritores correcto y `standing` corregido; API completa 445 suites y 5.982 tests. Dos problemas:
  - las ramas de `contracts.service.ts` quedan en 81,51 %, bajo la línea base de 82,87 % (B1-R);
  - el fixture de ciclo de vida da 6 FAIL por la falta de `terminated_at` en su DDL hecho a mano. Es la tercera vez: B3 lo pasa a la cadena migrada y cierra P3-5.
  
  El `[BLOQUEO]` de B1 fue correcto: no tocó el fixture.
- **Siguiente:** Ola 1-R (B1-R ∥ B2-R) con LAUNCH v1.1. Después, B3 (con el fixture migrado) ∥ B4, y B4 solo después de B2-R.

### Estado tras la Ola 1-R (2026-11-02)

- **B1-R: cobertura cumplida.** Ramas de `contracts.service.ts` en 83,82 % (base 82,87 %), con 5 pruebas nuevas y sin tocar producción.
  - La corrida PG no queda en verde: 28 fallos.
  - **22 son de entorno:** las suites clonan `contracts` de `tenant_iwana`, donde la 170 aún no está aplicada.
  - **4 son un defecto de producción de B1:** el parámetro `$1` tiene dos tipos en el SQL del ciclo de vida, y todo `TERMINATE` falla. Lo corrige B1-F, autorizado por AI-EM-ARCH.
- **B2-R: aceptado.** Sufijo `1700000000170`, prueba invariante y 10 excepciones de migraciones ya aplicadas. La 170 no estaba aplicada en ningún tenant. Falta la integración de `@iwana/db` en una base `iwana_it_*` (B2-R2).
- **Deudas nuevas, fuera de O-1:**
  - **P2:** tres suites PG dependen del esquema de `tenant_iwana`, no de la cadena migrada;
  - **entorno:** `tenant_e2e_mod13_f1_41398e` está a medio aprovisionar; limpiarlo lo decide el usuario.
- **Nueva secuencia:** Ola 1-F (B1-F ∥ B2-R2) → B4 paso 1 (aplicar la cadena a desarrollo) → B3 ∥ B4 pasos 2-3 → B5. Lanzador v1.2.

### Estado tras la Ola 1-F (2026-11-02)

- **B1-F: hecho.** El cast `$1::contract_status_enum` está aplicado. Con la 170 en desarrollo, la corrida de cobertura pasa en verde: 7 suites y 346 tests. Ramas: contratos 85,29 %, ciclo de vida 85,36 %, perfil tributario 89,47 % y suscriptores 86,64 %, todas sobre su base. B1-F cambió una aserción: la revisa `test-change-reviewer` en la Ola 2.
- **B2-R2: verde.** Integración de `@iwana/db` en `iwana_it_ci_r2_20261102`: 47 suites y 144 tests, sin omisiones (comprobado en el JSON). Las 7 suites que se negaban a correr en `dbiw` ahora corren y pasan.
- **B4 paso 1: hecho.** Los 7 tenants `ACTIVE` están en la 170, con paridad de 165 migraciones. El backfill solo tocó `tenant_e2e_privacy_1b_a114bf06` (16 contratos). **No se vio el conteo por candidato:** lo corrige B2-R3 y lo reconstruye B4, paso 4.
- **Decisiones del usuario:** ~~borrar la base desechable `iwana_it_ci_r2_20261102`~~ (borrada el 2026-11-02 por orden del usuario; no tenía conexiones), y qué hacer con `tenant_e2e_mod13_f1_41398e` (MARKED_FOR_DELETION, sin `typeorm_migrations` ni `audit_logs`).
- **Siguiente:** Ola 2 con LAUNCH v1.3: `test-change-reviewer` (B1-F) ∥ `sr-qa` §B3 ∥ `plat-ops` §B4 pasos 2 a 4 ∥ `sr-backend` §B2-R3. Después, §B5.

### Estado tras la Ola 2 (2026-11-03)

- **B3: GO.** CA-O1-01 a 09 en PASS. La suite nueva `retention-clock` tiene 7 pruebas con los servicios reales. CA-O1-09: 11 suites PG, 135/135, sin omisiones. El fixture de ciclo de vida ya usa la cadena migrada (12 pruebas, las mismas aserciones); con eso **queda cerrada la deuda P3-5 del clúster**.
- **B2-R3: GO.** La 170 imprime `[170] O1 backfill candidate=N count=M`, y una prueba comprueba el formato exacto.
- **B4 pasos 2 a 4: GO** (CA-O1-10).
  - 24 titulares anonimizados verificados, con 0 residuales.
  - **Ningún titular cambia de resultado de retención con O-1** en los 7 tenants de desarrollo.
  - Backfill reconstruido de forma aproximada: 7 contratos por el candidato 1 y 9 por el 4.
  - En desarrollo, `--verify-only` usó la clave MFA porque falta `PII_ENCRYPTION_KEY`; en producción eso es imposible (`app.config.ts:266-270`).
- **`test-change-reviewer` (B1-F y B1-R): sin hallazgos C.** B3 cambió después algunas de esas pruebas, así que la revisión se repite en B5.
- **Desvío aceptado:** B1-F usa `$6::boolean` en lugar del cast al enum.
- **Base de datos:** `iwana_it_ci_r2_20261102` la borró el usuario; ahora se usa `iwana_it_b2r3_20261102`.
- **Siguiente:** B5 con LAUNCH v1.4. `sec-eng` revisa además la dependencia del `search_path` en los triggers.

### Estado tras B5 (2026-11-03)

- **Gate: bloqueado por una sola integración.** Lo demás está en verde:
  - typecheck y lint;
  - unitarias de API (445 suites y 5.989 tests) y de DB (78 y 426);
  - integraciones de DB (47 y 144);
  - cobertura: contratos 85,29 % y ciclo de vida 85,36 %, las dos sobre su base;
  - auditoría de dependencias sin críticas.
- **`sec-eng`:** un P2. La 170 no exige `terminated_at` en `INSERT`, y ese es justo el único fallo (`b5-identity-conversion:1198`). Sobre la dependencia del `search_path` en la 169, concluye que basta la regla de `runInTenantSchema`, y AI-EM-ARCH lo acepta.
- **`test-change-reviewer`** (0 hallazgos C) y **`boundary-reviewer`** (sin hallazgos): GO.
- **Remediación:** migración 171 aditiva para `INSERT`, que rechaza en lugar de autocompletar (B2-R4); después, los fixtures que insertan contratos terminales (B3-R); después, repetir la revisión y el gate. Lanzador v1.5.

### Cierre (2026-11-03): G6 GO

- B2-R4 creó la migración 171 (`INSERT` terminal sin fecha → `23514`), aplicada en los 7 tenants `ACTIVE`, con 0 contratos terminales sin fecha. B3-R ajustó dos fixtures (categoría b) y `test-change-reviewer` no encontró hallazgos C.
- B5 repetido: integraciones de API (52 suites, 4 omisiones declaradas) y de DB (48 y 145), sin fallos del diff de O-1. Cobertura de ramas: contratos 85,29 % y ciclo de vida 85,36 %.
- **Fuera del diff, no bloquean:** el fixture de `second-schema` frente a la 092 (preexistente, P3) y las suites EV1 opt-in.
- Se emitieron el [informe de cierre](../informes/INFORME-PRIVACY-O1-RETENCION-CIERRE-v1.0.md) y el [HLD Privacy v1.3](../hlds/HLD-PRIVACY-HABEAS-DATA-v1.3.md), aprobado por el CTO el 2026-11-03, que ordenó commit y push.

## 2. Bloques y ruta crítica

| Bloque | Agente | Depende de | Rutas |
| --- | --- | --- | --- |
| B1 · escritores y puerto | `sr-backend` | P1 | `crm/contracts`, ciclo de vida, `standing`, impersonation |
| B2 · migración y backfill | `sr-backend` (2.ª instancia) | P1 | `packages/database/.../tenant/**` |
| B3 · criterios de aceptación PG | `sr-qa` | B1 y B2 | suite nueva `retention-clock` |
| B4 · datos de desarrollo | `plat-ops` | B2 | solo lectura |
| B5 · verificación | `sec-eng`, `test-change-reviewer`, `boundary-reviewer`, `gate-verifier` | B3 y B4 | solo lectura |

**Ruta crítica:** G0 → B1 (inventario de escritores) → B3 → B5 → cierre. **Olas:** 1 = B1 ∥ B2 (rutas disjuntas); 2 = B3 ∥ B4; 3 = B5.

## 3. Matriz agente × skill

| Bloque | Obligatorias | De apoyo | Descartadas (motivo) |
| --- | --- | --- | --- |
| B1 | `nestjs-expert`, `postgresql`, `backend-security-coder`, `testing-patterns`, `iwana-test-evidence` | `systematic-debugging` (si cae una suite existente) | `database-migration` e `iwana-tenant-migration` (son de B2); skills de UI (no hay cambio de portal); `openapi-spec-generation` (no se expone en la API) |
| B2 | `database-migration`, `iwana-tenant-migration`, `postgresql`, `iwana-test-evidence` | — | `bullmq-specialist` (no hay colas) |
| B3 | `testing-patterns`, `postgresql`, `iwana-test-evidence` | `systematic-debugging` | `e2e-testing-patterns` (no hay cambio visible) |
| B4 | `postgresql` | `iwana-queue-inspect` (no aplica salvo que haga falta el worker) | — |
| B5 `sec-eng` | `security-auditor`, `backend-security-coder` | `postgresql` | — |

## 4. Riesgos

Ver spec §7. Uno más: el backfill corre por tenant en `db:migrate:all`, que solo recorre tenants `ACTIVE`. Los tenants de QA y E2E quedan atrás hasta su provisión (lección de Fase 1b).

## Lanzamiento

Fuente: [`PROMPT-PRIVACY-O1-RETENCION-LAUNCH-v1.0.md`](../prompts/PROMPT-PRIVACY-O1-RETENCION-LAUNCH-v1.0.md). **El archivo prevalece si divergen.**

```text
===== B1 · sr-backend =====
Ejecuta docs/prompts/PROMPT-PRIVACY-O1-RETENCION-v1.0.md §B1. Spec docs/specs/2026-11-02-privacy-o1-reloj-retencion-spec.md v1.0.
Lee antes: AGENTS.md y SKILL.md de nestjs-expert, postgresql, backend-security-coder, testing-patterns, iwana-test-evidence.
Solo rutas de §B1. Sin stash ni commit. Entrega: inventario de escritores, diff, conteo real y cobertura por servicio.

===== B2 · sr-backend =====
Ejecuta docs/prompts/PROMPT-PRIVACY-O1-RETENCION-v1.0.md §B2. Spec v1.0.
Lee antes: AGENTS.md y SKILL.md de database-migration, iwana-tenant-migration, postgresql, iwana-test-evidence.
Solo packages/database/.../tenant/**. Sin stash ni commit. Entrega: número de migración, diff y conteo PG.
```
