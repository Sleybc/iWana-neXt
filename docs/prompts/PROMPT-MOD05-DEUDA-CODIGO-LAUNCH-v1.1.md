# LAUNCH — MOD05 · Deuda de código · Ola 2 (verificación)

**Fecha:** 2026-10-17 · **Estado:** Vigente · **Plan:** `docs/plans/2026-10-17-mod05-deuda-codigo.md` · **Prompt:** v1.0 §5 más el delta `PROMPT-MOD05-DEUDA-CODIGO-v1.1.md` (prevalece donde difieren)
**Base:** `main` en `e2348a42`, con la Ola 1 completa (migraciones 153 a 157, backend y portal) · **Gates:** G4 (V2, V3) y G6 (V1, V4)
**Precondición del CTO, antes de V1:** `pnpm db:backup` y `pnpm db:migrate:all` sobre `dbiw`, hasta la 157. Se trabaja en `main`; nadie commitea.

| # | Subagente | Encargo | Skills a leer antes de empezar | Salida |
| --- | --- | --- | --- | --- |
| V1 | `sr-qa` | **Escribe y ejecuta** `e2e/tests/portal-mod05-deuda-fiscal-live.spec.ts` contra la API real, sobre el tenant ACTIVE `e2e-privacy-1b-a114bf06` (reutiliza su seed y agrega lo que falte). Casos: (1) alta jurídica sin DV o con DV erróneo → rechazo; con DV, RUT y representante → alta, y el Party queda con el rol `LEGAL_REPRESENTATIVE`; (2) conversión desde expediente → `PROSPECT` sin datos fiscales, aviso «Faltan datos fiscales…», activar → 422 con `missing`, completar y activar → OK; (3) contrato sin completitud → 422; con completitud → 201, y en la base el documento fiscal queda solo cifrado (lectura de solo lectura) mientras la pantalla lo muestra. `--retries=0`; matriz de R1 a R15 contra los tests | `e2e-testing-patterns`, `playwright-skill`, `iwana-test-evidence`, `verification-before-completion` | `INFORME-MOD05-DEUDA-V1-QA-v1.0.md` |
| V2 | `sec-eng` | Cifrado y HMAC del documento fiscal (las escrituras nuevas sin texto plano); el CLI de backfill (simulación, sin valores en la salida); claves desde `ConfigService`; PII en logs (la guardia nueva); la proyección del representante legal (sin documento); el 422 sin PII; la supresión sobre las columnas nuevas | `security-auditor`, `backend-security-coder` | `INFORME-MOD05-DEUDA-V2-SEC-v1.0.md` |
| V3 | `boundary-reviewer` ∥ `contract-drift-reviewer` | CRM → `parties` solo por `IPartyWritePort`; `SubscriberFiscalCompletenessService` como fuente única; esquemas de shared (IVA, RUT, representante, `fiscalCompleteness`, código 422) frente a la API y el portal; la copia del DV en el portal frente a la API | `architect-review`; apoyo `monorepo-architect` | `INFORME-MOD05-DEUDA-V3-REV-v1.0.md` |
| V4 | `gate-verifier` | «Gates Before Merge» con `turbo run test --force --continue`, typecheck, lint y build, más `test:integration` de db y api contra `iwana_it_g7_ci` migrada hasta la 157. Cobertura de `crm/subscribers` y `crm/contracts` frente a su línea base | `iwana-test-evidence`, `turborepo-caching` | `INFORME-MOD05-DEUDA-V4-GATES-v1.0.md` |
| V5 | `docs-governance` | Los `docs/` de la fase | `docs-architect` | `INFORME-MOD05-DEUDA-V5-DOCS-v1.0.md` |

**Orden:** V1 ∥ V2 ∥ V3; después V4 y V5. Los revisores no corrigen; V1 sí escribe tests y fixtures, nunca código de producto.
**Entorno:** PostgreSQL en `127.0.0.1:5433` (`dbiw` y `iwana_it_g7_ci`) y Redis en `127.0.0.1:6380`. Si el agente no alcanza `localhost` o Docker, es un bloqueo de entorno: se reporta con el comando y el error exactos.
**Cierre:** G4 y G6 en GO → AI-EM-ARCH consolida `INFORME-MOD05-DEUDA-CIERRE-G6-v1.0.md` y actualiza el PRD (RF-SUB-03, D-M04).

---

### Bloque copiar-pegar

> Actúa como `{subagente}`. Lee `AGENTS.md`, el plan, el contrato `PROMPT-MOD05-DEUDA-CODIGO-v1.0.md` (§0 a §3 y §5) y el delta `-v1.1.md`. Tu encargo es tu fila de este launcher.
> Antes de empezar lee los `SKILL.md` de tu fila (en `.agents/skills/<nombre>/SKILL.md`, como documentación, no como tool).
> Si te falta algo, emite `[BLOQUEO]` y para. Ninguna PII, ciphertext, HMAC ni clave real en el repo, los informes, los fixtures o los logs. Los agentes no migran `dbiw`: esa migración es la precondición del CTO de arriba. No commitees.
> Verifica que la ruta esté libre y reporta en `docs/informes/{salida de tu fila}`, con el conteo real sin caché y los hallazgos por severidad con archivo:línea.
