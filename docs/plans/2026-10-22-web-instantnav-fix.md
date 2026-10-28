# Plan — Correccion de instant navigation en WEB y PORTAL

**Fecha:** 2026-10-22 · **Modo:** Orchestrator + EM (AI-EM-ARCH) · **Estado:** aprobado para ejecucion
**Encargo:** `docs/prompts/PROMPT-WEB-INSTANTNAV-FIX-v1.0.md`
**Launcher:** `docs/prompts/PROMPT-WEB-INSTANTNAV-FIX-LAUNCH-v1.0.md` (fuente; prevalece si divergen)

## 1. Estado al arrancar

- Incidente reproducido sobre `next@16.4.2` con `cacheComponents: true`.
- Web y portal ya tienen un layout protegido con `instant = false` (commit `27625542`), pero el opt-out no cubre descendientes.
- No hay cambios de auth, API ni base de datos en este alcance.

## 2. Decision

| ID  | Decision                                                                                                               | Fundamento                                                                                                                                               |
| --- | ---------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | `/` se resuelve con `redirects()` de `next.config.ts`                                                                  | Un `redirect()` en pagina prerenderizada produce `NEXT_REDIRECT` y shell cliente; el redirect de config es HTTP 307 sin segmento                         |
| D2  | `/auth/login` lee `searchParams` dentro de `<Suspense>` con fallback de la experiencia real y exporta `instant = true` | Elimina runtime data del shell y conserva la validacion donde si puede cumplirse                                                                         |
| D3  | `experimental.instantInsights.validationLevel: 'manual-warning'` en web y portal                                       | `instant = false` no cubre descendientes y 5 paginas protegidas son Client Components; `manual-warning` es el opt-out documentado para el arbol completo |

Impacto: multi-tenant **ninguno**; seguridad **ninguno** (el gate de sesion no cambia); escala **ninguno**; regulacion **ninguna**. Se pierde la validacion implicita de instant navigation en ambas apps; queda disponible por opt-in con `export const instant = true`.

## 3. Bloques, dependencias y olas

| #   | Bloque                              | Subagente         | Entregable                                  | Depende de       |
| --- | ----------------------------------- | ----------------- | ------------------------------------------- | ---------------- |
| 1   | Implementacion D1–D3 + informe §10  | `fe-platform`     | diff en 5 archivos + informe actualizado    | —                |
| 2   | Verificacion independiente de gates | `gate-verifier`   | evidencia CA-1..CA-7 con comandos y conteos | 1                |
| 3   | Auditoria de gobernanza documental  | `docs-governance` | hallazgos sobre el informe y el prompt      | 1 (paralelo a 2) |

**Ola 1:** bloques 1 y luego 2 y 3 en paralelo. El bloque 3 no bloquea el cierre; sus hallazgos se corrigen antes de commitear.

## 4. Matriz de dispatch (agente x skill)

Skills verificadas contra disco en `.agents/skills/<nombre>/SKILL.md`.

| Bloque | Subagente         | Skills obligatorias                                     | Apoyo (condicion)                                                                                                                                   | Descartadas y por que                                                                                                                                                                                     | Gate ejecutable                                                                    |
| ------ | ----------------- | ------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| 1      | `fe-platform`     | `nextjs-app-router-patterns`, `frontend-dev-guidelines` | `typescript-expert` (tipos de `NextConfig`), `testing-patterns` (si agrega prueba focalizada), `verification-before-completion` (antes de reportar) | `iwana-identity-ui-review`, `core-components`, `tailwind-patterns` (sin cambio visual ni de tokens); `database-migration`, `nestjs-expert` (sin backend); `openapi-spec-generation` (sin contrato de API) | `pnpm --filter @iwana/web build` · `pnpm --filter @iwana/portal build` · typecheck |
| 2      | `gate-verifier`   | `verification-before-completion`, `iwana-test-evidence` | `e2e-testing-patterns` (solo si valida el redirect con Playwright)                                                                                  | `frontend-dev-guidelines` (no implementa); `systematic-debugging` (el diagnostico ya esta cerrado)                                                                                                        | suites web/portal + HTTP 307 + logs de dev sin insights                            |
| 3      | `docs-governance` | `docs-architect`                                        | `system-vocabulary-review` (copy visible del informe)                                                                                               | `mermaid-expert` (sin diagramas), `architecture-decision-records` (no hay ADR nuevo)                                                                                                                      | revision de nombre, carpeta, estado y addendum                                     |

## 5. Riesgos y rollback

| Riesgo                                             | Mitigacion                                                                                 | Rollback                                                                 |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------ |
| `manual-warning` silencia validacion futura        | Opt-in explicito en paginas publicas (`instant = true`); tradeoff registrado en el informe | Quitar la clave `experimental.instantInsights` y volver al estado previo |
| El redirect de config no preserve query strings    | `/` no recibe query en los flujos actuales; verificar 307 y Location                       | Restaurar `page.tsx`                                                     |
| Flash de variante `sobria` por el fallback premium | El fallback es la misma experiencia; la variante solo cambia por query                     | Ajustar el fallback si la verificacion visual lo detecta                 |

## 6. Criterios de cierre

1. CA-1..CA-7 del encargo verificados con evidencia real.
2. Informe §10 con decision, archivos, evidencia y deuda.
3. `docs-governance` sin hallazgos bloqueantes.
4. Sin cambios en auth, contratos de API, boundaries ni tokens.

## Lanzamiento

El launcher `docs/prompts/PROMPT-WEB-INSTANTNAV-FIX-LAUNCH-v1.0.md` es la fuente y prevalece si divergen. Su bloque copiar-pegar, reproducido aqui para que el plan sea autosuficiente:

> Actua como `fe-platform`. Lee `AGENTS.md`, el plan `docs/plans/2026-10-22-web-instantnav-fix.md` y tu encargo `docs/prompts/PROMPT-WEB-INSTANTNAV-FIX-v1.0.md`.
> Antes de escribir codigo lee los `SKILL.md` de `nextjs-app-router-patterns`, `frontend-dev-guidelines` y `verification-before-completion` en `.agents/skills/<nombre>/SKILL.md` (como documentacion, no como tool).
> Alcance: solo §4 del encargo. No toques auth, API, contratos, boundaries, tokens ni migraciones.
> Aplica D1, D2 y D3 segun §3 del encargo, en web y portal.
> Cierras cuando: diff aplicado, informe §10 actualizado y CA-6/CA-7 ejecutados con conteos reales. Reporta evidencia, deuda nueva y cualquier `[BLOQUEO]`.
