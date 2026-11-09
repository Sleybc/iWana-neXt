# LAUNCH — UI · ANILLO-FOCO-AUTH · Ola 3

**Plan:** `docs/plans/2026-11-08-ui-anillo-foco-auth-orquestacion.md` v1.3 · **Spec:** `docs/specs/2026-11-08-ui-anillo-foco-auth-spec.md` v1.3
**Ola que lanza:** Ola 3 — B3 (evidencia «después») ∥ B4 (gates) · **Ola cerrada:** G3 y G4 ✅ 2026-11-08 (spec §9.4); no relanzar: sobrescribiría `despues/`
**Bloqueos abiertos:** ninguno. Servidores de 3002 y 3001 vivos, lanzados por `fe-platform`: nadie los para por nombre

| # | Subagente | Encargo | Skills a leer antes de trabajar | Contrato congelado |
| --- | --- | --- | --- | --- |
| 1 | `sr-qa` | Plan §5 B3 | `e2e-testing-patterns`, `wcag-audit-patterns` | Spec v1.3 §5 |
| 2 | `gate-verifier` | Plan §5 B4 | — (verificador auxiliar) | Spec v1.3 §5 |

**Paralelo:** 1 y 2 son de solo lectura y no comparten salida.
**Cierre de ola:** G3 y G4 del plan §6. No hay prompt de ejecución aparte: el encargo es el plan §5.

---

### Bloque copiar-pegar

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
