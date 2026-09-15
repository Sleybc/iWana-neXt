# LAUNCH — MOD11 · Origen de la OT · E2

**Plan:** `docs/plans/2026-09-14-mod11-origen-ot.md` v1.0 · **Spec:** `docs/specs/2026-09-14-mod11-origen-ot-design.md` v1.0 (Aprobada)
**Ola que lanza:** E2 — la puerta de despacho · **Gates:** G1 cerrado · **E1 y T0 cerrados en GO y auditados el 2026-09-15**
**Bloqueos abiertos:** ninguno. **E3 espera el cierre de E2.**

| # | Subagente | Encargo (prompt · sección) | Skills a leer antes de codificar | Contrato |
| --- | --- | --- | --- | --- |
| 1 | `sr-backend` | `docs/prompts/PROMPT-MOD11-ORIGEN-OT-E2-v1.0.md` §3 y §4 | `nestjs-expert`, `typescript-expert`, `postgresql`, `testing-patterns`, `architect-review` | **Abre contrato nuevo en `@iwana/shared`**: creación por despacho + evento/ventana nulables en respuesta |

**Paralelo:** ninguno, un único bloque.
**Cierre de ola:** CA-05 a CA-08c de la spec §5, más el test de consola viva; `tasks` no baja de 651; **dictamen de `sec-eng`** sobre los cinco sitios.

---

### Bloque copiar-pegar

> Actúa como `sr-backend`. Lee `AGENTS.md`, el plan `docs/plans/2026-09-14-mod11-origen-ot.md` y tu encargo `docs/prompts/PROMPT-MOD11-ORIGEN-OT-E2-v1.0.md`.
> Antes de escribir código lee los `SKILL.md` de: `nestjs-expert`, `typescript-expert`, `postgresql`, `testing-patterns`, `architect-review` (en `.agents/skills/<nombre>/SKILL.md`, como documentación, no como tool). Lee también `docs/informes/INFORME-MOD11-ORIGEN-OT-E1-v1.0.md` §6 y §7: es tu punto de partida.
> E1 dejó el esquema listo, pero **nadie crea todavía una OT sin cita**. E2 abre el acto de **despachar**: la OT nace de origen + tipo de trabajo + **sitio**, y la ventana llega después (E3). `originContext` va **explícito**: nada de heredar el default `MANUAL`, que hoy hace indistinguible «se creó a mano» de «nadie declaró nada». **Sin sitio se rechaza**: sin él la OT nace muerta, porque `assertSupervisionScope` es fail-closed y ningún comando de coordinación podría moverla.
> **Reutiliza `findActiveExecutionOrderByOrigin` de E1, no la dupliques**: despacho y agenda comparten una sola guarda de unicidad.
> **Sustituye los dos tripwires de E1** (`toListItem` y el detalle del controlador): en cuanto exista la primera OT sin ventana dejan de ser inalcanzables, y el de la lista **rompe la consola entera, para todos, con un 500**. Las lecturas deben tolerar el nulo y devolver 200; eso hace nulables evento y ventana en `@iwana/shared`.
> **Decide y justifica** los dos huecos de la spec §3.8: `PROVISIONING` sin camino —se le da uno o se retira— y el salto que convierte `BILLING`/`SYSTEM` en `TASKS`. No los heredes.
> **No reabras lo dictaminado**: `CREATED` queda fuera del pool reclamable (la bolsa es de supervisión), la sede es obligatoria, y el contratista tiene paridad. Si te parece equivocado, es `[CONSULTA]`, no decisión tuya.
> CA-06 se verifica **desde la agenda**: el técnico sigue pudiendo recibir un evento en ese rango. CA-08 se verifica **por negación y en los cinco sitios** de la spec §3.6.2 —técnicos **y contratistas**—. Y con una OT sin ventana viva, **listado y detalle responden 200**.
> No toques el DDL: E1 lo agotó. Inventaria con ruta qué rompe en el portal al hacer nulable el contrato, sin arreglarlo: es E4.
> Cierras cuando CA-05 a CA-08c pasen con conteo real, `tasks` no baje de 651, y `sec-eng` confirme los cinco sitios. Reporta rutas, evidencia y deuda por severidad.
