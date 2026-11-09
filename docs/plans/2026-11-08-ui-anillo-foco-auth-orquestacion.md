# Plan de orquestación — Flujos de autenticación: anillo de foco accesible y hex de marca

**Versión:** 1.5
**Cambio v1.4 → v1.5 (2026-11-08):** G6 cerrado (informe de cierre §2 y §6)
**Cambio v1.3 → v1.4 (2026-11-08):** G3 y G4 cerrados (spec §9.4); informe de cierre emitido (B5)
**Cambio v1.2 → v1.3 (2026-11-08):** G2 cerrado (spec §9.3); el lanzamiento pasa a la Ola 3
**Cambio v1.1 → v1.2 (2026-11-08):** G1 cerrado (spec §9.2); B3-pre guarda también el CSS generado «antes» (spec §8.5); el lanzamiento pasa a la Ola 2
**Cambio v1.0 → v1.1 (2026-11-08):** G0 cerrado (spec §9.1); el lanzamiento queda en la Ola 1
**Estado:** Aprobado. G0 a G4 y G6 cerrados el 2026-11-08; B6 por orden del usuario
**Fecha:** 2026-11-08
**Emitido por:** AI-EM-ARCH
**Definición:** [2026-11-08-ui-anillo-foco-auth-spec.md](../specs/2026-11-08-ui-anillo-foco-auth-spec.md) v1.5 · **Lanzadores:** [Ola 1](../prompts/PROMPT-UI-ANILLO-FOCO-AUTH-LAUNCH-v1.0.md) (G1 ✅) · [Ola 2](../prompts/PROMPT-UI-ANILLO-FOCO-AUTH-OLA2-LAUNCH-v1.0.md) (G2 ✅) · [Ola 3](../prompts/PROMPT-UI-ANILLO-FOCO-AUTH-OLA3-LAUNCH-v1.0.md) (G3 y G4 ✅) · **Cierre:** [INFORME-UI-ANILLO-FOCO-AUTH-v1.0](../informes/INFORME-UI-ANILLO-FOCO-AUTH-v1.0.md)

## 1. Precondiciones

| # | Precondición | Estado al 2026-11-08 |
| --- | --- | --- |
| P1 | G0: el CTO resuelve D1 y D2 (spec §6) | **Cerrada** el 2026-11-08: D1 y D2 sí (spec §9.1) |
| P2 | Nadie en vuelo sobre las rutas de §2 | **Abierta.** `packages/ui` y las páginas de auth limpias; `LoginForm.spec.tsx` y `SessionRecoveryModal.spec.tsx` del portal tienen cambios de otra sesión (spec H12). B2 no los edita; se comprueba de nuevo al lanzar B2 |
| P3 | Commit de la consolidación de skills publicado | **Abierta.** Solo bloquea el ajuste de skills de B5 (spec §7), no las olas de código |

## 2. Superficie

| Zona | Archivos |
| --- | --- |
| Contrato del anillo | `packages/ui/src/components/auth/auth-form-styles.ts` |
| Consumidores con anillo propio | `apps/portal/src/app/auth/{change-password,forgot-password,reset-password,verify-email}/page.tsx`; `apps/web/src/components/auth/LoginForm.tsx` |
| Hex de marca (si D1) | Las cuatro páginas anteriores y `apps/portal/src/app/auth/mfa/{setup,verify}/page.tsx` |
| `@source` | `packages/ui/src/styles/globals.css:13` |
| Pantallas de evidencia | Login del portal, `SessionRecoveryModal`, login de plataforma, `forgot-password` y `verify-email`, con un campo enfocado |

## 3. Bloques y ruta crítica

| Bloque | Agente | Depende de | Rutas |
| --- | --- | --- | --- |
| B1 · contrato | `ds-owner` | P1 | Solo la tabla del spec §5. No edita código |
| B3-pre · capturas «antes» | `sr-qa` | B1 | Guion nuevo en `docs/informes/evidence/ui-anillo-foco-auth/antes/`, derivado de `docs/informes/evidence/ui-tokens-fuente-unica/antes/capturas.mjs` |
| B2 · implementación | `fe-platform` | B1, B3-pre, P2 | §2 |
| B3 · evidencia y auditoría | `sr-qa` | B2 | Capturas «después» con el mismo guion y comparación |
| B4 · gates | `gate-verifier`; `test-change-reviewer` si cambia algún spec | B2 | Solo lectura |
| B5 · cierre documental | AI-EM-ARCH, con `docs-governance` | B3, B4 | Informe de cierre; regla de foco en `core-components` si B1 la fija (tras P3) |
| B6 · publicación | AI-EM-ARCH | B5 | Commit con lista explícita de rutas (`iwana-checkpoint-commit`); push solo por orden del usuario; G6.5 |

**Olas:** 1 = B1; 2 = B3-pre → B2; 3 = B3 ∥ B4; 4 = B5; 5 = B6.

**Ruta crítica:** G0 → B1 → B3-pre → B2 → B4 → B5 → B6 → G6.5.

## 4. Matriz agente × skill

| Bloque | Obligatorias | De apoyo (condición) | Descartadas (motivo) |
| --- | --- | --- | --- |
| B1 `ds-owner` | `core-components`, `iwana-identity-ui-review` (modo review y `scripts/audit-ui.mjs`), `wcag-audit-patterns` | `tailwind-patterns` (si la composición de variantes `focus:` y `dark:focus:` lo exige) | `iwana-identity-ui-review` en modo dirección (no hay propuesta visual nueva: se adopta el patrón de `Button`) |
| B2 `fe-platform` | `core-components`, `tailwind-patterns`, `frontend-dev-guidelines`, `iwana-test-evidence` | `typescript-expert` (si importar las constantes en `apps/web` choca con un tipo) | Skills de backend (no se toca backend) |
| B3-pre y B3 `sr-qa` | `e2e-testing-patterns`, `wcag-audit-patterns` | — | `testing-patterns` (B3 no escribe pruebas del repo) |
| B4 | — (verificadores auxiliares) | `test-change-reviewer` solo si B2 modificó algún spec | `boundary-reviewer` y `contract-drift-reviewer` (sin backend ni `packages/shared`) |
| B5 | `docs-architect` | — | — |
| B6 | `iwana-checkpoint-commit` | — | — |

Skills y subagentes verificados en disco el 2026-11-08.

## 5. Encargos

Trabajo en `main`, sin ramas, sin stash y sin commit hasta B6. **Nunca se matan procesos por nombre** (`taskkill /IM node.exe`, `turbo.exe` ni similares): solo los PID propios. Sin Prettier en `docs/`. `[BLOQUEO]` si un cambio exige un token nuevo, tocar un archivo fuera de §2 o contradice el spec.

- **B1.** Completar el spec §5: una fila por línea con hex (si D1), clase destino, veredicto y si hay cambio visual. Contraste medido del anillo contra el fondo del campo y del contenedor, en claro y en oscuro, y del hover de los enlaces. Decidir el anillo de error y cómo compone el login de plataforma su borde oscuro con la constante. Al terminar, §5 queda congelado.
- **B3-pre.** Copiar el guion de la evidencia de tokens a `docs/informes/evidence/ui-anillo-foco-auth/antes/capturas.mjs` y ajustarlo: las pantallas de §2 con el primer campo enfocado por teclado (`Tab`, no `focus()`), en claro y en oscuro; en el mock, correo con dominio `.test` y teléfono ficticio (deuda del informe de tokens §5). `PW_CHANNEL=chrome` obligatorio. Guarda también, en la misma carpeta, el CSS generado de portal y web con su tamaño y el listado de reglas `iwana-*`: tras B2 ya no se puede reconstruir (spec §8.5).
- **B2.** Línea base sin caché de `@iwana/ui`, `@iwana/portal` y `@iwana/web`. Aplicar §5 tal cual. Correr `audit-ui.mjs` sobre `packages/ui/src` y `apps/portal/src/app/auth` y el `grep` del spec §8.1.
- **B3.** Capturas «después» con el guion de B3-pre y comparación: diferencias solo donde D2 las admite. Contraste medido del anillo en las capturas. Tamaño y reglas `iwana-*` del CSS generado antes y después (spec §8.5).
- **B4.** «Gates Before Merge» sobre `@iwana/ui`, `@iwana/portal` y `@iwana/web`, sin caché, con conteo frente a la línea base de B2.

## 6. Gates

| Gate | Condición |
| --- | --- |
| G0 | **Cerrado** el 2026-11-08 (spec §9.1) |
| G1 | **✅ 2026-11-08** (spec §9.2). Spec §5 sin celdas «(B1)» y congelado |
| G2 | **✅ 2026-11-08** (spec §9.3). Spec §8 criterios 1 y 5 (parte de código) |
| G3 | **✅ 2026-11-08** (spec §9.4). Spec §8 criterios 2, 4 y 5 (CSS generado) |
| G4 | **✅ 2026-11-08** (spec §9.4). Spec §8 criterio 3, con conteo real y `Cached: 0` |
| G6 | **✅ 2026-11-08** (informe de cierre §2 y §6). `docs-governance` sin bloqueantes sobre el informe de cierre |
| G6.5 | CI de `main` en verde sobre el SHA publicado |

## 7. Riesgos

| Riesgo | Mitigación |
| --- | --- |
| Retirar `@source` hace que Tailwind deje de generar alguna clase | Inerte: el archivo no existe. B3 compara el CSS generado antes y después |
| `apps/web` no puede importar las constantes sin arrastrar su propio borde oscuro | B1 decide la composición; si no hay forma limpia, `[BLOQUEO]` y la fila queda como corrección local con el mismo contrato |
| Las páginas de auth son solo claro y la variante `dark:` no se ve | Inocua; B3 verifica en oscuro las pantallas que sí tienen tema |
| Specs de otra sesión en vuelo en `apps/portal/src/components/auth/` (P2) | B2 no los edita; B4 separa los rojos ajenos de los nuevos |
| Un agente mata procesos ajenos | Prohibido en §5 y en cada lanzador |

## Lanzamiento

El archivo [PROMPT-UI-ANILLO-FOCO-AUTH-OLA3-LAUNCH-v1.0](../prompts/PROMPT-UI-ANILLO-FOCO-AUTH-OLA3-LAUNCH-v1.0.md) es la fuente y **prevalece si divergen**. Lanza la Ola 3 (B3 ∥ B4). Olas anteriores: [Ola 1](../prompts/PROMPT-UI-ANILLO-FOCO-AUTH-LAUNCH-v1.0.md) (G1 ✅) y [Ola 2](../prompts/PROMPT-UI-ANILLO-FOCO-AUTH-OLA2-LAUNCH-v1.0.md) (G2 ✅). Cada ola siguiente se lanza con su propio archivo cuando cierra su gate.

```text
===== UI-ANILLO-FOCO-AUTH · Ola 3 · B3 · sr-qa =====
Actúa como sr-qa. Lee AGENTS.md, el spec docs/specs/2026-11-08-ui-anillo-foco-auth-spec.md (§5, §8 y §9.3) y el plan docs/plans/2026-11-08-ui-anillo-foco-auth-orquestacion.md (§5 B3, §6 G3).
Antes de trabajar, lee los SKILL.md de e2e-testing-patterns y wcag-audit-patterns (como documentación).
Antes de capturar, confirma que los servidores de 3002 y 3001 sirven el código actual: el CSS servido debe contener la regla de focus:ring-iwana-secondary-700. Si no, para y avisa.
Alcance: corre docs/informes/evidence/ui-anillo-foco-auth/antes/capturas.mjs sin cambios, con PW_CHANNEL=chrome y salida en docs/informes/evidence/ui-anillo-foco-auth/despues/; compara las 10 parejas píxel a píxel. Solo se admiten las diferencias de D2: anillo de foco en claro, anillo del login de plataforma (claro y oscuro). Mide en las capturas el contraste del anillo contra el campo y el contenedor. Guarda el CSS «después» de portal y web como en antes/css/ y compara tamaño y reglas iwana-* (criterio 5). Repite audit-ui.mjs sobre apps/portal/src/app/auth.
Fuera de alcance: editar código, apps/, packages/ui, la suite e2e/ y .agents/skills/. En main, sin commit. No pares los servidores de 3002 y 3001: los lanzó fe-platform. Nunca mates procesos por nombre.
Cierras cuando G3 se cumple: cada diferencia está explicada por D2 o es un hallazgo.
Informa: tabla de las 10 parejas, contrastes medidos, comparación de CSS, salida de audit-ui.mjs y deuda nueva por severidad.

===== UI-ANILLO-FOCO-AUTH · Ola 3 · B4 · gate-verifier (en paralelo con B3) =====
Actúa como gate-verifier. Lee AGENTS.md («Gates Before Merge»), el spec (§8 criterio 3 y §9.3) y el plan (§5 B4, §6 G4).
Alcance: lint, typecheck y pruebas de @iwana/ui, @iwana/web y @iwana/portal con --force (Cached: 0) frente a la línea base de §9.3 (8/55, 38/233, 348/3.478 + 1 omitido). Confirma con git diff que B2 no modificó ningún spec: si lo hizo, hace falta test-change-reviewer.
Fuera de alcance: editar archivos. En main, sin commit. No pares los servidores de 3002 y 3001. Nunca mates procesos por nombre.
Cierras cuando G4 se cumple con conteo real, o reportas el rojo con su causa.
Informa: comandos, conteos por paquete frente a la línea base, avisos de lint y veredicto.
```
