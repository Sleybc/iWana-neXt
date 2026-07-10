# INFORME — Auditoria de Skills del Workspace

**Modo activo:** Mixto
**Version:** 1.2
**Estado:** Aprobado
**Fecha:** 2026-07-09
**Convencion documental:** {TIPO}-{MODULO}-{FASE}-v{VERSION}.md

## Vinculos de trazabilidad

- Plantilla base: docs/informes/TEMPLATE-INFORME-FASE-v1.0.md
- Fuente de gobernanza: AGENTS.md
- Fuente de uso de skills: .agents/skills/README.md
- Politica de ejecucion: ADR-022

---

## Identificacion

- Modulo: SISTEMA
- Fase: SKILLS-AUDITORIA
- Sprint: N/A
- Fecha: 2026-03-12
- Responsable principal: GitHub Copilot

## 1. Resumen ejecutivo

- Objetivo de la fase: auditar la carpeta .agents/skills para detectar inconsistencias estructurales, duplicados, dependencias inciertas y skills fuera de scope para iWana neXt.
- Resultado alcanzado: la auditoria original redujo el catalogo a un set core operativo y las actualizaciones posteriores dejaron el estado vivo alineado al repo actual: 47 skills activas documentadas en `.agents/skills` (ver reconciliacion del 2026-07-09), 12 entradas habilitadas por `skills-lock.json` (10 de workflow + `skill-creator` + `ui-ux-pro-max`), sin directorio local `.agents/skills-archive/` y con referencias legacy `docs/superpowers/*` migradas a `docs/specs/*` y `docs/plans/*`.
- Estado: Completa

## 2. Metodologia aplicada

- Se inventariaron los puntos de entrada reales a partir de archivos SKILL.md en .agents/skills.
- Se contrasto el inventario real contra el catalogo declarado en .agents/skills/README.md.
- Se revisaron muestras manuales de skills core, skills duplicadas, skills sospechosas y skills claramente fuera de scope.
- Se cruzaron los hallazgos contra la gobernanza definida en AGENTS.md, CLAUDE.md y .github/copilot-instructions.md.
- Se evitaron ejecuciones peligrosas; la validacion funcional se hizo por estructura, dependencias declaradas y rutas referenciadas.

## 3. Hallazgos confirmados

### 3.1 Inventario inflado y documentacion desactualizada

- El inventario real detectado contiene 714 archivos SKILL.md dentro de .agents/skills.
- El catalogo raiz aun declara 179+ skills, lo que genera una divergencia material de discoverability y mantenimiento.
- Existen subskills anidadas que amplian el universo real de entrada, por ejemplo app-builder/templates y game-development/\*.

### 3.2 Anomalias estructurales en aliases raiz

- Los paths .agents/skills/docx, .agents/skills/pdf, .agents/skills/pptx y .agents/skills/xlsx no son carpetas; son archivos pequenos que solo redirigen a variantes oficiales.
- Esto rompe la expectativa documentada en el README raiz, que describe una carpeta por skill con SKILL.md obligatorio.
- Las variantes canonicamente estructuradas son docx-official, pdf-official, pptx-official y xlsx-official.

### 3.3 Nombres no canonicos o de baja calidad semantica

- Se confirmaron nombres redundantes o poco mantenibles, por ejemplo c4-architecture-c4-architecture y application-performance-performance-optimization.
- Tambien existen familias con prefijos heterogeneos que reducen claridad operativa, por ejemplo `error-debugging-*`, `error-diagnostics-*`, `code-refactoring-*` y `codebase-cleanup-*`.

### 3.4 Solapamientos y duplicados funcionales

- error-debugging-error-analysis y error-diagnostics-error-analysis son funcionalmente equivalentes; la comparacion de contenido mostro diferencia practicamente nominal en el encabezado.
- error-debugging-error-trace y error-diagnostics-error-trace no son identicos byte a byte, pero cubren el mismo dominio y compiten por el mismo trigger operativo.
- Existen otros grupos con alto riesgo de solapamiento: TDD, code review, context engineering, React, database migrations y performance review.

### 3.5 Exceso de skills fuera de scope del repo

- AGENTS.md define como prioritarias unas pocas skills alineadas al stack real: testing-patterns, playwright-skill, nestjs-expert, nextjs-app-router-patterns, monorepo-architect, core-components, frontend-dev-guidelines, tailwind-patterns, wcag-audit-patterns e i18n-localization.
- La carpeta actual mezcla ese nucleo con un volumen muy alto de skills ajenas al contexto del repo: pentesting ofensivo, growth marketing, game development, blockchain, stacks no usados y automatizaciones de terceros sin demanda documentada.
- Una muestra controlada de 22 skills claramente fuera de scope fue confirmada sin ambiguedad durante la auditoria.

### 3.6 Dependencias y operabilidad incierta

- Muchas skills son validas a nivel de estructura, pero dependen de herramientas externas, runners, MCPs o ecosistemas que no estan respaldados por evidencia visible en este workspace.
- Esto no implica que esten rotas, pero si que su valor operativo dentro de iWana neXt es incierto y aumenta la deuda de gobernanza.

## 4. Evidencia funcional

- Flujo probado: inventario de archivos, lectura de catalogo, validacion de tipos de alias raiz, comparacion de contenido de skills duplicadas, muestreo de skills core y fuera de scope, y ejecucion controlada de archivado.
- Datos de prueba usados: estructura real del workspace y contenido de archivos SKILL.md.
- Resultado observado:
  - 714 entradas con SKILL.md detectadas durante la auditoria inicial.
  - 4 aliases raiz confirmados como archivos y no como carpetas.
  - 1 duplicado funcional confirmado con diferencias nominales minimas.
  - 1 par adicional de solapamiento fuerte confirmado en error tracing.
  - 23 skills quedaron activas tras la auditoria original.
  - El estado vivo al 2026-05-19 registraba 41 skills documentadas en `.agents/skills`; tras la reconciliacion del 2026-07-09 el catalogo declara 47.
  - `skills-lock.json` (raiz del repo) habilita 12 entradas para la sesion operativa actual: 10 workflow skills + `skill-creator` + `ui-ux-pro-max`.
  - El repo ya no mantiene un directorio local `.agents/skills-archive/`.

## 5. Matriz de clasificacion

| Categoria                                | Estado                  | Decision recomendada                                  |
| ---------------------------------------- | ----------------------- | ----------------------------------------------------- |
| Skills core alineadas al repo            | Vigentes                | Mantener y marcar como core                           |
| Aliases raiz docx/pdf/pptx/xlsx          | Inconsistentes          | Sustituir por referencias canonicamente estructuradas |
| Duplicados funcionales de errores        | Confirmados             | Fusionar o deprecar el alias secundario               |
| Nombres redundantes                      | Confirmados             | Renombrar a formas canonicas                          |
| Skills fuera de scope del repo           | Confirmadas por muestra | Marcar como candidatas a deprecacion                  |
| Skills con tooling externo no verificado | Inciertas               | Marcar como experimental o external                   |

## 6. Ejecucion realizada

### 6.1 Curacion del set activo

- Se mantuvieron activas solo las skills consideradas core para el proyecto.
- Set final activo: architect-review, architecture-decision-records, auth-implementation-patterns, backend-security-coder, bullmq-specialist, core-components, docker-expert, frontend-dev-guidelines, frontend-security-coder, i18n-localization, mermaid-expert, monorepo-architect, nestjs-expert, nextjs-app-router-patterns, openapi-spec-generation, playwright-skill, postgresql, security-auditor, tailwind-patterns, test-driven-development, testing-patterns, typescript-expert y wcag-audit-patterns.

### 6.2 Tratamiento del material no activo

- Durante la auditoria original se uso un archivo local temporal para separar material no activo.
- En el estado actual del repo ese directorio ya no existe.
- Las decisiones historicas de descarte, hold y restauracion se conservan en este informe y en el manifiesto del catalogo activo.

### 6.3 Sincronizacion documental

- Se actualizo .agents/skills/README.md para reflejar el set core activo.
- Se creo .agents/skills/INDEX.md como manifiesto formal de estados core, candidate, archived y hold.
- Se creo .agents/skills/MANIFEST.json como representacion legible por maquina del catalogo vigente.
- En la actualizacion 2026-05-19 se limpiaron referencias documentales a `docs/superpowers/*` y se retiro la dependencia operativa hacia `.agents/skills-archive/`.

## 7. Plan de limpieza por lotes

### Lote 1 — Catalogo y discoverability

- Completado: .agents/skills/README.md fue actualizado para reflejar el set core real.
- Pendiente: corregir referencias historicas a aliases raiz no canonicos si reaparecen durante restauraciones futuras.
- Completado: se creo .agents/skills/INDEX.md como indice maestro de skills con estados operativos.

### Lote 2 — Correccion estructural

- Eliminar el uso operativo de docx, pdf, pptx y xlsx como aliases raiz.
- Establecer docx-official, pdf-official, pptx-official y xlsx-official como nombres canonicos mientras no exista una migracion controlada.

### Lote 3 — Consolidacion de duplicados

- Unificar familias `error-debugging-*` y `error-diagnostics-*` bajo un solo namespace.
- Revisar y consolidar familias `code-refactoring-*` y `codebase-cleanup-*`.
- Revisar la serie `tdd-workflow`, `tdd-orchestrator` y `tdd-workflows-*` para dejar un arbol claro y no competitivo.

### Lote 4 — Deprecacion por pertinencia

- Marcar como candidatas a deprecacion las skills de pentesting ofensivo, marketing/growth, game dev, blockchain y stacks no usados por el repo, salvo que exista justificacion documental explicita.
- Separar las skills externas o de uso eventual en una categoria experimental para que no compitan con las skills core del proyecto.

## 8. Riesgos y bloqueos

- Riesgo 1: la sobrecarga de catalogo puede inducir activaciones incorrectas o suboptimas frente a skills core del repo.
- Riesgo 2: mantener aliases y duplicados aumenta el costo de mantenimiento y la probabilidad de instrucciones contradictorias.
- Riesgo 3: skills ofensivas o ajenas al dominio pueden introducir ruido de gobernanza y falsear las prioridades del workspace.
- Bloqueo tecnico, si aplica: no se detecto un bloqueo tecnico para auditar; la limitacion principal es de gobierno y curacion del catalogo.

## 9. Cambios documentales

- PRD actualizado: No aplica.
- HLD actualizado: No aplica.
- ADR nuevo o referenciado: ADR-022 referenciado como politica de ejecucion.
- Otros documentos afectados: .agents/skills/README.md, .agents/skills/INDEX.md, .agents/skills/MANIFEST.json y docs/quality/CHECKLIST-SISTEMA-SKILLS-GOBERNANZA-v1.0.md quedaron sincronizados con el estado actual del catalogo.

## 10. Decision de salida

- Puede pasar a siguiente fase: Si
- Requiere correcciones previas: No para operar con el set core; Si para una potencializacion posterior del catalogo.
- Aprobadores pendientes: CTO Humano solo si se decide restaurar o ampliar el set fuera de las skills core.

## 11. Recomendacion final

- Stop/Go: Go para operar con el set core actual.
- Prioridad recomendada para la siguiente fase: revisar si conviene potencializar algunas skills archivadas de forma selectiva, empezando por stack, observabilidad y documentacion antes que por catalogos genericos.
- Criterio rector: AGENTS.md debe prevalecer sobre cualquier skill individual cuando exista conflicto de prioridad o de dominio.

## 12. Shortlist de potencializacion posterior

### Prioridad alta (Shortlist)

- observability-engineer
  - Motivo: agrega una capa SRE/operacional que hoy no esta cubierta de forma explicita en el set activo.
  - Valor esperado: monitoreo, logging, tracing, alertas y confiabilidad operativa.
- docs-architect
  - Motivo: complementa la gobernanza documental del repo con documentacion tecnica de mayor profundidad.
  - Valor esperado: manuales tecnicos, guias de arquitectura, documentacion de modulos y trazabilidad.
- github-actions-templates
  - Motivo: util para CI base y pipelines estandar si el repo consolida GitHub Actions como automatizacion principal.
  - Valor esperado: pipelines repetibles para lint, test, build, seguridad y despliegue.
- deployment-pipeline-design
  - Motivo: aporta diseno de gates y despliegue seguro, especialmente util si se formaliza el flujo CI/CD del monorepo.
  - Valor esperado: stages, aprobaciones, rollback y estrategia de release.

### Prioridad media (Shortlist)

- slo-implementation
  - Motivo: valiosa cuando ya exista una base minima de observabilidad y se quieran formalizar objetivos de confiabilidad.
  - Valor esperado: SLIs, SLOs, error budgets y alertas por objetivos.
- prometheus-configuration
  - Motivo: candidata fuerte si la plataforma adopta Prometheus como backend de metricas.
  - Valor esperado: scrape configs, recording rules y alerting basico.
- grafana-dashboards
  - Motivo: complementa Prometheus u otra telemetria con visualizacion operativa.
  - Valor esperado: dashboards RED/USE, tableros SLO y seguimiento de servicios.
- distributed-tracing
  - Motivo: gana valor cuando el sistema tenga multiples servicios o boundaries con trazas relevantes.
  - Valor esperado: analisis de latencia, dependencias y propagacion de errores.

### No recomendadas por ahora

- nx-workspace-patterns
  - Motivo: el repo usa Turborepo, no Nx.
- nodejs-best-practices
  - Motivo: parte de su espacio ya esta cubierto por nestjs-expert y typescript-expert; hoy no es prioritaria.
- context7-auto-research
  - Motivo: su propuesta se solapa con capacidades de documentacion ya disponibles por tooling del agente.

### Orden sugerido de restauracion futura

1. docs-architect
2. observability-engineer
3. github-actions-templates
4. deployment-pipeline-design
5. slo-implementation
6. prometheus-configuration
7. grafana-dashboards
8. distributed-tracing

## 13. Revision del catalogo activo para potencializacion

### 13.1 Hallazgos generales

- El set core activo es mucho mas gobernable que el catalogo historico, pero no todas las skills estan aterrizadas al stack y a la arquitectura real de iWana neXt.
- Hay inconsistencia de metadatos en frontmatter: algunas skills activas tienen metadata, category, displayName o allowed-tools y otras no.
- Varias skills siguen usando ejemplos o decision trees genericos que empujan a stacks no prioritarios para este repo.

### 13.2 Desalineaciones concretas detectadas

#### Prioridad alta (Desalineaciones)

- frontend-dev-guidelines
  - Problema: esta orientada a React generico con MUI v7 y TanStack Router, mientras el repo usa Next.js App Router y la linea activa privilegia patrones distintos.
  - Potencializacion requerida: reescribir ejemplos, reglas y checklist para Next.js App Router, stack visual real y convenciones del repo.
- testing-patterns
  - Problema: contiene ejemplos de react-native testing library, desalineados con Jest, Supertest y Playwright definidos por el proyecto.
  - Potencializacion requerida: reemplazar ejemplos por frontend web, backend NestJS y E2E reales del stack.
- core-components
  - Problema: incluye anti-patrones y ejemplos con react-native, View y Text, lo que no representa el entorno principal del repo.
  - Potencializacion requerida: adaptar el skill al sistema web real, tokens, componentes base y patrones accesibles del proyecto.
- nestjs-expert
  - Problema: mezcla TypeORM con Mongoose, Prisma, Bazel, microservices y Express sessions, cuando el repo tiene decisiones mucho mas cerradas.
  - Potencializacion requerida: sesgar el skill hacia NestJS + TypeORM + PostgreSQL multi-tenant por schema + modulith + OpenAPI.
- monorepo-architect
  - Problema: mantiene paridad entre Nx, Turborepo, Bazel y Lerna; el repo ya tiene direccion clara de Turborepo.
  - Potencializacion requerida: convertirlo en un skill preferentemente Turborepo-first con pnpm, boundaries y caching coherentes con el workspace.

#### Prioridad media (Desalineaciones)

- architect-review
  - Problema: sobrepondera microservices y event-driven architecture frente al enfoque modulith del repo.
  - Potencializacion requerida: reforzar boundaries, ADR-016, multi-tenant por schema y prohibiciones de acceso cruzado entre modulos.
- architecture-decision-records
  - Problema: los ejemplos siguen siendo genericos y en varios casos giran en torno a microservices, MongoDB y comparativas menos relevantes para el proyecto.
  - Potencializacion requerida: agregar plantillas y ejemplos propios para PostgreSQL, TypeORM, Docker on-prem, OpenAPI y decisiones de gobernanza modular.
- playwright-skill
  - Problema: asume rutas y flujos muy orientados a Unix y a instalaciones externas, con uso de /tmp y patrones no ideales para Windows.
  - Potencializacion requerida: agregar guia Windows-first y preferencia por herramientas integradas del entorno cuando existan.

#### Prioridad baja

- backend-security-coder y frontend-security-coder
  - Hallazgo: son buenos skills base, pero aun son muy genericos.
  - Potencializacion sugerida: inyectar reglas del proyecto sobre Zod en boundaries, zero-trust PII, CORS restrictivo y regulacion colombiana cuando aplique.
- postgresql
  - Hallazgo: muy completo, pero demasiado generalista.
  - Potencializacion sugerida: sumar notas concretas de multi-tenancy por schema, trazabilidad, cifrado y criterios regulatorios del proyecto.

### 13.3 Backlog sugerido de potencializacion del catalogo activo

#### Fase A — Aterrizaje al stack real

1. frontend-dev-guidelines
2. testing-patterns
3. core-components
4. nestjs-expert
5. monorepo-architect

#### Fase B — Aterrizaje a la gobernanza del repo

1. architect-review
2. architecture-decision-records
3. backend-security-coder
4. frontend-security-coder
5. postgresql

#### Fase C — Ajustes operativos del entorno

1. playwright-skill
2. mermaid-expert
3. openapi-spec-generation

### 13.4 Criterio de ejecucion recomendado

- No ampliar el catalogo activo antes de corregir estas desalineaciones en las skills core.
- Primero alinear las skills activas al stack y a la gobernanza real; despues restaurar skills candidatas del archivo.
- Toda potencializacion debe preservar el catalogo pequeno y aumentar precision, no amplitud.

## 14. Ejecucion de potencializacion del catalogo activo

### 14.1 Fase 1 ejecutada

- frontend-dev-guidelines fue reescrita para alinearse a Next.js App Router, React Server Components, accesibilidad e i18n del proyecto.
- testing-patterns fue reescrita para usar Jest, Supertest y Playwright en lugar de patrones mobile ajenos al stack.
- core-components fue reescrita para un sistema de componentes web y tokens semanticos del proyecto.

### 14.2 Fase 2 ejecutada

- nestjs-expert fue reescrita para enfocarse en modulith, TypeORM, PostgreSQL multi-tenant por schema, OpenAPI y testing backend real del repo.
- monorepo-architect fue reescrita para un enfoque Turborepo + pnpm, eliminando neutralidad innecesaria frente a Nx, Bazel y Lerna.

### 14.3 Fase 3 ejecutada

- architect-review fue reescrita para revisar cambios contra el modulith, los boundaries, el multi-tenant por schema, la seguridad y la gobernanza documental real del repo, evitando sesgo microservicios por defecto.
- architecture-decision-records fue reescrita para documentar ADRs alineados al stack aprobado, a los artefactos fuente obligatorios y a las decisiones estructurales reales de iWana neXt.
- playwright-skill fue reescrita para un uso orientado a VS Code, Windows, Playwright E2E del frontend web y pruebas estables sin supuestos Unix ni rutas temporales rigidas.

### 14.4 Fase 4 ejecutada

- backend-security-coder fue reescrita para reforzar NestJS con validacion en runtime, Zod en boundaries externos, JWT, RBAC o ABAC, rate limiting, auditoria y zero-trust PII segun las reglas activas del repo.
- frontend-security-coder fue reescrita para alinearse a Next.js App Router, Server Components por defecto, sanitizacion de salida, navegacion segura y control de exposicion de datos sensibles en UI.
- postgresql fue reescrita para centrarse en PostgreSQL multi-tenant por schema, TypeORM, migraciones versionadas, diseno de datos seguro y respeto de boundaries del modulith.

### 14.5 Fase 5 ejecutada

- openapi-spec-generation fue reescrita para aterrizar OpenAPI al modelo REST versionado del repo, a NestJS, a la validacion real de DTOs o boundaries y a la trazabilidad documental exigida por el proyecto.
- auth-implementation-patterns fue reescrita para priorizar JWT con rotacion, MFA, RBAC o ABAC, resolucion de tenant por request autenticada y auditoria de eventos sensibles dentro del baseline aprobado.
- mermaid-expert fue reescrita para generar diagramas Mermaid alineados a modulith, boundaries, tenancy, ADRs, HLDs e informes del repo, evitando diagramas aspiracionales ajenos al estado real del sistema.

### 14.6 Estado posterior

- El catalogo activo se mantiene pequeno y ya tiene catorce skills core potencializadas contra el stack y la gobernanza vigente.
- El remanente activo ya no muestra desalineaciones estructurales evidentes; las siguientes mejoras serian opcionales y de profundidad, no de correccion base.

### 14.7 Normalizacion editorial posterior

- Se homogeneizo el frontmatter de las skills activas recientemente potencializadas para usar la convencion `name`, `summary` y `allowed-tools` de forma consistente.
- Tambien se corrigieron pequenas divergencias de rotulado, como el encabezado de `nestjs-expert`, sin alterar el contenido funcional ni el inventario del catalogo.

## 15. Auditoria de skills activas aun no potencializadas

Se revisaron las nueve skills activas que aun no habian pasado por una potencializacion explicita posterior a la depuracion del catalogo.

### 15.1 Decision: elevar en siguiente ola

- bullmq-specialist: util por dominio, pero sigue demasiado generica, referencia skills ya inexistentes en el catalogo activo y no aterriza BullMQ al uso real con Redis, jobs y boundaries del repo.
- docker-expert: fuerte en Docker, pero mantiene sesgo amplio a Compose, cloud y flujos Unix genericos; conviene alinearla al baseline Docker on-prem, pnpm y servicios reales del proyecto.
- nextjs-app-router-patterns: actualmente es casi un stub generico y no tiene la profundidad operativa que ya tienen otras skills frontend del catalogo.
- security-auditor: conserva framing muy generalista de DevSecOps global, cloud y compliance internacional; requiere aterrizarse al baseline de seguridad, zero-trust PII y regulacion relevante del proyecto.
- typescript-expert: sigue orientada a escenarios amplios y matrices de tooling que no reflejan con precision el monorepo y baseline vigente de iWana neXt.
- wcag-audit-patterns: sigue siendo util, pero su framing legal y operativo aun es demasiado generico; conviene adaptarla a los flujos web, evidencia y criterios del proyecto.

### 15.2 Decision: mantener por ahora

- i18n-localization: aunque es generica, ya aporta patrones utiles y no contradice el stack; puede mantenerse hasta que exista necesidad real de profundizar localizacion del producto.
- tailwind-patterns: es suficientemente compatible con la direccion frontend actual y no introduce conflicto estructural inmediato; su potencializacion es deseable, pero no prioritaria.
- test-driven-development: sigue siendo transversal y util como skill metodologica; no depende del stack y no muestra desalineaciones graves con la gobernanza del repo.

### 15.3 Resultado de la auditoria

- Skills activas auditadas en esta pasada: 9.
- Candidatas a elevacion en siguiente ola: 6.
- Skills que pueden mantenerse sin intervencion inmediata: 3.
- No se detectaron nuevas candidatas a archivo dentro del catalogo activo actual.

## 16. Ejecucion de potencializacion adicional

### 16.1 Fase 6 ejecutada

- bullmq-specialist fue reescrita para BullMQ real del repo con Redis, jobs idempotentes, payloads minimos, trazabilidad por tenant y respeto de boundaries del modulith.
- docker-expert fue reescrita para el baseline Docker on-prem del proyecto, con foco en seguridad, builds reproducibles, monorepo pnpm y operacion simple del MVP.
- nextjs-app-router-patterns fue reescrita para aterrizar Server Components, Client Components, carga de datos, rutas y estados de UI al frontend real de iWana neXt.
- security-auditor fue reescrita para auditoria de seguridad enfocada en OWASP, zero-trust PII, tenancy, audit trail, regulacion aplicable y controles reales del stack aprobado.
- typescript-expert fue reescrita para TypeScript estricto y pragmatico dentro del monorepo, con foco en boundaries, contratos y mantenibilidad por encima de type gymnastics.
- wcag-audit-patterns fue reescrita para auditoria WCAG accionable sobre flujos web reales del repo, con evidencia concreta, pruebas manuales y priorizacion de remediacion.

### 16.2 Estado posterior

- El catalogo activo mantiene 23 skills y ahora tiene veinte skills core potencializadas contra el stack y la gobernanza vigente.
- Las skills activas restantes que aun no pasaron por una potencializacion explicita son i18n-localization, tailwind-patterns y test-driven-development; hoy no muestran desalineaciones estructurales graves.

## 17. Cierre de homogeneizacion del catalogo activo

### 17.1 Fase 7 ejecutada

- i18n-localization fue reescrita para evitar hardcodes, ordenar catalogos de mensajes, soportar formatos locales y preparar crecimiento multilenguaje del frontend web del repo.
- tailwind-patterns fue reescrita para priorizar tokens semanticos, composicion mantenible, consistencia visual y uso de Tailwind al servicio del sistema de UI del proyecto.
- test-driven-development fue reescrita para aterrizar TDD a Jest, Supertest y Playwright dentro del stack real, con foco en red-green-refactor y pruebas utiles por capa.
- README del catalogo activo fue curado para clasificar las skills por prioridad de uso, ademas de mantener la vista por area funcional.

### 17.2 Estado final de esta fase

- El catalogo activo mantiene 23 skills y las 23 ya quedaron potencializadas u homogeneizadas contra el stack y la gobernanza vigente.
- El catalogo activo queda cerrado sin desalineaciones estructurales evidentes.
- Los siguientes pasos recomendables ya son de gobernanza, restauracion selectiva o afinamiento fino, no de limpieza base.

## 18. Gobernanza posterior al cierre tecnico

### 18.1 Alineacion documental ejecutada

- INDEX del catalogo fue actualizado para reflejar la nueva prioridad de uso: primera linea, segunda linea y especializadas por necesidad.
- MANIFEST fue extendido para incluir `usagePriority`, `admissionPolicy` y `rejectionCriteria` como parte de la gobernanza operativa del catalogo.
- README del archivo de skills no activas fue endurecido con una politica estricta de reingreso al catalogo activo.

### 18.2 Politica operativa resultante

- Ninguna skill nueva o restaurada debe entrar al catalogo activo sin caso de uso recurrente y verificable en el repo.
- Toda activacion o restauracion debe declarar prioridad de uso y relacion con skills ya activas.
- Toda modificacion sustancial del catalogo debe dejar trazabilidad sincronizada en README, INDEX, MANIFEST e informe vigente.
- Se rechaza cualquier skill que solo aumente amplitud de catalogo, dependa de tooling no disponible o introduzca mas ruido que valor operativo.

## 19. Decision dura sobre la shortlist archivada

### 19.1 Tabla de decision ejecutada

| Skill                      | Decision           | Estado actual documentado        | Motivo resumido                                                        |
| -------------------------- | ------------------ | -------------------------------- | ---------------------------------------------------------------------- |
| docs-architect             | restaurar          | activa en `.agents/skills/`      | valor directo para gobierno documental y calidad del repo              |
| observability-engineer     | restaurar          | activa en `.agents/skills/`      | valor transversal probable para siguiente capa operativa del sistema   |
| github-actions-templates   | mantener archivada | solo documentada en este informe | util potencial, pero no prioritaria frente al baseline actual          |
| deployment-pipeline-design | mantener archivada | solo documentada en este informe | relevante a futuro, no urgente para el estado actual del repo          |
| slo-implementation         | mantener archivada | solo documentada en este informe | necesita mayor madurez operativa antes de justificar activacion        |
| prometheus-configuration   | mantener archivada | solo documentada en este informe | util cuando exista iniciativa concreta de observabilidad               |
| grafana-dashboards         | mantener archivada | solo documentada en este informe | dependiente de una capa observability aun no priorizada                |
| distributed-tracing        | mantener archivada | solo documentada en este informe | premature para el estado actual del sistema                            |
| nx-workspace-patterns      | descartar          | solo documentada en este informe | fuera del baseline Turborepo aprobado                                  |
| nodejs-best-practices      | descartar          | solo documentada en este informe | demasiado generica y redundante frente a skills activas especializadas |
| context7-auto-research     | descartar          | solo documentada en este informe | dependiente de flujo externo no esencial para el catalogo activo       |

### 19.2 Estado actual tras retiro del archivo local

- Las dos skills con decision de restauracion ya forman parte del catalogo activo.
- Las seis skills revisadas y mantener archivadas quedan solo registradas en este informe.
- Las tres skills descartadas por ahora quedan solo registradas en este informe.
- No existe un directorio fisico `.agents/skills-archive/` en el repo actual.

## 20. Documento corto de politica operativa

- Se genero `docs/quality/CHECKLIST-SISTEMA-SKILLS-GOBERNANZA-v1.0.md` como referencia breve para uso futuro del catalogo.

## 21. Cierre ejecutivo para el equipo

- Se genero `docs/informes/INFORME-SISTEMA-CIERRE-SKILLS-v1.0.md` como resumen ejecutivo corto de cierre, orientado a uso operativo del equipo sin necesidad de recorrer el informe maestro completo.

## 22. Restauracion y potencializacion de skills restaurables

### 22.1 Fase 8 ejecutada

- docs-architect fue restaurada al catalogo activo y reescrita para gobernanza documental real del repo, con foco en PRD, HLD, ADR, informes, prompts y trazabilidad entre artefactos.
- observability-engineer fue restaurada al catalogo activo y reescrita para una estrategia de observabilidad gradual, util y alineada al stack real, evitando asumir una plataforma enterprise no existente.
- README, INDEX y MANIFEST del catalogo activo fueron actualizados para reflejar el estado vigente del catalogo y su prioridad de uso.
- Checklist de gobernanza e informe maestro fueron actualizados para reflejar el retiro del archivo local y la limpieza de referencias legacy.

### 22.2 Estado posterior

- El catalogo activo mantiene 25 skills y las 25 ya quedaron potencializadas u homogeneizadas.
- No quedan skills con decision vigente de restauracion inmediata en el archivo.
- El archivo conservaba en ese momento 6 skills revisadas y mantener archivadas, 3 en hold, 4 archivos legacy y 670 directorios historicos en raiz (estado historico previo al retiro del archivo local; ver §19.2 — hoy no existe archivo fisico y esas decisiones solo se conservan en este informe).

## Actualización 2026-03-14 — Integración de despacho de skills

**Modo:** Mixto (EM + Architect)

### Skills restauradas al catálogo activo (25 → 30)

| Skill | Dominio | Commits |
| --- | --- | --- |
| `turborepo-caching` | Arquitectura/Monorepo | 49f57f6 |
| `database-migration` | Backend | 554d2d9 |
| `e2e-testing-patterns` | Testing | ba1dc64 |
| `typescript-pro` | Backend/Frontend (Opus) | 1d644fb |
| `codebase-cleanup-deps-audit` | Seguridad/Mantenimiento | 5e28df2 |

### Archivos actualizados

- `.agents/skills/INDEX.md` — 30 skills, nuevas secciones por área (d253d24)
- `.agents/skills/README.md` + `MANIFEST.json` — conteos y mapas actualizados (9349d39)
- `CLAUDE.md` — sección `## Despacho de Skills` con tablas completas por dominio (4e196dc)
- `AGENTS.md` — sección `## Despacho de Skills` compacta (4e196dc)
- `.github/copilot-instructions.md` — sección `## Skills` de listado rápido (4e196dc)

### Documento de diseño

`docs/plans/2026-03-14-skills-dispatch-design.md` y `docs/plans/2026-03-14-skills-dispatch-integration.md` (documentos de trabajo no conservados en el repo actual; la decision vigente quedo consolidada en este informe y en las tablas de dispatch de `AGENTS.md` y `CLAUDE.md`).

## Actualización 2026-05-04 — Activación de skill de dirección visual

**Modo:** Mixto

### Decisión ejecutada

- Se evaluaron las skills activas del frente visual y se confirmó que cubrían implementacion, accesibilidad y tokens, pero no direccion visual SaaS ni propuestas esteticas fuertes para interfaces nuevas.
- Se revisaron skills archivadas cercanas al problema, especialmente `ui-ux-designer`, `frontend-design` y `ui-visual-validator`.
- Se descartó restaurarlas tal cual porque su alcance era demasiado amplio, generico o tensionaba la sobriedad operativa del producto.
- Como accion correctiva se creó una nueva skill activa: `senior-ui-systems-designer`.

### Alcance de la nueva skill

- direccion visual de nuevas interfaces SaaS para `apps/web` y `apps/portal`
- generacion de 2 o 3 propuestas esteticas viables antes de implementar
- definicion de jerarquia, densidad, ritmo visual, estados y responsive behavior
- review visual sistemico de pantallas, no solo revision tecnica de implementacion
- integracion explicita con `core-components`, `frontend-dev-guidelines`, `tailwind-patterns` y `wcag-audit-patterns`

### Guardrails incorporados

- no usar la skill para marketing pages o interfaces decorativas sin utilidad operativa
- no contradecir Tailwind v4, `@iwana/ui`, multi-tenancy, seguridad ni copy en espanol del repo
- no permitir propuestas visuales genericas tipo SaaS template ni gestos esteticos que empeoren escaneo o mantenimiento
- mantener accesibilidad WCAG 2.2 AA como baseline de salida

### Sincronizacion documental ejecutada

- Se creó `.agents/skills/senior-ui-systems-designer/SKILL.md`.
- Se actualizó `.agents/skills/README.md` para reflejar 31 skills activas y su mapa de uso.
- Se actualizó `.agents/skills/INDEX.md` para declarar la nueva skill como especializada por necesidad dentro de frontend y accesibilidad.
- Se actualizó `.agents/skills/MANIFEST.json` para reflejar el nuevo inventario, prioridad de uso y referencias de trazabilidad.
- Se actualizó este informe vivo como registro formal de la activacion.

### Estado posterior

- El catalogo activo pasa de 30 a 31 skills.
- El set frontend gana una skill orientada a direccion visual y exploracion estetica, sin mezclar esa responsabilidad con implementacion o auditoria.

## Actualización 2026-07-09 — Reactivación de Claude Code

**Modo activo:** Mixto (EM + Architect)
**Responsable principal:** Claude Code
**Solicitado por:** usuario, en sesion directa de Claude Code

### Decisión ejecutada

- `AGENTS.md` marcaba a `CLAUDE.md` como superficie pasiva/deprecada ("hasta que Claude Code vuelva a ser herramienta activa") y listaba solo a Copilot, OpenCode y Codex como IAs activas del workspace.
- El usuario solicitó explícitamente integrar el catálogo `.agents/skills/` al flujo de trabajo de Claude Code. Por la regla de precedencia del propio repo (no sintetizar sobre un conflicto documental, sino documentarlo y escalar), se confirmó con el usuario el alcance antes de tocar la gobernanza maestra.
- Se ejecutó la opción de reactivación formal siguiendo el procedimiento ya definido en `AGENTS.md` § "Reactivacion o desactivacion de herramientas IA": comparar el bootstrap de la IA reactivada contra `AGENTS.md`, reemplazar reglas duplicadas por referencias, y actualizar precedencia, stack y boundaries si corresponde.

### Hallazgo técnico relevante

- Claude Code no tiene, en este entorno, un mecanismo nativo equivalente a `skills.paths` de OpenCode para cargar un directorio de skills de proyecto arbitrario. Su tool `Skill` solo invoca skills que el harness expone directamente (utilidades genéricas del cliente); ninguna de las 41 skills activas de `.agents/skills/` aparece ahí, y no existe `.claude/skills/` en el repo.
- Se descartó crear `.claude/skills/` (por symlink o copia) para no infringir la regla de "no crear catálogos paralelos por cliente" y por fricción de symlinks en Windows sin privilegios elevados.
- Se adoptó el mismo patrón que ya usa Codex: consumo del catálogo por lectura documental. `CLAUDE.md` ahora instruye a leer `.agents/skills/INDEX.md` y el `SKILL.md` de la skill que coincida con la tarea, vía la herramienta de lectura de archivos, aplicando sus reglas como si fueran parte del bootstrap — no invocación como tool nativa.

### Archivos actualizados

- `AGENTS.md` — Claude Code se suma a "Asistentes activos"; `CLAUDE.md` pasa de "Superficies pasivas" a "Superficies activas"; se aclara en la matriz operativa de Skills que Claude Code aplica el catálogo por lectura, no por `skills.paths`.
- `.agents/skills/INDEX.md` — nota de precedencia actualizada: `CLAUDE.md` ya no aparece como pasivo.
- `.agents/skills/README.md` — se agrega una nota sobre cómo Claude Code consume el catálogo (lectura documental, sin `skills.paths`).
- `.github/copilot-instructions.md` — Claude Code se suma a la lista de IAs activas y a "Superficies activas"; se agrega una sección "### Claude Code" en "Notas por proveedor", paralela a las de Copilot/OpenCode/Codex.
- `CLAUDE.md` — reescrito el bloque "Source of truth" para declarar a Claude Code como asistente activo y reactivado; se agrega una sección `## Skills` nueva con el procedimiento de consumo del catálogo y una tabla de dispatch por dominio (equivalente reducido de `AGENTS.md` § "Skills Dispatch").
- Este informe — registro formal de la reactivación.

### Guardrails mantenidos

- `AGENTS.md` sigue siendo la fuente maestra; `CLAUDE.md` no duplica reglas ya definidas ahí (comandos, arquitectura, gotchas, convenciones) más allá de lo que ya tenía antes de esta actualización.
- El catálogo de skills sigue teniendo una única fuente real: `.agents/skills/`. No se creó ningún catálogo paralelo para Claude Code.
- No se modificó la prioridad de uso, el estado core/archived/hold de ninguna skill, ni el conteo total del catálogo (sigue en 41 skills activas).

### Estado posterior

- Asistentes activos del workspace: GitHub Copilot, OpenCode, Codex y Claude Code, los cuatro subordinados a `AGENTS.md` con el mismo orden de lectura y el mismo catálogo de skills.
- No quedan superficies documentales marcadas como "pasivas" en `AGENTS.md` (excepto proveedores no adoptados, p. ej. `GEMINI.md`, que sigue fuera de este workspace).
- No se reabrió el archivo historico ni se restauró una skill generica que aumentara ruido de activacion.

## Actualización 2026-07-09 — Reconciliación del catálogo (auditoría de desviaciones)

**Modo activo:** Mixto (Sr. Dev Fullstack en modo revisión)
**Responsable principal:** Claude Code
**Solicitado por:** usuario, auditoría de desviaciones documentación vs. repo

### Hallazgo

Una auditoría de gobernanza detectó que el filesystem contenía 47 directorios con `SKILL.md` mientras `INDEX.md` y `MANIFEST.json` solo declaraban 41. Las 6 skills sin catalogar eran: `brainstorming`, `iwana-identity-ui-review`, `skill-creator`, `system-vocabulary-review`, `ui-ux-pro-max`, `using-git-worktrees`. Tres de ellas (`iwana-identity-ui-review`, `ui-ux-pro-max`, `system-vocabulary-review`) ya se despachaban desde las tablas de `AGENTS.md` y `CLAUDE.md` sin respaldo del catálogo.

### Trazabilidad reconstruida (salto 31 → 41)

La cronología de este informe registraba 23 → 25 → 30 → 31 skills, pero el resumen afirmaba 41 sin entrada intermedia. La reconstrucción confirma que el salto corresponde al alta de las 10 workflow skills del 2026-05-19 (las mismas habilitadas por `skills-lock.json`): `dispatching-parallel-agents`, `executing-plans`, `finishing-a-development-branch`, `receiving-code-review`, `requesting-code-review`, `subagent-driven-development`, `systematic-debugging`, `verification-before-completion`, `writing-plans`, `writing-skills`. Esa alta actualizó MANIFEST/INDEX pero no dejó entrada en este informe; esta sección la registra retroactivamente. 31 + 10 = 41.

### Decisión ejecutada (41 → 47)

Las 6 skills huérfanas se catalogaron formalmente en vez de retirarse, porque las seis cumplen la política de admisión: caso de uso recurrente verificable (tres ya despachadas por la gobernanza maestra; tres de workflow ya en uso operativo), sin duplicar cobertura activa y sin dependencias no disponibles.

- `iwana-identity-ui-review`, `system-vocabulary-review`, `ui-ux-pro-max` → área frontend y accesibilidad, prioridad especializada por necesidad. `ui-ux-pro-max` permanece subordinada a `iwana-identity-ui-review`, `core-components`, `tailwind-patterns` y tokens reales del repo, según `AGENTS.md`.
- `brainstorming`, `skill-creator`, `using-git-worktrees` → área flujos de trabajo.

### Aclaración sobre skills-lock.json

`skills-lock.json` vive en la raíz del repo (no en `.agents/skills/`). Sus entradas `skill-creator` y `ui-ux-pro-max` son de procedencia GitHub (`sourceType: "github"`); el `skillPath` de esas entradas (p. ej. `.claude/skills/ui-ux-pro-max/SKILL.md`) es la ruta **dentro del repo upstream**, no un directorio local — no infringe la regla de no crear `.claude/skills/` en este workspace. La copia gobernada de ambas skills vive en `.agents/skills/`.

### Archivos actualizados

- `.agents/skills/INDEX.md` → v1.3: 6 skills catalogadas, nota sobre procedencia del lock.
- `.agents/skills/MANIFEST.json` → v1.3, fecha 2026-07-09, `coreCount: 47`, áreas y prioridades sincronizadas (la cabecera estaba desfasada en v1.0/2026-05-19).
- `.agents/skills/README.md` → v1.3.
- Este informe: conteos del resumen ejecutivo y de la evidencia funcional corregidos (47 skills, 12 entradas de lock), contradicción histórica de §22.2 anotada como estado previo al retiro del archivo, y enlaces a los planes de dispatch del 2026-03-14 marcados como documentos no conservados.

### Nota

Los nombres de secciones citados en entradas históricas de este change-log (p. ej. "## Despacho de Skills") reflejan la redacción vigente en su momento; las superficies actuales usan "## Skills Dispatch" (`AGENTS.md`) y "## Skills" (`CLAUDE.md`).

### Estado posterior

- Catálogo activo: 47 skills, con filesystem, INDEX, MANIFEST y dispatch de gobernanza plenamente sincronizados.
- `potentializedCoreSkills` del MANIFEST se mantiene en 41: las 6 skills recién catalogadas no han pasado por fase de potencialización y quedan como candidatas a esa revisión.

## Actualización 2026-07-10 — Potencialización de iwana-identity-ui-review

**Modo:** Mejora de skill existente (aplicando `skill-creator`)

### Motivación

La versión previa de `iwana-identity-ui-review` mezclaba guía de diseño y auditoría sin metodología ni formato de salida definidos, no exigía evidencia por hallazgo (riesgo de falsos positivos y de recomendar tokens inexistentes) y no delimitaba fronteras con `wcag-audit-patterns`, `senior-ui-systems-designer`, `system-vocabulary-review` ni `ui-ux-pro-max` (riesgo de hallazgos redundantes entre skills).

### Cambios ejecutados

- `SKILL.md` reescrito: dos modos de operación explícitos (diseño / review), metodología de review en 6 pasos, 7 dimensiones de evaluación, tabla de reglas duras mecánicamente verificables (grep-ables contra el código), sistema de severidad P0–P3 con impacto y esfuerzo S/M/L, puntaje 0–100 derivado por fórmula (no estimado), sección anti-falsos-positivos con evidencia obligatoria `archivo:línea` y deduplicación por causa raíz, y formato de informe estándar con ejemplo de hallazgo bien formado.
- Se agregó `references/evaluation-criteria.md` con los criterios detallados por dimensión anclados a artefactos reales del repo (`globals.css`, `portal-ui.tsx`, ADR-026), siguiendo el patrón de progressive disclosure de `skill-creator`.
- La descripción del frontmatter se reescribió para mejorar el triggering (incluye contextos de activación implícitos: "UI genérica, ruidosa o fuera de identidad").
- Se preservaron sin cambios semánticos las reglas vigentes: `iwana-secondary-700` para texto sobre blanco, glassmorphism selectivo, `iwana-surface-soft` vs `iwana-secondary-50`, prioridad de accesibilidad sobre identidad y adopción por fases en legacy.

### Estado posterior

- La skill mantiene su nombre, categoría, prioridad (especializada por necesidad) y posición en INDEX/MANIFEST; no requiere cambios de catálogo.
- Queda pendiente como evolución futura: corrida de evals comparativas (versión previa vs nueva) sobre 2–3 pantallas reales del portal según el flujo de `skill-creator`.
