---
description: "Despachar agentes ejecutores desde el modo Orquestador AI-EM-ARCH: leer protocolo y plan, verificar gates y DoR, delegar por olas con skills, consolidar."
name: "Despacho multiagente (AI-EM-ARCH)"
argument-hint: "Ruta del plan de orquestacion a ejecutar"
agent: "ask"
---

Despacha los agentes ejecutores de un plan de orquestacion ya aprobado.

**Complementa, no sustituye,** a [`PROMPT-OPERATIVO-ACTIVAR-AI-EM-ARCH-v1.0.md`](PROMPT-OPERATIVO-ACTIVAR-AI-EM-ARCH-v1.0.md): aquel activa la identidad y los limites del modo Orquestador; este define **el procedimiento de despacho**. Si el modo no esta activo, activalo primero.

## Fuente de verdad (leer antes de despachar, en este orden)

1. `AGENTS.md` — gobernanza maestra y **Skills Dispatch**.
2. [`docs/roles/Protocolo_Colaboracion_Multiagente_v1.md`](../roles/Protocolo_Colaboracion_Multiagente_v1.md) — **v1.5 vigente**. Secciones que gobiernan el despacho: §2 RACI, §3 workflow de 7 etapas y 8 gates, **§3.1 definition of ready**, §3bis ejecucion paralela y contratos congelados, §6 red de consulta, §6.3 vocabulario de marcadores.
3. El **plan de orquestacion** del trabajo (`docs/plans/`) y la **spec** que ejecuta.
4. Los **prompts de ejecucion por fase** (`docs/prompts/`), que son el encargo real de cada agente.
5. El **prompt corto de lanzamiento** de la ola (`PROMPT-{MODULO}-{FASE}-LAUNCH-v{VERSION}.md`) y la **matriz de dispatch** del plan: traen ya resueltos el agente y las skills de cada bloque. *(Añadido el 2026-09-14 con el perfil v2.5 §3.6.)* Si el plan no los trae, el despacho no arranca: se emiten primero con [`PROMPT-OPERATIVO-ANALISIS-DISPATCH-v1.0.md`](PROMPT-OPERATIVO-ANALISIS-DISPATCH-v1.0.md). Derivarlos aqui sobre la marcha es rehacer con menos contexto un trabajo que pertenece al cierre de la definicion.
6. [`.agents/skills/INDEX.md`](../../.agents/skills/INDEX.md) — catalogo activo; verificar contra disco antes de citar una skill.

## Procedimiento

### Paso 1 — Verificar el estado de los gates antes de mover a nadie

No se despacha implementacion con gates de etapas anteriores sin cerrar. Recorre el workflow §3 y declara, por escrito, el estado de cada gate relevante:

| Gate | Pregunta | Si no esta cerrado |
| --- | --- | --- |
| **G1** | ¿PRD/HLD/spec aprobados? | Aprobacion del CTO, o review cruzado SR-FULL + PROD-UX |
| **G2** | ¿Existen UX spec y contrato de componente en `docs/specs/`? | Despachar **etapa 2** (PROD-UX + DS-OWNER) antes que implementacion |
| **G3** | ¿Hay dictamen de factibilidad resuelto? | Despachar **etapa 3** (SR-FULL + FE-PLATFORM, y DATA-ENG/SEC-ENG/PLAT-OPS si aplica) |
| **G4** | ¿Prompt de ejecucion emitido con contratos congelados citados por ruta y version? | Emitirlo; sin prompt no hay implementacion |

**Saltar G2 o G3 y despachar directo a implementacion es el error que §3.1 obliga a devolver.** El agente receptor verifica su propio DoR y emitira `[BLOQUEO]` antes de empezar — una sesion perdida por una omision del orquestador.

### Paso 2 — Ordenar por olas, no por fases

Una **ola** es el conjunto de encargos que pueden correr simultaneamente porque ninguno depende de la salida de otro. La regla de agrupacion viene de §3bis: **los contratos se congelan primero; despues todo lo que dependa de ellos corre en paralelo**.

Ola tipica de un trabajo con superficie de UI:

1. **Ola de congelacion** — contrato de API (SR-FULL), contrato de componente (DS-OWNER), UX spec (PROD-UX), dictamenes de factibilidad (SR-FULL + FE-PLATFORM). Todos producen artefactos, ninguno depende de otro.
2. **Ola de implementacion** — backend y frontend contra los contratos congelados.
3. **Ola de integracion** — sustitucion de mocks por el API real.
4. **Ola de verificacion** — SR-QA, y SEC-ENG si la fase toco seguridad, PII o integraciones.

Entre olas, el orquestador **aprueba el gate correspondiente**; no es un tramite: es donde se detecta que un artefacto no sirve antes de que otros construyan sobre el.

### Paso 3 — Componer el encargo de cada agente

Cada despacho lleva **exactamente** estos siete elementos. Un encargo al que le falte uno produce trabajo fuera de alcance:

1. **Rol:** el subagente de `.claude/agents/` que corresponde al perfil (`sr-backend`, `fe-platform`, `ds-owner`, `prod-ux`, `sr-qa`, `sec-eng`, `data-eng`, `plat-ops`). **AI-EM-ARCH no es subagente** (protocolo §33): es el agente padre que despacha.
2. **Encargo:** el prompt de ejecucion por ruta, y **que fase de ese prompt le toca** cuando el documento cubre varias o sirve a varios agentes.
3. **Skills:** las **obligatorias** de su bloque segun la matriz de dispatch del plan, con la instruccion de **leerlas antes de escribir codigo**; las **de apoyo** con su condicion de activacion; y las **descartadas con su motivo**, que es lo que impide que el agente las abra por su cuenta y amplie alcance. `AGENTS.md`: Claude Code aplica el dispatch leyendo el `SKILL.md`, no invocandolo como tool.
4. **Contratos congelados** que consume o produce, citados por ruta y version (§3bis regla 1).
5. **DoR:** que debe verificar antes de empezar, y que hacer si falta (emitir `[BLOQUEO]`, no arrancar igual).
6. **Stop/go:** las condiciones bajo las que su fase no cierra.
7. **Marcadores:** `[BLOQUEO]`, `[CONSULTA]`, `[DESEMPATE]` segun §6.3 — exactos, sin variantes, porque se recuperan con `grep`.

### Paso 4 — Consolidar

Al volver cada agente:

1. **Verificar el handoff contra su condicion de aceptacion**, no contra su autodeclaracion. Un "listo" sin el artefacto localizable no es un handoff (§3 regla de handoff explicito).
2. **Exigir conteo real de pruebas.** Un `pnpm test` verde no prueba que los tests corrieron: Turborepo cachea. El reporte adjunta `Cached: 0` o la corrida con `--force` (§4, nota de cache). Sin eso, la cobertura se reporta **no verificada**.
3. **Atender los marcadores emitidos** con el SLA de §6.3: `[BLOQUEO]` con prioridad sobre el trabajo en curso; un marcador no atendido **no caduca, escala** a `[ESCALACION AL CTO]`.
4. **Resolver desempates** dejando un solo artefacto vigente: el invalidado se marca superado **en el mismo acto** (§6.3).
5. **Registrar** en el informe de fase: entregables, evidencia de gates, deuda por severidad, latencia de gates y cola de desempates — es la fuente de dato de los KPIs (§8).

## Limites del despacho

- **No despaches trabajo que no tenga prompt de ejecucion.** Sin G4 no hay implementacion (§3 etapa 4).
- **No intervengas dentro de un track que respeta su contrato** y no toca alcance, boundary, tokens de marca ni dependencias nuevas (§3bis regla 2). Hacerlo reintroduce el cuello de botella que ADR-049 elimino.
- **No apruebes tu propio artefacto en un gate** (§3): el aprobador es siempre distinto del productor.
- **El carril rapido de UI es de AI-DS-OWNER** por delegacion; no lo reclames (§3bis regla 3).
- **No delegues tu accountability.** Consultar a otro perfil no la transfiere (§6, principio de accountability).

## Anti-patrones de despacho

- Mandar "lee el plan y ejecuta" sin acotar la fase: el agente ve el programa entero y elige alcance por su cuenta.
- Despachar implementacion con G2 o G3 abiertos.
- Dos agentes con el mismo archivo en su alcance: si ocurre, el reparto esta mal; se corrige antes de despachar, no por merge.
- Citar una skill sin verificar que existe en disco; el `INDEX.md` puede ir por delante del filesystem.
- Aceptar un verde de CI o de tests sin SHA, plataforma y conteo real.
