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

## Fuentes adicionales que puede leer la CLI de Copilot

La CLI/cliente de Copilot puede recoger instrucciones desde varias ubicaciones. En entornos locales o cuando se establecen variables de entorno, el orden observado de lectura suele ser (ejemplo observado en el workspace):

- `CLAUDE.md` (archivo local en la raíz, si existe)
- `GEMINI.md` (archivo local en la raíz, si existe)
- `AGENTS.md` (fuente maestra del repo)
- `.github/instructions/**/*.instructions.md` (instrucciones por path)
- `.github/copilot-instructions.md` (este archivo)
- `$HOME/.copilot/copilot-instructions.md` (archivo por usuario)
- rutas definidas por la variable `COPILOT_CUSTOM_INSTRUCTIONS_DIRS`

Nota importante: la presencia de estos archivos en el entorno no cambia la regla de gobernanza del proyecto. Aunque la CLI pueda leer `CLAUDE.md` o `GEMINI.md`, en este workspace **esas fuentes están marcadas como pasivas** y no deben emplearse como fuentes de verdad.

Regla del repositorio sobre precedencia:

- Fuente maestra: `AGENTS.md` — siempre prevalece cuando hay conflicto.
- Complementos por path: `.github/instructions/*.instructions.md` — aplican en su ámbito de path.
- Archivos de usuario (`$HOME/.copilot/...`) o variables de entorno son auxiliares y nunca deben contradecir `AGENTS.md`.

Si encuentras que la CLI está considerando una instrucción que contradice `AGENTS.md`, documenta el conflicto y escálalo — no asumas la autoridad del archivo local que contradice `AGENTS.md`.
