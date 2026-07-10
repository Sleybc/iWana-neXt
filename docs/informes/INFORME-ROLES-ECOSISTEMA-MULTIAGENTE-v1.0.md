# INFORME — Auditoría y optimización del ecosistema multiagente (perfiles IA)

**Versión:** 1.0
**Estado:** Vigente
**Fecha:** 2026-07-10
**Alcance:** Auditoría de `Perfil_IA_EM_Architect_Unificado_v1`, `Perfil_IA_Sr_Dev_Fullstack_v1` y `Perfil_IA_Senior_UI_Systems_Designer_v1`; emisión de versiones v2 y del protocolo de colaboración compartido.
**Documentos emitidos:**

- [docs/roles/Perfil_IA_EM_Architect_Unificado_v2.md](../roles/Perfil_IA_EM_Architect_Unificado_v2.md)
- [docs/roles/Perfil_IA_Sr_Dev_Fullstack_v2.md](../roles/Perfil_IA_Sr_Dev_Fullstack_v2.md)
- [docs/roles/_historico/Perfil_IA_Senior_UI_Systems_Designer_v2.md](../roles/_historico/Perfil_IA_Senior_UI_Systems_Designer_v2.md)
- [docs/roles/Protocolo_Colaboracion_Multiagente_v1.md](../roles/Protocolo_Colaboracion_Multiagente_v1.md)

Todos en estado **Propuesto — pendiente aprobación CTO**. Los v1 permanecen como referencia histórica (mismo patrón de ADR-021).

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

1. **Aprobación formal:** ADR corto (o actualización de ADR-021) que declare los v2 + protocolo como fuente primaria y los v1 como superseded. Sin ese ADR, los v1 siguen vigentes.
2. **Actualizar los perfiles no rediseñados:** QA v1, Security v1 y Data Engineer (este último es genérico y con stack drift declarado) deben alinearse al protocolo — al menos añadir la referencia y el estándar WCAG 2.2 AA donde aplique.
3. **Verificar afirmaciones de stack heredadas:** confirmar contra el código el rol real de Zod en boundaries externos y corregir el perfil que corresponda.
4. **Métricas del sistema, no solo del rol:** instrumentar los KPIs cruzados (fidelidad a especificación visual, conflictos resueltos sin CTO) en los informes de sprint para que la RACI sea auditable.
5. **Evolución a 5 años:** cuando el equipo crezca (más agentes ejecutores en paralelo), el protocolo admite sharding por módulo (un EM-ARCH por dominio) sin cambiar la estructura de capas; ese cambio requerirá ADR.
6. **Sincronizar vocabulario:** los perfiles v2 usan los identificadores AI-* existentes; si se adoptan los títulos nuevos (Principal Fullstack Engineer, etc.) en otras superficies (AGENTS.md, prompts de ejecución), actualizar en la misma iteración para evitar dos nomenclaturas.
