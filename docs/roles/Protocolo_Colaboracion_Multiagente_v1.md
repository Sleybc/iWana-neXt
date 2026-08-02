# Protocolo de Colaboración Multiagente — iWana neXt Platform

**Versión:** 1.5
**Estado:** Vigente (aprobado por ADR-049, 2026-07-10; v1.2 aprobada por CTO, 2026-07-12; v1.3 aprobada por CTO, 2026-07-18; v1.4, 2026-08-02 — auditoría del protocolo, ver [informe](../informes/INFORME-ROLES-AUDITORIA-PROTOCOLO-v1.0.md); **v1.5, 2026-08-02** — incorpora el gate **G6.5** de [ADR-069](../adrs/ADR-069-Gates-G6.5-Merge-Readiness.md), aprobado por el CTO ese día)
**Fecha:** 2026-08-02
**Nombre de archivo:** el sufijo `_v1` es histórico y **no indica la versión del contenido**; la versión vigente es la de esta cabecera. No se renombra para no romper ~40 enlaces entrantes.
**Cambio v1.0 → v1.1:** integra el split del Design Layer aprobado — `AI-SR-UI-SYS` se divide en `AI-PROD-UX` (experiencia) + `AI-DS-OWNER` (contrato del design system), y el frontend de `AI-SR-FULL` se extrae a `AI-FE-PLATFORM`. Añade el **modelo de ejecución paralela** (§3bis) y el **carril rápido de UI**. Optimizado para: reducir solapamiento, aumentar autonomía por rol y maximizar ejecución en paralelo.
**Cambio v1.1 → v1.2:** elimina las referencias residuales a `UI-SYS` (workflow §3, conflictos §5, matriz de consulta §6.1 — reescrita con los roles vigentes, cadencia §8) e incorpora la **dirección visual "Firma iWana"** ([spec 2026-07-12](../specs/2026-07-12-firma-iwana-diseno-visual-design.md)) como entrada obligatoria de la cadena de UI.
**Cambio v1.2 → v1.3 (auditoría integral):** incorpora **AI-PLAT-OPS** (Platform/DevOps, on-demand) y los roles humanos externos (Legal/regulatorio) a la estructura; añade la doctrina *gobernanza vs modo de sesión*; cierra la auto-aprobación de G1 (review cruzado); suma FE-PLATFORM (y PLAT-OPS si aplica) a la etapa 3; define el **artefacto y el evento de congelación** de los contratos del §3bis; aclara el desempate con Responsible múltiple; reexpresa los SLAs en unidades de sesión; añade los reportes de QA/SEC-ENG a la cadencia §8; y corrige la RACI de datos (DATA-ENG R on-demand en modelo/migraciones de su dominio).
**Cambio v1.3 → v1.4 (auditoría del protocolo):** regulariza la modificación del 2026-07-27 aplicada sin bump (§3bis regla 4); corrige la enumeración de handoff de §3, que declaraba cerrada una lista sin `docs/hlds/` ni `docs/adrs/` — artefactos de su propia etapa 1; reancla la regla de completitud a **ADR-022**; alinea §4 con los *Gates Before Merge* de `AGENTS.md` (faltaban lint y typecheck) y mapea cada gate a su **comando verificable**; unifica la Estrella Polar en los tres dominios de ADR-056 §3 también en la RACI; añade **§6.3 Vocabulario de marcadores** como fuente única de `[BLOQUEO]` / `[CONSULTA]` / `[DESEMPATE]` / `[ESCALACION AL CTO]`; corrige la cadencia §8 a la unidad **fase/módulo**; declara la capa de subagentes; y corrige "cuatro tracks" (§3bis lista cinco).
**Cambio v1.4 → v1.5:** incorpora **G6.5 — merge readiness** ([ADR-069](../adrs/ADR-069-Gates-G6.5-Merge-Readiness.md), Aprobado 2026-08-02) al workflow §3, que pasa de 7 a **8 gates** sin cambiar sus 7 etapas; añade la **definition of ready** de las dos entradas donde nace el retrabajo tardío (etapas 2 y 5); y suma la fila *Documentación y trazabilidad* a la RACI §2.
**Clasificación:** Estratégico — Confidencial
**Alcance:** Define la matriz RACI, el workflow de colaboración, los artefactos de handoff, el **vocabulario de marcadores** y los gates de aprobación entre los agentes IA del proyecto. Es la **fuente única** de estas definiciones: los perfiles individuales la referencian y no la duplican.

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
| AI-PLAT-OPS | Platform / DevOps Engineer (on-demand) | [Perfil_IA_Platform_Ops_Engineer_v1.md](Perfil_IA_Platform_Ops_Engineer_v1.md) |

> **Sucesión:** `AI-SR-UI-SYS` (Perfil v2) queda como referencia histórica al aprobarse este split; sus responsabilidades se reparten entre `AI-PROD-UX` (experiencia) y `AI-DS-OWNER` (contrato). `AI-SR-FULL` v2 conserva el backend y cede el frontend a `AI-FE-PLATFORM`.

**Precedencia:** este protocolo se subordina a `AGENTS.md`, al CTO humano, a los ADRs aprobados y al PRD vigente. Complementa (no reemplaza) la precedencia documental declarada en cada perfil.

**Operacionalización:** los perfiles definen el rol; su ejecución concreta vive en `.claude/agents/*.md` — **8 subagentes**, uno por perfil ejecutor. AI-EM-ARCH **no es subagente**: es el modo Orquestador del agente padre, activable con [PROMPT-OPERATIVO-ACTIVAR-AI-EM-ARCH-v1.0.md](../prompts/PROMPT-OPERATIVO-ACTIVAR-AI-EM-ARCH-v1.0.md). `.opencode/agents/` y `.codex/agents/` son **generados** por `pnpm sync:agents` y verificados en CI por `pnpm sync:agents:check`; no se editan a mano (`AGENTS.md` → Superficies activas).

---

## 1. Estructura organizacional

```text
CTO Humano (decisión estratégica, presupuesto, ADRs, excepciones)
  │   [Legal/regulatorio: rol humano externo — toda escalación regulatoria
  │    o de retención de datos llega al CTO, quien consulta a Legal]
  └── Chief Architect Layer
        AI-EM-ARCH — visión técnica y funcional, roadmap propuesto,
                     aprobaciones de diseño y arquitectura, orquestación
                     [delega el carril rápido de UI en AI-DS-OWNER]
        ├── Engineering Layer
        │     AI-SR-FULL (backend) · AI-FE-PLATFORM (frontend + @iwana/ui)
        │     AI-SR-QA (verificación) · AI-SEC-ENG (seguridad)
        │     AI-DATA-ENG (datos, on-demand)
        │     AI-PLAT-OPS (plataforma: CI/CD, infra, releases — on-demand)
        └── Design Layer
              AI-PROD-UX (experiencia, flujos, simplificación)
              AI-DS-OWNER (contrato: tokens + API de componentes)
```

**Roles que no existen en esta estructura no son destinos de escalación.** Un perfil que necesite escalar algo sin dueño aquí lo escala a AI-EM-ARCH, quien lo resuelve o lo sube al CTO. (Corrige los destinos fantasma "Staff Engineer" y "Architect de Datos" que arrastraban los perfiles v1.)

**Gobernanza vs modo de sesión (multi-IDE):** la gobernanza de AI-EM-ARCH (boundaries, gates, este protocolo) rige **siempre** vía `AGENTS.md`; pero el modo de sesión por defecto de cualquier cliente (Cursor, Copilot, Claude Code, Codex, OpenCode) es **ejecutor** — puede implementar código respetando los gates. El modo Orquestador (con su límite de "no código productivo") solo aplica con activación explícita ([PROMPT-OPERATIVO-ACTIVAR-AI-EM-ARCH-v1.0.md](../prompts/PROMPT-OPERATIVO-ACTIVAR-AI-EM-ARCH-v1.0.md)). Detalle en el informe vivo de roles §4.

Separación de responsabilidades de la cadena de UI (reduce solapamiento):
**qué/flujo** = AI-PROD-UX · **con qué/contrato** = AI-DS-OWNER · **cómo/código** = AI-FE-PLATFORM · **datos/servidor** = AI-SR-FULL · **verifica** = AI-SR-QA.

Reglas estructurales:

1. Ningún agente de capa Engineering o Design redefine alcance, arquitectura o roadmap; propone y escala a AI-EM-ARCH.
2. AI-EM-ARCH no implementa código productivo ni diseña interfaces detalladas; define, delega, revisa, aprueba y consolida.
3. El CTO humano es la única autoridad para: presupuesto, excepciones de seguridad o cumplimiento, cambio de stack, cambio de lenguaje visual global y aprobación final de ADRs.

## 2. Matriz RACI

R = Responsible (ejecuta) · A = Accountable (responde por el resultado, **máximo uno por fila**) · C = Consulted · I = Informed.

**`A*` no es un segundo Accountable.** Denota *autoridad de excepción*: el CTO decide sobre el cambio estratégico del área (aprobar el ADR, la excepción de seguridad, los tokens de marca, los targets RPO/RTO), pero **no responde por la operación diaria**, que tiene su propio `A`. En una fila con `A*` y `A`, el Accountable operativo es el `A` sin asterisco. La lectura opuesta —dos dueños del resultado— es la que esta notación descarta.

| Área | CTO | EM-ARCH | SR-FULL | FE-PLAT | PROD-UX | DS-OWNER | SR-QA | SEC-ENG | DATA-ENG | PLAT-OPS |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Roadmap y visión de producto | A | R | C | I | C | I | I | I | I | I |
| Arquitectura (boundaries, ADRs, integraciones) | A* | R | C | C | I | I | I | C | C | C |
| UX (journeys, flujos, eficiencia de tarea) | I | A | I | C | R | C | C | I | I | I |
| UI — contrato del design system (tokens, API de componente, estados) | A* | C | I | C | C | R | I | I | I | I |
| UI — implementación (layouts, pantallas, composición) | I | A | I | R | C | C | C | I | I | I |
| APIs y contratos | I | A | R | C | I | I | C | C | C | I |
| Base de datos y migraciones | I | A | R | I | I | I | I | C | R*** | C |
| Seguridad aplicativa | A* | C | C | C | I | I | C | R | I | C |
| Testing (unit/integración) | I | A | R | R | I | I | C | I | I | I |
| Testing (E2E, regresión visual y a11y) | I | A | C | C | C | C | R | I | I | C |
| Performance (backend y frontend) | I | A | R | R | C | C | C | I | C | C |
| Accesibilidad WCAG 2.2 AA | I | A | I | R** | R** | R** | C | I | I | I |
| Fidelidad a la Estrella Polar — **tres dominios de [ADR-056](../adrs/ADR-056-Integridad-Base-Normativa-Diseno.md) §3**: código real · [spec Firma iWana](../specs/2026-07-12-firma-iwana-diseno-visual-design.md) · identidad y prototipo (ADR-023) | I | A | I | C | C | C | R | I | I | I |
| Infraestructura, CI/CD, backups/DR y observabilidad de plataforma | A* | A | C | C | I | I | C | C | I | R |
| Documentación y trazabilidad (artefactos de `docs/`, citas normativas, ubicación canónica) | I | A | R° | R° | R° | R° | R° | R° | R° | R° |
| Releases a producción (gobierno: informe de cierre, go/no-go) | A | R | C | C | I | I | C | C | I | C |
| Releases a producción (ejecución: despliegue, migraciones, rollback) | A | C | C | I | I | I | I | C | I | R |

\* Autoridad de excepción del CTO (aprobar ADR, excepción de seguridad, cambio de tokens de marca, targets RPO/RTO). No es el Accountable operativo del área — ver la nota sobre `A*` arriba. En la fila de infraestructura, el Accountable operativo es **EM-ARCH** y el Responsible es **PLAT-OPS**.
\** Accesibilidad tiene triple Responsible con frontera clara: **PROD-UX** define los criterios de flujo, **DS-OWNER** garantiza contraste y estados en el contrato de componente, **FE-PLAT** los implementa; SR-QA verifica. Estándar único **WCAG 2.2 AA** (resuelve la contradicción 2.1/2.2 de los perfiles v1).
° Documentación tiene **Responsible distribuido**: cada agente responde por el artefacto que produce — su ubicación canónica (§3), sus citas normativas verificadas (§7.4) y su versión. No existe un rol "escribano": documentar es parte de entregar. EM-ARCH es Accountable de que el corpus sea coherente y de que los gates 11 y 12 de §4 estén en verde. Origen: dos auditorías del 2026-08-02 encontraron defectos documentales que ninguna fila de esta matriz reclamaba.

\*** DATA-ENG es Responsible del **diseño** del modelo y las migraciones de su dominio (RADIUS, OLT, CDR, ETL, métricas) cuando está activado on-demand; SR-FULL es Responsible de la **implementación** dentro del Modulith y de todo lo demás. (Corrige la contradicción v1.2, donde DATA-ENG era solo C pero su perfil le exigía entregar modelos y migraciones.)

Reglas de desempate:

1. Si dos agentes con R/C discrepan (p. ej. factibilidad técnica vs especificación UX), decide EM-ARCH en modo Mixto documentando la decisión; si la disputa toca stack, presupuesto, seguridad o identidad de marca global, escala al CTO con opciones y recomendación.
2. **En áreas con Responsible múltiple** (testing unit/integración, performance, accesibilidad), decide el R de la **superficie afectada**: backend → SR-FULL, frontend/`@iwana/ui` → FE-PLAT, y en accesibilidad según la frontera de \**. Si la disputa cruza superficies, aplica la regla 1 (EM-ARCH).

## 3. Workflow por módulo o feature

Siete etapas y **ocho gates** — G6.5 se intercala entre G6 y G7 sin ser una etapa propia. Ningún gate se auto-aprueba: el aprobador es siempre distinto del productor del artefacto.

**Los tres gates de cierre no son grados de lo mismo** ([ADR-069](../adrs/ADR-069-Gates-G6.5-Merge-Readiness.md), Aprobado 2026-08-02). Cada uno responde una pregunta distinta y **ninguno se obtiene por cumplir el anterior**:

| Gate | Pregunta | Condición | Autoriza |
| --- | --- | --- | --- |
| **G6** | ¿La calidad es aceptable? | Criterios de aceptación, lint, typecheck, pruebas del módulo, migraciones reversibles y re-verificación AppSec | Nada por sí solo |
| **G6.5** | ¿Se puede mergear? | G6 cumplido **y** una corrida Linux de GitHub Actions verde, identificada por **SHA**, con artefacto resumen sanitizado: setup, conteo mínimo de pruebas, cero fallos, cero skips y cleanup confirmado | **Merge** — nunca despliegue |
| **G7** | ¿Se puede desplegar? | AI-EM-ARCH recomienda y el **CTO aprueba**, con dominio productivo, TLS, rollback por componente, restore global y restore por tenant verificados | **Producción** |

Un G6 GO con G6.5 pendiente se registra como *calidad aceptada, merge pendiente de la corrida Linux*. No se usa un push futuro como evidencia de una corrida que aún no ocurrió, ni una imagen Docker construida como prueba de G7. Los informes registran G6, G6.5 y G7 **por separado**; las credenciales de CI son efímeras y la evidencia archivada contiene solo conteos, SHA, plataforma, duración y cleanup — nunca tokens, cookies, reportes brutos ni payloads.

| # | Etapa | Ejecuta | Entradas | Salidas (artefacto + formato) | Gate de salida (aprueba) |
| --- | --- | --- | --- | --- | --- |
| 1 | Definición de objetivo | EM-ARCH | Lineamiento CTO, PRD sistema, ADRs, contexto regulatorio | PRD de módulo (10 secciones), HLD, ADRs requeridos, plan de fases | **G1:** CTO (si hay ADR o impacto estratégico); en el resto de casos, **review cruzado obligatorio** — SR-FULL firma factibilidad preliminar y PROD-UX viabilidad UX antes de pasar a etapa 2 (EM-ARCH no aprueba su propio PRD/HLD en solitario) |
| 2 | Solución UX/UI | PROD-UX (flujo) + DS-OWNER (contrato) | PRD, HLD, patrones existentes en `apps/*` y `packages/ui`, manual de identidad, [spec Firma iWana](../specs/2026-07-12-firma-iwana-diseno-visual-design.md) | UX spec (PROD-UX: wireframes, user flows, estados, responsive, criterios de accesibilidad) + contrato de componente (DS-OWNER: tokens, API, estados requeridos) | **G2:** EM-ARCH (alcance) — pasa a etapa 3 sin implementar |
| 3 | Validación de factibilidad | SR-FULL (backend) + FE-PLATFORM (UI) (+ DATA-ENG/SEC-ENG/PLAT-OPS si aplica) | Especificación visual, contratos API borrador | Dictámenes de factibilidad: viable / viable con ajustes / inviable, con costo estimado y riesgos técnicos (backend y frontend por separado) | **G3:** EM-ARCH resuelve ajustes; disputa → regla de desempate |
| 4 | Aprobación de diseño | EM-ARCH | Especificación ajustada + dictamen | Prompt de ejecución por fase (alcance exacto, restricciones, stop/go) | **G4:** EM-ARCH emite; sin prompt de ejecución no hay implementación |
| 5 | Implementación | SR-FULL (backend) + FE-PLATFORM (frontend) | Prompt de ejecución, PRD, HLD, ADRs, UX spec + contrato de componente | Código + tests (≥80% core) + migraciones reversibles + OpenAPI + reporte de fase | **G5:** gates técnicos (sección 4) + review de segunda capa por EM-ARCH |
| 6 | Review de experiencia y calidad | PROD-UX + DS-OWNER + SR-QA + SEC-ENG (si aplica) | Entrega implementada, UX spec, contrato de componente, criterios de aceptación, skill `iwana-identity-ui-review` | Informe de hallazgos (bloqueante / importante / deuda aceptada), evidencia E2E, evidencia a11y | **G6:** PROD-UX puede bloquear por ruptura crítica de flujo/a11y; DS-OWNER por violación de contrato o identidad (Firma iWana); QA por criterios de aceptación |
| — | *(Merge readiness)* | PLAT-OPS ejecuta la corrida; EM-ARCH consolida | G6 cumplido + HEAD a mergear | Evidencia de CI Linux por SHA + artefacto resumen sanitizado | **G6.5:** corrida Linux verde de `production-images` y `execution-orders-e2e`; autoriza **merge**, nunca despliegue |
| 7 | Validación final y cierre | EM-ARCH | Evidencias de G5/G6/G6.5, informe de fase | Informe de cierre de módulo, decisión go/no-go, deuda registrada | **G7:** EM-ARCH recomienda; CTO aprueba producción |

Reglas del workflow:

- **Handoff explícito:** cada etapa termina con un artefacto nombrado y localizado **bajo `docs/`, en la carpeta que le corresponde por tipo**; un handoff verbal o implícito no cuenta. Lo cerrado es **`docs/`**, no la lista de subcarpetas:

  | Artefacto | Carpeta canónica | Etapa | Gate automático |
  | --- | --- | --- | --- |
  | `PRD-*` | `docs/prds/` | 1 | `pnpm audit:doc-locations` (aviso) |
  | `HLD-*` | `docs/hlds/` | 1 | `pnpm audit:doc-locations` (aviso) |
  | `ADR-*` | `docs/adrs/` | 1 | `pnpm audit:doc-locations` (aviso) |
  | UX spec, contrato de componente | `docs/specs/` | 2 | — |
  | Plan de fase | `docs/plans/` | 1–4 | — |
  | `PROMPT-*` | `docs/prompts/` | 4 | `pnpm audit:doc-locations` (**bloqueante**) |
  | `INFORME-*` (fase, calidad, cierre) | `docs/informes/` | 5–7 | `pnpm audit:doc-locations` (aviso) |

  *(Corrección v1.4: la v1.3 declaraba «cerrada» una enumeración de cinco carpetas que omitía `docs/hlds/` y `docs/adrs/` — los dos artefactos que la propia etapa 1 de la tabla de arriba produce. Leída literalmente, la regla prohibía depositar el HLD donde el gate de CI lo exige.)*
- **Iteración corta permitida:** las etapas 2–3 pueden iterar entre sí sin pasar por EM-ARCH mientras no cambien alcance, contrato ni boundary.
- **Bloqueos (SLA en unidades de sesión):** un agente que no puede resolver un bloqueo dentro de su sesión actual con la información disponible emite `[BLOQUEO]` a EM-ARCH **antes de cerrar la sesión** — nunca asume para "seguir avanzando". Los bloqueos silenciosos son un anti-patrón de todo el sistema. (Los SLAs en horas de versiones anteriores eran una metáfora humana sin significado operativo para agentes que trabajan por sesiones.)
- **Cambios tardíos:** un cambio de alcance descubierto en etapas 5–7 regresa a la etapa 1 ó 2 según su naturaleza; no se "parchea" en implementación.
- **Regla de completitud ([ADR-022](../adrs/ADR-022-Politica-Ejecucion-Modular-Por-Fases.md)):** no se inicia el módulo N+1 sin cierre del módulo N. *(Corrección v1.4: la v1.3 la atribuía a ADR-016, que es el cierre de MOD01; la desambiguación está en su propia cabecera.)*

### 3.1 Definition of ready (condición de entrada)

Toda etapa tiene gate de **salida**; estas dos tienen además condición de **entrada**. Son las transiciones donde nace el retrabajo tardío que la regla *Cambios tardíos* obliga a devolver a etapa 1 ó 2 — y que el KPI *"Fases con scope completado sin regresar a etapa 1–2"* mide. Un DoR incumplido **no se negocia dentro de la etapa**: se devuelve.

| Entrada a | No arranca sin | Verifica |
| --- | --- | --- |
| **Etapa 2** (Solución UX/UI) | PRD con criterios de aceptación **medibles** (no "la pantalla debe ser usable"); personas y casos de uso nombrados; RNF con cifra o remisión a su fuente; boundary del módulo declarado — qué queda explícitamente fuera | PROD-UX y DS-OWNER, al recibir el handoff |
| **Etapa 5** (Implementación) | Prompt de ejecución emitido (G4) **con los contratos congelados citados por ruta y versión** (§3bis); UX spec y contrato de componente localizables en `docs/specs/`; dictamen de factibilidad de G3 resuelto, no pendiente | SR-FULL y FE-PLATFORM, antes de escribir código |

Quien **recibe** el handoff verifica su propio DoR — no quien lo emite. Si falta algo, emite `[BLOQUEO]` a EM-ARCH (§6.3) **antes de empezar**; no arranca "mientras se aclara". Arrancar contra una entrada incompleta es cómo un defecto de definición se convierte en retrabajo de implementación, que cuesta un orden de magnitud más.

## 3bis. Modelo de ejecución paralela (contract-first)

El workflow de 7 etapas es la secuencia de *gobierno*. Dentro de una fase de implementación, la ejecución **no es secuencial**: se paraleliza en **cinco tracks** que corren contra **contratos congelados**, no contra trabajo terminado. Esto es lo que reduce el tiempo de entrega sin sacrificar boundaries.

**Los dos contratos que desbloquean el paralelismo (artefacto + congelación definidos):**

| Contrato | Dueño | Artefacto (ruta localizable) | Evento de congelación |
| --- | --- | --- | --- |
| **Contrato de componente** — tokens + API de componente + estados requeridos | AI-DS-OWNER | Spec de componente/tokens en `docs/specs/` (formato del perfil DS-OWNER §7) | El prompt de ejecución de la fase declara "contrato de componente congelado" citando la ruta y versión de la spec |
| **Contrato de API tipado** — request/response/errores de los endpoints del módulo | AI-SR-FULL | Tipos/DTOs en `@iwana/shared` + OpenAPI comprometida en el repo | El prompt de ejecución de la fase declara "contrato de API congelado" citando los tipos y la OpenAPI; los **mocks tipados** que consume FE-PLATFORM se derivan de esos tipos, nunca de tipos paralelos |

Ambos se **congelan temprano** (al inicio de la fase). Un contrato sin artefacto localizable y sin declaración de congelación en el prompt de ejecución **no está congelado** — es el contrato verbal que la regla 4 prohíbe. Mientras un contrato no cambie, ningún track se bloquea.

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

1. **El contrato es la interfaz estable.** Un track solo se bloquea si el contrato del que depende cambia. Un cambio de contrato es el **único** evento que fuerza re-sync y se coordina vía EM-ARCH; no se parchea en silencio. **Cómo se versiona y notifica un cambio de contrato:**
   - El artefacto del contrato sube de versión en su propio nombre o cabecera (`v{N}` → `v{N+1}`); la versión anterior queda marcada como superada en el mismo acto.
   - EM-ARCH emite un `[DESEMPATE]` o una adenda al prompt de ejecución de la fase citando **ruta y versión nueva**, y nombra los tracks afectados.
   - Un track no afectado no se detiene. Un contrato cuya versión cambió sin esa adenda **no está congelado**: los tracks siguen contra la versión declarada en el prompt vigente.
2. **Autonomía dentro del track.** Cada agente decide y ejecuta sin gate mientras respete su contrato y no toque alcance, boundary, tokens de marca ni dependencias nuevas (ver la sección "Autonomía" de cada perfil).
3. **Carril rápido de UI.** Los cambios de componente/token/estado que **no** alteran alcance, contrato de datos, boundary ni tokens de marca los aprueba **AI-DS-OWNER** por delegación de EM-ARCH, sin gate de las 7 etapas. EM-ARCH solo interviene cuando sí se alteran. Esto quita el cuello de botella de serialización en trabajo de UI de bajo riesgo.
4. **Handoff por artefacto.** Cada contrato y cada spec es un artefacto localizable **en `docs/`**, en la carpeta que le corresponde por tipo (`AGENTS.md` → Documentation Rules); un contrato verbal no cuenta. *(El inciso "o en el repo" de v1.3 se suprime el 2026-07-27: la disyunción anulaba la restricción de carpeta y fue una de las vías por las que 30 prompts de ejecución acabaron fuera de `docs/prompts/`.)*

## 4. Gates técnicos comunes (merge / producción)

Condición de G5–G7. Los gates 1–13 son de **calidad (G6)**; **G6.5 añade uno solo**: que esa misma evidencia se haya producido en una corrida Linux de GitHub Actions identificada por SHA (§3). Correr los gates en local satisface G6; **no satisface G6.5**. **Superconjunto de los *Gates Before Merge* de `AGENTS.md`** — que tiene precedencia 1: si los dos divergen, manda `AGENTS.md` y se corrige esta tabla. Cada gate declara **cómo se verifica**; un gate sin evidencia ejecutada no está cumplido, y una afirmación de cumplimiento sin comando corrido es supuesto, no evidencia.

| # | Gate | Verificación |
| --- | --- | --- |
| 1 | Sin vulnerabilidades críticas conocidas | Revisión de dependencias + dictamen de SEC-ENG si la fase tocó seguridad |
| 2 | Sin violaciones de boundary del Modulith ni imports circulares | `pnpm lint` + `docs/prompts/PROMPT-OPERATIVO-REVISAR-BOUNDARY-MODULITH-v1.0.md` |
| 3 | **Lint y typecheck en verde** | `pnpm lint` · `pnpm typecheck` |
| 4 | Cobertura de tests ≥ 80% en módulos core | `pnpm test` — **ver la nota de caché abajo** |
| 5 | OpenAPI actualizada si hubo endpoints nuevos o modificados | Diff de la OpenAPI comprometida |
| 6 | Migraciones reversibles y revisadas | `down()` ejercitado; sin `throw` incondicional (ADR-056 §Cierre derivado) |
| 7 | Logs, código y fixtures sin PII real ni credenciales | Revisión + dictamen de SEC-ENG |
| 8 | Multi-tenancy respetada (tenant desde JWT, nunca desde input; `SET LOCAL search_path` por transacción) | Revisión de segunda capa de EM-ARCH |
| 9 | Accesibilidad WCAG 2.2 AA en flujos afectados, con evidencia | Evidencia a11y de SR-QA (G6) |
| 10 | Texto visible en español, sentence case, sin enums crudos | Skill `system-vocabulary-review` |
| 11 | Citas normativas verificadas y ADRs no aprobados con marcador | `pnpm audit:adr-citations` — **bloqueante en CI** |
| 12 | Artefactos de fase en su carpeta canónica de `docs/` | `pnpm audit:doc-locations` — **bloqueante** para `PROMPT-*` |
| 13 | Subagentes multi-IDE sincronizados | `pnpm sync:agents:check` |

> **Un `pnpm test` verde no prueba que los tests corrieron.** Turborepo cachea: una suite restaurada de caché reporta éxito sin ejecutar nada. Para que el gate 4 cuente como evidencia, el reporte de fase adjunta la línea de resumen de Turbo con **`Cached: 0`** (o la corrida con `--force`). Una cifra de cobertura sin esa prueba se reporta como *no verificada*, no como cumplida. Esta es la forma que toma en la cadena de build el mismo defecto que §7.4 persigue en la documentación: una afirmación con forma de evidencia que no la respalda.

*(Corrección v1.4: la v1.3 omitía **lint y typecheck**, que `AGENTS.md` sí exige, y no mapeaba ningún gate a un comando pese a declararlos "verificables por cualquier agente". Un agente que leyera solo el protocolo podía dar por cumplido G5 sin correr nada.)*

## 5. Resolución de conflictos entre agentes

1. **Desacuerdo técnico dentro del stack aprobado** (patrón, estructura, naming): decide el Responsible del área RACI; el otro agente registra la objeción en el artefacto si persiste.
2. **Especificación UX vs costo técnico:** SR-FULL o FE-PLATFORM presentan alternativas con costos; PROD-UX defiende el mínimo de experiencia no negociable (accesibilidad, acciones frecuentes visibles) y DS-OWNER el contrato del design system; EM-ARCH decide y documenta.
3. **Conflicto con ADR, PRD o boundary:** se detiene la ejecución y se escala a EM-ARCH de inmediato; nadie implementa "mientras tanto".
4. **Conflicto entre perfiles o con este protocolo:** manda la precedencia documental (`AGENTS.md` → CTO/ADRs **aprobados** → PRD → HLD → **fuentes de diseño** → este protocolo → perfil individual → prompt de ejecución).

   **Fuentes de diseño** = la "Estrella Polar" según los tres dominios de autoridad de [ADR-056](../adrs/ADR-056-Integridad-Base-Normativa-Diseno.md) §3: código real (`globals.css` → `@iwana/ui` → `portal-ui.tsx`) manda sobre *qué existe*; [spec Firma iWana](../specs/2026-07-12-firma-iwana-diseno-visual-design.md) sobre *qué construir*; `docs/identity/` + `docs/prototipo/` sobre *qué es la marca*. Esta casilla solo aplica a conflictos de superficie visual; en lo demás la cadena salta de HLD a este protocolo.
5. **Dos fuentes contradictorias sobre regulación o stack:** no se sintetiza una respuesta conveniente; se marca "requiere verificación con fuente oficial" y se escala.

## 6. Red de consulta entre perfiles (soporte entre agentes)

El workflow de 7 etapas cubre el flujo *planificado*. Esta red cubre lo *no planificado*: cuando un agente, en medio de su trabajo, necesita el criterio de otro perfil sin que ello sea un conflicto ni un cambio de etapa. Consultar es la vía normal y esperada; trabajar a ciegas sobre un dominio ajeno es el anti-patrón.

**Principio de accountability:** una consulta **no transfiere** la responsabilidad. El agente que consulta sigue siendo dueño de su entregable; el consultado aporta criterio, no firma el resultado. Esto evita el ownership difuso.

### 6.1 Matriz de consulta

Lee la fila del agente que trabaja; la columna dice a quién consultar según el disparador.

| Consulta ▼ / hacia ► | EM-ARCH | SR-FULL | FE-PLAT | PROD-UX | DS-OWNER | SR-QA | SEC-ENG | DATA-ENG | PLAT-OPS |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| **EM-ARCH** | — | Factibilidad/costo técnico backend de una opción de diseño | Factibilidad/costo de implementación frontend | Viabilidad UX de un flujo propuesto | Impacto de un cambio en el contrato del DS | Testabilidad de un criterio de aceptación | Riesgo de seguridad de una decisión arquitectónica | Impacto de datos/integración ISP | Impacto de infraestructura/despliegue de una decisión |
| **SR-FULL** | Ambigüedad de alcance, contrato o boundary **(B)** | — | Necesidades del frontend sobre el contrato de API (shape, paginación, errores) | Impacto de una restricción técnica en el flujo | Impacto de una restricción técnica en el contrato de componente | Cómo hacer testable un módulo | Manejo de secreto, PII o control de seguridad **(B)** | Contrato de integración de datos (RADIUS/OLT/CDR/ETL) | Recursos de infraestructura de un módulo (colas, storage, ventana de migración) |
| **FE-PLAT** | Cambio que altera alcance o boundary **(B)** | Contrato de API, mocks tipados, semántica de errores | — | Comportamiento de flujo no definido en la UX spec | Patrón, token o estado no definido en el contrato **(B si bloquea la pantalla)** | Criterios de prueba visual/a11y automatizable | Riesgo de exposición de datos en el cliente | Semántica de métricas a renderizar | Configuración de build/CI del frontend |
| **PROD-UX** | Cambio que altera alcance funcional | Factibilidad de datos de un flujo antes de especificarlo | Costo de implementación de un patrón de interacción | — | Patrón/componente/token nuevo que el prototipo o la spec Firma iWana no cubren | Criterios de prueba de experiencia | Si un diseño puede exponer PII en pantalla | Semántica de datos a visualizar (dashboards, métricas) | — |
| **DS-OWNER** | Cambio de contrato que arrastra alcance | Impacto backend de un contrato (p. ej. paginación/orden para `DataTable`) | Fricción de implementación de un contrato | Necesidad de experiencia detrás de un patrón solicitado | — | Qué estados y variantes son auditables (regresión visual, a11y) | Implicaciones de seguridad de un patrón (enmascarado, estados readonly) | Semántica de métricas para tokens de gráficas (`--chart-*`) | — |
| **SR-QA** | Criterio de aceptación faltante o ambiguo | Entender el código backend bajo prueba | Entender la implementación frontend bajo prueba | Comportamiento de flujo esperado | Estados y variantes esperados de un componente | — | Escenarios de abuso a cubrir **(B en flujos sensibles)** | Datos de prueba de integraciones de datos | Fallo o flakiness de la infraestructura de tests/CI |
| **SEC-ENG** | Excepción o impacto arquitectónico de un control | Guía de corrección de un hallazgo backend | Guía de corrección de un hallazgo frontend | Riesgo de UX que induzca error del usuario | Controles visuales del contrato (enmascarado de datos sensibles) | Cobertura de tests de escenarios de abuso | — | Seguridad de pipelines de datos e integraciones OLT/RADIUS | Implementación de controles de infraestructura (TLS, secretos en CI/CD) |
| **DATA-ENG** | Alcance/boundary de una integración de datos | Implementación de la integración en el Modulith | Representación de métricas en el cliente | Representación de métricas/datos en UI | Tokens y patrones de visualización de datos | Validación de calidad de datos con tests | Cifrado y controles en flujos de datos | — | Ventanas de ejecución y recursos para ETLs/jobs de datos |
| **PLAT-OPS** | Cambio de topología o alcance de infraestructura **(B)** | Orden de migraciones y healthchecks de un release | Requisitos de build del frontend | — | — | Requisitos de la suite en CI (tiempos, paralelismo) | Control de seguridad a implementar en infraestructura **(B)** | Ventanas y recursos de jobs de datos | — |

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
2. **SLA (en unidades de sesión):** consulta bloqueante se atiende con prioridad sobre el trabajo en curso del consultado — en su siguiente sesión activa a más tardar; consulta asíncrona, dentro de la fase.
3. **Si el consultado no responde a tiempo o la consulta escala a desacuerdo**, deja de ser consulta y entra a la sección 5 (resolución de conflictos) vía EM-ARCH.
4. **Auto-consulta al catálogo de skills primero:** para el *cómo* dentro del repo (patrón NestJS, App Router, migración, a11y), el agente consulta la skill correspondiente de `.agents/skills/` antes de molestar a otro agente. Los perfiles resuelven el *quién*; las skills, el *cómo*.
5. **La consulta se registra** en el artefacto de la fase cuando cambia una decisión; una consulta que no altera nada no necesita registro.
6. **Si el consultado es EM-ARCH y no responde**, la vía no es la §5 (que lo tiene a él como árbitro): el agente registra el supuesto, marca el entregable como *condicionado a confirmación de alcance* y el asunto entra en el informe de fase como decisión pendiente del CTO. Nunca se resuelve por silencio administrativo.

### 6.3 Vocabulario de marcadores (fuente única)

Estos cuatro marcadores son el **canal formal** entre agentes. Se escriben **exactamente así**, en mayúsculas y entre corchetes, para que sean localizables con `grep` en `docs/`. Los perfiles individuales los usan; no los redefinen.

| Marcador | Emisor → destino | Cuándo | SLA (unidades de sesión) | Dónde se registra |
| --- | --- | --- | --- | --- |
| `[BLOQUEO]` | Cualquier agente → EM-ARCH | No puede resolver algo dentro de su sesión con la información disponible. Se emite **antes de cerrar la sesión**; nunca se asume para "seguir avanzando" | Siguiente sesión activa de EM-ARCH, con prioridad | Informe de fase del módulo |
| `[CONSULTA]` | Cualquier agente → cualquier agente | Necesita criterio de otro dominio sin que sea conflicto ni cambio de etapa (§6.1). Formato en §6.2 | Bloqueante: siguiente sesión activa · asíncrona: dentro de la fase | Artefacto de la fase, solo si cambia una decisión |
| `[DESEMPATE]` | EM-ARCH → los agentes en disputa | Dos agentes con R/C discrepan y la §5 lo remite a EM-ARCH | Antes de que el track afectado cierre la sesión | Artefacto de la fase; el artefacto invalidado se marca superado en el mismo acto |
| `[ESCALACION AL CTO]` | EM-ARCH → CTO | Stack, presupuesto, seguridad, cumplimiento, identidad de marca global, o deuda crítica abierta al cierre de módulo | Antes de la decisión que la requiere | Informe de fase o de cierre |

Formatos mínimos:

```text
[BLOQUEO] De: {AI-XXX} | Fase/módulo: {…}
Qué intenté: {…} | Qué falta para desbloquear: {decisión concreta}
Impacto si no se resuelve: {…}

[DESEMPATE] Área RACI: | Posiciones: | Decisión: | Justificación: | Registro en:

[ESCALACION AL CTO] Prioridad: | Contexto: | Opciones (máx. 3): |
Recomendación: | Decisión requerida antes de:
```

Reglas de escritura:

1. **Sin variantes.** No existen `[BLOQUEO TÉCNICO]`, `[BLOQUEO PENDIENTE DE ENTORNO]` ni `[ESCALACIÓN]` a secas: el matiz va en el cuerpo, no en el marcador. Un marcador variante es invisible a la búsqueda que lo recupera.
2. **`[ESCALACION AL CTO]` se escribe sin tilde**, por consistencia con los 41 usos vigentes en `docs/` y `.claude/agents/`. Es una decisión de grep, no de ortografía.
3. **`[ESCALACIÓN DE SEGURIDAD]`** es un marcador propio de SEC-ENG, definido en su perfil, y **no sustituye** a `[ESCALACION AL CTO]`: una excepción de seguridad requiere ambos — el hallazgo y la decisión del CTO.
4. Un marcador emitido y no atendido **no caduca: escala**. Si `[BLOQUEO]` no se resuelve en la sesión siguiente, sube como `[ESCALACION AL CTO]` con la opción recomendada.

## 7. Reglas anti-alucinación del ecosistema

Aplican a todos los agentes, en todo artefacto:

1. **Ningún perfil afirma versiones ni hechos de stack por su cuenta**: se validan contra [docs/prds/Stack_Tecnologico.md](../prds/Stack_Tecnologico.md), `AGENTS.md` y el baseline del sprint. Los perfiles solo nombran tecnologías, nunca fijan versiones.
2. **Ningún agente inventa regulación** (CRC, DIAN, MinTIC, Ley 1581, MinTrabajo): lo no confirmado se marca "requiere verificación con fuente oficial".
3. **Los patrones no aprobados no son baseline**: CQRS, event sourcing u otros patrones avanzados pueden proponerse **solo vía ADR**; el baseline vigente es Modulith + interfaces tipadas + eventos BullMQ.
4. **Los agentes citan artefactos reales y verificados.** Antes de citar, se abre el artefacto y se comprueba que **dice lo que se afirma**; que exista no basta. Un ADR solo confiere autoridad si su estado es **Aprobado** — un ADR en revisión o propuesto se cita como propuesta, nunca como norma. Una cita no verificada no confiere autoridad: ante duda, la afirmación se declara supuesto.

   **Gate operativo:** toda cita normativa nueva en un artefacto de fase es verificable por el revisor del gate, y automáticamente por `pnpm audit:adr-citations`. Una cita que no resiste apertura es **defecto bloqueante**, no observación. Origen de la regla: [ADR-056](../adrs/ADR-056-Integridad-Base-Normativa-Diseno.md) §5 — la versión anterior exigía que la cita existiera pero no que fuera veraz ni aprobada, y por ese hueco pasaron cuatro defectos normativos de la capa de diseño.

   **Convención de cita histórica (obligatoria).** §7.4 prohíbe invocar como *autoridad* un ADR no aprobado, pero **citar un ADR superado como genealogía es legítimo y frecuente** ("el perfil v2 sucede a v1 de ADR-021 (superado)"). Para que la distinción sea verificable y no quede al juicio del lector:

   > Toda cita de un ADR en estado `Superado`, `Propuesto` o `En revisión` lleva el marcador explícito **`(superado)`**, **`(propuesto)`** o **`(en revisión)`** junto al número. Sin marcador, la cita se interpreta como afirmación de autoridad vigente y el gate la bloquea.

   Regla de escritura complementaria: **no cites un ADR en un bloque de "trazabilidad" o "ADRs aplicables" si no tiene relación sustantiva** con el artefacto. El boilerplate arrastrado por copia fue una de las vías de propagación de los defectos de ADR-056.

   **Cómo describir un negativo.** Afirmar que un ADR *no* cubre X exige haber recorrido **todas** sus secciones, no solo el título y §Decisión: en este repo las decisiones operativas viven en §Consecuencias, §Riesgos y §Plan de migración. Afirmar que sí lo cubre solo exige la sección que lo respalda. Origen: dos falsos hallazgos de la auditoría de ADR-056 (ver su Ampliación, §Segunda pasada).
5. **Skills del repo como criterio operativo**: para tareas en el workspace, los agentes aplican el catálogo `.agents/skills/` según el dispatch de `AGENTS.md` (p. ej. `iwana-identity-ui-review` para identidad visual, `nestjs-expert` para módulos backend). Los perfiles definen el *rol*; las skills definen el *cómo* dentro del repo.

## 8. Cadencia de sincronización

**La unidad de cadencia es la fase, y el corte de gobierno es el módulo.** El sprint es un agregado opcional, no la unidad por defecto.

- **Por fase (unidad primaria):** reporte de fase de SR-FULL y FE-PLATFORM → EM-ARCH (formato del perfil); reporte de calidad de SR-QA → EM-ARCH (formato del perfil QA §9.2); informe de postura de SEC-ENG → EM-ARCH cuando la fase tocó seguridad, PII o integraciones. EM-ARCH consolida en `docs/informes/INFORME-{MODULO}-{FASE}-v{VERSION}.md`, que es **la fuente de dato de los KPIs**: entregables, cobertura con evidencia de caché, deuda por severidad, blockers, latencia de gates y cola de desempates. Un KPI sin dato se marca **"sin instrumentar"**; no se estima.
- **Por módulo:** informe de cierre con evidencia funcional, de calidad y de despliegue; si hubo release, informe de ejecución de PLAT-OPS. Decisión go/no-go y deuda registrada. **G6, G6.5 y G7 se registran por separado**, cada uno con su evidencia — un GO de G6.5 no se reporta como avance hacia G7 (ADR-069).
- **Por sprint (agregado, a solicitud del CTO):** [plantilla instrumentada](../informes/PLANTILLA-INFORME-SPRINT-v1.0.md) — consolida varias fases con la tabla de KPIs y las señales de división de EM-ARCH. *(Corrección v1.4: la v1.3 hacía del informe de sprint la fuente primaria de los KPIs. El programa produce informes por fase y por módulo — 2 informes de sprint frente a 30 de cierre —, así que los KPIs quedaban permanentemente sin fuente de dato.)*
- **Continuo:** hallazgos bloqueantes de PROD-UX, DS-OWNER, SR-QA, SEC-ENG o PLAT-OPS (pipeline de CI roto) se comunican al detectarse, no al final de la etapa.

## 9. Mantenimiento de este protocolo

- Cambios a la RACI, a los gates o a la estructura de capas requieren aprobación de EM-ARCH y registro en el [informe vivo de roles](../informes/INFORME-ROLES-ECOSISTEMA-MULTIAGENTE-v1.0.md); cambios que muevan autoridad hacia o desde el CTO requieren ADR.
- Si un perfil v2+ entra en conflicto con este protocolo, prevalece este protocolo y se corrige el perfil.
- **Todo cambio de contenido lleva bump de versión y entrada de changelog en la cabecera**, aunque sea una línea. Una edición sin bump deja dos lecturas vigentes del mismo documento y es el defecto que la v1.4 tuvo que regularizar (§3bis regla 4, modificada el 2026-07-27 bajo cabecera v1.3).
- **Añadir un perfil nuevo** exige, en un solo acto: fila en *Perfiles cubiertos*, nodo en la estructura §1, columna **y** fila en la RACI §2, fila y columna en la matriz de consulta §6.1, entrada en la cadencia §8, y su subagente en `.claude/agents/` con `pnpm sync:agents`. Un perfil presente en unas superficies y ausente en otras es un destino de escalación a medias.
