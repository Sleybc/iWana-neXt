# Plan de orquestación — Auditoría de cruces de roles, olas 2 a 4

**Versión:** 1.2
**Estado:** Aprobado. G0 el 2026-11-09; Ola 2: T1–T4 ejecutados y G1 ✅ 2026-11-09; sigue el cierre (T5 → T6 → T7)
**Cambio v1.0 → v1.1 (2026-11-09):** G0-5 a G0-11 cerrados en bloque con las recomendaciones; la definición pasa a la v1.4 del informe, con §10.3 y §10.5 sin cambios
**Cambio v1.1 → v1.2 (2026-11-09):** G1 de la Ola 2 cerrado. Se corrigen dos patrones de G1 que eran defecto del plan, no de la ejecución: «Baseline del sprint y» admite los changelogs que lo citan, igual que el G1 de la Ola 1; y «merge readiness» se sustituye por la comprobación de la semántica retirada, porque es el nombre del gate en el título de ADR-069 (aprobado) y ADR-107 no lo renombra. §5 T7 recibe la lista explícita de rutas. Nuevo lanzador de cierre
**Fecha:** 2026-11-09
**Emitido por:** AI-EM-ARCH
**Definición:** [INFORME-ROLES-AUDITORIA-CRUCES-v1.0](../informes/INFORME-ROLES-AUDITORIA-CRUCES-v1.0.md) v1.4, §10 · **Contrato congelado:** §10.3 (Ola 2) y §10.5 (Ola 4) de ese informe · **Lanzador:** [Ola 2](../prompts/PROMPT-ROLES-AUDITORIA-CRUCES-OLA2-LAUNCH-v1.0.md)
**Antecesor:** [plan de las olas 0 y 1](2026-11-08-roles-auditoria-cruces-orquestacion.md) (cerradas: `75528631`, G6.5 ✅)
**Publicación:** [ADR-107](../adrs/ADR-107-Publicacion-por-Lotes-y-G6.5-Asincrono.md) (aprobado) — commit por ola, push por tren, G6.5 asíncrono. Las dos olas son de documentación: ninguna cae en las excepciones síncronas de D3

## 1. Precondiciones

| # | Precondición | Estado al 2026-11-09 |
| --- | --- | --- |
| P0 | G0: el CTO resuelve G0-5 a G0-11 (informe §10.6) | **Cerrada** el 2026-11-09: aprobación en bloque con las recomendaciones |
| P1 | Nadie más en vuelo sobre `docs/roles/` ni `.claude/agents/` | **Cerrada**: `git status` solo muestra `.claude/launch.json` sin seguimiento, ajeno. Se vuelve a comprobar al lanzar |
| P2 | Ola 1 cerrada | **Cerrada**: `75528631`, G6.5 ✅ (informe §9.2) |
| P3 | Línea base de sincronización | Se toma al lanzar T4: `pnpm sync:agents:check` |
| P4 | Numeración | Las líneas del informe §10.3 son las de `75528631`; si un tramo las encuentra desplazadas, localiza el texto citado, no el número |

## 2. Superficie

| Zona | Archivos |
| --- | --- |
| Ola 2 · T1 | `Protocolo_Colaboracion_Multiagente_v1.md` |
| Ola 2 · T2 | EMA, SRF, FEP, OPS |
| Ola 2 · T3 | PUX, DSO, QA, SEC |
| Ola 2 · T4 | GAT, BND, CON, TCR; `.claude/agents/sr-qa.md`, `ds-owner.md`, `gate-verifier.md`, `boundary-reviewer.md` |
| Ola 2 · T5 | `INFORME-ROLES-ECOSISTEMA-MULTIAGENTE-v1.0.md` §15 y el informe de cruces §9.3 |
| Ola 4 · T8 a T10 | Los 9 perfiles ejecutores; los 8 subagentes ejecutores de `.claude/agents/` |
| Generados (no se editan a mano) | `.opencode/agents/`, `.codex/agents/` (`pnpm sync:agents`, solo en T4 y T10) |
| Fuera de alcance | `AGENTS.md` (lo toca la Ola 1b de ADR-107), `.agents/skills/`, DAT y ANX en la Ola 2, cualquier código |

## 3. Bloques y ruta crítica

| Bloque | Agente | Depende de | Contenido (informe §10.3 y §10.5) |
| --- | --- | --- | --- |
| T1 · protocolo v1.10 | AI-EM-ARCH (sesión principal) | P0, P1 | Columna «Protocolo v1.10» de D1 a D9 |
| T2 · espejos de gobierno e ingeniería | AI-EM-ARCH (segunda sesión) | P0, P1 | EMA: D1, D7, D10, D11 · SRF: D10, D11 · FEP: D10, D11 · OPS: D7 |
| T3 · espejos de diseño, calidad y seguridad | AI-EM-ARCH (tercera sesión) | P0, P1 | PUX: D11 · DSO: D6, D10, D11 · QA: D2 · SEC: D4 |
| T4 · verificadores y subagentes | AI-EM-ARCH (cuarta sesión) | P0, P1, P3 | GAT: D7, D9 · BND: D3, D9 · CON y TCR: D9 · `sr-qa.md`: D2 · `ds-owner.md`: D6 · `gate-verifier.md` y `boundary-reviewer.md`: D9 · `pnpm sync:agents` |
| T5 · registro de la Ola 2 | AI-EM-ARCH (sesión principal) | T1–T4 | Informe vivo §15 y §9.3 del informe de cruces |
| T6 · verificación de la Ola 2 | `docs-governance` | T5 | Solo lectura (§6, G4) |
| T7 · commit de la Ola 2 | AI-EM-ARCH (sesión principal) | T6 | Un commit con lista explícita de rutas; push en el tren siguiente, solo por orden del usuario |
| T8 · prompts compactos A | AI-EM-ARCH (sesión principal) | G1 de la Ola 2 | EMA, SRF, FEP, DAT, OPS |
| T9 · prompts compactos B | AI-EM-ARCH (segunda sesión) | G1 de la Ola 2 | PUX, DSO, QA, SEC |
| T10 · reconciliación de subagentes | AI-EM-ARCH (tercera sesión) | G1 de la Ola 2 | Los 8 subagentes ejecutores + `pnpm sync:agents` |
| T11 · registro de la Ola 4 | AI-EM-ARCH (sesión principal) | T8–T10 | Informe vivo y §9.4 del informe de cruces |
| T12 · verificación de la Ola 4 | `docs-governance` | T11 | Solo lectura (§6, G4′) |
| T13 · commit de la Ola 4 | AI-EM-ARCH (sesión principal) | T12 | Como T7 |

**Olas internas.** Ola 2 = (T1 ∥ T2 ∥ T3 ∥ T4) → T5 → T6 → T7. Ola 4 = (T8 ∥ T9 ∥ T10) → T11 → T12 → T13. Los cuatro tramos de la Ola 2 corren en paralelo porque no comparten archivos y el texto de cada cambio está congelado en el informe §10.3 (G0-11). Solo T4 y T10 corren `pnpm sync:agents`, así que dos sesiones nunca regeneran a la vez.

**Ruta crítica:** G0 → (T1 ∥ T2 ∥ T3 ∥ T4) → G1 → T5 → T6 → T7 → (T8 ∥ T9 ∥ T10) → G1′ → T11 → T12 → T13 → tren → G6.5. Por ADR-107 D3, la Ola 4 arranca con el G1 de la Ola 2, sin esperar a su G6.5.

Los bloques de gobierno van a la sesión principal y a sesiones paralelas de AI-EM-ARCH, como en la Ola 1: ningún subagente de `.claude/agents/` es dueño de `docs/roles/` y el R de «Documentación y trazabilidad» es de quien produce el artefacto (`PROT:118`).

## 4. Matriz agente × skill

| Bloque | Obligatorias | De apoyo (condición) | Descartadas (motivo) | Gate ejecutable |
| --- | --- | --- | --- | --- |
| T1 | `docs-architect` | `architecture-decision-records` (solo para el marcador de estado al citar ADR-069 y ADR-107) | `architect-review`: no cambia la arquitectura del producto · `brainstorming`: la definición se aprueba en G0 | `pnpm audit:adr-citations` |
| T2, T3 | `docs-architect` | — | `security-auditor` y `wcag-audit-patterns`: no se audita nada, se alinean textos | `pnpm audit:adr-citations` |
| T4 | `docs-architect` | — | `skill-creator`: los subagentes no son skills | `pnpm sync:agents:check` |
| T5, T11 | `docs-architect` | — | `architecture-decision-records`: no se emite ningún ADR | `pnpm audit:doc-locations` |
| T6, T12 `docs-governance` | — (verificador auxiliar) | — | `gate-verifier`: no hay código ni suites | Los dos scripts de auditoría |
| T7, T13 | `iwana-checkpoint-commit` | `verification-before-completion` (antes de registrar G6.5) | — | `gh run list --commit <sha>` |
| T8, T9, T10 | `docs-architect` | — | `anthropic-skills:prompt-engineering-patterns` (solo Claude Code): su disparador en INDEX es depurar un encargo mal ejecutado, y aquí el texto ya está congelado en §10.5 | T10: `pnpm sync:agents:check` |

Skills y subagente verificados en disco el 2026-11-09; la skill de plugin, contra INDEX («Skills externas de plugin»). Los `SKILL.md` se **leen** como documentación; no se invocan como tool.

## 5. Encargos

Reglas para todos los tramos de edición: trabajo en `main`, sin ramas, sin stash y sin commit hasta T7 o T13. Sin Prettier en `docs/` ni en `.claude/agents/`. Cada archivo tocado sube a la versión del informe §10.4, actualiza `Fecha` y añade su changelog en el lugar que ya usa. Se aplica **solo** el texto de §10.3 o §10.5; cualquier otra corrección se anota como deuda en el reporte. `[BLOQUEO]` a EM-ARCH si el texto congelado no encaja en el archivo o contradice `AGENTS.md`, un ADR aprobado o otro punto de §10.3.

- **T1.** Aplicar la columna «Protocolo v1.10» de D1 a D9. Cabecera: versión 1.10, `Fecha`, `Estado` completo de v1.7 a v1.10 (D8) y entrada `Cambio v1.9 → v1.10`, que cite el informe y nombre ADR-107 (aprobado) como origen de D7. La entrada declara que no se mueve autoridad hacia o desde el CTO (G0-6 = A). No se toca la RACI fuera de la regla de desempate 2 (D5).
- **T2.** Columna «Espejos» de D1, D7, D10 y D11 en EMA, SRF, FEP y OPS. En EMA, la `Versión del Perfil` de la Parte II pasa a 2.8 y la referencia al protocolo, a v1.10.
- **T3.** Columna «Espejos» de D2, D4, D6, D10 y D11 en PUX, DSO, QA y SEC. En QA y SEC, la `Versión del Perfil` de la Parte II se actualiza. QA conserva su autoridad de bloqueo en G6 por criterios, defectos críticos, a11y y desviación visual; solo sale la cobertura.
- **T4.** Columna «Espejos» de D3, D7 y D9 en los cuatro verificadores; D2 en `sr-qa.md:24`, D6 en `ds-owner.md:22` y una línea con el orden de D9 en `gate-verifier.md` y `boundary-reviewer.md`. Luego `pnpm sync:agents` y `pnpm sync:agents:check`. Los subagentes no llevan versión: el cambio queda en el changelog del perfil del verificador o en el reporte.
- **T5.** Informe vivo, nueva §15 «Actualización 2026-11-xx — Auditoría de cruces, Ola 2»: tabla `archivo · versión anterior → nueva · Dn aplicados`, decisiones G0-5 a G0-11 y salida de los gates. Informe de cruces: §9.3 con la misma tabla y `Estado` actualizado.
- **T7.** `iwana-checkpoint-commit` con esta lista explícita y nada más (30 rutas). `docs/roles/`: el protocolo, EMA, SRF, FEP, OPS, PUX, DSO, QA, SEC, GAT, BND, CON y TCR. `.claude/agents/`, `.opencode/agents/` (`.md`) y `.codex/agents/` (`.toml`): `sr-qa`, `ds-owner`, `gate-verifier` y `boundary-reviewer`. `docs/informes/`: `INFORME-ROLES-AUDITORIA-CRUCES-v1.0.md` e `INFORME-ROLES-ECOSISTEMA-MULTIAGENTE-v1.0.md`. Este plan y los lanzadores `PROMPT-ROLES-AUDITORIA-CRUCES-OLA2-LAUNCH-v1.0.md` y `PROMPT-ROLES-AUDITORIA-CRUCES-OLA2-CIERRE-LAUNCH-v1.0.md`. Fuera: el resto del árbol, en particular los demás `docs/informes/` modificados (otros trenes, entre ellos el §8.6 de la consolidación de skills). Sin push: el tren lo ordena el usuario (ADR-107)
- **T8 y T9.** Sustituir la Parte II o el «Prompt base (compacto)» de cada perfil por su bloque de §10.5, con techo de 15 líneas; los formatos de respuesta de la Parte II se conservan sin cambios en una sección «Formatos» (G0-10 = A). DAT gana su primer prompt compacto. Versión menor de cada perfil.
- **T10.** En los 8 subagentes ejecutores, reconciliar la sección de reglas con el prompt compacto de su perfil: quitar o corregir lo que lo contradiga; no reescribir lecturas ni procedimiento. Luego `pnpm sync:agents` y `pnpm sync:agents:check`.
- **T11.** Como T5, para la Ola 4 (informe vivo §16 y §9.4).

## 6. Gates

| Gate | Condición |
| --- | --- |
| G0 | **Cerrado** el 2026-11-09: aprobación en bloque (informe §10.6) |
| G1 (Ola 2) | Versiones de §10.4 en las cabeceras; `rg -n 'Baseline del sprint y' docs/roles` sin resultados fuera de changelogs; `rg -n 'Bloquear merge por cobertura' docs/roles` vacío; `rg -n -i 'autoriza.{0,3}merge|merge pendiente' docs/roles .claude/agents` vacío (el nombre «merge readiness» de ADR-069 se conserva); `rg -n 'Escalas? a.*CTO Humano' docs/roles` vacío; el protocolo contiene la nota de orden de D9 y la regla 2 de D5; `pnpm sync:agents:check` en verde; `pnpm audit:adr-citations` con `BLOQUEANTE: 0`. **✅ 2026-11-09** (verificación de EM-ARCH sobre el árbol: versiones de §10.4, cadenas de los 5 perfiles de D11 renumeradas, fila G6.5 y G6 del protocolo según D2, D4 y D7, diffs de `sr-qa.md` y `ds-owner.md`; `sync:agents:check` «OK: 14 agentes»; los dos scripts con `BLOQUEANTE: 0`) |
| G3 | T5: §15 del informe vivo y §9.3 del informe de cruces presentes; `pnpm audit:doc-locations` sin bloqueantes |
| G4 | T6: `docs-governance` sin bloqueantes sobre los 17 archivos de la Ola 2 |
| G1′ (Ola 4) | Cada prompt compacto ≤15 líneas y coincide con §10.5; los formatos de la Parte II siguen presentes; ninguna regla de un subagente ejecutor contradice el prompt de su perfil (lo comprueba T12); `pnpm sync:agents:check` en verde |
| G4′ | T12: `docs-governance` sin bloqueantes sobre los 17 archivos de la Ola 4 |
| G6.5 | Por tren (ADR-107): CI de `main` en verde sobre el SHA publicado. El registro viaja en el tren siguiente (D4) |

## 7. Línea base de pruebas

No aplica: las dos olas tocan solo `docs/` y `.claude/agents/`. Ninguna suite ni ningún spec cambian, así que el gate 14 (`PROT:237`) no tiene conteo que comparar. T7 y T13 lo declaran en el mensaje de commit.

## 8. Riesgos

| Riesgo | Mitigación |
| --- | --- |
| Cuatro sesiones paralelas interpretan distinto el mismo cambio | El texto está congelado en §10.3; apartarse exige `[BLOQUEO]` |
| T2 y T3 contradicen al protocolo que T1 aún está escribiendo | Los tres aplican el mismo §10.3; T6 compara el protocolo final con los espejos |
| La Ola 1b de ADR-107 edita `AGENTS.md` en paralelo | `AGENTS.md` queda fuera de alcance; si un tramo necesita tocarlo, `[BLOQUEO]` |
| Dos sesiones corren `pnpm sync:agents` a la vez | Solo T4 (Ola 2) y T10 (Ola 4), que nunca coinciden |
| La Ola 4 pierde un formato de respuesta al compactar | G1′ exige que la sección «Formatos» conserve los de la Parte II |
| Se publica mezclado con otros trabajos | T7 y T13 con `iwana-checkpoint-commit` y lista explícita de rutas |

## Lanzamiento

**Vigente:** [PROMPT-ROLES-AUDITORIA-CRUCES-OLA2-CIERRE-LAUNCH-v1.0](../prompts/PROMPT-ROLES-AUDITORIA-CRUCES-OLA2-CIERRE-LAUNCH-v1.0.md) — cierre de la Ola 2 (T5 → T6 → T7). La Ola 4 se lanza con su propio archivo **después de T7**: T8 a T10 editan los mismos perfiles y subagentes que T6 verifica y T7 commitea.

Lanzador anterior, ya ejecutado: [PROMPT-ROLES-AUDITORIA-CRUCES-OLA2-LAUNCH-v1.0](../prompts/PROMPT-ROLES-AUDITORIA-CRUCES-OLA2-LAUNCH-v1.0.md) (T1 ∥ T2 ∥ T3 ∥ T4, G1 ✅). Cada archivo es la fuente de su bloque y **prevalece si divergen**. El bloque de abajo es el de la Ola 2 (histórico).

```text
===== ROLES-CRUCES · Ola 2 · T1 · AI-EM-ARCH (sesión principal) =====
Antes de empezar: git status --short docs/roles .claude/agents vacío. Si no, para.
Lee AGENTS.md, el informe docs/informes/INFORME-ROLES-AUDITORIA-CRUCES-v1.0.md (§10) y el plan docs/plans/2026-11-09-roles-auditoria-cruces-olas-2-4-orquestacion.md (§5 reglas y T1, §6 G1).
Lee como documentación .agents/skills/docs-architect/SKILL.md.
Alcance: solo el protocolo, con la columna «Protocolo v1.10» de D1 a D9 del §10.3 y su cabecera v1.10.
===== ROLES-CRUCES · Ola 2 · T2 · AI-EM-ARCH (segunda sesión) =====
Mismas precondiciones y lecturas, con §5 T2. Alcance: EMA, SRF, FEP y OPS, columna «Espejos» de D1, D7, D10 y D11.
===== ROLES-CRUCES · Ola 2 · T3 · AI-EM-ARCH (tercera sesión) =====
Mismas precondiciones y lecturas, con §5 T3. Alcance: PUX, DSO, QA y SEC, columna «Espejos» de D2, D4, D6, D10 y D11.
===== ROLES-CRUCES · Ola 2 · T4 · AI-EM-ARCH (cuarta sesión) =====
Mismas precondiciones y lecturas, con §5 T4. Alcance: GAT, BND, CON, TCR y los subagentes sr-qa, ds-owner, gate-verifier y boundary-reviewer; cierra con pnpm sync:agents y pnpm sync:agents:check.
===== Común a los cuatro =====
Solo el texto congelado del §10.3; cada archivo sube a la versión del §10.4 con Fecha y changelog. Fuera de alcance: los archivos de los otros tramos, informes, AGENTS.md, .agents/skills/ y código. Sin Prettier, sin commit, en main.
Si el texto no encaja o contradice AGENTS.md o un ADR aprobado: [BLOQUEO] y para.
Reporta: archivo · versión · Dn aplicados · salida de pnpm audit:adr-citations (T4: también sync:agents:check) · deuda vista.
```

Bloque vigente (espejo del lanzador de cierre; el archivo prevalece):

```text
===== ROLES-CRUCES · Ola 2 · cierre T5 → T6 → T7 · AI-EM-ARCH (sesión principal) =====
Lee AGENTS.md, el plan docs/plans/2026-11-09-roles-auditoria-cruces-olas-2-4-orquestacion.md (§5 T5 y T7, §6 G1, G3 y G4) y el informe docs/informes/INFORME-ROLES-AUDITORIA-CRUCES-v1.0.md (§9 y §10).
Lee como documentación .agents/skills/docs-architect/SKILL.md; antes de T7, .agents/skills/iwana-checkpoint-commit/SKILL.md.
T1 a T4 están cerrados con G1 ✅: no reabras ni retoques sus 17 archivos. Si T6 encuentra un bloqueante en ellos, corrígelo solo si cabe en el texto de §10.3; si no, [BLOQUEO] y para.
T5: informe vivo, §15 «Actualización 2026-11-09 — Auditoría de cruces, Ola 2» (tabla archivo · versión anterior → nueva · Dn; G0-5 a G0-11; gates; los dos patrones de G1 corregidos en el plan v1.2). Informe de cruces: §9.3 con la misma tabla y el Estado al día. Cierra G3 con pnpm audit:doc-locations.
T6: invoca el subagente docs-governance sobre los 17 archivos de la Ola 2 y los dos informes; pásale la lista y la salida de los dos scripts de auditoría. Registra su veredicto en §9.3. Cierra G4.
T7: commit con exactamente las 30 rutas del plan §5 T7 (git add por ruta; nada del resto del árbol, que tiene trabajo ajeno). Mensaje docs(roles) en inglés, con «Línea base de pruebas: no aplica». Sin push, sin --no-verify, en main.
Reporta: secciones escritas, veredicto de docs-governance, SHA del commit, git status de las 30 rutas tras el commit y deuda nueva.
```
