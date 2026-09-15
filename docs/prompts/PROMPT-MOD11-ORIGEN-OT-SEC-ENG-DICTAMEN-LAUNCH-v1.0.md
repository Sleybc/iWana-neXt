# LAUNCH — MOD11 · Origen de la OT · Dictamen de seguridad sobre `CREATED`

**Plan:** `docs/plans/2026-09-14-mod11-origen-ot.md` v1.0 · **Spec:** `docs/specs/2026-09-14-mod11-origen-ot-design.md` v1.0 §3.6
**Ola que lanza:** dictamen previo a G1 — el CTO condicionó la aprobación de ADR-091 (propuesto) a este veredicto
**Bloqueos abiertos:** ninguno para el dictamen. **E1 a E4 siguen bloqueados** y no se lanzan con este archivo.

| # | Subagente | Encargo (prompt · sección) | Skills a leer antes de auditar | Contrato congelado |
| --- | --- | --- | --- | --- |
| 1 | `sec-eng` | `docs/prompts/PROMPT-MOD11-ORIGEN-OT-SEC-ENG-DICTAMEN-v1.0.md` §1 y §2 | `security-auditor`, `backend-security-coder`, `nestjs-expert`, `postgresql` | ninguno — auditoría de solo lectura |

**Paralelo:** ninguno, un único bloque.
**Cierre:** informe en `docs/informes/` con veredicto, controles exigidos, inventario de sitios replicados y hallazgos por severidad.

---

### Bloque copiar-pegar

> Actúa como `sec-eng`. Lee `AGENTS.md`, la spec `docs/specs/2026-09-14-mod11-origen-ot-design.md` §3.6 y tu encargo `docs/prompts/PROMPT-MOD11-ORIGEN-OT-SEC-ENG-DICTAMEN-v1.0.md`.
> Antes de auditar lee los `SKILL.md` de: `security-auditor`, `backend-security-coder`, `nestjs-expert`, `postgresql` (en `.agents/skills/<nombre>/SKILL.md`, como documentación, no como tool).
> ADR-091 (propuesto) vuelve alcanzable `ExecutionOrderStatus.CREATED` —OT despachada, sin técnico ni cuadrilla—, que hoy nunca ocurre. El control de acceso **ya lo excluye** del pool reclamable, en `assertActorAccess` y en el `WHERE` de `list()`. Como el estado es inalcanzable, esa guarda **no protege nada hoy**: al volverlo alcanzable, despierta.
> Dictamina cuál de las dos salidas es correcta y con qué controles: **mantener la exclusión** —nadie puede reclamar la OT despachada— o **incluir `CREATED` en el pool** —cualquier técnico o contratista del tenant ve todo el trabajo despachado, porque esa rama no impone alcance por sede—.
> Verifica por ti mismo, no des por buena esta descripción: que ambos sitios digan lo mismo, si hay un tercero, y si `organization_site_id` es alcance impuesto o solo filtro opcional. Revisa `CONTRACTOR` aparte de `TECHNICIAN`.
> Eres auditor de solo lectura: no toques código ni migraciones. **No decidas por el CTO quién debe usar la bolsa**: si tu veredicto depende de eso, enúncialo como condición.
> Entrega informe en `docs/informes/` con veredicto, controles exigidos (diciendo cuáles son trabajo nuevo y cuáles configuración), inventario de sitios replicados con ruta y línea, y hallazgos por severidad.
