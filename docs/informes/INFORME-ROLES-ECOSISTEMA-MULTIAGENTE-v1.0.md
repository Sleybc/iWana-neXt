# INFORME — Auditoría y optimización del ecosistema multiagente (perfiles IA)

**Versión:** 1.6
**Estado:** Vigente
**Fecha:** 2026-07-10 (v1.1: 2026-07-18; v1.2 — auditoría integral y correcciones aplicadas: 2026-07-18; **v1.3 — auditoría del perfil AI-EM-ARCH y emisión de v2.2: 2026-08-02**, ver §6; **v1.4 — auditoría del protocolo y emisión de v1.4: 2026-08-02**, ver §7; **v1.5 — decisiones del CTO que cierran ambos pendientes: 2026-08-02**, ver §8; **v1.6 — diferimiento del dominio productivo vía ADR-070 (superado): 2026-08-02**, ver §9)
**Sin pendientes de gobernanza abiertos.** El dominio productivo, último asunto que quedaba, se cerró por diferimiento formal con disparador de reactivación ([ADR-070](../adrs/ADR-070-Diferimiento-Dominio-Productivo.md) (superado)) — ver §9.
**Alcance:** Auditoría de `Perfil_IA_EM_Architect_Unificado_v1`, `Perfil_IA_Sr_Dev_Fullstack_v1` y `Perfil_IA_Senior_UI_Systems_Designer_v1`; emisión de versiones v2 y del protocolo de colaboración compartido.
**Documentos emitidos:**

- [docs/roles/Perfil_IA_EM_Architect_Unificado_v2.md](../roles/Perfil_IA_EM_Architect_Unificado_v2.md)
- [docs/roles/Perfil_IA_Sr_Dev_Fullstack_v2.md](../roles/Perfil_IA_Sr_Dev_Fullstack_v2.md)
- `docs/roles/_historico/Perfil_IA_Senior_UI_Systems_Designer_v2.md` — archivado en el historial de git (commit `6770730c^`); la carpeta no se restaura, ver §5.3
- [docs/roles/Protocolo_Colaboracion_Multiagente_v1.md](../roles/Protocolo_Colaboracion_Multiagente_v1.md)

~~Todos en estado Propuesto — pendiente aprobación CTO.~~ **Aprobados por [ADR-049](../adrs/ADR-049-Split-Design-Layer-Frontend-Platform.md) (CTO, 2026-07-10)** — esta línea quedó desactualizada en v1.0/v1.1 y contradecía el estado declarado en el protocolo y los perfiles; corregida en v1.2 (ver §5.2.3). Los v1 permanecen como referencia histórica en el historial de git (ver §5.3).

---

## 1. Auditoría de los perfiles v1

### 1.1 Fortalezas confirmadas

Los tres perfiles v1 son documentos maduros: modos de operación explícitos (EM), matrices de decisión, precedencia documental, SLAs de escalación, zero-trust de PII y regla de no fijar versiones. La auditoría no partió de cero; partió de una base sólida con vacíos sistémicos.

### 1.2 Debilidades críticas

1. **Contradicción normativa entre perfiles:** el Fullstack v1 exigía WCAG **2.1** AA (§5.2) mientras el Designer v1 exigía WCAG **2.2** AA — dos agentes aplicando estándares distintos sobre la misma pantalla. Resuelto: 2.2 AA único, declarado en el protocolo (fuente única).
2. **Ownership de producto vacante:** el EM v1 "coordina con Product Manager", pero no existe perfil PM. Visión funcional, reglas de negocio y roadmap quedaban sin dueño formal → riesgo de que se definieran implícitamente en código. Resuelto: EM v2 asume Product Architecture con el CTO como Accountable.
3. **UX sin dueño explícito:** el Designer v1 era UI-céntrico ("dirección visual"); user journeys, user flows y eficiencia de tarea no estaban asignados a nadie. Resuelto: Designer v2 los asume como responsabilidad primaria.
4. **Sin RACI ni protocolo de colaboración:** los handoffs (quién entrega qué, en qué formato, quién aprueba) existían solo de forma fragmentaria dentro de cada perfil, sin gates nombrados ni regla de desempate para conflictos Dev↔Designer. Resuelto: protocolo compartido con RACI de 13 áreas, workflow de 7 etapas y resolución de conflictos.
5. **Dos sistemas de gobernanza desconectados:** los perfiles (docs/roles) ignoraban por completo `AGENTS.md` y el catálogo `.agents/skills/` — un agente activado con el perfil podía operar en el workspace sin las reglas maestras del repo. Resuelto: `AGENTS.md` encabeza la precedencia de los tres v2 y las skills se integran como el "cómo" operativo.
6. **Contenido normativo duplicado:** stack, reglas absolutas y regulatorio repetidos en cada perfil → deriva garantizada al actualizar uno. Resuelto: los v2 referencian fuentes únicas (protocolo, Stack_Tecnologico, manual de identidad).
7. **Datos volátiles en documentos de gobernanza:** tabla de IDE/modelos en Fullstack v1 ("GPT 5.3 Codex", "Claude Sonnet 4.6") — obsolescencia integrada. Retirada en v2; se decide por sesión operativa.
8. **Riesgo de alucinación de stack:** afirmaciones puntuales de los perfiles pueden divergir del repo real (p. ej. el uso declarado de Zod frente a la validación global con class-validator + Joi documentada en la gobernanza del workspace). Mitigado con la regla 6.1 del protocolo: los perfiles no afirman hechos de stack; remiten a fuentes.

### 1.3 Riesgos del pedido original gestionados

- **CQRS / Event-Driven como responsabilidad del EM:** el baseline aprobado del repo es Modulith + interfaces tipadas + eventos BullMQ. Introducir CQRS como mandato contradiría ADRs vigentes; conforme a la regla de no sintetizar conflictos, los v2 lo acotan a "patrones que pueden proponerse solo vía ADR".
- **Estructura de 3 agentes:** el ecosistema real tiene 6 perfiles activos (existen QA, Security y Data Engineer). El protocolo los incorpora a la RACI para no crear una gobernanza paralela de 3 que ignore a los otros 3.

## 2. Evaluación de madurez (antes → después)

| Dimensión | v1 | v2 | Justificación del delta |
| --- | --- | --- | --- |
| Gobernanza | 6 | 9 | Precedencia unificada bajo AGENTS.md, gates con aprobador ≠ productor, RACI formal |
| Escalabilidad | 5 | 8 | Escala objetivo declarada como criterio de decisión del EM; protocolo soporta añadir agentes sin reescribir perfiles |
| Calidad técnica | 7 | 9 | Checklists internos verificables, dictamen de factibilidad, testing strategy como entregable |
| Calidad UX | 5 | 9 | UX con dueño (journeys/flows/eficiencia), wireframes y UX specs obligatorios, WCAG unificado 2.2 AA |
| Coordinación | 4 | 9 | Workflow de 7 etapas con artefactos y gates nombrados; regla de desempate; SLAs de bloqueo |
| Precisión (anti-alucinación) | 5 | 8 | Reglas de fuente citable, no afirmar stack/regulación, patrones no aprobados fuera del baseline |
| Productividad | 6 | 8 | Handoffs con formato fijo, iteración corta 2↔3 sin burocracia, menos duplicación documental |

## 3. Pendientes y recomendaciones futuras

1. ~~**Aprobación formal:** ADR corto (o actualización de ADR-021 (superado)) que declare los v2 + protocolo como fuente primaria y los v1 como superseded.~~ **Resuelto:** [ADR-049](../adrs/ADR-049-Split-Design-Layer-Frontend-Platform.md) (Aprobado 2026-07-10) ya declara vigentes los v2 y el protocolo. **ADR-021 no debe actualizarse** — quedó **Superado** por ADR-049 el 2026-07-19 vía [ADR-056](../adrs/ADR-056-Integridad-Base-Normativa-Diseno.md); apoyar una acción en él sería invocar un ADR sin autoridad.
2. **Actualizar los perfiles no rediseñados:** QA v1, Security v1 y Data Engineer (este último es genérico y con stack drift declarado) deben alinearse al protocolo — al menos añadir la referencia y el estándar WCAG 2.2 AA donde aplique.
3. **Verificar afirmaciones de stack heredadas:** confirmar contra el código el rol real de Zod en boundaries externos y corregir el perfil que corresponda.
4. **Métricas del sistema, no solo del rol:** instrumentar los KPIs cruzados (fidelidad a especificación visual, conflictos resueltos sin CTO) en los informes de sprint para que la RACI sea auditable.
5. **Evolución a 5 años:** cuando el equipo crezca (más agentes ejecutores en paralelo), el protocolo admite sharding por módulo (un EM-ARCH por dominio) sin cambiar la estructura de capas; ese cambio requerirá ADR.
6. **Sincronizar vocabulario:** los perfiles v2 usan los identificadores AI-* existentes; si se adoptan los títulos nuevos (Principal Fullstack Engineer, etc.) en otras superficies (AGENTS.md, prompts de ejecución), actualizar en la misma iteración para evitar dos nomenclaturas.

## 4. Actualización 2026-07-18 — Gobernanza vs modo de sesión (multi-IDE)

### 4.1 Problema

La cabecera de `AGENTS.md` declaraba `Identidad: EM + Architect unificado`. Eso hacía que cualquier sesión en Cursor, Copilot, Claude Code, Codex u OpenCode heredara implícitamente el perfil AI-EM-ARCH, incluido el límite duro de “no código productivo”, mientras el Agent por defecto de esos clientes **sí implementa**. Resultado: solapamiento entre *autoridad de gobernanza* y *modo de sesión*, y riesgo de arreglarlo solo en `.cursor/rules/` (superficie que no leen los demás IDEs).

### 4.2 Solución aplicada

Separación explícita, agnóstica al proveedor:

| Concepto | Comportamiento |
| --- | --- |
| Gobernanza AI-EM-ARCH | Siempre vigente vía `AGENTS.md` (boundaries, gates, protocolo) |
| Modo de sesión por defecto | **Ejecutor** — puede implementar código respetando gates |
| Modo Orquestador | Solo con activación explícita |

### 4.3 Superficies tocadas

- [`AGENTS.md`](../../AGENTS.md) — cabecera + párrafo gobernanza vs modo de sesión; prompt listado en Prompts Operativos.
- [`docs/prompts/PROMPT-OPERATIVO-ACTIVAR-AI-EM-ARCH-v1.0.md`](../prompts/PROMPT-OPERATIVO-ACTIVAR-AI-EM-ARCH-v1.0.md) — activación multi-IDE (fuente operativa compartida; remite a Parte II del perfil + protocolo).
- [`.cursor/rules/ai-em-arch.mdc`](../../.cursor/rules/ai-em-arch.mdc) — adaptador Cursor (`alwaysApply: false`); no es fuente de verdad.
- [`.github/copilot-instructions.md`](../../.github/copilot-instructions.md) — nota de paridad para Copilot/OpenCode/Codex/Claude.

No se reescribió el perfil AI-EM-ARCH v2 ni el protocolo RACI; no se requiere ADR (cambio operativo de sesión, no de autoridad). `CLAUDE.md` y `.opencode/opencode.json` no duplican el prompt: ya apuntan a `AGENTS.md` / bootstrap. *(Nota v1.2: la doctrina quedó además incorporada al protocolo §1 en su v1.3.)*

## 5. Actualización 2026-07-18 — Auditoría integral del protocolo y los 8 perfiles (correcciones aplicadas)

Auditoría a profundidad de los 9 documentos del ecosistema (protocolo + 8 perfiles), verificando cada afirmación contra el repo real. Aprobada y ejecutada con el CTO en sesión del 2026-07-18. Resultado: protocolo **v1.3**, EM-ARCH **v2.1**, SR-FULL **v2.1** (backend puro), FE-PLATFORM **v1.1**, QA **v1.1**, SEC-ENG **v1.1**, DS-OWNER **v1.2**, y dos documentos nuevos.

### 5.1 Hallazgos bloqueantes corregidos

1. **SR-FULL v2.0 seguía siendo fullstack en su contenido operativo** pese al banner de extracción: título, objetivo, §2.2 Frontend completa y — lo crítico — el prompt base de la Parte II instruían implementar UI, en colisión con FE-PLATFORM. Corregido en v2.1: rol renombrado a Principal Backend Engineer (alineado a la tabla del protocolo), contenido frontend retirado, y §2.2 sustituida por el **contrato de API tipado** como interfaz formal con FE-PLATFORM.
2. **QA v1.0 contradecía el modelo paralelo del protocolo §3bis** (esperaba "código completado del Fullstack") y su estructura de tests §7.3 no era la del repo (la real: specs co-locados en `src/**`, E2E en `e2e/tests/**`). Corregido en v1.1: entrada paralela contra contratos/mocks, estructura real, relaciones con FE-PLATFORM/PROD-UX/DS-OWNER, umbrales de performance remitidos al RNF del PRD (no inventados).
3. **Roles fantasma como destino de escalación** ("Staff Engineer" en SR-FULL/QA/SEC; "Architect de Datos" en SR-FULL/SEC): purgados y redirigidos a EM-ARCH / AI-DATA-ENG / AI-PLAT-OPS. El protocolo §1 ahora declara que un rol inexistente en la estructura no es destino de escalación.
4. **Artefactos contradictorios sobre el estado de aprobación**: la línea "Propuesto — pendiente CTO" de este informe contradecía el estado "Vigente (ADR-049)" del protocolo y los perfiles. Verificado contra ADR-049 (aprobado por el CTO el 2026-07-10): el desactualizado era este informe; corregido.
5. **`docs/roles/_historico/` (ordenado por ADR-049) fue borrado** en el commit `6770730c` ("cierre compras Fase 06…"), un commit de features sin relación con roles, llevándose 7 documentos — incluido el anexo regulatorio v1 §13–§14 que EM-ARCH v2 declara vigente. Ver §5.3.

### 5.2 Hallazgos importantes corregidos

1. **G1 permitía auto-aprobación** (EM-ARCH aprobaba su propio PRD/HLD cuando el CTO no intervenía), contra la regla "el aprobador nunca es el productor". v1.3: review cruzado obligatorio (SR-FULL factibilidad + PROD-UX viabilidad) cuando no interviene el CTO.
2. **La cadena de precedencia del protocolo §5.4 estaba invertida en SR-FULL y FE-PLATFORM** (ponían el prompt de ejecución por encima del protocolo). Corregida en ambos perfiles conforme al §9 ("prevalece este protocolo y se corrige el perfil"); el prompt de ejecución define alcance operativo, pero en conflicto normativo se detiene y escala.
3. **El §3bis no definía dónde vive un contrato "congelado"**: v1.3 fija artefacto y evento de congelación — contrato de API = tipos en `@iwana/shared` + OpenAPI, contrato de componente = spec en `docs/specs/`; la congelación se declara en el prompt de ejecución citando la ruta. Sin artefacto localizable no hay congelación.
4. **RACI de "Base de datos y migraciones" contradecía al perfil DATA-ENG** (C en la matriz, R en sus entregables): v1.3 le da R\*\*\* al diseño de su dominio cuando está activado on-demand; SR-FULL implementa.
5. **Etapa 3 omitía a FE-PLATFORM** (su dictamen de factibilidad de UI no tenía slot): añadido. **Cadencia §8 omitía los reportes de QA y SEC-ENG**: añadidos.
6. **Desempate ambiguo con Responsible múltiple**: nueva regla — decide el R de la superficie afectada; si cruza superficies, EM-ARCH.
7. **Hechos volátiles fijados en perfiles** ("14 roles RBAC" en SEC-ENG, p95/p99 en QA, "deuda > 20% del codebase" en EM-ARCH): sustituidos por remisión a la fuente (matriz de permisos del PRD, RNF del módulo) o por métrica contable. **SLAs en horas** ("bloqueo > 4h") reexpresados en unidades de sesión en protocolo y perfiles.
8. **DS-OWNER duplicaba los hex de marca** que su propio rol prohíbe duplicar: v1.2 cita tokens, nunca hex (el hex vive solo en `packages/ui/src/styles/globals.css` y el manual de identidad). **KPIs sin instrumentación** en EM-ARCH/SR-FULL/FE-PLATFORM: ahora declaran su fuente de dato y la regla "sin dato = 'sin instrumentar', nunca se estima" (también en la cadencia §8).
9. **Enlaces rotos** (`docs/prds/...` relativo en QA/SEC; `_historico/` en EM-ARCH/SR-FULL): corregidos. **Trazabilidad de versiones**: todos los perfiles registran ahora quién aprobó cada versión.
10. **Pendiente §3.3 cerrado**: verificado contra el código — **Zod sí se usa** en boundaries del API (`apps/api/src/modules/crm/schemas/`, `parties/dto/`, `inventory/dto/`, `tasks/dto/`) junto a class-validator; la afirmación de SEC-ENG era correcta.

### 5.3 Política de archivo histórico (decisión del CTO, 2026-07-18)

El borrado accidental de `_historico/` demostró que mantener perfiles superados en el working tree aporta poco y arriesga que un agente los lea y aplique (el riesgo que ADR-049 anotó como "deuda de migración"). Decisión: **no se restaura la carpeta; el archivo histórico canónico es el historial de git** — referencia: commit `6770730c^`, ruta `docs/roles/_historico/`. El contenido aún normativo (v1 §13–§14) se extrajo al documento vivo [docs/roles/Anexo_Regulatorio_Integraciones_ISP.md](../roles/Anexo_Regulatorio_Integraciones_ISP.md). Esta decisión modifica la disposición operativa de ADR-049 sobre la ubicación del archivo (no su autoridad) y queda registrada aquí.

### 5.4 Análisis de cobertura del ecosistema (¿faltan perfiles? ¿dividir alguno?)

- **Hueco cubierto — operaciones de plataforma:** existían `.github/workflows/`, `docker-compose.yml`, `nginx.dev/prod.conf` sin dueño (QA y SEC-ENG lo excluían explícitamente; EM-ARCH no implementa). Se crea **[AI-PLAT-OPS](../roles/Perfil_IA_Platform_Ops_Engineer_v1.md)** (Platform/DevOps Engineer, on-demand, patrón DATA-ENG v3): CI/CD, infra Docker/Nginx, backups/DR multi-tenant, observabilidad de plataforma y **ejecución** de releases (el go sigue siendo de G7). Incorporado a estructura, RACI, matriz de consulta y cadencia del protocolo v1.3. No requiere ADR (no mueve autoridad del CTO; registro aquí conforme al §9).
- **Rol humano externo formalizado:** Legal/regulatorio declarado en la estructura §1 (vía CTO). Deliberadamente **no** es un agente IA — la regla anti-alucinación de regulación es correcta.
- **No se divide EM-ARCH** (Accountable en casi toda la RACI por diseño; válvulas existentes: carril rápido + regla de completitud de [ADR-022](../adrs/ADR-022-Politica-Ejecucion-Modular-Por-Fases.md)). Disparador de división: módulos en paralelo → sharding por dominio vía ADR (ya previsto en §3.5). Señal a instrumentar: latencia de gates y cola de desempates en el informe de fase. *(Corrección v1.3: la cita original decía "ADR-016" — la autoridad de la regla es ADR-022; y la señal se instrumenta por fase, no por sprint. Ver §6.)*
- **No se divide FE-PLATFORM** (la consolidación DRY se beneficia de un dueño único). Disparador: `@iwana/ui` estable + volumen de pantallas → DS Engineer vs Feature FE.
- **No se añaden** PM, tech writer, BI ni agente legal: cubiertos por diseño (EM-ARCH/CTO), por skills del catálogo, o vetados por las reglas anti-alucinación.

### 5.5 Pendientes tras esta actualización

1. ~~Generación de subagentes multi-IDE~~ — **ejecutado (2026-07-18)**: 8 subagentes de rol en `.claude/agents/*.md` (fuente canónica, leída nativamente por Claude Code, Cursor y VS Code/Copilot): `sr-backend`, `fe-platform`, `prod-ux`, `ds-owner`, `sr-qa`, `sec-eng` (readonly), `data-eng`, `plat-ops`. AI-EM-ARCH no es subagente — es el modo Orquestador del agente padre (`docs/prompts/PROMPT-OPERATIVO-ACTIVAR-AI-EM-ARCH-v1.0.md`). Generador [`scripts/sync-agents.mjs`](../../scripts/sync-agents.mjs) (`pnpm sync:agents` / `sync:agents:check`) emite `.opencode/agents/*.md` (frontmatter OpenCode: `mode: subagent`, `permission` desde `readonly`) y `.codex/agents/*.toml` (TOML de Codex: `developer_instructions`, `sandbox_mode`). Los generados no se editan a mano; regla registrada en `AGENTS.md` → Superficies activas. Cada subagente remite a su perfil de `docs/roles/` y al protocolo, sin duplicarlos (regla del Alcance del protocolo). Limitación conocida de Codex: los agentes de proyecto pueden no cargar en sesiones tool-backed (issue openai/codex#15250).
2. ~~Instrumentar en el informe de sprint la tabla de KPIs~~ — **ejecutado (2026-07-18)**: creada [PLANTILLA-INFORME-SPRINT-v1.0.md](PLANTILLA-INFORME-SPRINT-v1.0.md) con la tabla de KPIs del protocolo (dato + fuente por fila, regla "sin dato = sin instrumentar"), las métricas contables de deuda que alimentan la regla de escalación de EM-ARCH §3.3, y las señales de división de EM-ARCH (§5.4) con umbrales de atención. Referenciada desde la cadencia §8 del protocolo v1.3.
3. ~~Actualizar la tabla de perfiles en `AGENTS.md`~~ — verificado: `AGENTS.md` no duplica la lista de roles (delega en el protocolo), que es el patrón correcto; sin cambio requerido.
4. ~~Añadir `pnpm sync:agents:check` a CI~~ — **ejecutado (2026-07-18)**: paso "Check agentes multi-IDE sincronizados" en `.github/workflows/ci.yml`, antes de lint; falla el pipeline si `.opencode/agents/` o `.codex/agents/` derivan de `.claude/agents/`.

**Sin pendientes abiertos.** Próxima revisión de este informe: al cierre del siguiente módulo o cuando cambie la estructura de roles (protocolo §9).

## 6. Actualización 2026-08-02 — Auditoría del perfil AI-EM-ARCH (v2.2)

Auditoría a solicitud del CTO sobre [`Perfil_IA_EM_Architect_Unificado_v2.md`](../roles/Perfil_IA_EM_Architect_Unificado_v2.md) en su v2.1. Informe completo: [INFORME-ROLES-AUDITORIA-EM-ARCH-v1.0.md](INFORME-ROLES-AUDITORIA-EM-ARCH-v1.0.md). Registro aquí conforme al protocolo §9.

**Resultado:** 3 bloqueantes, 7 altos, 6 medios, 4 bajos. Perfil emitido en **v2.2**. No mueve autoridad hacia ni desde el CTO → no requiere ADR.

### 6.1 Causa raíz — un alcance de remediación mal delimitado

El plan de ejecución de [ADR-056](../adrs/ADR-056-Integridad-Base-Normativa-Diseno.md) (acción 5) ordenó alinear el §6 de **DS-OWNER, PROD-UX, FE-PLATFORM y SR-QA** a la cadena canónica nueva y a la definición de Estrella Polar de tres dominios. **EM-ARCH quedó fuera de ese alcance.** Durante seis semanas, el perfil que *aprueba* las especificaciones UX/UI operó contra la definición de dos dominios de ADR-049 que él mismo había declarado superada, y con una cadena de precedencia distinta de la de sus cuatro revisores.

> **Regla derivada, aplicable a toda enmienda normativa futura:** cuando un ADR ordena alinear perfiles a una definición, el alcance se determina por **quién cita la definición**, no por quién pertenece a la capa que la origina. El aprobador de un artefacto cita siempre la norma contra la que aprueba.

### 6.2 Correcciones aplicadas al perfil (v2.1 → v2.2)

| Área | Cambio |
| --- | --- |
| **Base normativa** | §5 aprueba UX/UI contra los tres dominios de ADR-056 §3; §6 adopta la cadena de 8 niveles con casilla de *fuentes de diseño*; la regla de completitud se reancla a **ADR-022** (ADR-016 es el cierre de MOD01) |
| **Ejecución paralela** | Nueva §3.5 *Delegación paralela (contract-first)*: los dos contratos congelables, cómo se declara la congelación en el prompt de fase y qué evento fuerza re-sync (protocolo §3bis). El **carril rápido de UI** delegado en DS-OWNER queda registrado en la matriz §5 |
| **Bloqueos** | Nueva §8 con SLA en unidades de sesión, artefacto de salida y destino de registro para `[BLOQUEO]`, `[CONSULTA]`, `[DESEMPATE]` y `[ESCALACIÓN AL CTO]`. Era el único perfil sin contrato para esto, siendo el destinatario único de todo el ecosistema |
| **Instrumentación** | §7 y §11 pasan del informe de sprint al **informe de fase + informe de cierre de módulo**. Motivo: el repo tiene 2 informes de sprint frente a 30 de cierre — los 7 KPIs reportaban "sin instrumentar" de forma permanente |
| **Gates y consulta** | §3.4 añade el mecanismo de review cruzado de G1 (el perfil es el productor del PRD/HLD) y a **AI-SR-QA** a la red de consulta |
| **Trazabilidad** | `Fecha` sincronizada, campos `Gobernanza` y `Modo de sesión`, versión del protocolo declarada (v1.3), y changelog de las dos ediciones post-v2.1 que se habían aplicado sin bump (`7cd44be4`, `9ea24f99`) |
| **Checklist** | Tres verificaciones nuevas: cita abierta y verificada con estado `Aprobado`, artefacto previo contradictorio marcado como superado, y `pnpm audit:adr-citations` en verde |

### 6.3 Colaterales

- `.cursor/rules/ai-em-arch.mdc` apuntaba a `.github/prompts/activar-ai-em-arch.prompt.md` — carpeta suprimida el 2026-07-27. **La activación del modo Orquestador en Cursor estaba rota.** Repuntado a `docs/prompts/PROMPT-OPERATIVO-ACTIVAR-AI-EM-ARCH-v1.0.md`. **Corrección local:** `.cursor/` está en `.gitignore:44`, así que no se propaga ni la valida CI — decisión pendiente en §6.4.
- Corregidas en este informe la atribución `ADR-016 → ADR-022` de §5.4 y el enlace a `_historico/` de la cabecera (la carpeta no existe desde `6770730c`).

### 6.4 Pendientes abiertos tras esta auditoría

1. ~~**ADR-069 (propuesto)**~~ — **cerrado el 2026-08-02**: aprobado por el CTO; perfil en **v2.3** y protocolo en **v1.5**. Ver §8.
2. ~~**Protocolo → v1.4**~~ — **cerrado el 2026-08-02** por la auditoría del protocolo, ver §7.
3. **Normalización estructural de los 9 documentos** — coexisten tres convenciones de Parte I/II/III y cinco formatos de sección de handoff. **Decisión del CTO 2026-08-02: no se aborda como proyecto.** No hay defecto funcional —cada perfil es coherente por dentro y su subagente maneja la diferencia correctamente— y tocar nueve documentos por consistencia es donde ADR-056 documentó que aparece la "corrección parcial que aparenta estar cerrada". Se normaliza **de forma oportunista**: cada perfil adopta la forma objetivo cuando se le toque por un motivo sustantivo.
4. ~~**`.cursor/` sin versionar**~~ — **cerrado el 2026-08-02: retirado, no versionado.** Ver §8.

## 7. Actualización 2026-08-02 — Auditoría del protocolo (v1.4)

Segunda auditoría del mismo día, sobre [`Protocolo_Colaboracion_Multiagente_v1.md`](../roles/Protocolo_Colaboracion_Multiagente_v1.md) en su v1.3. Informe completo: [INFORME-ROLES-AUDITORIA-PROTOCOLO-v1.0.md](INFORME-ROLES-AUDITORIA-PROTOCOLO-v1.0.md). Registro conforme al §9 del propio protocolo.

**Resultado:** 2 bloqueantes, 6 altos, 7 medios, 3 bajos. Protocolo emitido en **v1.4**. Toca gates y notación de RACI → requiere aprobación de EM-ARCH y registro (hecho); no mueve autoridad del CTO → no requiere ADR.

### 7.1 Causa raíz — la norma era buena, la instrumentación no cerraba

Al contrario que en la auditoría del perfil (§6), aquí no se encontró **ningún error de diseño**: la RACI, el workflow de 7 etapas y el modelo paralelo §3bis son correctos. Los defectos están todos en la **interfaz entre el protocolo y el repo que gobierna**: listas declaradas cerradas que el árbol real desmiente, gates llamados "verificables" sin decir con qué comando, y un vocabulario de marcadores que el ecosistema usa más de 100 veces y que el protocolo definía en una cuarta parte.

> **Regla derivada:** toda afirmación del protocolo sobre el estado del repo —carpetas, comandos, conteos, marcadores— es una **cita verificable** y le aplica §7.4 igual que a una cita de ADR. Una lista "cerrada" que nadie contrastó contra `ls` es del mismo género que un ADR citado sin abrir.

### 7.2 Correcciones aplicadas (v1.3 → v1.4)

| Área | Cambio |
| --- | --- |
| **Handoff (§3)** | La enumeración "cerrada" omitía `docs/hlds/` y `docs/adrs/` — los dos artefactos que su propia etapa 1 produce, y que el gate `audit-doc-locations` **exige** ahí. Sustituida por tabla artefacto → carpeta → etapa → gate |
| **Gates (§4)** | Faltaban **lint y typecheck**, que `AGENTS.md` (precedencia 1) sí exige. Reescrita como superconjunto declarado, con los 13 gates mapeados a su comando verificable y la regla de precedencia explícita |
| **Caché de Turbo** | Nota operativa nueva: un `pnpm test` verde puede no haber ejecutado nada. El gate de cobertura exige el resumen con `Cached: 0` o la corrida `--force`; sin eso se reporta *no verificada* |
| **Marcadores (§6.3, nueva)** | Fuente única de `[BLOQUEO]`, `[CONSULTA]`, `[DESEMPATE]` y `[ESCALACION AL CTO]`: emisor, disparador, SLA, registro y formato. Prohibidas las variantes (`[BLOQUEO TÉCNICO]`, `[ESCALACIÓN]` a secas) que son invisibles a la búsqueda que las recupera |
| **Cadencia (§8)** | Reordenada a fase (primaria) → módulo (corte de gobierno) → sprint (agregado). Cierra el conflicto con EM-ARCH v2.2, que por §9 el protocolo debía resolver |
| **Completitud** | Regla reanclada a **ADR-022**; el protocolo era el origen de la atribución a ADR-016 que los perfiles copiaron |
| **Estrella Polar** | La fila de la RACI decía dos dominios mientras §5.4 ya traía los tres de ADR-056 §3. Alineada — la lee SR-QA, que audita fidelidad |
| **Otros** | `A*` declarado como autoridad de excepción, nunca segundo Accountable; "cuatro tracks" → cinco; procedimiento de versionado y notificación de un cambio de contrato (§3bis.1); salida del punto muerto de §6.2 cuando el consultado es EM-ARCH; capa de subagentes declarada; §9 exige bump por cambio y define cómo se añade un perfil nuevo |

### 7.3 Pendientes abiertos

**Los cuatro quedaron resueltos por decisión del CTO el 2026-08-02 — ver §8.**

## 8. Decisiones del CTO 2026-08-02 — cierre de los pendientes de ambas auditorías

Las auditorías del perfil (§6) y del protocolo (§7) dejaron cuatro pendientes. El CTO los resolvió el mismo día, en un solo acto. Documentos emitidos: **ADR-069 Aprobado**, **protocolo v1.5**, **perfil AI-EM-ARCH v2.3**.

### 8.1 ADR-069 aprobado — el gate ya operaba

**Decisión: aprobar sin cambios de contenido.**

No era una decisión de diseño pendiente: G6.5 estaba operando. `INFORME-MOD11-FLOW-CABLEADO-v1.0.md` §15.13 registraba **G6.5 GO** con evidencia de CI #112 sobre `1343d6b8`, y los dos últimos commits del repo eran `record G6.5 Linux evidence` y `point G6.5 evidence to latest CI` — mientras el ADR que crea el gate seguía `Propuesto`. La autorización de merge de MOD09/MOD11 descansaba sobre autoridad provisional.

Precedente aplicado: ADR-056 §Ampliación resolvió lo mismo con **ADR-022** (*"Propuesto con 91 citas — gobierna la cadencia de fases de todo el programa"* → Aprobado sin cambios), y con ADR-025 y ADR-042.

Valor del gate, y motivo para no plegarlo en G6 ni en G7: **G6.5 es lo que permite que QA-34/TLS no bloquee el merge mientras sigue bloqueando G7.** Sin esa separación, o se mergea afirmando una readiness productiva que no existe, o se congelan dos módulos por una decisión de dominio pendiente.

Propagación aplicada: protocolo §3 (workflow de 7 etapas y **8 gates**, con la tabla de los tres gates de cierre), §4 (correr los gates en local satisface G6, no G6.5) y §8 (registro separado); perfil §7 (*Consolidación de G6.5* como entregable). Citas prospectivas de *"ADR-069 (propuesto)"* actualizadas en el informe de MOD11, el README de evidencia y los dos planes; las del plan del 2026-08-01 se conservan como **registro cronológico** con nota de resolución, conforme al corolario de ADR-056.

### 8.2 `.cursor/` retirado — no versionado

**Decisión: retirar el adaptador, no versionarlo.** Corrige la recomendación inicial de §6.4, que proponía versionarlo.

Al verificarlo: `AGENTS.md` → *AI Workflow Activo* declara **cuatro** asistentes activos —Copilot, OpenCode, Codex y Claude Code—; **Cursor no está entre ellos**. Y `.cursor/` contenía exactamente **un archivo**: el adaptador del modo Orquestador.

Versionarlo habría significado mantener una quinta superficie de activación, con obligación de sincronía, para un cliente que la gobernanza no declara activo. Retirarlo no pierde capacidad: Cursor lee `.claude/agents/` nativamente (`AGENTS.md` → Superficies activas) y el modo Orquestador se activa por `docs/prompts/PROMPT-OPERATIVO-ACTIVAR-AI-EM-ARCH-v1.0.md` igual que en los otros cuatro.

`.gitignore` conserva la entrada `.cursor/` —config local de IDE, se ignora como `.vscode/` y `.idea/`— con un comentario que registra la decisión en el punto de tentación: no se deposita gobernanza del repo ahí. **Si en el futuro Cursor debe ser superficie activa, primero se declara en `AGENTS.md` y después se versiona**; no al revés.

### 8.3 Definition of ready — acotada a dos transiciones

**Decisión: implementarla, solo en las entradas a etapa 2 y etapa 5** (protocolo §3.1).

No siete DoR. Esas dos son las transiciones donde nace el retrabajo tardío que la regla *Cambios tardíos* obliga a devolver a etapa 1 ó 2 — y que el KPI *"Fases con scope completado sin regresar a etapa 1–2"*, instrumentado en la v2.2 del perfil, ya mide. El DoR es el control **preventivo** de un KPI que hasta hoy solo registraba el fallo.

Regla clave: **quien recibe el handoff verifica su propio DoR**, no quien lo emite; si falta algo emite `[BLOQUEO]` antes de empezar, no "mientras se aclara".

### 8.4 RACI — una fila de las tres propuestas

**Decisión: añadir solo *Documentación y trazabilidad*.**

- **Documentación: sí.** Única de las tres con fallo demostrado — más de 500 artefactos en `docs/`, dos gates bloqueantes en CI y dos auditorías el mismo día encontrando defectos documentales que ninguna fila de la matriz reclamaba. Modelo: **Responsible distribuido** (cada agente responde por el artefacto que produce: ubicación canónica, citas verificadas, versión), **Accountable EM-ARCH** de la coherencia del corpus. No se crea un rol "escribano": documentar es parte de entregar.
- **Deuda técnica: no.** El §3.3 del perfil EM-ARCH ya la gobierna con regla de escalación propia, y desde la v2.2 está instrumentada en el informe de fase. Una fila nueva duplicaría sin añadir dueño.
- **Observabilidad de aplicación: diferida a G7.** El sistema no está en producción y la frontera PLAT-OPS/SR-FULL depende de la topología productiva, bloqueada en la misma definición de dominio que QA-34. Asignarla ahora sería adivinar.

### 8.5 El dominio productivo — resuelto por diferimiento formal

Al cerrar §8 quedaba señalado un último asunto, ajeno a estas auditorías: `INFORME-MOD11-FLOW-CABLEADO` §15.8 registraba **QA-34/TLS bloqueando G7**, con AI-PLAT-OPS como responsable *"cuando dominio definido"* — un input del CTO, no trabajo de ingeniería.

**Resuelto el mismo día por [ADR-070](../adrs/ADR-070-Diferimiento-Dominio-Productivo.md) (superado)** (Aprobado, CTO 2026-08-02): se difiere formalmente la definición del dominio productivo hasta que se cumpla un disparador de reactivación. Ver §9.

## 9. Decisión del CTO 2026-08-02 — diferimiento del dominio productivo (ADR-070, superado)

Documento emitido: **[ADR-070](../adrs/ADR-070-Diferimiento-Dominio-Productivo.md) (superado)**, Aprobado. Registro aquí conforme al protocolo §9.

### 9.1 Por qué hacía falta una decisión y no bastaba con posponerlo

El diferimiento **ya existía de facto** desde el 2026-07-31, pero estaba registrado como *bloqueo*, no como *decisión*. `RUNBOOK-RELEASE-ROLLBACK` §8.6 decía literalmente `BLOQUEADO — STOP/NO-GO` —un estado de emergencia operativa— y otros cinco documentos lo listaban como `PENDIENTE / ESCALADO — CTO`. Cualquier lector, o cualquier agente que abriera un informe de gate, concluía que había trabajo detenido esperando una decisión inminente.

> **Un pendiente sin dueño ni horizonte se relee indefinidamente. Una decisión con disparador se lee una vez.**

Esa es la diferencia que aporta el ADR: convierte seis lecturas ambiguas en una norma verificable, y evita que cada sesión vuelva a evaluar un asunto ya resuelto.

### 9.2 Contenido de la decisión

**Se difiere** la definición del dominio productivo y, con ella, el hosting, la CA y método ACME, la ventana operativa y los targets RPO/RTO. El programa está en construcción modular y no va a producción; el foco se mantiene en los módulos faltantes conforme a ADR-022.

**G7 permanece NO-GO por diseño, no por defecto.** ADR-069, aprobado horas antes, es lo que permite decirlo sin ambigüedad: G6.5 GO autoriza el merge y nunca el despliegue. El estado **G6 GO · G6.5 GO · G7 NO-GO** de MOD09/MOD11 es el estado correcto y deliberado del programa.

**No se produce evidencia ficticia:** no se elige dominio, no se registra nada, no se emite certificado, no se cablea certbot. Los placeholders `REPLACE_ME_PRODUCTION_DOMAIN` y `approval-required` se conservan intactos y el gate R3.5 de CI mantiene su lógica.

**También se difieren los prerrequisitos que no dependen del dominio** —restore global, restore por tenant, rollback por digest— y esto merece explicación, porque eran ejecutables hoy. Son ensayos de un release que no se va a planificar: la evidencia caducaría antes de usarse y al reactivar habría que repetirlos sobre una superficie mayor. Cumplir un gate dos veces no lo cumple mejor.

### 9.3 Disparador de reactivación

Se reabre ante **cualquiera** de tres condiciones, sin necesidad de que concurran:

1. El último módulo del roadmap queda cerrado conforme a ADR-022 *(planificada)*.
2. Se necesita un entorno accesible fuera de la red de desarrollo — demo, piloto, UAT externo *(oportunista)*.
3. **Se procesa PII de personas reales, aunque el entorno no se llame "producción" *(no negociable)*.**

El tercero es el que convierte el diferimiento en algo seguro. La Ley 1581 no distingue entre "producción" y "piloto": lo que importa es si hay datos de personas reales. En el momento en que un tenant real cargue suscriptores, contratos o documentos de identidad, TLS deja de ser un prerrequisito de release y pasa a ser una obligación regulatoria — aunque el roadmap no haya terminado y aunque nadie llame producción a ese entorno. Sin ese disparador, este ADR sería una forma elegante de aplazar un riesgo regulatorio.

### 9.4 Lo que queda conservado para la reactivación

El ADR registra los insumos para no rehacer análisis: el CTO **dispone de un dominio de marca ya en uso para marketing**, así que la opción por defecto es un subdominio (`app.…`, `portal.…`) y **no hay paso de compra**; el hosting queda como primera pregunta al reactivar, porque determina la viabilidad de ACME HTTP-01; el análisis de tres opciones ACME de PLAT-OPS se conserva íntegro; y se verificó contra el código que bastan **dos FQDN** —la resolución de tenant va por JWT y `X-Tenant-Slug`, nunca por hostname—, con la dependencia anotada de que adoptar subdominio por tenant obligaría a migrar a DNS-01 con wildcard.

Registra además **seis riesgos congelados**, de los cuales dos son defectos latentes de configuración que no dependen del dominio y existirían con cualquier FQDN: `FRONTEND_URL` es `Joi.optional()` y no figura en `.env.production.example` —los correos de reset y verificación saldrían a `localhost:3001` sin fallo visible al arrancar—, y `CORS_ORIGIN` está ausente con default de Joi a localhost. Quedan registrados como trabajo de una fase futura; corregirlos estaba fuera del alcance de este cierre, que no toca código.

### 9.5 Documentos reencuadrados

Ocho superficies pasan de *bloqueado/pendiente* a *diferido por ADR-070 (superado)*, sin borrar un solo análisis: `RUNBOOK-RELEASE-ROLLBACK` → **v1.1** (§1.2, §8.5, §8.6 y §10), `CHECKLIST-MOD09-MOD11-OT-INSTALACION` (QA-34 y su tally), `INFORME-MOD11-FLOW-CABLEADO` (§15.8 reclasificada en *diferidos por decisión* vs *deuda viva*, y §15.13), `INFORME-PLAT-OPS-R3.4-EVIDENCIA` (seis filas), el plan `2026-08-01-mod11-g7-cierre-produccion` (**suspendido, no descartado** — sus Tasks 2–5 se retoman tal cual), `INFORME-ROLES-AUDITORIA-PROTOCOLO` y este informe, más el comentario del gate R3.5 en `ci.yml`, cuya lógica **no cambia**.

### 9.6 Estado del ecosistema

**Sin pendientes de gobernanza abiertos.** Los cuatro que dejaron las auditorías se cerraron en §8; el quinto, que no era de gobernanza, queda cerrado aquí. Lo que sigue vivo es deuda técnica ordinaria con dueño y curso normal: `EVIDENCE_UPLOAD_EXPIRED` en el contrato público, el derecho de supresión ARCO con Legal, y el umbral de lag QA-37 que se fija sobre datos reales post-release.
