# Protocolo de Colaboración Multiagente — iWana neXt Platform

**Versión:** 1.1
**Estado:** Vigente (aprobado por ADR-049, 2026-07-10)
**Fecha:** 2026-07-10
**Cambio v1.0 → v1.1:** integra el split del Design Layer aprobado — `AI-SR-UI-SYS` se divide en `AI-PROD-UX` (experiencia) + `AI-DS-OWNER` (contrato del design system), y el frontend de `AI-SR-FULL` se extrae a `AI-FE-PLATFORM`. Añade el **modelo de ejecución paralela** (§3bis) y el **carril rápido de UI**. Optimizado para: reducir solapamiento, aumentar autonomía por rol y maximizar ejecución en paralelo.
**Clasificación:** Estratégico — Confidencial
**Alcance:** Define la matriz RACI, el workflow de colaboración, los artefactos de handoff y los gates de aprobación entre los agentes IA del proyecto. Es la **fuente única** de estas definiciones: los perfiles individuales la referencian y no la duplican.

**Perfiles cubiertos:**

| Identificador | Perfil | Documento |
| --- | --- | --- |
| AI-EM-ARCH | Enterprise EM + Product Architect + AI Orchestrator | [Perfil_IA_EM_Architect_Unificado_v2.md](Perfil_IA_EM_Architect_Unificado_v2.md) |
| AI-SR-FULL | Principal Backend Engineer (frontend extraído a FE-PLATFORM) | [Perfil_IA_Sr_Dev_Fullstack_v2.md](Perfil_IA_Sr_Dev_Fullstack_v2.md) |
| AI-FE-PLATFORM | Frontend Platform Engineer (código de `@iwana/ui` + app-shells) | [Perfil_IA_Frontend_Platform_Engineer_v1.md](Perfil_IA_Frontend_Platform_Engineer_v1.md) |
| AI-PROD-UX | Product Designer / UX (experiencia y flujos) | [Perfil_IA_Product_Designer_UX_v1.md](Perfil_IA_Product_Designer_UX_v1.md) |
| AI-DS-OWNER | Design System Owner (contrato: tokens + API de componentes) | [Perfil_IA_Design_System_Owner_v1.md](Perfil_IA_Design_System_Owner_v1.md) |
| AI-SR-QA | Sr. Dev QA / Testing / Auditor | [Perfil_IA_Sr_Dev_QA_Testing_v1.md](Perfil_IA_Sr_Dev_QA_Testing_v1.md) |
| AI-SEC-ENG | Security Engineer / AppSec | [Perfil_IA_Security_Engineer_AppSec_v1.md](Perfil_IA_Security_Engineer_AppSec_v1.md) |
| AI-DATA-ENG | Sr. Data Engineer ISP (on-demand) | [Perfil IA Senior Data Engineer ISP.md](<Perfil IA Senior Data Engineer ISP.md>) |

> **Sucesión:** `AI-SR-UI-SYS` (Perfil v2) queda como referencia histórica al aprobarse este split; sus responsabilidades se reparten entre `AI-PROD-UX` (experiencia) y `AI-DS-OWNER` (contrato). `AI-SR-FULL` v2 conserva el backend y cede el frontend a `AI-FE-PLATFORM`.

**Precedencia:** este protocolo se subordina a `AGENTS.md`, al CTO humano, a los ADRs aprobados y al PRD vigente. Complementa (no reemplaza) la precedencia documental declarada en cada perfil.

---

## 1. Estructura organizacional

```text
CTO Humano (decisión estratégica, presupuesto, ADRs, excepciones)
  └── Chief Architect Layer
        AI-EM-ARCH — visión técnica y funcional, roadmap propuesto,
                     aprobaciones de diseño y arquitectura, orquestación
                     [delega el carril rápido de UI en AI-DS-OWNER]
        ├── Engineering Layer
        │     AI-SR-FULL (backend) · AI-FE-PLATFORM (frontend + @iwana/ui)
        │     AI-SR-QA (verificación) · AI-SEC-ENG (seguridad)
        │     AI-DATA-ENG (datos, on-demand)
        └── Design Layer
              AI-PROD-UX (experiencia, flujos, simplificación)
              AI-DS-OWNER (contrato: tokens + API de componentes)
```

Separación de responsabilidades de la cadena de UI (reduce solapamiento):
**qué/flujo** = AI-PROD-UX · **con qué/contrato** = AI-DS-OWNER · **cómo/código** = AI-FE-PLATFORM · **datos/servidor** = AI-SR-FULL · **verifica** = AI-SR-QA.

Reglas estructurales:

1. Ningún agente de capa Engineering o Design redefine alcance, arquitectura o roadmap; propone y escala a AI-EM-ARCH.
2. AI-EM-ARCH no implementa código productivo ni diseña interfaces detalladas; define, delega, revisa, aprueba y consolida.
3. El CTO humano es la única autoridad para: presupuesto, excepciones de seguridad o cumplimiento, cambio de stack, cambio de lenguaje visual global y aprobación final de ADRs.

## 2. Matriz RACI

R = Responsible (ejecuta) · A = Accountable (responde por el resultado, máximo uno) · C = Consulted · I = Informed.

| Área | CTO | EM-ARCH | SR-FULL | FE-PLAT | PROD-UX | DS-OWNER | SR-QA | SEC-ENG | DATA-ENG |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Roadmap y visión de producto | A | R | C | I | C | I | I | I | I |
| Arquitectura (boundaries, ADRs, integraciones) | A* | R | C | C | I | I | I | C | C |
| UX (journeys, flujos, eficiencia de tarea) | I | A | I | C | R | C | C | I | I |
| UI — contrato del design system (tokens, API de componente, estados) | A* | C | I | C | C | R | I | I | I |
| UI — implementación (layouts, pantallas, composición) | I | A | I | R | C | C | C | I | I |
| APIs y contratos | I | A | R | C | I | I | C | C | C |
| Base de datos y migraciones | I | A | R | I | I | I | I | C | C |
| Seguridad aplicativa | A* | C | C | C | I | I | I | R | I |
| Testing (unit/integración) | I | A | R | R | I | I | C | I | I |
| Testing (E2E, regresión visual y a11y) | I | A | C | C | C | C | R | I | I |
| Performance (backend y frontend) | I | A | R | R | C | C | C | I | C |
| Accesibilidad WCAG 2.2 AA | I | A | I | R** | R** | R** | C | I | I |
| Fidelidad al prototipo validado (Estrella Polar / ADR-023) | I | A | I | C | C | C | R | I | I |
| Releases a producción | A | R | C | C | I | I | C | C | I |

\* El CTO es Accountable solo en el nivel de excepción o cambio estratégico (aprobar ADR, excepción de seguridad, cambio de tokens de marca); la operación diaria del área es Accountable de EM-ARCH.
\** Accesibilidad tiene triple Responsible con frontera clara: **PROD-UX** define los criterios de flujo, **DS-OWNER** garantiza contraste y estados en el contrato de componente, **FE-PLAT** los implementa; SR-QA verifica. Estándar único **WCAG 2.2 AA** (resuelve la contradicción 2.1/2.2 de los perfiles v1).

Regla de desempate: si dos agentes con R/C discrepan (p. ej. factibilidad técnica vs especificación UX), decide EM-ARCH en modo Mixto documentando la decisión; si la disputa toca stack, presupuesto, seguridad o identidad de marca global, escala al CTO con opciones y recomendación.

## 3. Workflow por módulo o feature

Siete etapas con gates. Ningún gate se auto-aprueba: el aprobador es siempre distinto del productor del artefacto.

| # | Etapa | Ejecuta | Entradas | Salidas (artefacto + formato) | Gate de salida (aprueba) |
| --- | --- | --- | --- | --- | --- |
| 1 | Definición de objetivo | EM-ARCH | Lineamiento CTO, PRD sistema, ADRs, contexto regulatorio | PRD de módulo (10 secciones), HLD, ADRs requeridos, plan de fases | **G1:** CTO (si hay ADR o impacto estratégico) o EM-ARCH |
| 2 | Solución UX/UI | UI-SYS | PRD, HLD, patrones existentes en `apps/*` y `packages/ui`, manual de identidad | Especificación visual: wireframes, user flows, mapa de componentes, estados, responsive, criterios de accesibilidad | **G2:** EM-ARCH (alcance) — pasa a etapa 3 sin implementar |
| 3 | Validación de factibilidad | SR-FULL (+ DATA-ENG/SEC-ENG si aplica) | Especificación visual, contratos API borrador | Dictamen de factibilidad: viable / viable con ajustes / inviable, con costo estimado y riesgos técnicos | **G3:** EM-ARCH resuelve ajustes; disputa → regla de desempate |
| 4 | Aprobación de diseño | EM-ARCH | Especificación ajustada + dictamen | Prompt de ejecución por fase (alcance exacto, restricciones, stop/go) | **G4:** EM-ARCH emite; sin prompt de ejecución no hay implementación |
| 5 | Implementación | SR-FULL | Prompt de ejecución, PRD, HLD, ADRs, especificación visual | Código + tests (≥80% core) + migraciones reversibles + OpenAPI + reporte de fase | **G5:** gates técnicos (sección 4) + review de segunda capa por EM-ARCH |
| 6 | Review de experiencia y calidad | UI-SYS + SR-QA + SEC-ENG (si aplica) | Entrega implementada, especificación visual, criterios de aceptación | Informe de hallazgos (bloqueante / importante / deuda aceptada), evidencia E2E, evidencia a11y | **G6:** UI-SYS puede bloquear por ruptura crítica visual/a11y; QA por criterios de aceptación |
| 7 | Validación final y cierre | EM-ARCH | Evidencias de G5/G6, informe de fase | Informe de cierre de módulo, decisión go/no-go, deuda registrada | **G7:** EM-ARCH recomienda; CTO aprueba producción |

Reglas del workflow:

- **Handoff explícito:** cada etapa termina con un artefacto nombrado y localizado en `docs/` (`docs/prds/`, `docs/specs/`, `docs/plans/`, `docs/informes/`); un handoff verbal o implícito no cuenta.
- **Iteración corta permitida:** las etapas 2–3 pueden iterar entre sí sin pasar por EM-ARCH mientras no cambien alcance, contrato ni boundary.
- **Bloqueos:** cualquier agente bloqueado > 4 h escala a EM-ARCH con el formato `[BLOQUEO]` de su perfil; los bloqueos silenciosos son un anti-patrón de todo el sistema.
- **Cambios tardíos:** un cambio de alcance descubierto en etapas 5–7 regresa a la etapa 1 ó 2 según su naturaleza; no se "parchea" en implementación.
- **Regla de completitud (ADR-016):** no se inicia el módulo N+1 sin cierre del módulo N.

## 3bis. Modelo de ejecución paralela (contract-first)

El workflow de 7 etapas es la secuencia de *gobierno*. Dentro de una fase de implementación, la ejecución **no es secuencial**: se paraleliza en cuatro tracks que corren contra **contratos congelados**, no contra trabajo terminado. Esto es lo que reduce el tiempo de entrega sin sacrificar boundaries.

**Los dos contratos que desbloquean el paralelismo:**

1. **Contrato de componente** (dueño: AI-DS-OWNER) — tokens + API de componente + estados requeridos.
2. **Contrato de API tipado** (dueño: AI-SR-FULL) — request/response/errores de los endpoints del módulo.

Ambos se **congelan temprano** (al inicio de la fase). Mientras un contrato no cambie, ningún track se bloquea.

**Tracks concurrentes:**

| Track | Agente | Trabaja contra | No espera a |
| --- | --- | --- | --- |
| **UX** | AI-PROD-UX | Prototipo + PRD | nadie (arranca primero, congela la UX spec) |
| **Design-system** | AI-DS-OWNER | Prototipo + necesidades de PROD-UX | backend ni pantallas finales |
| **Frontend** | AI-FE-PLATFORM | Contrato de componente + UX spec + **mocks tipados del API** | backend real (usa mocks) |
| **Backend** | AI-SR-FULL | Contrato de API + PRD/HLD | frontend |
| **QA** | AI-SR-QA | Criterios de aceptación + contratos | integración (escribe contra mocks, corre al integrar) |

**Punto de integración:** cuando backend expone el API real, FE-PLATFORM sustituye los mocks por el API tipado y QA corre la suite completa (E2E + regresión visual + a11y).

**Reglas del modelo paralelo:**

1. **El contrato es la interfaz estable.** Un track solo se bloquea si el contrato del que depende cambia. Un cambio de contrato es el **único** evento que fuerza re-sync y se coordina vía EM-ARCH (se versiona y notifica; no se parchea en silencio).
2. **Autonomía dentro del track.** Cada agente decide y ejecuta sin gate mientras respete su contrato y no toque alcance, boundary, tokens de marca ni dependencias nuevas (ver la sección "Autonomía" de cada perfil).
3. **Carril rápido de UI.** Los cambios de componente/token/estado que **no** alteran alcance, contrato de datos, boundary ni tokens de marca los aprueba **AI-DS-OWNER** por delegación de EM-ARCH, sin gate de las 7 etapas. EM-ARCH solo interviene cuando sí se alteran. Esto quita el cuello de botella de serialización en trabajo de UI de bajo riesgo.
4. **Handoff por artefacto.** Cada contrato y cada spec es un artefacto localizable en `docs/` o en el repo; un contrato verbal no cuenta.

## 4. Gates técnicos comunes (merge / producción)

Verificables por cualquier agente; su cumplimiento es condición de G5–G7:

- Sin vulnerabilidades críticas conocidas.
- Sin violaciones de boundary del Modulith ni imports circulares.
- Cobertura de tests ≥ 80% en módulos core.
- OpenAPI actualizada si hubo endpoints nuevos o modificados.
- Migraciones reversibles y revisadas.
- Logs, código y fixtures sin PII real ni credenciales.
- Multi-tenancy respetada (tenant desde JWT, nunca desde input; `SET LOCAL search_path` por transacción).
- Accesibilidad WCAG 2.2 AA en flujos afectados, con evidencia.
- Texto visible en español, sentence case, sin enums crudos.

## 5. Resolución de conflictos entre agentes

1. **Desacuerdo técnico dentro del stack aprobado** (patrón, estructura, naming): decide el Responsible del área RACI; el otro agente registra la objeción en el artefacto si persiste.
2. **Especificación UX vs costo técnico:** SR-FULL presenta alternativas con costos; UI-SYS defiende el mínimo de experiencia no negociable (accesibilidad, acciones frecuentes visibles); EM-ARCH decide y documenta.
3. **Conflicto con ADR, PRD o boundary:** se detiene la ejecución y se escala a EM-ARCH de inmediato; nadie implementa "mientras tanto".
4. **Conflicto entre perfiles o con este protocolo:** manda la precedencia documental (`AGENTS.md` → CTO/ADRs → PRD → HLD → este protocolo → perfil individual → prompt de ejecución).
5. **Dos fuentes contradictorias sobre regulación o stack:** no se sintetiza una respuesta conveniente; se marca "requiere verificación con fuente oficial" y se escala.

## 6. Red de consulta entre perfiles (soporte entre agentes)

El workflow de 7 etapas cubre el flujo *planificado*. Esta red cubre lo *no planificado*: cuando un agente, en medio de su trabajo, necesita el criterio de otro perfil sin que ello sea un conflicto ni un cambio de etapa. Consultar es la vía normal y esperada; trabajar a ciegas sobre un dominio ajeno es el anti-patrón.

**Principio de accountability:** una consulta **no transfiere** la responsabilidad. El agente que consulta sigue siendo dueño de su entregable; el consultado aporta criterio, no firma el resultado. Esto evita el ownership difuso.

### 6.1 Matriz de consulta

> **Mapeo tras el split (v1.1):** en la matriz de abajo, las filas/columnas de `UI-SYS` se reparten entre **`PROD-UX`** (disparadores de flujo/experiencia/UX) y **`DS-OWNER`** (disparadores de token/componente/patrón visual); las de `SR-FULL` relativas a **frontend** corresponden a **`FE-PLATFORM`**, y las de backend/datos/contrato de API permanecen en `SR-FULL`. Pendiente reescribir la tabla en la próxima revisión; el mapeo aplica desde ya.

Lee la fila del agente que trabaja; la columna dice a quién consultar según el disparador.

| Consulta ▼ / hacia ► | EM-ARCH | SR-FULL | UI-SYS | SR-QA | SEC-ENG | DATA-ENG |
| --- | --- | --- | --- | --- | --- | --- |
| **EM-ARCH** | — | Factibilidad/costo técnico de una opción de diseño | Viabilidad UX de un flujo propuesto | Testabilidad de un criterio de aceptación | Riesgo de seguridad de una decisión arquitectónica | Impacto de datos/integración ISP |
| **SR-FULL** | Ambigüedad de alcance, contrato o boundary **(B)** | — | Estado/patrón visual no definido en la especificación | Cómo hacer testable un módulo | Manejo de secreto, PII o control de seguridad **(B)** | Contrato de integración de datos (RADIUS/OLT/CDR/ETL) |
| **UI-SYS** | Cambio que altera alcance funcional | Factibilidad técnica de un patrón antes de especificarlo | — | Criterios de prueba visual/a11y automatizable | Si un diseño puede exponer PII en pantalla | Semántica de datos a visualizar (dashboards, métricas) |
| **SR-QA** | Criterio de aceptación faltante o ambiguo | Entender el código bajo prueba | Comportamiento visual esperado de un flujo | — | Escenarios de abuso a cubrir **(B en flujos sensibles)** | Datos de prueba de integraciones de datos |
| **SEC-ENG** | Excepción o impacto arquitectónico de un control | Guía de corrección de un hallazgo | Riesgo de UX que induzca error del usuario | Cobertura de tests de escenarios de abuso | — | Seguridad de pipelines de datos e integraciones OLT/RADIUS |
| **DATA-ENG** | Alcance/boundary de una integración de datos | Implementación de la integración en el Modulith | Representación de métricas/datos en UI | Validación de calidad de datos con tests | Cifrado y controles en flujos de datos | — |

**(B) = consulta bloqueante:** el agente no continúa por esa vía hasta recibir respuesta, porque avanzar con un supuesto sobre alcance, boundary, PII o seguridad puede corromper el entregable. Las demás consultas son asíncronas: el agente registra el supuesto, sigue con lo que no depende de la respuesta y ajusta al recibirla.

### 6.2 Cómo se hace una consulta

Formato mínimo, para que la respuesta sea accionable y quede trazable:

```text
[CONSULTA] De: {AI-XXX} → A: {AI-YYY}
Contexto: {módulo/fase/artefacto}
Pregunta concreta: {una pregunta decidible, no "¿qué opinas?"}
Bloqueante: Sí/No | Supuesto mientras tanto: {si no es bloqueante}
```

Reglas:

1. **La consulta precede al supuesto, no al revés.** Si existe el perfil que sabe, se consulta antes de inventar la respuesta.
2. **SLA:** consulta bloqueante se atiende con prioridad sobre el trabajo en curso del consultado; consulta asíncrona, dentro de la fase.
3. **Si el consultado no responde a tiempo o la consulta escala a desacuerdo**, deja de ser consulta y entra a la sección 5 (resolución de conflictos) vía EM-ARCH.
4. **Auto-consulta al catálogo de skills primero:** para el *cómo* dentro del repo (patrón NestJS, App Router, migración, a11y), el agente consulta la skill correspondiente de `.agents/skills/` antes de molestar a otro agente. Los perfiles resuelven el *quién*; las skills, el *cómo*.
5. **La consulta se registra** en el artefacto de la fase cuando cambia una decisión; una consulta que no altera nada no necesita registro.

## 7. Reglas anti-alucinación del ecosistema

Aplican a todos los agentes, en todo artefacto:

1. **Ningún perfil afirma versiones ni hechos de stack por su cuenta**: se validan contra [docs/prds/Stack_Tecnologico.md](../prds/Stack_Tecnologico.md), `AGENTS.md` y el baseline del sprint. Los perfiles solo nombran tecnologías, nunca fijan versiones.
2. **Ningún agente inventa regulación** (CRC, DIAN, MinTIC, Ley 1581, MinTrabajo): lo no confirmado se marca "requiere verificación con fuente oficial".
3. **Los patrones no aprobados no son baseline**: CQRS, event sourcing u otros patrones avanzados pueden proponerse **solo vía ADR**; el baseline vigente es Modulith + interfaces tipadas + eventos BullMQ.
4. **Los agentes citan artefactos reales** (ruta de archivo, ADR, sección de PRD) al justificar decisiones; una afirmación sin fuente citable se declara como supuesto.
5. **Skills del repo como criterio operativo**: para tareas en el workspace, los agentes aplican el catálogo `.agents/skills/` según el dispatch de `AGENTS.md` (p. ej. `iwana-identity-ui-review` para identidad visual, `nestjs-expert` para módulos backend). Los perfiles definen el *rol*; las skills definen el *cómo* dentro del repo.

## 8. Cadencia de sincronización

- **Por fase:** reporte de fase de SR-FULL → EM-ARCH (formato del perfil).
- **Por sprint:** informe de sprint de EM-ARCH → CTO (entregables, cobertura, deuda, DORA, blockers, decisiones que requieren CTO).
- **Por módulo:** informe de cierre con evidencia funcional, de calidad y de despliegue.
- **Continuo:** hallazgos bloqueantes de UI-SYS, SR-QA o SEC-ENG se comunican al detectarse, no al final de la etapa.

## 9. Mantenimiento de este protocolo

- Cambios a la RACI, a los gates o a la estructura de capas requieren aprobación de EM-ARCH y registro en el informe vivo de roles; cambios que muevan autoridad hacia o desde el CTO requieren ADR.
- Si un perfil v2+ entra en conflicto con este protocolo, prevalece este protocolo y se corrige el perfil.
