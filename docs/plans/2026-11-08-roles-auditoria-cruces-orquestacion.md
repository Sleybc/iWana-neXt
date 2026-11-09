# Plan de orquestación — Auditoría de cruces de roles, olas 0 y 1

**Versión:** 1.2
**Estado:** Aprobado. G0 el 2026-11-08 (informe §8); no lanzar antes de que cierre P1
**Cambio v1.0 → v1.1 (2026-11-08):** G0 cerrado en bloque con las recomendaciones del informe §8: G0-1 = A, G0-2 aprobado, G0-3 = A, G0-4 aprobado. Los cambios condicionados a G0-1 y G0-3 en §5 pasan a obligatorios
**Cambio v1.1 → v1.2 (2026-11-09):** T4 halló que §5 T1 prescribía para DAT y OPS una cadena con «Baseline y Stack» ajena a `PROT:248`; se corrigen las filas de DAT y OPS y prevalece `PROT:248` (informe §9)
**Fecha:** 2026-11-09
**Emitido por:** AI-EM-ARCH
**Definición:** [INFORME-ROLES-AUDITORIA-CRUCES-v1.0](../informes/INFORME-ROLES-AUDITORIA-CRUCES-v1.0.md) v1.1 · **Lanzador:** [Ola 1 · tramo A](../prompts/PROMPT-ROLES-AUDITORIA-CRUCES-LAUNCH-v1.0.md)
**Alcance:** olas 0 y 1 del informe §8. Las olas 2 a 4 tocan protocolo, RACI y subagentes, y se planifican al cerrar esta (G0-4).

## 1. Precondiciones

| # | Precondición | Estado al 2026-11-08 |
| --- | --- | --- |
| P0 | G0: el CTO resuelve G0-1 a G0-4 (informe §8) | **Cerrada** el 2026-11-08: aprobación en bloque con las recomendaciones |
| P1 | Ola 0: la consolidación de skills publicó B4–B6 ([plan](2026-11-08-skills-consolidacion-orquestacion.md) §3), incluidos sus cambios en `docs/roles/` | **Abierta**: B4 en curso; 5 perfiles con cambios sin commit |
| P2 | Nadie más en vuelo sobre `docs/roles/` ni `docs/informes/INFORME-ROLES-*` | Se comprueba con `git status --short docs/roles docs/informes` al lanzar |
| P3 | Línea base de numeración: las líneas citadas en §5 son las de HEAD tras P1 | Si P1 cambia la numeración de un perfil, el tramo localiza el texto citado, no el número |

## 2. Superficie

| Zona | Archivos |
| --- | --- |
| T1 · gobierno e ingeniería | EMA, SRF, FEP, DAT, OPS y ANX (abreviaturas en el informe §1) |
| T2 · diseño, calidad y seguridad | PUX, DSO, QA, SEC |
| T3 · registro | `INFORME-ROLES-ECOSISTEMA-MULTIAGENTE-v1.0.md` §14 y `INFORME-ROLES-AUDITORIA-CRUCES-v1.0.md` (estado y §9 de remediación) |
| Fuera de alcance | `Protocolo_Colaboracion_Multiagente_v1.md`, los 6 verificadores, `AGENTS.md`, `.claude/agents/`, generados (`.opencode/agents/`, `.codex/agents/`, `.claude/skills/`) y cualquier código |

## 3. Bloques y ruta crítica

| Bloque | Agente | Depende de | Rutas |
| --- | --- | --- | --- |
| T1 · perfiles de gobierno e ingeniería | AI-EM-ARCH (sesión principal) | P0–P2 | EMA, SRF, FEP, DAT, OPS, ANX |
| T2 · perfiles de diseño, calidad y seguridad | AI-EM-ARCH (sesión principal, segunda sesión) | P0–P2 | PUX, DSO, QA, SEC |
| T3 · registro | AI-EM-ARCH (sesión principal) | T1, T2 | Informe vivo §14 y el informe de cruces |
| T4 · verificación | `docs-governance` | T3 | Solo lectura (§6, G4) |
| T5 · publicación | AI-EM-ARCH (sesión principal) | T4 | Commit con lista explícita de rutas; push solo a pedido del usuario; G6.5 |

**Olas internas:** A = T1 ∥ T2 (no comparten archivos); B = T3; C = T4; D = T5. **Ruta crítica:** G0 → P1 → (T1 ∥ T2) → T3 → T4 → T5 → G6.5.

Los bloques de gobierno van a la sesión principal, como en la consolidación de skills ([plan](2026-11-08-skills-consolidacion-orquestacion.md) §3): ningún subagente de `.claude/agents/` es dueño de `docs/roles/`, y el R de la fila «Documentación y trazabilidad» es de quien produce el artefacto (`PROT:118`).

## 4. Matriz agente × skill

| Bloque | Obligatorias | De apoyo (condición) | Descartadas (motivo) | Gate ejecutable |
| --- | --- | --- | --- | --- |
| T1 | `docs-architect` | `architecture-decision-records` (solo si una cita de ADR necesita marcador de estado) | `architect-review`: no cambia arquitectura · `skill-creator`: no toca el catálogo · `brainstorming`: la definición se aprueba en G0 | `pnpm audit:adr-citations` |
| T2 | `docs-architect` | `iwana-test-evidence` (solo para redactar en QA la remisión al gate 14) | `security-auditor`: no se audita seguridad · `wcag-audit-patterns`: no cambia ningún criterio de a11y · `e2e-testing-patterns`: no se toca ningún test | `pnpm audit:adr-citations` |
| T3 | `docs-architect` | — | `architecture-decision-records`: no se emite ningún ADR | `pnpm audit:doc-locations` |
| T4 `docs-governance` | — (verificador auxiliar, sin skills) | — | `gate-verifier`: no hay código ni suites | Los dos scripts de auditoría |
| T5 | `iwana-checkpoint-commit` | `verification-before-completion` (antes de declarar G6.5) | — | `gh run list --commit <sha>` |

Skills y subagente verificados en disco el 2026-11-08. Los `SKILL.md` se **leen** como documentación antes de editar; no se invocan como tool.

## 5. Encargos

Reglas para T1 y T2: trabajo en `main`, sin ramas, sin stash y sin commit hasta T5. Sin Prettier en `docs/`. **Cada archivo tocado sube su versión**, actualiza `Fecha` y añade su línea de changelog (`PROT:361`); el changelog va en el lugar que el perfil ya usa (Parte III, cabecera `Cambio vX → vY` o campo `Estado`). Si G0-1 = A, el changelog incluye la regularización de la edición de B4 que tenga ese archivo. Se cambia solo lo listado; cualquier otra corrección se anota como deuda en el reporte. `[BLOQUEO]` a EM-ARCH si un cambio exige tocar el protocolo, la RACI o un gate.

### T1 — Gobierno e ingeniería

| Archivo | Versión | Cambios (informe §4–§7) |
| --- | --- | --- |
| EMA | 2.6 → 2.7 | V1: `EMA:10`, `EMA:136` y `EMA:269` → protocolo v1.9. C9: `EMA:169` y `EMA:309` → `[ESCALACION AL CTO]`. `Versión del Perfil` de la Parte II (`EMA:229`) → 2.7. Nuevo ítem 12 de la Parte III con estos cambios y la regularización de `EMA:286-287` (V3). El historial de la Parte III no se reescribe |
| SRF | 2.1 → 2.2 | C9: `SRF:143`, `SRF:199` y `SRF:214` → `[BLOQUEO]` (formato de `PROT:311-313`; el matiz «técnico» va en el cuerpo). V6: `SRF:158` → «del informe de fase y del informe de cierre de módulo (protocolo §8)». `Versión del Perfil` (`SRF:167`) → 2.2. Ítem 4 de la Parte III |
| FEP | 1.1 → 1.2 | V3: solo la regularización de `FEP:63`, en una línea `Cambio v1.1 → v1.2` de la cabecera |
| DAT | 3.0 → 3.1 | C11: §5 (`DAT:58-66`) → «Sigue la cadena canónica del protocolo §5.4» con: AGENTS + skills · CTO y ADR aprobados · PRD y HLD · fuentes de diseño (solo conflictos visuales) · protocolo · este perfil · prompt de ejecución. El checklist de SEC-ENG y la baseline de versiones pasan a una línea «Entradas de trabajo (no precedencia)» |
| OPS | 1.0 → 1.1 | V7: `OPS:68` `deploy-checklist` → `docker-expert`. C11: `OPS:72` (checklist de SEC-ENG) y la baseline de versiones salen de la cadena y pasan a «Entradas de trabajo (no precedencia)»; la cadena gana la casilla de fuentes de diseño (solo conflictos visuales), como DAT. V3: regularización de la misma línea 68 |
| ANX | 1.0 → 1.1 | V8: `ANX:24` → «(regla del perfil AI-EM-ARCH §3.2)», sin la mención al protocolo §4. Si G0-3 = A: `ANX:52` + «(requiere verificación con fuente oficial)» |

### T2 — Diseño, calidad y seguridad

| Archivo | Versión | Cambios |
| --- | --- | --- |
| PUX | 1.1 → 1.2 | C7: la cabecera «Fuente de verdad de UI» (`PUX:13`) pasa a una línea que remite a §6 nivel 4 (tres dominios de ADR-056 §3, aprobado). Prompt compacto (`PUX:104-105`): «fuentes de diseño = los tres dominios de ADR-056 §3». V4: `Fecha` real. Línea de bloqueos al final de §4: «`[BLOQUEO]` a AI-EM-ARCH antes de cerrar la sesión (protocolo §6.3)». V3: regularización de `PUX:64` |
| DSO | 1.2 → 1.3 | C7: `DSO:13` igual que en PUX. V5: `DSO:7` con la fecha real. C6 (solo el perfil): `DSO:56` → «se versiona y se notifica vía AI-EM-ARCH con adenda al prompt de fase (protocolo §3bis regla 1)»; prompt compacto (`DSO:113-114`) con «vía AI-EM-ARCH». Línea de bloqueos igual que en PUX |
| QA | 1.1 → 1.2 | C11: §3 (`QA:46-57`) → cadena de `PROT:248` con la casilla de fuentes de diseño; el checklist de SEC-ENG pasa a entradas de trabajo. C10: nueva §5.8 «Verificadores que invoca»: corrida E2E roja → `e2e-triage` antes de tocar tests (`E2E:18`); spec ajustado → `test-change-reviewer` antes de `gate-verifier` (`TCR:51`); conteos, carraca y cobertura → `gate-verifier` (`GAT:25-28`, gate 14 de `PROT:237`). `QA:311` + «tras el triaje de AI-E2E-TRIAGE». V6: `QA:299-302`, columna SLA → «Fase en curso — bloquea merge» / «Fase en curso o siguiente» / backlog; `QA:328` → «En la sesión de cierre de la fase» (MVP y Fase 2+). V9: `QA:22` y `QA:466` → AI-SR-FULL y AI-FE-PLATFORM. `Versión del Perfil` (`QA:342`) → 1.2. V3: regularización de `QA:14`. **No** se toca la autoridad de bloqueo por cobertura (`QA:42`, `QA:167`): es C2, Ola 2 |
| SEC | 1.1 → 1.2 | C11: §3 (`SEC:44-55`) → cadena de `PROT:248`. V6: `SEC:242` «siguiente sprint» → «siguiente fase»; `SEC:266-268` «Sprint actual» / «Próximo sprint» → «Fase en curso» / «Fase siguiente»; `SEC:289` → «≤ 1 sesión» (MVP y Fase 2+). Si G0-3 = A: `SEC:133` y `SEC:368` + «(requiere verificación con fuente oficial)»; `SEC:64` + «(pendiente de verificar contra `Stack_Tecnologico.md`)». `Versión del Perfil` (`SEC:316`) → 1.2. **No** se toca la escalación (`SEC:38`) ni el veto en G6: es C4, Ola 2 |

### T3 — Registro

- Informe vivo, nueva §14 «Actualización 2026-11-xx — Auditoría de cruces, Ola 1»: origen (este informe), tabla `perfil · versión anterior → nueva · hallazgos cerrados`, decisiones G0 y lo que queda para las olas 2 a 4.
- Informe de cruces: `Estado` → «Ola 1 aplicada» y nueva §9 «Remediación» con la misma tabla y el resultado de T4.

## 6. Gates

| Gate | Condición |
| --- | --- |
| G0 | **Cerrado** el 2026-11-08: aprobación en bloque (informe §8) |
| G1 | T1 y T2: cada archivo tocado tiene versión, `Fecha` y changelog nuevos; `rg -n 'v1\.5 vigente\|\(v1\.5\)' docs/roles` sin resultados fuera de changelogs históricos; `rg -n 'BLOQUEO TÉCNICO\|ESCALACIÓN AL CTO' docs/roles` sin resultados fuera de `PROT:323-325` y de las líneas de changelog; `rg -n deploy-checklist docs/roles` vacío; las cadenas de precedencia de DAT, OPS, QA y SEC coinciden con `PROT:248`; `pnpm audit:adr-citations` con `BLOQUEANTE: 0` |
| G3 | T3: §14 del informe vivo y §9 del informe de cruces presentes; `pnpm audit:doc-locations` sin bloqueantes |
| G4 | T4: `docs-governance` sin bloqueantes sobre los 12 archivos tocados |
| G6.5 | CI de `main` en verde sobre el SHA publicado (`gh run list --commit`) |

## 7. Línea base de pruebas

No aplica: la ola solo toca `docs/`. No cambia ninguna suite ni ningún spec, así que el gate 14 (`PROT:237`) no tiene conteo que comparar. T5 lo declara en el mensaje de commit.

## 8. Riesgos

| Riesgo | Mitigación |
| --- | --- |
| Pisar los cambios de B4 de la consolidación de skills | P1: no se lanza hasta que B6 esté publicado |
| T1 y T2 escriben a la vez en el informe vivo | Ninguno de los dos lo toca; el registro es solo de T3 |
| Un tramo corrige de paso algo de las olas 2–4 | El encargo lo prohíbe expresamente; se reporta como deuda |
| La numeración cambia tras P1 | P3: se localiza el texto citado, no el número |
| Se publica mezclado con otros trabajos en vuelo | T5 con `iwana-checkpoint-commit` y lista explícita de rutas |

## Lanzamiento

El archivo [PROMPT-ROLES-AUDITORIA-CRUCES-LAUNCH-v1.0](../prompts/PROMPT-ROLES-AUDITORIA-CRUCES-LAUNCH-v1.0.md) es la fuente y **prevalece si divergen**. Lanza la Ola A (T1 ∥ T2). T3, T4 y T5 se lanzan con su propio archivo cuando cierre G1.

```text
===== ROLES-CRUCES · Ola A · T1 · AI-EM-ARCH (sesión principal) =====
Antes de empezar: G0 ✅ en el informe §8 y P1 cerrada (consolidación de skills publicada); git status --short docs/roles vacío. Si no, para.
Lee AGENTS.md, el informe docs/informes/INFORME-ROLES-AUDITORIA-CRUCES-v1.0.md (§4–§8) y el plan docs/plans/2026-11-08-roles-auditoria-cruces-orquestacion.md (§5 reglas y T1, §6 G1).
Lee como documentación .agents/skills/docs-architect/SKILL.md.
Alcance: solo EMA, SRF, FEP, DAT, OPS y ANX, con los cambios de la tabla T1; cada archivo sube versión, Fecha y changelog.
Fuera de alcance: protocolo, verificadores, PUX/DSO/QA/SEC (T2), informes, AGENTS.md, .claude/agents/ y código. Sin Prettier, sin commit, en main.
Si un cambio exige tocar protocolo, RACI o gates: [BLOQUEO] y para.
Cierras con la parte de G1 de tus archivos. Reporta: archivo · versión · cambios · salida de pnpm audit:adr-citations · deuda vista.
===== ROLES-CRUCES · Ola A · T2 · AI-EM-ARCH (segunda sesión) =====
Mismas precondiciones y lecturas que T1, con §5 T2.
Lee como documentación .agents/skills/docs-architect/SKILL.md; .agents/skills/iwana-test-evidence/SKILL.md solo para la §5.8 de QA.
Alcance: solo PUX, DSO, QA y SEC, con los cambios de la tabla T2; cada archivo sube versión, Fecha y changelog.
No toques la autoridad de bloqueo por cobertura de QA (C2) ni la escalación o el veto de SEC (C4): son de la Ola 2.
Fuera de alcance, cierre y reporte: iguales que T1, sobre tus cuatro archivos.
```
