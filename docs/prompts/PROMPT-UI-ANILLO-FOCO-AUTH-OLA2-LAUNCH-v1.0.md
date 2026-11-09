# LAUNCH — UI · ANILLO-FOCO-AUTH · Ola 2

**Plan:** `docs/plans/2026-11-08-ui-anillo-foco-auth-orquestacion.md` v1.2 · **Spec:** `docs/specs/2026-11-08-ui-anillo-foco-auth-spec.md` v1.2
**Ola que lanza:** Ola 2 — B3-pre (capturas «antes») y luego B2 (implementación) · **Ola cerrada:** G2 ✅ 2026-11-08 (spec §9.3); no relanzar: sobrescribiría `antes/`
**Bloqueos abiertos:** ninguno. P2 del plan: B2 no edita los specs de otra sesión en `apps/portal/src/components/auth/`

| # | Subagente | Encargo | Skills a leer antes de trabajar | Contrato congelado |
| --- | --- | --- | --- | --- |
| 1 | `sr-qa` | Plan §5 B3-pre | `e2e-testing-patterns`, `wcag-audit-patterns` | Spec v1.2 §5 |
| 2 | `fe-platform` | Plan §5 B2 | `core-components`, `tailwind-patterns`, `frontend-dev-guidelines`, `iwana-test-evidence` | Spec v1.2 §5 |

**Secuencia:** 2 no arranca hasta que 1 entrega las capturas y el CSS «antes».
**Cierre de ola:** G2 (spec §8 criterios 1 y 5, parte de código). No hay prompt de ejecución aparte: el encargo es el plan §5.

---

### Bloque copiar-pegar

```text
===== UI-ANILLO-FOCO-AUTH · Ola 2 · paso 1 · B3-pre · sr-qa =====
Actúa como sr-qa. Lee AGENTS.md, el spec docs/specs/2026-11-08-ui-anillo-foco-auth-spec.md (§5, §8 y §9) y el plan docs/plans/2026-11-08-ui-anillo-foco-auth-orquestacion.md (§2 y §5 B3-pre).
Antes de trabajar, lee los SKILL.md de e2e-testing-patterns y wcag-audit-patterns (como documentación).
Alcance: copia docs/informes/evidence/ui-tokens-fuente-unica/antes/capturas.mjs a docs/informes/evidence/ui-anillo-foco-auth/antes/capturas.mjs y ajústalo: login del portal, SessionRecoveryModal, login de plataforma, forgot-password y verify-email, cada uno con su primer campo enfocado con Tab (no focus()), en claro y en oscuro; en el mock, correo con dominio .test y teléfono ficticio. Corre con PW_CHANNEL=chrome. Guarda además el CSS generado de portal y web, su tamaño y el listado de reglas iwana-* (spec §8.5).
Fuera de alcance: editar código, packages/ui, apps/, la suite e2e/ y .agents/skills/. En main, sin commit. Nunca mates procesos por nombre (taskkill /IM node.exe, turbo.exe ni similares): solo los PID que lanzaste tú.
Cierras cuando las capturas existen, se ve el anillo en cada una y el guion corre de nuevo sin cambios. Avisa al orquestador: B2 no arranca antes.
Informa: comando, rutas de capturas y CSS, cómo llegaste a cada pantalla y deuda nueva por severidad.

===== UI-ANILLO-FOCO-AUTH · Ola 2 · paso 2 · B2 · fe-platform (solo tras el paso 1) =====
Actúa como fe-platform. Lee AGENTS.md, el spec (§2 a §5 congelado, §8, §9) y el plan (§2, §5 B2, §7).
Antes de codificar, lee los SKILL.md de core-components, tailwind-patterns, frontend-dev-guidelines e iwana-test-evidence (como documentación).
Toma la línea base sin caché de @iwana/ui, @iwana/portal y @iwana/web.
Alcance: aplica el spec §5 tal cual, fila por fila; las filas «Se queda» no se tocan. Retira @source "../tokens.ts" de globals.css.
Fuera de alcance: archivos fuera del plan §2, los specs en vuelo de apps/portal/src/components/auth/, .agents/skills/, tokens nuevos y cualquier hex que §5 no migre. En main, sin commit. Nunca mates procesos por nombre: solo tus PID.
Si un cambio exige tocar otro archivo o contradice §5, emite [BLOQUEO] con archivo:línea y para.
Cierras cuando G2 se cumple (spec §8 criterios 1 y 5), con lint, typecheck y pruebas de los tres paquetes sin caché y conteo no inferior a la línea base; los rojos ya presentes en la línea base se reportan, no se corrigen.
Informa: diff por archivo, salida de audit-ui.mjs sobre packages/ui/src y apps/portal/src/app/auth, el grep del spec §8.1, línea base frente al cierre de los tres paquetes y deuda nueva por severidad.
```
