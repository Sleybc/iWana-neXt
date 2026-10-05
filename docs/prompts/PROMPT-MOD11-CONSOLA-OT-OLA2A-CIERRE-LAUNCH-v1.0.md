# LAUNCH — MOD11 · Consola de OT · Cierre de la Ola 2a + hotfix de ventana nula

**Plan:** `docs/plans/2026-09-14-mod11-consola-ot-remediacion.md` v1.2 · **Spec:** consola v1.2 + UX `2026-10-05-mod11-consola-ot-requisito-ux.md` v1.0 (GO condicionado, adenda A2)
**Gates:** G1 cerrado · **G2 parcial**: R0 tiene GO condicionado y R1 está **sin ejecutar** · G3 abierto · G4 emitido para los tres bloques
**Cerrado, no re-despachar:** Ola 1, R0 v1.0 (solo se corrige), ETag, acta T1, línea de tiempo T1, corrección T0/T2, origen E1/E2. **Supera a** `PROMPT-MOD11-CONSOLA-OT-OLA2A-LAUNCH-v1.0.md` en lo que siga pendiente.

| # | Subagente | Encargo | Skills a leer | Contrato congelado |
| --- | --- | --- | --- | --- |
| 1 | `fe-platform` | `docs/prompts/PROMPT-MOD11-CONSOLA-OT-HOTFIX-VENTANA-NULA-v1.0.md` | `frontend-dev-guidelines`, `testing-patterns` | `execution-orders.ts` v1.4 · tablas operativas v1.1 |
| 2 | `ds-owner` | `docs/prompts/PROMPT-MOD11-CONSOLA-OT-OLA2-R1-DS-OWNER-v1.0.md` | `core-components`, `senior-ui-systems-designer`, `tailwind-patterns`, `iwana-identity-ui-review`, `wcag-audit-patterns` | ídem + `execution-orders-completion.ts` v1 |
| 3 | `prod-ux` | `docs/prompts/PROMPT-MOD11-CONSOLA-OT-OLA2-R0-PROD-UX-v1.0.md`, **adenda A2** | `system-vocabulary-review`, `wcag-audit-patterns` | ídem |

**Paralelo:** los tres a la vez, porque no comparten archivo. **El 1 es prioritario**: corrige un defecto vivo, ya que la bandeja cae con una OT despachada sin cita.
**Cierre de ola:** hotfix en GO, R1 y spec UX v1.1 en disco, y ningún `[DESEMPATE]` abierto. Después de eso, AI-EM-ARCH cierra G2, se pide el dictamen G3 a `fe-platform` y se lanza la Ola 2b, condicionada a que E3 esté en GO.

---

### Bloque copiar-pegar — `fe-platform` (hotfix)

> Actúa como `fe-platform`. Lee `AGENTS.md` y tu encargo `docs/prompts/PROMPT-MOD11-CONSOLA-OT-HOTFIX-VENTANA-NULA-v1.0.md` completo. Antes de codificar lee los `SKILL.md` de `frontend-dev-guidelines` y `testing-patterns`.
> Desde E2, `schedule.window` puede ser nulo y la bandeja cae en `ExecutionOrdersTable.tsx:203`, igual que el resumen en `ExecutionOrderSummary.tsx:259`. Haz que ambos toleren el nulo y pinten `'—'`, la convención de tablas v1.1. No pongas «Por programar», no añadas copy y no toques la estructura de la consola.
> Cierras con el §4 del encargo en GO: typecheck, jest de `operations/` con `Cached: 0` y `audit-ui.mjs` limpio. Lista en el informe los derefs que no arreglaste.

### Bloque copiar-pegar — `ds-owner`

> Actúa como `ds-owner`. Lee `AGENTS.md`, el plan v1.2, tu encargo `docs/prompts/PROMPT-MOD11-CONSOLA-OT-OLA2-R1-DS-OWNER-v1.0.md` y la UX spec `docs/specs/2026-10-05-mod11-consola-ot-requisito-ux.md` junto con la **adenda A2** del encargo R0, que corrige esa spec.
> Lee antes los `SKILL.md` de `core-components`, `senior-ui-systems-designer`, `tailwind-patterns`, `iwana-identity-ui-review` y `wcag-audit-patterns`.
> Contrata `RequirementChecklist` y `RequirementActionSheet` contra las necesidades de la §11.1 de la UX spec. Resuelve «Por programar» frente a la raya de tablas v1.1: o se cita del contrato vigente o se versiona a v1.2. La superficie de firma lleva controles operables por teclado y el trazo queda exceptuado según WCAG 2.1.1.
> Sin tokens de marca nuevos ni librería de firma elegida. Cierras con el §6 del encargo en GO.

### Bloque copiar-pegar — `prod-ux`

> Actúa como `prod-ux`. Lee la **adenda A2** de tu encargo `docs/prompts/PROMPT-MOD11-CONSOLA-OT-OLA2-R0-PROD-UX-v1.0.md`. Aplica sus cuatro correcciones a `docs/specs/2026-10-05-mod11-consola-ot-requisito-ux.md` y súbela a v1.1 con changelog.
> Las correcciones son: borrador offline inexistente; orden `DESC NULLS FIRST` y tu propuesta de tres tramos como mejora diferida; etiqueta real del snapshot con el estado «Sin registrar»; y la firma resuelta con trazo exceptuado, controles por teclado y sin nombre escrito.
> No reabras el resto: está aprobado. Entrega el informe R0 v1.2.
