# PROMPT — Cierre ADR-065 · V-2 (E2E de a11y con dev server)

**Emisor:** AI-EM-ARCH · **Destinatario:** AI-SR-QA
**Fecha:** 2026-07-27
**Plan que lo gobierna:** [docs/plans/2026-07-27-adr065-cierre-programa.md](../../docs/plans/2026-07-27-adr065-cierre-programa.md) — fase 1
**Entradas obligatorias:** [INFORME-ADR065-DISPOSICION-EJECUTADA-v1.0](../../docs/informes/INFORME-ADR065-DISPOSICION-EJECUTADA-v1.0.md) §«Lo que NO pude verificar» · [contrato de estados atenuados](../../docs/specs/2026-07-26-estados-atenuados-contraste-ds-contrato.md)

---

## El problema

Desde que entró la remediación de contraste, **las specs del gate no se han vuelto a correr**. Están en este estado en disco, sin evidencia de ejecución:

- `e2e/tests/portal-pager-a11y.spec.ts` incluye el test nuevo `v2-34 R-14: el estado de carga cumple contraste AA`, que audita con axe-core **durante** `refreshing`/`aria-busy` y asserta `toEqual([])`. **Ese test se escribió cuando el defecto estaba vivo.** La remediación posterior sustituyó `opacity-60` por `portalDataBusyRegionClassName` (`cursor-progress`) en 11 pantallas, así que debería estar en verde ahora — pero nadie lo ha comprobado.
- El test de modo oscuro del mismo archivo pasó de `expect(...violations.length).toBeLessThanOrEqual(3)` a `toEqual([])`. Ese endurecimiento tampoco se ha ejecutado.
- `e2e/tests/portal-crm-subscribers-pagination.spec.ts` y `e2e/tests/web-audit-logs-datepicker.spec.ts` completan las 10 assertions del gate.

## Pasos

1. Levanta lo que las specs necesiten. Consulta `e2e/playwright.portal.config.ts` y `e2e/playwright.web.config.ts` para ver si declaran `webServer` o esperan un servidor ya levantado, y qué `baseURL` usan. **Un fallo por `baseURL` ausente ya contaminó una ronda anterior de este programa** y llevó a atribuir un P0 a tres fallos de entorno: no lo repitas.
2. Ejecuta las tres specs del gate y captura la **salida literal**.
3. **Dos corridas consecutivas** de `portal-pager-a11y.spec.ts`. Una sola corrida verde no descarta que el flake del hallazgo A-1 siga vivo; ese fue el error de método de los dos gates anteriores.
4. Si el test del estado `refreshing` falla, **no relajes la aserción**: significa que quedan violaciones AA en el estado de carga. Captura el detalle de axe-core (regla, nodos, `fgColor`/`bgColor`/`contrastRatio`/`expectedContrastRatio`) y repórtalo como hallazgo. Un rojo aquí es información valiosa, no un obstáculo.
5. Si falla por infraestructura y no por producto, **distínguelo con claridad**.

## Restricciones

- El árbol tiene ~485 archivos modificados de trabajo previo: **no hagas `git add`, `git commit`, `git stash` ni `git checkout`.**
- **No modifiques specs para conseguir verde** y **no toques componentes**: si hay defecto de producto es de AI-FE-PLATFORM bajo contrato de AI-DS-OWNER, y se enruta por AI-EM-ARCH.
- Estándar WCAG 2.2 AA.
- Sin PII real en fixtures.
- Si levantas servidores, di explícitamente qué queda corriendo al terminar.

## Entregables

1. Salida literal de las tres specs, con el conteo de assertions.
2. Las dos corridas consecutivas de `portal-pager-a11y.spec.ts`.
3. Veredicto explícito sobre la pregunta que abrió el hallazgo A-1: **¿el flake de axe desapareció porque se corrigió el defecto, o sigue vivo?** Es la razón de ser de esta tarea.

## Stop/go

Las tres specs en verde, dos corridas del a11y, con salida pegada. **Emite `[BLOQUEO]` a AI-EM-ARCH** si no puedes levantar el entorno, con el error literal. No declares verde lo que no ejecutaste — es la regla que este programa lleva cuatro informes incumpliendo.
