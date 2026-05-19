# iWana neXt — Copilot Bootstrap

GitHub Copilot es el asistente activo del workspace. `AGENTS.md` es la fuente maestra de gobernanza, arquitectura, comandos, gotchas, skills y entregables.

## Orden de lectura

1. `AGENTS.md`
2. `docs/prds/Stack_Tecnologico.md`
3. PRD/HLD/ADR vigente del modulo afectado
4. Instrucciones contextuales en `.github/instructions/` cuando apliquen por path

Si dos artefactos chocan en multi-tenancy, seguridad, boundaries o stack, no sintetices por conveniencia: documenta el conflicto y escala.

## Flujo activo

- Usa siempre `pnpm`; no uses `npm` ni `yarn` para flujos del repo.
- Las reglas por archivo viven en `.github/instructions/*.instructions.md` y son complementos, no fuentes maestras.
- Los prompts operativos viven en `.github/prompts/`.
- Claude y OpenCode quedan pasivos por ahora; no tomes `CLAUDE.md` ni `.opencode/` como fuentes activas si contradicen `AGENTS.md`.

## Recordatorios de alto riesgo

- `@Roles()` usa `UserRole.*`, no strings literales.
- Tenant/schema nunca se hardcodean; resuelve desde contexto aprobado.
- pgBouncer no conserva `search_path`; usa `SET LOCAL` por transaccion o helpers aprobados.
- Tailwind es v4 CSS-first; no agregues `tailwind.config.js` sin ADR.
- Cero PII, secretos, tokens o connection strings en codigo, tests, docs o logs.

Para el mapa completo de decisiones y comandos, vuelve a `AGENTS.md`.
