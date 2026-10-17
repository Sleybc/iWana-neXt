# LAUNCH — MOD05 · Deuda de código · Ola 1

**Fecha:** 2026-10-17 · **Estado:** Vigente; D-M03, D-M04 (A) y D-FIS aprobadas el 2026-10-17 · **Plan:** `docs/plans/2026-10-17-mod05-deuda-codigo.md` v1.0 · **Prompt:** `docs/prompts/PROMPT-MOD05-DEUDA-CODIGO-v1.0.md`
**Ola que lanza:** B0; después de S1, B1 ∥ B2; después de S2, B3 · **Gates:** G4 y G6 al final de la Ola 2
**Precondición:** `main` en `48529fd0` o posterior; se trabaja en `main`, sin ramas; nadie commitea. No se migra `dbiw`.

| # | Subagente | Encargo | Skills a leer antes de empezar | Salida |
| --- | --- | --- | --- | --- |
| B0 | `sr-backend` | prompt §2.1 y §4 B0; avisa S1 | `database-migration`, `iwana-tenant-migration`, `postgresql`, `test-driven-development` | `INFORME-MOD05-DEUDA-B0-v1.0.md` |
| B1 | `sr-backend` | prompt §2.2, §2.3, §2.5 y §4 B1, tras S1; avisa S2 | `nestjs-expert`, `backend-security-coder`, `test-driven-development`, `typescript-expert` | `INFORME-MOD05-DEUDA-B1-v1.0.md` |
| B2 | `sr-backend` | prompt §2.4 y §4 B2, tras S1 | `nestjs-expert`, `backend-security-coder`, `postgresql`, `test-driven-development` | `INFORME-MOD05-DEUDA-B2-v1.0.md` |
| B3 | `fe-platform` | prompt §2.6 y §4 B3, tras S2 | `core-components`, `frontend-dev-guidelines`, `iwana-identity-ui-review`, `system-vocabulary-review` | `INFORME-MOD05-DEUDA-B3-v1.0.md` |

**Paralelo:** B1 y B2 tienen propiedad disjunta; en `subscriber-creation.service.ts`, B2 toca solo las líneas del documento fiscal. Solo B0 edita `runner.ts`.
**Evidencia obligatoria:** la suite completa del paquete sin caché y con 0 fallos; `turbo run test --force --continue`; `test:integration` de db y api contra `iwana_it_g7_ci` (nunca `dbiw`); y, en backend, la API arrancada hasta `/health`.
**Cierre de la ola:** los cuatro informes → AI-EM-ARCH emite la Ola 2 (prompt §5).

---

### Bloque copiar-pegar

> Actúa como `{subagente}`. Lee `AGENTS.md`, el plan v1.0 y tu encargo en `docs/prompts/PROMPT-MOD05-DEUDA-CODIGO-v1.0.md` (§0 a §3 completos y tu bloque de §4).
> Antes de empezar lee los `SKILL.md` de tu fila (en `.agents/skills/<nombre>/SKILL.md`, como documentación, no como tool).
> No modifiques contratos; si te falta algo, emite `[BLOQUEO]` y para. Trabaja solo dentro de tu propiedad: otro agente edita el mismo árbol en paralelo.
> Ninguna PII, ciphertext, HMAC ni clave real en el repo, los informes o los logs. No migres `dbiw`. No commitees.
> Verifica que la ruta esté libre y reporta en `docs/informes/{salida de tu fila}`, con el conteo real de tests sin caché y la deuda nueva por severidad.
