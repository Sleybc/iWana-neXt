# LAUNCH — `privacy` · Habeas Data · Fase 1 · Ola 1-bis

> **Superado el 2026-10-14** por [PROMPT-PRIVACY-HABEAS-DATA-FASE-1-LAUNCH-v1.2.md](PROMPT-PRIVACY-HABEAS-DATA-FASE-1-LAUNCH-v1.2.md) (Ola 2-bis + Ola 2). No relanzar desde este archivo.

**Plan:** `docs/plans/2026-10-14-privacy-habeas-data-fase-1.md` v1.1 · **Prompt:** `docs/prompts/PROMPT-PRIVACY-HABEAS-DATA-FASE-1-v1.1.md` (adenda A1–A9 sobre v1.0)
**Ola que lanza:** Ola 1-bis — completar contratos y relanzar Q1 a Q4 · **Gates:** G4 vigente
**Precondición de entorno:** PostgreSQL levantado en `127.0.0.1:5433` (lo hace el CTO; Docker Desktop estaba detenido). Sin él, Q1 no puede cerrar.
**No re-despachar** el trabajo ya entregado de Q2 (calendario, schemas, autorizaciones, textos, marcas, retención, incidentes): solo se completa. Un bloque = una sesión; cierra las sesiones anteriores de Q1 a Q4.

| # | Subagente | Encargo | Skills a leer antes de empezar | Contrato |
| --- | --- | --- | --- | --- |
| 1 | `data-eng` | v1.1 §2 Q1 | `postgresql`, `database-migration`, `backend-security-coder` | C-PRIV-DDL v1.1 (A1–A3, A9) |
| 2 | `sr-backend` | v1.1 §2 Q2 | `nestjs-expert`, `backend-security-coder`, `test-driven-development` | A7, A8, A9 |
| 3 | `sr-backend` | v1.1 §2 Q3 | `nestjs-expert`, `test-driven-development`, `backend-security-coder`, `postgresql` | A1–A6; consume C-CAL-1 |
| 4 | `prod-ux` | v1.1 §2 Q4 | `iwana-identity-ui-review`, `system-vocabulary-review`, `docs-architect` | C-PRIV-API v1.1 |

**Paralelo:** los cuatro, con propiedad disjunta. Q2 toca `media/**` solo para A9; Q3 es dueño de `requests/**`, incluidos sus puertos.
**Cierre de ola:** Q1 con `up/down/up` de 146 y 147 contra Postgres real (la 027, en CI o en una base de integración); Q2 y Q3 con `turbo --force` y conteo real, y Q3 con la integración de R5 y R3; Q4 con la spec entregada para ratificar.

---

### Bloque copiar-pegar

> Actúa como `{subagente}`. Lee `AGENTS.md`, ADR-094, el plan v1.1, tu informe previo `docs/informes/INFORME-PRIVACY-FASE-1-{Q#}-v1.0.md` y tu encargo `docs/prompts/PROMPT-PRIVACY-HABEAS-DATA-FASE-1-v1.1.md` §1–§2 bloque `{Q#}` (con v1.0 para lo que v1.1 no cambia).
> Antes de empezar lee los `SKILL.md` de tu fila (en `.agents/skills/<nombre>/SKILL.md`, como documentación, no como tool).
> No modifiques contratos; si necesitas cambiarlos, emite `[BLOQUEO]` y para. Trabaja solo dentro de tu propiedad exclusiva. El árbol tiene trabajo sin commitear de la Ola 1: no lo reviertas.
> Verifica que la ruta esté libre y reporta en `docs/informes/INFORME-PRIVACY-FASE-1-{Q#}-v1.1.md` con ruta, conteo real y deuda nueva por severidad.
