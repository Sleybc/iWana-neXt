# LAUNCH — `privacy` · Habeas Data · Fase 1 · Ola 1

> **Superado el 2026-10-14** por [PROMPT-PRIVACY-HABEAS-DATA-FASE-1-LAUNCH-v1.1.md](PROMPT-PRIVACY-HABEAS-DATA-FASE-1-LAUNCH-v1.1.md) (Ola 1-bis). No relanzar desde este archivo.

**Plan:** `docs/plans/2026-10-14-privacy-habeas-data-fase-1.md` v1.0 · **Prompt:** `docs/prompts/PROMPT-PRIVACY-HABEAS-DATA-FASE-1-v1.0.md` · **ADR:** ADR-094 (Aprobado)
**Ola que lanza:** Ola 1 — datos, núcleo, solicitudes y spec UX · **Gates:** G1–G3 por ADR-094; G4 se firma al lanzar
**Precondición:** ✅ IVA y D-PDF commiteados. **Bloqueos abiertos:** ninguno para esta ola. No correr la Fase 04 de suscriptores en paralelo. Un bloque = una sesión.

| # | Subagente | Encargo | Skills a leer antes de empezar | Contrato |
| --- | --- | --- | --- | --- |
| 1 | `data-eng` | prompt §3 Q1 | `postgresql`, `database-migration`, `backend-security-coder` | produce C-PRIV-DDL v1.0 |
| 2 | `sr-backend` | prompt §3 Q2 | `nestjs-expert`, `typescript-expert`, `backend-security-coder`, `test-driven-development` | produce C-CAL-1, C-PRIV-PORT y C-PRIV-API (salvo solicitudes) |
| 3 | `sr-backend` | prompt §3 Q3 | `nestjs-expert`, `test-driven-development`, `backend-security-coder`, `postgresql` | produce la parte de solicitudes de C-PRIV-API; consume C-CAL-1 |
| 4 | `prod-ux` | prompt §3 Q4 | `iwana-identity-ui-review`, `system-vocabulary-review`, `docs-architect` | consume C-PRIV-API v1.0 |

**Paralelo:** los cuatro, con propiedad disjunta. Q2 publica C-CAL-1 y los DTOs como primer paso; Q3 no escribe fuera de `privacy/requests/**` ni de `schemas/privacy/requests*`.
**Cierre de ola:** Q1 con `up/down/up` y triggers probados contra Postgres real; Q2 y Q3 con `turbo --force` y conteo real; Q3 con la integración de R5 (puerto simulado); Q4 con la spec entregada para ratificar.

---

### Bloque copiar-pegar

> Actúa como `{subagente}`. Lee `AGENTS.md`, `docs/adrs/ADR-094-Modelo-Proteccion-Datos-Personales-Habeas-Data.md`, el plan v1.0 y tu encargo `docs/prompts/PROMPT-PRIVACY-HABEAS-DATA-FASE-1-v1.0.md` §1–§3 bloque `{Q#}`.
> Antes de empezar lee los `SKILL.md` de tu fila (en `.agents/skills/<nombre>/SKILL.md`, como documentación, no como tool).
> No modifiques contratos; si necesitas cambiarlos, emite `[BLOQUEO]` y para. Trabaja solo dentro de tu propiedad exclusiva.
> Fuera de alcance: CRM (es de la Ola 2), anonimización (Ola 3), centrales de riesgo, Ley 2300 y `assurance`.
> Verifica que la ruta de tu informe esté libre y reporta en `docs/informes/INFORME-PRIVACY-FASE-1-{Q#}-v1.0.md` con ruta, conteo real y deuda nueva por severidad.
