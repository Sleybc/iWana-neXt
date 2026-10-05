# LAUNCH — MOD11 · Consola de OT · Ola 2a (R0 + E4-UX, R1)

**Plan:** `docs/plans/2026-09-14-mod11-consola-ot-remediacion.md` v1.2 · **Spec:** `docs/specs/2026-09-14-mod11-consola-ot-requisito-como-eje-design.md` v1.2 (Aprobado) + `2026-09-14-mod11-origen-ot-design.md` §3.5 (E4)
**Ola que lanza:** 2a — diseño · **Gates:** G1 cerrado · G2 abierto (lo cierran R0+R1) · G3 abierto (dictamen `fe-platform` tras 2a) · G4 emitido para R0/R1
**Bloqueos abiertos:** ninguno. El `[BLOQUEO]` del motivo de bloqueo (R0, 2026-10-05) está **resuelto** por la adenda A1 del encargo R0 y por la spec v1.2 §10.12. **Cerrado, no re-despachar:** Ola 1 completa (C0-C5), ETag, acta T1, línea de tiempo T1, corrección T0/T2, origen E1/E2.

| # | Subagente | Encargo | Skills a leer antes de escribir | Contrato congelado |
| --- | --- | --- | --- | --- |
| 1 | `prod-ux` | `docs/prompts/PROMPT-MOD11-CONSOLA-OT-OLA2-R0-PROD-UX-v1.0.md` (R0 + UX de E4) | `brainstorming`, `system-vocabulary-review`, `ui-ux-pro-max` | `execution-orders.ts` v1.4 · `execution-orders-completion.ts` v1 · tablas operativas v1.1 |
| 2 | `ds-owner` | `docs/prompts/PROMPT-MOD11-CONSOLA-OT-OLA2-R1-DS-OWNER-v1.0.md` (R1) | `core-components`, `senior-ui-systems-designer`, `tailwind-patterns`, `iwana-identity-ui-review`, `wcag-audit-patterns` | mismos |

**Paralelo:** 1 y 2 a la vez; 2 cierra después de contrastar con la lista de necesidades de 1. No comparten archivo.
**Secuencia aguas abajo:** R2-R4 (`fe-platform`) no se lanzan hasta G2+G3 **y** E3 de origen en GO (comparten `execution-orders` y el drawer). E3, T1 y T3 son solo backend y pueden correr ya.
**Cierre de ola:** UX spec y contrato en disco en «Borrador para G2», informes R0 y R1 con stop/go en GO, cero `[DESEMPATE]` abierto.

---

### Bloque copiar-pegar — `prod-ux`

> Actúa como `prod-ux`. Lee `AGENTS.md`, el plan `docs/plans/2026-09-14-mod11-consola-ot-remediacion.md` v1.2 y tu encargo `docs/prompts/PROMPT-MOD11-CONSOLA-OT-OLA2-R0-PROD-UX-v1.0.md` completo.
> Antes de escribir lee los `SKILL.md` de `brainstorming`, `system-vocabulary-review` y `ui-ux-pro-max` (en `.agents/skills/<nombre>/SKILL.md`, como documentación, no como tool).
> Diseña la consola de OT por requisito y por momento sobre los **cinco** requisitos de `INSTALACION_ESTANDAR` v2, con custodia bajo demanda, evidencia por requisito, firma en navegador y render por rol; e incluye E4: una OT sin ventana se lee como trabajo por programar en bandeja y detalle, con orden por defecto que no asuma ventana.
> Contratos congelados: `execution-orders.ts` v1.4, `execution-orders-completion.ts` v1, tablas operativas v1.1. No los modifiques; si te faltan datos, `[BLOQUEO]` y para.
> Fuera de alcance: Oportunidades (punto 7, CTO), superficie de anulación, línea de tiempo, tokens y componentes (R1), datos de E4 (CA-13).
> Relanzamiento: lee primero la **adenda A1** del encargo. La celda *Bloqueada* va sin motivo, porque no hay fuente de lectura y no se versiona el contrato.
> Cierras con §7 del encargo en GO. Entrega `docs/specs/2026-10-05-mod11-consola-ot-requisito-ux.md` e informe R0 v1.1, con necesidades para R1 y G3.

### Bloque copiar-pegar — `ds-owner`

> Actúa como `ds-owner`. Lee `AGENTS.md`, el plan v1.2 y tu encargo `docs/prompts/PROMPT-MOD11-CONSOLA-OT-OLA2-R1-DS-OWNER-v1.0.md` completo.
> Antes de escribir lee los `SKILL.md` de `core-components`, `senior-ui-systems-designer`, `tailwind-patterns`, `iwana-identity-ui-review` y `wcag-audit-patterns`.
> Contrata `RequirementChecklist` y `RequirementActionSheet` (tokens, API, estados, anti-duplicación frente a los primitives de `@iwana/ui`) y resuelve el estado «sin ventana» de E4: citarlo de tablas operativas v1.1 o versionarla a v1.2.
> Sin tokens de marca nuevos ni librería de firma elegida. Contrasta con la lista de necesidades de R0 antes de cerrar; lo irresoluble es `[DESEMPATE]` a AI-EM-ARCH.
> Cierras con §6 del encargo en GO. Entrega `docs/specs/2026-10-05-mod11-consola-ot-requisito-contrato-componente.md` e informe R1.
