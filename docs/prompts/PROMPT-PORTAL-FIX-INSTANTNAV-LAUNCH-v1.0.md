# PROMPT-PORTAL-FIX-INSTANTNAV-LAUNCH-v1.0

**Módulo:** PORTAL (+ paridad WEB) · **Fase:** FIX-INSTANTNAV · **Ola:** única
**Plan y spec:** respuesta de la sesión (diagnóstico cerrado); `AGENTS.md` como fuente maestra.
**Gates:** por correr al cierre (tests portal+web, typecheck, lint) · **Bloqueos abiertos:** ninguno.

# · Subagente · Encargo · Skills (leer antes de escribir) · Contrato congelado
| # | Subagente | Encargo | Skills a leer | Contrato |
|---|---|---|---|---|
| 1 | fe-platform | Gate de sesión `<AuthReadyGate />` (suspender + Suspense) en `apps/portal/src/app/dashboard/layout.tsx` y `apps/web/src/app/(protected)/layout.tsx`; tests nuevos de gate | `nextjs-app-router-patterns` + `frontend-dev-guidelines` (obligatorias); `verification-before-completion` + `iwana-test-evidence` (gates) | Contrato de componente AuthReadyGate definido en el encargo de la sesión; UI spec (spinner «Validando sesión...») intacta |

**Paralelo:** no aplica (un bloque). **Secuencia:** web solo tras portal en verde.
**Condición de cierre:** insights «instant navigation» ausentes en dev + suites/typecheck/lint verdes.

## Lanzamiento (bloque copiar-pegar)

```
Eres fe-platform. Encargo: FIX-INSTANTNAV (ola 1).
Lee antes: docs/prompts/PROMPT-PORTAL-FIX-INSTANTNAV-LAUNCH-v1.0.md,
skills `.agents/skills/nextjs-app-router-patterns/SKILL.md` y
`.agents/skills/frontend-dev-guidelines/SKILL.md`.
Causa raíz cerrada: el layout cliente del dashboard condiciona su render y omite
{children} durante la validación de sesión → Next 16.3+ (cacheComponents) no
puede validar navegación instantánea y emite el insight por cada ruta del
subárbol. Fix sancionado por docs (instant-unrendered-segment): Suspense +
gate que suspende hasta que useAuth() resuelva; nunca `return null`/early-return.
Implementa portal (dashboard/layout.tsx + AuthReadyGate + specs) y luego web
((protected)/layout.tsx + AuthReadyGate + spec). UX idéntica: spinner
«Validando sesión...» sin montar chrome/children pre-auth.
Gates de cierre (evidencia con conteos): pnpm --filter @iwana/portal test,
pnpm --filter @iwana/web test, typecheck y lint de ambos paquetes.
Stop/Go: si un test existente del layout rompe, reporta el diff exacto; no lo
saltes. Prohibido: refactor fuera de alcance, tokens/UX nuevos, cambiar E2E.
```
