# INFORME — Auditoria de Skills del Workspace

**Modo activo:** Mixto
**Version:** 1.1
**Estado:** Aprobado
**Fecha:** 2026-05-19
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
- Resultado alcanzado: la auditoria original redujo el catalogo a un set core operativo y la actualizacion del 2026-05-19 dejo el estado vivo alineado al repo actual: 41 skills activas documentadas en `.agents/skills`, 10 workflow skills habilitadas por `skills-lock.json`, sin directorio local `.agents/skills-archive/` y con referencias legacy `docs/superpowers/*` migradas a `docs/specs/*` y `docs/plans/*`.
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
  - El estado vivo al 2026-05-19 registra 41 skills documentadas en `.agents/skills`.
  - `skills-lock.json` habilita 10 workflow skills para la sesion operativa actual.
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
- El archivo conserva 6 skills revisadas y mantener archivadas, 3 en hold, 4 archivos legacy y 670 directorios historicos en raiz.

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

`docs/plans/2026-03-14-skills-dispatch-design.md`
`docs/plans/2026-03-14-skills-dispatch-integration.md`

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
- No se reabrió el archivo historico ni se restauró una skill generica que aumentara ruido de activacion.
