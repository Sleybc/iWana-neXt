# LAUNCH — MOD11 · Registro compacto de equipos y materiales · Ola 1 (U1 + D1)

**Plan:** `docs/plans/2026-10-11-mod11-consola-registro-material.md` (aprobado por el CTO, 2026-10-11) · **Encargo:** `PROMPT-MOD11-CONSOLA-REGISTRO-MATERIAL-IMPL-v1.0.md`
**Decisiones del CTO:** dirección B con referencia + serial · un equipo por registro · consumibles en el requisito opcional `installation-materials` · si el equipo no aparece, se avisa a supervisión.
**Antes de ola 2:** el CTO ejecuta el paso 0 de datos (plan §5).

| # | Subagente | Encargo | Skills a leer antes de escribir |
| --- | --- | --- | --- |
| 1 | `prod-ux` | §U1: adenda v1.4 de la spec UX, con el flujo de serial, el de consumibles, los estados y el copy | `ui-ux-pro-max`, `system-vocabulary-review`, `iwana-identity-ui-review` |
| 2 | `ds-owner` | §D1: contrato de `RadioCardGroup` y decisión sobre `QuantityStepper` | `core-components`, `iwana-identity-ui-review`, `tailwind-patterns` |

**Paralelo:** sí; son documentos disjuntos.
**Siguiente:** con las dos en GO, la ola 2: F1 (componente) y F2 (rediseño de la hoja), ambas de `fe-platform`.

---

### Bloque copiar-pegar — `prod-ux` (U1)

> Actúa como `prod-ux`. Lee `AGENTS.md`, el plan `docs/plans/2026-10-11-mod11-consola-registro-material.md`, el §U1 de `docs/prompts/PROMPT-MOD11-CONSOLA-REGISTRO-MATERIAL-IMPL-v1.0.md`, la spec `docs/specs/2026-10-05-mod11-consola-ot-requisito-ux.md` v1.3 y `ExecutionOrderMaterialAction.tsx`. Lee los `SKILL.md` de la tabla. Las decisiones del CTO no se re-litigan.
> Escribe la adenda v1.4: el flujo con serial (tarjetas de radio con serial + «referencia · SKU · estado», contexto en lectura y pie fijo), el flujo de consumibles (filas −/+ y un registro por fila), lo que deja de mostrarse, los estados y el copy completo. Ratifica el destino de los consumibles y la regla que deriva la acción del destino.
> Entrega la spec v1.4 e `INFORME-MOD11-CONSOLA-REGISTRO-MATERIAL-U1-v1.0.md`. Sin commit.

### Bloque copiar-pegar — `ds-owner` (D1)

> Actúa como `ds-owner`. Lee `AGENTS.md`, el plan citado y el §D1 del encargo. Lee los `SKILL.md` de la tabla. Revisa las tres implementaciones ad hoc: `inventory/QuoteShippingFields.tsx:107`, `commercial/catalog/PlanCatalogFormPeek.tsx:73` y `scheduling/ExhaustedAttemptsDecisionDialog.tsx:83`.
> Congela el contrato de `RadioCardGroup` para `@iwana/ui`: props, anatomía (radios nativos en `fieldset`, `min-h-11`, foco con `has-[:focus-visible]`, selección con indicador visible), estados, modo oscuro solo con `dark-surface-*` y a11y. Decide si hace falta un `QuantityStepper`.
> Entrega `docs/specs/2026-10-11-ui-radio-card-group-contrato-componente.md` con tu veredicto G2. Sin commit.
