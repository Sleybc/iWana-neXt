# Plan — MOD13: retiro de «Referencia LAN anterior» del catálogo de routers

**Versión:** 1.1 (2026-10-29: addendum §6, consumidor WFM del puerto de Organización)
**Fecha:** 2026-10-28
**Modo:** Architect + EM + Orchestrator
**Estado:** Definición cerrada; sin ejecutar
**Addendum a:** [plan de interfaces IPv4 v3.13](2026-10-26-mod13-interfaces-ipv4-orquestacion.md). No reabre sus gates ni altera su estado.
**Encargo:** [PROMPT-MOD13-ROUTERS-CATALOGO-v1.0.md](../prompts/PROMPT-MOD13-ROUTERS-CATALOGO-v1.0.md)
**Decisión:** aprobada por el usuario el 2026-10-28.

## 1. Decisión y alcance

`lan_interface` es un texto heredado (`varchar(64)`, nullable) anterior a la colección de interfaces. El HLD D-3 lo dejó como dato de solo lectura, sin conversión automática y sin parseo. En el listado no tiene acción, filtro ni orden asociado: su único uso operativo —la conversión a interfaz— vive en el detalle del router.

Se retira de:

- la tabla del catálogo (`NetworkRouterCatalogClient.tsx:363-365`, `408-410` y el `columnCount` de la línea 311);
- el formulario de edición (`NetworkRouterDrawer.tsx:311-323`), donde es información no editable dentro de un formulario que no puede actuar sobre ella.

Se conserva en el detalle (`NetworkRouterDetailSidePeek.tsx:515-527`), que es donde se explica y se convierte.

**Fuera de alcance:** retirar el campo (D6, requiere `sr-backend` y `data-eng`), contratos, entidad, migraciones, rediseño de la tabla y la alineación del texto «Convertida en \<nombre\>».

## 2. Por qué

- La spec §5 ya declara que «el resumen de interfaces sustituye gradualmente la columna singular LAN» (`2026-10-26-mod13-interfaces-ux.md:82`): retirarla cumple la spec, no la contradice.
- La tabla sostiene 10 columnas y `min-w-[1120px]` con scroll horizontal; esta es la de menor densidad informativa.
- Todo router posterior a la migración 165 tiene el campo nulo: la columna tiende a una franja de «—».
- Un texto libre junto a «Interfaces» se puede leer como una interfaz más, que es justo lo que la nota intenta evitar y la celda no puede explicar.

## 3. Bloques y matriz de dispatch

| Bloque | Subagente | Skills obligatorias | Apoyo (condición) | Descartadas y por qué | Gate ejecutable |
| --- | --- | --- | --- | --- | --- |
| **B1 · Spec** | `prod-ux` | `system-vocabulary-review`, `iwana-identity-ui-review`, `docs-architect` | `senior-ui-systems-designer` solo si el retiro altera la jerarquía visual de la tabla más allá de quitar una columna (no previsto) | `core-components` y `tailwind-patterns`: no hay componente ni token nuevo. `wcag-audit-patterns`: se retira una columna sin controles; no cambia contraste ni foco. `ui-ux-pro-max`: no hay dirección visual nueva | Revisión de AI-EM-ARCH al publicar v2.3 |
| **B2 · Código** | `fe-platform` | `frontend-dev-guidelines`, `iwana-identity-ui-review`, `tailwind-patterns`, `testing-patterns` | `core-components` solo si hay que tocar una primitiva (no previsto); `nextjs-app-router-patterns` solo si cambia el boundary RSC (no cambia) | `ui-ux-pro-max`: subordinada y sin diseño nuevo. `wcag-audit-patterns`: sin superficie interactiva nueva. `playwright-skill` y `e2e-testing-patterns`: sin flujo de usuario nuevo; cubre la suite unitaria. `postgresql` y `database-migration`: sin cambio de schema | `jest` focal + `typecheck` + `lint` + `audit-ui.mjs` (comandos en el encargo §5) |

Todas las skills citadas se verificaron contra disco el 2026-10-28 (`.agents/skills/<nombre>/SKILL.md`). Los subagentes `prod-ux` y `fe-platform` existen en `.claude/agents/`.

## 4. Secuencia, gates y evidencia

- **Paralelo:** B1 y B2 comparten ola y no comparten archivos. La conducta que ejecuta B2 la fija este plan y el encargo, no la redacción de la spec; si B1 encuentra una contradicción en 13.13 V2, emite `[CONSULTA]` y B2 no se detiene.
- **Cierre de ola:** spec v2.3 publicada + diff de B2 + evidencia de la suite focalizada con conteo real. Sin los tres, la ola no cierra.
- **Gates:** no se reabre G1, G3 ni G4. **G2 no se reabre**: no hay componente, token, estado ni copy nuevos; la superficie se reduce. La spec sube a v2.3 y AI-EM-ARCH la aprueba como cambio de alcance — productor `prod-ux`, aprobador distinto del productor.
- **Evidencia de árbol:** el cambio altera la suite de Portal, así que los conteos de G6 registrados sobre el árbol sin commit quedan obsoletos para el conteo, no para los criterios. `gate-verifier` debe re-ejecutar la suite de Portal antes del commit y G6.5 corre sobre el SHA final.
- **Invariantes:** `NETWORK_IP_PROTECTION=PENDING` no cambia. D6 sigue abierto: el campo no se retira en esta ola.

## 5. Riesgos

| Riesgo | Mitigación |
| --- | --- |
| El operador pierde la vista de routers pendientes de normalizar desde el listado | El detalle conserva la referencia y la conversión. Si la operación necesita encontrarlos, se decide un filtro como alcance aparte, no como efecto de esta columna |
| Un test asume el orden o el número de columnas | `fe-platform` actualiza el test; es parte del cambio, no una regresión |
| Deriva documental si la spec no se sincroniza | El cierre de ola exige v2.3; sin ella la ola no cierra |

## 6. Addendum 2026-10-29 — consumidor WFM del puerto de Organización

**Origen.** La §8.8 del [informe MOD13](../informes/INFORME-MOD13-ROUTERS-ANALISIS-v1.0.md) («Nombre de sede en "Routers registrados"») añadió el método abstracto `findRouterSummariesByIds` a `OrganizationSiteReadPort` (`apps/api/src/modules/organization/ports/organization-site-read.port.ts`). Su evidencia fue focal (`network-catalog`, D23 y Portal) más ESLint, **sin typecheck de API**. El otro consumidor del puerto, WFM, quedó sin cubrir. Hoy `pnpm --filter @iwana/api typecheck` sale con código 2 por un único error, `TS2352` en `apps/api/src/modules/wfm/services/wfm-organization-sites.adapter.spec.ts:7`: el mock tipado `jest.Mocked<OrganizationSiteReadPort>` no declara el método nuevo. Lo detectó la fase privacy · textos legales, cuyo G6 queda en NO-GO por este gate ([plan privacy](2026-10-29-privacy-textos-legales.md) §6).

**Decisión (usuario, 2026-10-29).** Lo corrige esta obra MOD13, que es la que cambió el puerto.

**Bloque B3 — `sr-backend`.** El encargo está en [PROMPT-MOD13-ROUTERS-SEDE-PUERTO-v1.0.md](../prompts/PROMPT-MOD13-ROUTERS-SEDE-PUERTO-v1.0.md).

| Bloque | Subagente | Skills obligatorias | Apoyo (condición) | Descartadas y por qué | Gate ejecutable |
| --- | --- | --- | --- | --- | --- |
| **B3 · Consumidor WFM** | `sr-backend` | `nestjs-expert`, `testing-patterns`, `iwana-test-evidence` | `typescript-expert` solo si el mock exige un tipado distinto de `jest.fn()` | `postgresql` y `database-migration`: sin cambio de datos. `openapi-spec-generation`: sin cambio de contrato. Skills de frontend: sin superficie de Portal | `pnpm --filter @iwana/api typecheck` con salida 0 + specs focales de WFM, organización y `network-catalog` sin caché |

**Efecto sobre los gates de MOD13.** El G6 PASS del plan de interfaces IPv4 v3.13 se dictó sobre un árbol que no incluía §8.8. No se reabre, pero G6.5 de MOD13 exige el typecheck de API en verde sobre el SHA final, y hoy no lo está. **Regla para próximos ajustes de un puerto compartido:** typecheck del paquete completo, no solo de los archivos tocados.

## Lanzamiento

> Esta sección es espejo del launcher vigente. **El archivo [PROMPT-MOD13-ROUTERS-SEDE-PUERTO-LAUNCH-v1.0.md](../prompts/PROMPT-MOD13-ROUTERS-SEDE-PUERTO-LAUNCH-v1.0.md) (B3, addendum §6) es la fuente y prevalece si divergen.** La ola original B1 ∥ B2 se lanzó con [PROMPT-MOD13-ROUTERS-CATALOGO-LAUNCH-v1.0.md](../prompts/PROMPT-MOD13-ROUTERS-CATALOGO-LAUNCH-v1.0.md) (cumplido).

| # | Subagente | Encargo | Skills a leer | Contrato |
| --- | --- | --- | --- | --- |
| 1 | `prod-ux` | `PROMPT-MOD13-ROUTERS-CATALOGO-v1.0.md` §2 y §4 (spec v2.3) | `system-vocabulary-review`, `iwana-identity-ui-review`, `docs-architect` | Spec UX v2.2 → v2.3 |
| 2 | `fe-platform` | `PROMPT-MOD13-ROUTERS-CATALOGO-v1.0.md` §2, §4 y §5 | `frontend-dev-guidelines`, `iwana-identity-ui-review`, `tailwind-patterns`, `testing-patterns` | Sin contrato nuevo: se conserva API v1.2 y el detalle |

**Paralelo:** sí, archivos disjuntos. **Cierre:** spec v2.3 + diff + evidencia real de la suite focalizada.

**Ola vigente — B3 (addendum §6):**

> Actúa como `sr-backend`. Lee `AGENTS.md`, el plan `docs/plans/2026-10-28-mod13-routers-retiro-columna-lan.md` v1.1 §6 y tu encargo `docs/prompts/PROMPT-MOD13-ROUTERS-SEDE-PUERTO-v1.0.md`.
> Antes de codificar lee los `SKILL.md` de `nestjs-expert`, `testing-patterns` e `iwana-test-evidence` (en `.agents/skills/<nombre>/SKILL.md`, como documentación, no como tool).
> Solo completas el mock de WFM del puerto de Organización. No cambies el puerto, su adaptador, `network` ni privacy. Si el typecheck revela otro error, emite `[BLOQUEO]` y para.
> No commitees ni reviertas cambios ajenos. Añade la §8.9 al informe `docs/informes/INFORME-MOD13-ROUTERS-ANALISIS-v1.0.md` con conteo real sin caché.
