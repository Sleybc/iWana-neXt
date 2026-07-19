# INFORME — Auditoría y optimización del ecosistema multiagente (perfiles IA)

**Versión:** 1.2
**Estado:** Vigente
**Fecha:** 2026-07-10 (v1.1: 2026-07-18; v1.2 — auditoría integral y correcciones aplicadas: 2026-07-18)
**Alcance:** Auditoría de `Perfil_IA_EM_Architect_Unificado_v1`, `Perfil_IA_Sr_Dev_Fullstack_v1` y `Perfil_IA_Senior_UI_Systems_Designer_v1`; emisión de versiones v2 y del protocolo de colaboración compartido.
**Documentos emitidos:**

- [docs/roles/Perfil_IA_EM_Architect_Unificado_v2.md](../roles/Perfil_IA_EM_Architect_Unificado_v2.md)
- [docs/roles/Perfil_IA_Sr_Dev_Fullstack_v2.md](../roles/Perfil_IA_Sr_Dev_Fullstack_v2.md)
- [docs/roles/_historico/Perfil_IA_Senior_UI_Systems_Designer_v2.md](../roles/_historico/Perfil_IA_Senior_UI_Systems_Designer_v2.md)
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
- [`.github/prompts/activar-ai-em-arch.prompt.md`](../../.github/prompts/activar-ai-em-arch.prompt.md) — activación multi-IDE (fuente operativa compartida; remite a Parte II del perfil + protocolo).
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
- **No se divide EM-ARCH** (Accountable en casi toda la RACI por diseño; válvulas existentes: carril rápido + ADR-016). Disparador de división: módulos en paralelo → sharding por dominio vía ADR (ya previsto en §3.5). Señal a instrumentar: latencia de gates y cola de desempates en el informe de sprint.
- **No se divide FE-PLATFORM** (la consolidación DRY se beneficia de un dueño único). Disparador: `@iwana/ui` estable + volumen de pantallas → DS Engineer vs Feature FE.
- **No se añaden** PM, tech writer, BI ni agente legal: cubiertos por diseño (EM-ARCH/CTO), por skills del catálogo, o vetados por las reglas anti-alucinación.

### 5.5 Pendientes tras esta actualización

1. ~~Generación de subagentes multi-IDE~~ — **ejecutado (2026-07-18)**: 8 subagentes de rol en `.claude/agents/*.md` (fuente canónica, leída nativamente por Claude Code, Cursor y VS Code/Copilot): `sr-backend`, `fe-platform`, `prod-ux`, `ds-owner`, `sr-qa`, `sec-eng` (readonly), `data-eng`, `plat-ops`. AI-EM-ARCH no es subagente — es el modo Orquestador del agente padre (`.github/prompts/activar-ai-em-arch.prompt.md`). Generador [`scripts/sync-agents.mjs`](../../scripts/sync-agents.mjs) (`pnpm sync:agents` / `sync:agents:check`) emite `.opencode/agents/*.md` (frontmatter OpenCode: `mode: subagent`, `permission` desde `readonly`) y `.codex/agents/*.toml` (TOML de Codex: `developer_instructions`, `sandbox_mode`). Los generados no se editan a mano; regla registrada en `AGENTS.md` → Superficies activas. Cada subagente remite a su perfil de `docs/roles/` y al protocolo, sin duplicarlos (regla del Alcance del protocolo). Limitación conocida de Codex: los agentes de proyecto pueden no cargar en sesiones tool-backed (issue openai/codex#15250).
2. ~~Instrumentar en el informe de sprint la tabla de KPIs~~ — **ejecutado (2026-07-18)**: creada [PLANTILLA-INFORME-SPRINT-v1.0.md](PLANTILLA-INFORME-SPRINT-v1.0.md) con la tabla de KPIs del protocolo (dato + fuente por fila, regla "sin dato = sin instrumentar"), las métricas contables de deuda que alimentan la regla de escalación de EM-ARCH §3.3, y las señales de división de EM-ARCH (§5.4) con umbrales de atención. Referenciada desde la cadencia §8 del protocolo v1.3.
3. ~~Actualizar la tabla de perfiles en `AGENTS.md`~~ — verificado: `AGENTS.md` no duplica la lista de roles (delega en el protocolo), que es el patrón correcto; sin cambio requerido.
4. ~~Añadir `pnpm sync:agents:check` a CI~~ — **ejecutado (2026-07-18)**: paso "Check agentes multi-IDE sincronizados" en `.github/workflows/ci.yml`, antes de lint; falla el pipeline si `.opencode/agents/` o `.codex/agents/` derivan de `.claude/agents/`.

**Sin pendientes abiertos.** Próxima revisión de este informe: al cierre del siguiente módulo o cuando cambie la estructura de roles (protocolo §9).
