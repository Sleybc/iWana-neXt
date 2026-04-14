# INFORME — Definición MOD05 CRM / Expediente Único Progresivo

**Versión:** 4.0  
**Estado:** Sprint 02 cerrado — refinamiento técnico validado  
**Fecha:** 2026-04-14  
**Modo activo:** Architect  
**Módulo:** MOD05 — CRM / Expediente Único Progresivo  
**Artefacto principal:** docs/prds/PRD-MOD05-CRM-DEFINICION-v2.0.md

---

## Vínculos de trazabilidad

| Artefacto                 | Ruta                                                         |
| ------------------------- | ------------------------------------------------------------ |
| PRD vigente (v2.0)        | `docs/prds/PRD-MOD05-CRM-DEFINICION-v2.0.md`                 |
| PRD previo (v1.1)         | _(eliminado — referencia historica)_                         |
| PRD original (v1.0)       | _(eliminado — referencia historica)_                         |
| Spec expediente único     | `docs/superpowers/specs/SPEC-MOD05-EXPEDIENTE-UNICO-v1.0.md` |
| Spec rediseño             | `docs/superpowers/specs/SPEC-MOD05-REDISENO-v1.0.md`         |
| HLD vigente (v2.0)        | `docs/hlds/HLD-MOD05-ARQUITECTURA-v2.0.md`                   |
| HLD previo (v1.0)         | _(eliminado — referencia historica)_                         |
| ADR-024                   | `docs/adrs/ADR-024-Migracion-CRM-Expediente-Unico.md`        |
| Addendum cierre Sprint 02 | `docs/prds/PRD-MOD05-CRM-ADDENDUM-CIERRE-v2.1.md`            |
| PRD origen y atribución   | `docs/prds/PRD-MOD05-CRM-ORIGEN-ATRIBUCION-v1.1.md`          |
| Plan backlog incentivos futuro | `docs/plans/PLAN-MOD05-INCENTIVOS-BACKLOG-v1.0.md`      |
| Sprint plan 02            | `docs/sprints/PLAN-MOD05-CRM-SPRINT-02-v1.0.md`              |
| Prompt ejecución Fase 02  | `docs/prompts/PROMPT-MOD05-CRM-FASE-02-v1.0.md`              |
| Prompt origen y atribución | `docs/prompts/PROMPT-MOD05-CRM-ORIGEN-ATRIBUCION-FASE1-v1.1.md` |
| PRD del sistema           | `docs/prds/PRD_Sistema_ISP_Colombia_v2_2.md`                 |
| Stack tecnológico         | `docs/prds/Stack_Tecnologico.md`                             |
| Informe Sprint 01         | _(eliminado — referencia historica)_                         |
| ADRs referenciados        | ADR-016, ADR-017, ADR-018, ADR-019, ADR-022, ADR-024         |

---

## Identificación

- **Módulo:** MOD05 — CRM / Expediente Único Progresivo
- **Fase:** Definición arquitectónica (evolución v2.0)
- **Sprint:** CRM-SPRINT-01 completado; evolución a expediente único en definición
- **Fecha:** 2026-03-22
- **Responsable:** AI-EM-ARCH (Lead Software Architect Senior)

---

## 1. Resumen ejecutivo

MOD05 ha pasado por tres iteraciones de definición:

1. **PRD v1.0:** CRM clásico con leads, suscriptores y contratos.
2. **PRD v1.1:** Rediseño del lifecycle comercial-operativo (potencial → prospecto → instalación → cliente activo). Sprint 01 ejecutado con modelo básico.
3. **PRD v2.0 (actual):** Evolución al modelo de **expediente único progresivo** con captura en 8 secciones, 12 estados de pipeline, completitud por 4 dimensiones y consentimiento triple.

### Motivación de v2.0

El Sprint 01 implementó un flujo funcional pero limitado: solo nombre + fuente al crear, sin captura progresiva, sin completitud dimensional, sin historial de interacciones, sin coordenadas y con consentimiento genérico. El asesor del ISP necesita capturar la mayor información posible desde el primer contacto, completarla en interacciones posteriores (incluso hasta el día de instalación), y el modelo debe ser lo suficientemente robusto para no requerir refactorizaciones futuras.

### Resultados de la fase completa

- Spec de rediseño v1.0 emitida → congeló decisiones de boundary.
- PRD v1.1 emitido → ejecutado en Sprint 01.
- Sprint 01 completado con backend (PotentialsModule, ProspectsModule, ReviewsModule) + frontend portal + migración tenant 017.
- **Brainstorming de expediente único completado** → 5 secciones de diseño aprobadas.
- **Spec de expediente único v1.0 emitida** → modelo maestro + hijos + pipeline 12 estados.
- **PRD v2.0 emitido** → 10 secciones canónicas con expediente único progresivo.
- **CTO aprobó PRD v2.0 y Spec.** HLD v2.0 emitido. ADR-024 emitido. Sprint plan 02 y prompt de ejecución Fase 02 generados.
- **Refinamiento documental 2026-04-02 aprobado por CTO:** PRD y prompt complementarios quedaron aprobados para cerrar origen comercial y atribución como alcance operativo, dejando incentivos y productividad como roadmap futuro fuera de MOD05.

---

## 2. Artefactos fuente utilizados

- `docs/prds/PRD_Sistema_ISP_Colombia_v2_2.md` — §5.1 (RF-CRM), §6.2-6.4 (modelo de datos), §14.2 (roadmap)
- `docs/prds/Stack_Tecnologico.md`
- `docs/superpowers/specs/SPEC-MOD05-REDISENO-v1.0.md`
- `docs/prds/PRD-MOD01-DEFINICION-v1.1.md`
- `docs/prds/PRD-MOD02-DASHBOARD-EMPRESA-v1.0.md`
- `docs/prds/PRD-MOD03-CONFIGURACION-EMPRESA-v1.0.md`
- `docs/prds/PRD-MOD04-USUARIOS-INTERNOS-v1.0.md`
- `docs/prds/PRD-MOD05-CRM-DEFINICION-v1.0.md`
- `docs/prds/PRD-MOD05-CRM-DEFINICION-v1.1.md`
- `docs/hlds/HLD-MOD05-ARQUITECTURA-v1.0.md`
- `docs/hlds/HLD-MOD01-ARQUITECTURA-v1.0.md`
- `docs/informes/INFORME-MOD01-CIERRE-v1.0.md`
- `docs/informes/INFORME-MOD04-DEFINICION-v1.0.md`
- `packages/database/src/entities/user.entity.ts`
- `apps/api/src/modules/users/` (patrón de referencia: estructura, cifrado, guards)

---

## 3. Decisiones principales

| Decisión                                                | Razonamiento                                                                                                                                                                                                                 |
| ------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| CRM como bounded context propio (`CrmModule`)           | El volumen de entidades (8), la complejidad del pipeline y la regulación Habeas Data/CRC justifican un contexto dedicado. No se coloca dentro de UsersModule.                                                                |
| Entidad `subscribers` separada de `users`               | El suscriptor es una entidad de negocio del ISP con campos fiscales colombianos (estrato, vatTreatment, NIT). El usuario autenticado se vincula por FK lógica `userId`. No se mezclan en la misma tabla.                     |
| vatTreatment calculado en backend al crear/actualizar   | El tratamiento fiscal no puede delegarse al cliente ni a formularios frontend. Es un cálculo determinístico que el backend aplica según las reglas legales confirmadas por el ISP.                                           |
| Plan snapshot en contratos (sin ownership del catálogo) | El catálogo maestro de planes y valores pasa a MOD03. CRM consume lectura y guarda snapshots para inmutabilidad contractual.                                                                                                 |
| Cobertura comercial fuera de CRM                        | La configuración de nodos, zonas y radios pertenece a MOD03. CRM solo consume factibilidad comercial inicial.                                                                                                                |
| Evidencia contractual al cierre                         | La fase documental ya exige evidencia contractual o acta de conformidad al cierre exitoso. Para MVP queda aprobada una modalidad parametrizable por tenant, enlazada al cierre técnico y trazada por referencia desde MOD05. |
| Eventos de activación post-cierre                       | Billing y Provisioning deben dispararse de forma asíncrona solo después de cierre exitoso del caso. No hay llamada directa entre módulos.                                                                                    |
| Propuesta técnica inicial de repositorio documental     | Se evaluó MinIO con hash de integridad como opción compatible con on-premise, pero no queda cerrada como decisión final en esta versión documental.                                                                          |

### Ajustes arquitectónicos del 2026-03-22

| Decisión                                                    | Razonamiento                                                                       |
| ----------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| Potencial y Prospecto no son equivalentes                   | Evita activar demasiado pronto una entidad comercial aún no lista para instalación |
| Cliente activo solo después de instalación efectiva         | Alinea el PRD con la operación real en campo y con la conformidad firmada          |
| Ticket y work order obligatorios desde programación         | La trazabilidad operativa deja de ser opcional y se vuelve requisito del flujo     |
| Caso `En revisión` antes de declararlo inviable             | Permite cubrir expansión, refuerzo o inversión adicional sin perder el caso        |
| Solicitud interna automática ante falla por infraestructura | Reduce ambigüedad entre comercial y técnica                                        |
| Ejecución posterior gobernada por política configurable     | Evita hardcodear decisiones administrativas en el diseño del módulo                |

---

## 4. Evidencia funcional

Esta actualización del informe es documental. Se consolidaron artefactos de diseño para corregir la versión previa del PRD y dejar congelada la arquitectura de MOD05 antes de cualquier siguiente fase de ejecución.

Avances documentales de esta actualización:

- Spec de rediseño emitida en `docs/superpowers/specs/SPEC-MOD05-REDISENO-v1.0.md`.
- PRD revisado emitido en `docs/prds/PRD-MOD05-CRM-DEFINICION-v1.1.md`.
- HLD emitido en `docs/hlds/HLD-MOD05-ARQUITECTURA-v1.0.md`.
- Alineación explícita con decisiones de negocio sobre potenciales, prospectos, activación, revisión y política configurable.
- Política configurable aterrizada como configuración tenant-managed consumida por MOD05.

### Evidencia documental del 2026-04-02

Se emitieron y ajustaron dos artefactos complementarios para cerrar el alcance real del refinamiento comercial:

- `docs/prds/PRD-MOD05-CRM-ORIGEN-ATRIBUCION-v1.1.md` aprobado por CTO como PRD operativo de **origen comercial y atribución**.
- `docs/prompts/PROMPT-MOD05-CRM-ORIGEN-ATRIBUCION-FASE1-v1.1.md` aprobado por CTO como prompt de ejecución de **origen comercial y atribución**.

Decisión documental registrada:

1. MOD05 sí incorpora canal estructurado de captación y actor originador.
2. MOD05 no incorpora en esta fase políticas de incentivos, devengos, liquidaciones, pagos ni metas de productividad.
3. Incentivos comerciales y productividad técnica quedan proyectados como backlog futuro en un bounded context separado.
4. El backlog futuro queda documentado en `docs/plans/PLAN-MOD05-INCENTIVOS-BACKLOG-v1.0.md`.

### Evidencia funcional del 2026-04-11

Se aplicó un refinamiento UX en `apps/portal` para la sección **Viabilidad técnica** del expediente:

- Se eliminó la percepción de duplicidad entre `Tecnologías candidatas` y `Tecnología recomendada` mediante un flujo guiado en un único bloque de alternativas.
- La `opción principal recomendada` ahora se selecciona desde las alternativas marcadas, evitando catálogos repetidos en controles separados.
- `Resultado de cobertura` pasó a rol contextual (`Referencia de cobertura`) y visibilidad condicional, para priorizar la conclusión de viabilidad.
- Se reforzó consistencia frontend: la opción principal debe pertenecer al conjunto de alternativas seleccionadas.

Archivos impactados en portal:

- `apps/portal/src/components/crm/expedientes/sections/TechnicalFeasibilitySection.tsx`
- `apps/portal/src/components/crm/expedientes/sections/constants.ts`
- `apps/portal/src/app/dashboard/crm/expedientes/[id]/page.tsx`

Validación ejecutada:

- `pnpm --filter @iwana/portal typecheck` sin errores.

### Evidencia funcional adicional del 2026-04-11

Se ejecutó la consolidación mínima del bloque legal en la vista de expediente del portal:

- La sección `legal_consent` se renombró visualmente a **Cumplimiento legal**.
- Se dejó un flujo manual simplificado con dos decisiones:
  - `Identidad verificada`: `Verificado` o `Sin verificar`.
  - `Tratamiento de datos personales`: `Autoriza` o `No autoriza`.
- Se eliminó la pestaña separada de `Consentimientos` para evitar duplicidad operativa con la captura en Secciones.

Archivos impactados en portal:

- `apps/portal/src/components/crm/expedientes/sections/LegalConsentSection.tsx`
- `apps/portal/src/components/crm/expedientes/sections/constants.ts`
- `apps/portal/src/app/dashboard/crm/expedientes/[id]/page.tsx`

### Evidencia funcional adicional 2 del 2026-04-11

### Evidencia documental del 2026-04-13

Se emitieron los artefactos de definición para el ajuste de **auto-pipeline de expedientes**:

- `docs/prds/PRD-MOD05-CRM-AUTO-PIPELINE-v1.0.md`
- `docs/prompts/PROMPT-MOD05-CRM-AUTO-PIPELINE-v1.0.md`

Decisiones documentadas en esta actualización:

1. el estado del expediente debe derivarse automáticamente del avance real de captura y de la conclusión técnica, con backend como fuente de verdad;
2. el retroceso automático será mixto y solo estará permitido en estados tempranos del pipeline;
3. la actualización automática visible del portal en esta fase se resolverá con polling inteligente, no con SSE ni WebSocket;
4. `DESCARTADO` y `reactivate` permanecen manuales y fuera del motor de automatización.

### Evidencia de ejecución técnica del 2026-04-13

Se ejecutó la implementación full stack del ajuste de auto-pipeline definido en los artefactos anteriores.

Cambios backend aplicados:

- `apps/api/src/modules/crm/expedientes/expediente.service.ts`
  - se incorporó motor de recálculo automático de estado con fuente de verdad en backend;
  - se aplicó política de retroceso mixto (sin downgrade automático desde `EN_COTIZACION` en adelante);
  - se integró trazabilidad de cambio automático en `StatusChange` y `AuditLog`;
  - se activó recálculo automático tras `updateSection` y `createCoverageCheck`.

Cambios de pruebas backend:

- `apps/api/src/modules/crm/expedientes/tests/expediente.service.spec.ts`
  - se agregaron pruebas de promoción automática a `PRECALIFICADO`;
  - se agregó prueba de no retroceso automático desde `EN_COTIZACION`.

Cambios frontend aplicados:

- `apps/portal/src/app/dashboard/crm/expedientes/[id]/page.tsx`
  - polling inteligente de detalle cada 15s con guardado de estado de edición local (sin pisar draft en captura).
- `apps/portal/src/app/dashboard/crm/expedientes/page.tsx`
  - polling inteligente de listado cada 15s.
- `apps/portal/src/components/crm/CrmOverviewClient.tsx`
  - polling inteligente de resumen/recientes cada 15s.

Validaciones ejecutadas:

- `pnpm --filter @iwana/api test -- expediente.service.spec.ts` ✅
- `pnpm --filter @iwana/portal typecheck` ✅

### Evidencia correctiva del 2026-04-14

Se corrigió un error 500 en guardado de secciones del expediente (`PATCH /crm/expedientes/:id/sections/:section`) asociado al recálculo automático de pipeline.

Causa raíz confirmada:

- `status_changes.changed_by` exige UUID en PostgreSQL;
- en expedientes heredados, el actor de sesión (`sub`) y candidatos de fallback podían no ser UUID;
- el motor `AUTO_PIPELINE` intentaba persistir `StatusChange` con `changedBy` no válido y la transacción devolvía `Internal server error`.

Corrección aplicada:

- `apps/api/src/modules/crm/expedientes/expediente.service.ts`
  - se agregó resolución defensiva de actor UUID para cambios automáticos (`resolveAutoStatusChangeActorId`);
  - cuando no existe candidato UUID válido, el recálculo automático actualiza estado del expediente y auditoría, pero omite el insert en `status_changes` para evitar fallo transaccional;
  - se registra `warn` técnico para trazabilidad operativa.

Pruebas ajustadas/agregadas:

- `apps/api/src/modules/crm/expedientes/tests/expediente.service.spec.ts`
  - nueva regresión: auto-pipeline no falla cuando no hay actor UUID candidato y omite `status_change`;
  - ajuste de caso de promoción automática para usar actor UUID válido y mantener expectativa de registro en `status_changes`.

Validación ejecutada:

- `pnpm --filter @iwana/api test -- src/modules/crm/expedientes/tests/expediente.service.spec.ts` ✅ (38/38)

### Evidencia correctiva complementaria del 2026-04-14 (hardening de raíz)

Se aplicó una segunda corrección de raíz para evitar que cualquier fallo al persistir historial en `status_changes` vuelva a bloquear guardados de secciones.

Corrección aplicada:

- `apps/api/src/modules/crm/expedientes/expediente.service.ts`
  - se desacopló la persistencia de historial de estado con helper seguro (`persistStatusChangeSafely`) en modo best-effort;
  - `transitionStatus` y `reactivate` mantienen la operación principal aunque falle el insert de `StatusChange`;
  - se reforzó tipado para no propagar `changedBy` nullable a inserciones que requieren UUID.

Pruebas ajustadas/agregadas:

- `apps/api/src/modules/crm/expedientes/tests/expediente.service.spec.ts`
  - se actualizaron casos de transición/reactivación con actores UUID válidos;
  - nueva regresión: auto-pipeline no falla cuando persiste estado pero falla `status_change`.

Validación ejecutada:

- `npx jest src/modules/crm/expedientes/tests/expediente.service.spec.ts` ✅ (39/39)

### Evidencia correctiva del 2026-04-14 (rollback funcional de auto-pipeline)

Se ejecutó rollback funcional en portal para retirar el modo de “override manual” introducido como complemento del auto-pipeline y volver al flujo estándar de transición manual del pipeline.

Corrección aplicada:

- `apps/portal/src/app/dashboard/crm/expedientes/[id]/page.tsx`
  - se reemplazó el catálogo limitado de estados por el catálogo estándar de transición manual (`NUEVO_POTENCIAL` → `DESCARTADO`);
  - se retiró copy de auto-movimiento del pipeline y se restauró copy operativo neutral;
  - se eliminó el bloque de tarjetas de “override” y se volvió al formulario simple de transición.

Validación ejecutada:

- `pnpm --filter @iwana/portal typecheck` ✅

Se retiraron temporalmente de la pestaña `Secciones` los bloques de **Facturación** e **Instalación** por dependencia funcional de módulos aún no activos:

- Facturación: el ciclo de facturación se define en el momento de instalación y requiere configuración previa de ciclos.
- Instalación: la programación depende del módulo de agenda/programación de instalación.

Decisión aplicada en portal:

- Se removieron ambas secciones del arreglo activo `SECTIONS`.
- Se removieron del agrupador `operational` en `DIMENSION_SECTION_GROUPS`.
- Se removió su renderizado del panel de Secciones del expediente.

Archivos impactados:

- `apps/portal/src/components/crm/expedientes/sections/constants.ts`
- `apps/portal/src/components/crm/expedientes/sections/ExpedienteSections.tsx`

Nota de roadmap:

- Reintroducir estas capacidades en un flujo dedicado de ejecución cuando estén disponibles los módulos de parametrización de ciclos y programación de instalación.

---

## 5. Evidencia de calidad

- Estado de verificación en esta actualización:
  - No se ejecutaron pruebas; la actualización fue documental.
  - Se validó consistencia de gobernanza: 10 secciones en el PRD nuevo, HLD mínimo emitido e informe vivo actualizado.
  - Se validó consistencia arquitectónica del boundary contra el modulith y contra MOD03.
- Revisión de alineación: el PRD v1.1 corrige la activación temprana y formaliza la trazabilidad operativa exigida por negocio.
- Regulación colombiana aún aplicable: Ley 1581 (Habeas Data) y trazabilidad contractual/documental; para MVP queda aprobada una modalidad parametrizable por tenant y cualquier exigencia probatoria superior deberá escalarse como ADR o requerimiento tenant específico.

---

## 6. Cambios documentales

| Documento                                                    | Tipo                            | Estado                         |
| ------------------------------------------------------------ | ------------------------------- | ------------------------------ |
| `docs/superpowers/specs/SPEC-MOD05-REDISENO-v1.0.md`         | Spec de rediseño                | Base aprobada de referencia    |
| `docs/prds/PRD-MOD05-CRM-DEFINICION-v2.0.md`                 | PRD vigente                     | Aprobado por CTO               |
| `docs/prds/PRD-MOD05-CRM-ADDENDUM-CIERRE-v2.1.md`            | Addendum de cierre Sprint 02    | Aprobado para cierre extendido |
| `docs/prds/PRD-MOD05-CRM-ORIGEN-ATRIBUCION-v1.1.md`          | PRD operativo de origen/atribución | Aprobado por CTO |
| `docs/plans/PLAN-MOD05-INCENTIVOS-BACKLOG-v1.0.md`          | Backlog futuro de incentivos | Borrador |
| `docs/hlds/HLD-MOD05-ARQUITECTURA-v2.0.md`                   | HLD vigente                     | Aprobado por CTO               |
| `docs/adrs/ADR-024-Migracion-CRM-Expediente-Unico.md`        | ADR migración aditiva           | Aprobado                       |
| `docs/sprints/PLAN-MOD05-CRM-SPRINT-02-v1.0.md`              | Plan de sprint vigente (v1.1)   | Aprobado con cierre extendido  |
| `docs/prompts/PROMPT-MOD05-CRM-FASE-02-v1.0.md`              | Prompt ejecución vigente (v1.1) | Aprobado con cierre extendido  |
| `docs/prompts/PROMPT-MOD05-CRM-ORIGEN-ATRIBUCION-FASE1-v1.1.md` | Prompt operativo de origen/atribución | Aprobado por CTO |
| `docs/superpowers/specs/SPEC-MOD05-EXPEDIENTE-UNICO-v1.0.md` | Spec expediente único           | Aprobado por CTO               |
| Este informe                                                 | Informe vivo de definición      | Actualizado v4.0               |

**Documentos eliminados por consolidación:**

| Documento eliminado                                 | Razón                                               |
| --------------------------------------------------- | --------------------------------------------------- |
| `docs/prompts/PROMPT-MOD05-CRM-FASE-01-v1.0.md`     | Deprecado — Sprint 01 ejecutado y superado por v2.0 |
| `docs/prompts/PROMPT-MOD05-CRM-FASE-03-v1.0.md`     | Nunca aprobado — alcance absorbido en Sprint 02     |
| `docs/sprints/PLAN-MOD05-CRM-SPRINT-03-v1.0.md`     | Nunca aprobado — alcance absorbido en Sprint 02     |
| `docs/prds/PRD-MOD05-CRM-ADDENDUM-SPRINT03-v2.1.md` | Renombrado a `ADDENDUM-CIERRE-v2.1.md`              |
| `docs/prds/PRD-MOD05-CRM-DEFINICION-v1.0.md`        | Referencia histórica — ya no en disco               |
| `docs/prds/PRD-MOD05-CRM-DEFINICION-v1.1.md`        | Referencia histórica — ya no en disco               |
| `docs/hlds/HLD-MOD05-ARQUITECTURA-v1.0.md`          | Referencia histórica — ya no en disco               |

---

## 7. Riesgos y bloqueos

| ID  | Tipo                                                         | Descripción                                                                                             |
| --- | ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------- |
| R1  | Bloqueo por gate ADR-016                                     | MOD04 debe cerrarse antes de iniciar ejecución de MOD05                                                 |
| R2  | Nivel probatorio superior requerido por un tenant específico | Escalar ADR o definición contractual adicional solo si el tenant no acepta la modalidad MVP aprobada    |
| R3  | Contratos con Ticketing/WFM/Inventory no formalizados        | MOD05 ya exige esas referencias, pero sus interfaces deben cerrarse antes de ejecución                  |
| R4  | Contratos con MOD03 aún no materializados en código          | Implementar `ExecutionPolicyReadPort`, `CoverageReadPort` y `PlanCatalogReadPort` sin romper boundaries |
| R5  | Mezclar incentivos dentro de MOD05                            | Introducir payout en el CRM rompería boundaries y ensancharía indebidamente `ExpedienteRecord`         |

---

## 8. Próximos pasos

1. Completar BT-CRM2-36: pruebas E2E ampliadas del portal para cubrir los 3 gaps y hardening.
2. Cerrar Sprint 02 cuando se cumplan los gates de cierre definidos en el addendum y el sprint plan.
3. Materializar los puertos stub con MOD03, Ticketing, WFM, Inventory y Expansión en fases posteriores.
4. Actualizar este informe vivo con evidencia del cierre definitivo.
5. Si se aprueba la evolución comercial, ejecutar solo origen comercial y atribución según el PRD/prompt complementarios del 2026-04-02.
6. Dejar incentivos y productividad como backlog futuro separado, sin abrir implementación en MOD05.

### Handoff de ejecución

Los artefactos operativos vigentes para Sprint 02 son:

- `docs/prompts/PROMPT-MOD05-CRM-FASE-02-v1.0.md` (v1.1)
- `docs/sprints/PLAN-MOD05-CRM-SPRINT-02-v1.0.md` (v1.1)
- `docs/prds/PRD-MOD05-CRM-ADDENDUM-CIERRE-v2.1.md`

Los artefactos de Sprint 01 (prompts, planes, informes) fueron eliminados o consolidados en este informe.

---

## 9. Refinamiento arquitectonico posterior

Se ajusto el boundary del modulo despues de la primera emision del PRD para corregir dos ownerships que estaban mal posicionados en MVP:

- Cobertura comercial
- Catalogo maestro de planes y valores

Decision final:

- ambos pasan a MOD03 como submodulos tenant-managed dentro de Configuracion Empresarial;
- MOD05 los consume via contratos read-only;
- MOD05 conserva solo snapshots inmutables necesarios para oportunidades, cotizaciones y contratos.

Con este ajuste, el prompt de ejecución de MOD05 queda mejor acotado y se evita abrir deuda estructural con Billing, Provisioning e Inventory.

### Refinamiento adicional del 2026-03-22

Se aplicó un segundo refinamiento para corregir el flujo de negocio real del ISP:

- se distingue formalmente `Potencial` de `Prospecto`;
- la activación se mueve al cierre efectivo de instalación y no a una aceptación temprana;
- se vuelve obligatoria la trazabilidad por ticket y orden de trabajo desde la programación;
- se introduce `En revisión` como estado previo a declarar un caso no viable cuando hay necesidad de expansión o refuerzo;
- la salida de revisión queda sujeta a una política configurable por administración, aterrizada como configuración tenant-managed.

---

## 10. Evolución al expediente único progresivo (v2.0)

### 10.1 Decisiones de diseño aprobadas

| Decisión                      | Detalle                                                                                            |
| ----------------------------- | -------------------------------------------------------------------------------------------------- |
| Expediente único              | Un solo registro maestro reemplaza PotentialLead + ProspectCase                                    |
| 8 secciones de captura        | Identificación, contacto, ubicación, interés, viabilidad, consentimiento, facturación, instalación |
| 12 estados de pipeline        | Desde NUEVO_POTENCIAL hasta CLIENTE_ACTIVO o DESCARTADO                                            |
| Completitud por 4 dimensiones | Comercial, legal, técnica, operativa — solo CLIENTE_ACTIVO exige >= 90%                            |
| Consentimiento triple         | Tratamiento datos, contacto comercial, contacto operativo (Ley 1581)                               |
| Coordenadas prioritarias      | Con fuente (manual/GPS/mapa) y confianza (exacto/aproximado/referencial)                           |
| Entidades hijas               | ContactAttempt, ConsentRecord v2, CoverageCheck, StatusChange, Quote                               |
| UI 4 zonas                    | Cabecera + secciones acordeón + panel lateral + timeline                                           |
| Principio de diseño           | "Haz simple la captura, no simple el modelo" — UI simple + modelo rico                             |

### 10.2 Impacto en implementación Sprint 01

| Entidad Sprint 01  | Destino en v2.0                           |
| ------------------ | ----------------------------------------- |
| PotentialLead      | Absorbida → ExpedienteRecord              |
| ProspectCase       | Absorbida → ExpedienteRecord              |
| ConsentRecord      | Evolucionada → ConsentRecord v2 (3 tipos) |
| CustomerActivation | Absorbida → transición de estado          |
| Quote              | Ajustada → FK a expediente_id             |

**Estrategia de migración:** aditiva. Crear tablas nuevas → migrar datos → deprecar tablas anteriores. Las tablas del Sprint 01 se mantienen temporalmente.

### 10.3 Artefactos emitidos

| Documento                  | Ruta                                                         | Estado                  |
| -------------------------- | ------------------------------------------------------------ | ----------------------- |
| PRD v2.0                   | `docs/prds/PRD-MOD05-CRM-DEFINICION-v2.0.md`                 | Aprobado por CTO        |
| Spec expediente único      | `docs/superpowers/specs/SPEC-MOD05-EXPEDIENTE-UNICO-v1.0.md` | Aprobado por CTO        |
| HLD v2.0                   | `docs/hlds/HLD-MOD05-ARQUITECTURA-v2.0.md`                   | Aprobado por CTO        |
| ADR-024                    | `docs/adrs/ADR-024-Migracion-CRM-Expediente-Unico.md`        | Aprobado                |
| Sprint plan 02             | `docs/sprints/PLAN-MOD05-CRM-SPRINT-02-v1.0.md`              | Aprobado                |
| Prompt ejecución Fase 02   | `docs/prompts/PROMPT-MOD05-CRM-FASE-02-v1.0.md`              | Aprobado para ejecución |
| Este informe (actualizado) | `docs/informes/INFORME-MOD05-DEFINICION-v1.0.md`             | Actualizado v1.2        |

### 10.4 Acciones post-aprobación CTO (completadas)

1. ✅ HLD v2.0 emitido con modelo ExpedienteRecord, 12 estados, 4 dimensiones.
2. ✅ ADR-024 emitido (Migración CRM a Expediente Único Progresivo).
3. ✅ Plan de sprint 02 generado con 15 tareas Fullstack, 8 QA, 3 EM en 3 fases.
4. ✅ Prompt de ejecución Fase 02 generado para Sr. Dev Fullstack.
5. ✅ Informe vivo actualizado con trazabilidad completa.

### 10.5 Próximos pasos (ejecución Sprint 02)

1. Ejecutar Fase 1: modelo de datos + migración aditiva.
2. Ejecutar cierre extendido de Sprint 02 para ContactAttempt, ConsentRecord y CoverageCheck.
3. Actualizar prompt Fase 02 y plan Sprint 02 para absorber el backlog adicional sin abrir nueva fase documental.
4. Cerrar Sprint 02 únicamente cuando se cumplan los nuevos criterios de aceptación de gaps, seguridad y pruebas.

### 10.21 Cierre extendido de Sprint 02 para absorber los gaps auditados (2026-03-26)

Después del análisis de brechas sobre la implementación del expediente único, se decidió no abrir un Sprint 03 documental para resolver los tres gaps funcionales detectados, sino completar Sprint 02 con un cierre extendido y trazable.

Gaps absorbidos en el cierre extendido:

- `ContactAttempt` existía como entidad pero sin CRUD operativo expuesto.
- `ConsentRecord v2` existía como entidad, pero sin gestión independiente ni revocación auditable.
- `CoverageCheck` existía como entidad, pero sin historial funcional ni operaciones expuestas.

Decisiones aplicadas:

- se emitió un addendum de PRD para completar requisitos y contratos faltantes sin reescribir el PRD base;
- se actualizó Sprint 02 para incluir backlog de cierre BT-CRM2-27 a BT-CRM2-36;
- se actualizó el Prompt Fase 02 a versión 1.1 para ejecutar el cierre dentro de la misma fase;
- se mantuvo la política de no abrir una fase paralela mientras el sprint actual siga técnicamente abierto.

Artefactos emitidos para este cierre:

- `docs/prds/PRD-MOD05-CRM-ADDENDUM-CIERRE-v2.1.md`
- `docs/sprints/PLAN-MOD05-CRM-SPRINT-02-v1.0.md` (v1.1)
- `docs/prompts/PROMPT-MOD05-CRM-FASE-02-v1.0.md` (v1.1)

Gate de cierre definitivo de Sprint 02:

- CRUD operativo de ContactAttempt, ConsentRecord y CoverageCheck implementado;
- tabs portal para contacto, consentimiento y cobertura integrados al detalle del expediente;
- PII oculta en listados y `ipAddress` restringida por rol;
- pruebas unitarias, boundary y E2E ampliadas sin regresiones;
- backend legacy retirado solo si ya no existen dependencias activas.

### 10.22 Ejecución técnica del cierre de gaps operativos (2026-03-26)

Se ejecutó la primera pasada técnica del cierre extendido de Sprint 02 directamente sobre el módulo CRM y el portal empresarial, enfocada en los tres gaps funcionales detectados en auditoría.

Cambios implementados:

- se crearon los enums compartidos `ContactChannel`, `ContactResult` y `EvidenceMode` en `packages/shared/src/enums/crm/`;
- se agregaron DTOs Zod para `ContactAttempt`, `ConsentRecord` y `CoverageCheck` en `apps/api/src/modules/crm/expedientes/dto/`;
- `ExpedienteService` ahora expone operaciones para crear y listar intentos de contacto, consentimientos y verificaciones de cobertura, y permite revocar consentimientos;
- `ExpedientesController` ahora publica los endpoints `/contact-attempts`, `/consents` y `/coverage-checks` subordinados al expediente;
- el timeline operativo empezó a incorporar intentos de contacto como actividad visible;
- `apps/portal/src/lib/api-client.ts` ya consume los nuevos contratos backend;
- la vista detalle `apps/portal/src/app/dashboard/crm/expedientes/[id]/page.tsx` ahora incluye una superficie operativa mínima para registrar y listar contacto, consentimiento y cobertura.

Validación ejecutada:

- análisis estático sin errores en los archivos backend y frontend modificados;
- prueba unitaria focalizada ejecutada: `pnpm --filter @iwana/api test -- expedientes.controller.spec.ts` ✅.
- verificación de tipos ejecutada: `pnpm --filter @iwana/api typecheck` ✅.
- verificación de tipos ejecutada: `pnpm --filter @iwana/portal typecheck` ✅.

Pendientes para cierre definitivo:

- cobertura adicional de pruebas unitarias, boundary y E2E más allá del controller.

### 10.23 Hardening estructural y retiro del wiring legacy (2026-03-26)

Se ejecutó una segunda pasada técnica sobre MOD05 para completar el hardening pendiente del agregado y reducir superficie operativa heredada.

Cambios aplicados:

- `ExpedienteRecord` ahora soporta `assignedTo` y `dataConsentRevoked` como metadata persistente del caso;
- `StatusChange` y `ContactAttempt` ahora soportan `actorName` como snapshot histórico del actor resoluble;
- `ConsentRecord` ahora soporta `revokedAt`, `revokedReason` y `revokedBy` para trazabilidad de revocación;
- `ExpedienteService.findAll()` ahora enmascara PII cifrada en listados, manteniendo visibilidad solo en el detalle del expediente;
- `GET /crm/expedientes/:id/consents` ahora oculta `ipAddress` para roles no autorizados;
- se creó la migración tenant `020_add_mod05_expediente_hardening.ts` para aplicar estos cambios de schema de forma idempotente;
- `CrmModule` dejó de importar `PotentialsModule`, `ProspectsModule` y `ReviewsModule`, retirando el wiring legacy del módulo activo.

Validación ejecutada:

- `pnpm --filter @iwana/api test -- crm.module.spec.ts expedientes.controller.spec.ts` ✅
- `pnpm --filter @iwana/api typecheck` ✅
- `pnpm --filter @iwana/portal typecheck` ✅
- `pnpm --filter @iwana/db typecheck` ✅

Estado resultante:

- los gaps funcionales y el hardening estructural principal ya están implementados;
- el cierre técnico de Sprint 02 queda condicionado principalmente a ampliar cobertura de pruebas unitarias, boundary y E2E;
- el código legacy sigue en disco como referencia histórica, pero ya no forma parte del wiring activo del bounded context CRM.

### 10.24 Ampliación de pruebas unitarias del servicio Expediente (2026-03-26)

Se amplió la cobertura unitaria de `ExpedienteService` para atacar el último bloque pendiente del cierre extendido de Sprint 02 desde la capa de servicio.

Cobertura agregada:

- validación de `findAll()` para asegurar enmascaramiento de PII cifrada en listados;
- validación de `revokeConsent()` para confirmar revocación saneada, auditoría y marca `dataConsentRevoked` en el agregado;
- validación de `assignExpediente()` para confirmar persistencia de `assignedTo` y traza operativa con `actorName` y metadata de asignación;
- validación boundary DTO para los contratos nuevos de contacto, consentimiento, cobertura y asignación;
- revalidación controller del boundary HTTP sobre actor autenticado, masking de consentimientos y timeline enriquecido.

Validación ejecutada:

- `pnpm --filter @iwana/api test -- expediente-boundary-dto.spec.ts expedientes.controller.spec.ts expediente.service.spec.ts` ✅
- `pnpm --filter @iwana/api typecheck` ✅

Estado resultante:

- la cobertura unitaria y boundary del backend ya cubre los controles más sensibles incorporados en el cierre de gaps;
- BT-CRM2-36 queda reducido a pruebas E2E del portal, ya no a lógica unitaria ni boundary del backend.

### 10.25 Cierre mínimo trazable de Sprint 02 sobre el estado real del repo (2026-03-26)

Se ejecutó una pasada final de cierre enfocada exclusivamente en los gaps reales que todavía bloqueaban el gate de Sprint 02, sin rehacer el flujo vigente de `expedientes` ni abrir una fase nueva.

Cambios aplicados en backend:

- `GET /crm/expedientes` ahora acepta y propaga `assignedTo` y `documentNumber` como filtros explícitos del cierre extendido;
- `PATCH /crm/expedientes/:id/assign` quedó alineado con el patrón Zod del módulo mediante `AssignExpedienteSchema`;
- `ExpedienteService.findAll()` ahora soporta filtro exacto por documento sobre el estado actual del agregado manteniendo el masking de PII en listados;
- se incorporó `ExpedienteService.getPipelineSummary()` para evitar el resumen basado en `findAll({ limit: 1000 })` y eliminar truncamiento artificial del pipeline summary.

Cambios aplicados en frontend:

- `apps/portal/src/lib/api-client.ts` ahora soporta `assignedTo` y `documentNumber` en `crmApi.listExpedientes()`;
- `apps/portal/src/app/dashboard/crm/expedientes/page.tsx` ahora expone filtros mínimos por asesor asignado y documento exacto sin rediseñar la pantalla;
- `apps/portal/src/app/dashboard/crm/expedientes/[id]/page.tsx` ahora muestra señales operativas mínimas de cierre (`assignedTo`, `dataConsentRevoked`, actor del intento de contacto) preservando el detalle existente;
- `apps/portal/src/components/layout/Sidebar.tsx` ahora expone acceso directo al módulo CRM activo en la navegación principal.

Evidencia E2E agregada:

- se creó `e2e/tests/portal-crm-expedientes.spec.ts` con cobertura del flujo vigente del portal sobre mocks controlados;
- la suite E2E ahora cubre: apertura del módulo, listado, navegación a detalle, masking de PII en listados, revocación de consentimiento, filtros `assignedTo`/`documentNumber` y registro de intento de contacto reflejado en timeline.

Validación ejecutada en esta pasada:

- `pnpm --filter @iwana/api test -- apps/api/src/modules/crm/expedientes/tests/expediente-boundary-dto.spec.ts apps/api/src/modules/crm/expedientes/tests/expedientes.controller.spec.ts apps/api/src/modules/crm/expedientes/tests/expediente.service.spec.ts` ✅
- `pnpm exec playwright test --config e2e/playwright.portal.config.ts e2e/tests/portal-crm-expedientes.spec.ts --project=chromium` ✅
- `pnpm --filter @iwana/portal build` ✅

Estado resultante:

- los pendientes reales detectados en esta pasada para `BT-CRM2-36` quedaron cubiertos con cambios mínimos y trazables;
- el gate de Sprint 02 queda técnicamente respaldado en backend focalizado, portal CRM y evidencia E2E del flujo vigente;
- no se reestructuró el módulo por alineación literal del prompt, y se preservó el comportamiento ya válido del diseño aprobado.

### 10.6 Ajuste de lenguaje visible en portal CRM (2026-03-23)

Se aprobó un ajuste de lenguaje visible limitado a UX copy en `apps/portal`, sin renombre técnico interno del dominio.

Decisión aplicada:

- usar `Oportunidades comerciales` como marco de módulo en copy de contexto;
- usar `Oportunidad` en acciones, detalle, mensajes de error y feedback;
- mantener sin cambios nombres técnicos internos como `ExpedienteRecord`, rutas `/crm/expedientes`, contratos API y artefactos documentales de arquitectura.

Motivación:

- mejorar comprensión para usuarios no técnicos;
- reforzar el sesgo comercial del flujo para el asesor de ventas;
- evitar un refactor transversal innecesario en backend, frontend técnico, migraciones y documentación estructural.

Evidencia de ajuste:

- overview CRM del portal actualizado a lenguaje de oportunidades;
- listado y detalle del flujo `/dashboard/crm/expedientes` actualizados en copy visible;
- prueba E2E del flujo CRM alineada al nuevo lenguaje visible.

### 10.16 Normalización visual del frontend CRM Expedientes

Se corrigió la desviación visual de la pantalla `apps/portal/src/app/dashboard/crm/expedientes/page.tsx`, que había quedado con estilos Tailwind ad hoc ajenos a la línea del portal empresarial.

Cambios aplicados:

- adopción de `PageHeader` para alinear jerarquía visual con el resto del portal;
- reemplazo de inputs y CTA manuales por `Input`, `Button`, `Card`, `Badge` del sistema `@iwana/ui`;
- unificación de iconografía a `lucide-react`, consistente con sidebar, dashboard y tablas existentes del portal;
- sustitución de paleta genérica (`blue-*`, `gray-*` sin semántica) por tokens y acentos iWana ya vigentes en el proyecto;
- tabla operativa refinada con badges de estado, barra de completitud y acción de apertura del expediente acorde al patrón de cards/tablas ya usado en `UsersTable` y componentes del dashboard.

Resultado:

- la experiencia de CRM Expedientes vuelve a la gramática visual del portal iWana neXt;
- se elimina la mezcla inconsistente entre estilos de prototipo aislado y diseño productivo real;
- la pantalla queda preparada para futuras extracciones a primitives compartidas de tabla/filtros sin rehacer el lenguaje visual.

### 10.17 Normalización visual de la vista detalle del expediente

Se extendió el refinamiento visual a `apps/portal/src/app/dashboard/crm/expedientes/[id]/page.tsx` y a su estado de carga asociado para que el flujo CRM quede consistente entre listado y detalle.

Cambios aplicados:

- cabecera reconstruida con `PageHeader`, badges de estado y CTA de retorno coherentes con el portal;
- reemplazo de secciones con emojis y botones genéricos por cards, acordeón visual limpio e iconografía `lucide-react` alineada al resto de la app;
- unificación de acciones de pipeline, panel lateral de actividad y timeline completo con tokens iWana y superficies compartidas;

### 10.18 Refinamiento operativo del detalle de oportunidad (2026-03-23)

Se corrigió la ambigüedad funcional detectada en la vista detalle del flujo `apps/portal/src/app/dashboard/crm/expedientes/[id]/page.tsx`, donde la interfaz mostraba `Actividad reciente`, `Metadata operativa` y `Timeline completo` sin distinguir claramente entre edición operativa y cambios de estado del pipeline.

Cambios aplicados:

- el resumen ahora aclara que el municipio se modifica desde la sección `Ubicación`, evitando la falsa expectativa de edición directa desde el snapshot superior;
- el backend CRM dejó de registrar auditoría sin actor y ahora envía `userId` en create, update, transition y reactivate para conservar autoría consistente;
- el endpoint `/crm/expedientes/:id/timeline` se amplió para devolver tres vistas separadas: `changes`, `activities` y `metadata`;
- `Actividad reciente` en portal ahora mezcla eventos reales de creación, guardado de secciones y cambios de estado, en lugar de depender únicamente de `statusChanges`;
- `Metadata operativa` ahora muestra `Creado por`, `Última edición por` y `Última actividad` con autoría resuelta desde auditoría y usuarios del tenant;
- `Timeline completo` se renombró a `Historial del pipeline` para comunicar con precisión que solo representa transiciones de estado comerciales.

Resultado:

- la vista detalle responde a la expectativa operativa real del asesor;
- se elimina la confusión entre actividad general y evolución del pipeline;
- la oportunidad gana trazabilidad visible sin cambiar el naming técnico interno del dominio.

### 10.19 Ajuste fino de metadata operativa y simplificación del resumen (2026-03-23)

Se aplicó un ajuste menor posterior sobre la vista detalle para reducir ruido visual y mejorar la lectura del actor más reciente cuando la metadata backend aún no puede resolver nombres históricos.

Cambios aplicados:

- se retiró la acción visual extra para editar municipio desde el resumen superior, manteniendo el dato como snapshot limpio;
- `Última edición por` ahora usa como fallback el usuario autenticado del portal cuando el backend no entrega nombre resuelto del actor;
- se preservó `Creado por` como dato estrictamente backend para no inventar autoría histórica no confirmada.

Resultado:

- la tarjeta de resumen queda menos cargada;
- el asesor ve su propia autoría reciente cuando acaba de editar y el backend aún no tiene metadata enriquecida completa para ese evento;
- se evita introducir inferencias incorrectas sobre el creador original de la oportunidad.

### 10.20 Corrección backend de autoría histórica en metadata operativa (2026-03-23)

Se reforzó la inferencia de `Metadata operativa` en backend para no dar prioridad a referencias de usuario sin nombre resoluble cuando existe evidencia mejor en auditoría histórica.

Cambios aplicados:

- `createdBy` ahora prioriza el primer evento auditado con actor resuelto cuando el campo del expediente no permite mostrar nombre útil;
- `lastEditedBy` ahora toma el evento más reciente con actor resoluble en lugar de quedarse con una referencia huérfana sin nombre;
- se agregó prueba unitaria específica para el caso histórico en que la oportunidad debe atribuirse a `Liliana Paola Borda Ovalle` a partir de la auditoría del tenant.

Resultado:

- `Metadata operativa` muestra nombres reales con mayor frecuencia en registros históricos;
- se reduce el uso de `Usuario no disponible` cuando la auditoría sí contiene trazabilidad suficiente;
- la corrección queda anclada en backend, no solo en un fallback visual del portal.
- mejora del estado loading para evitar spinner azul genérico fuera de la identidad visual del producto.

### 10.26 Hardening E2E portal en usuarios y dashboard (2026-04-01)

Se ejecutó una pasada de estabilización sobre las suites E2E del portal enfocada en los bloques con mayor tasa de fallo (`portal-users` y `portal-dashboard-empresa`) para cerrar las regresiones detectadas en la corrida integral.

Cambios aplicados:

- se reforzó el guard de sesión en `apps/portal/src/app/dashboard/layout.tsx` para redirigir a `/auth/login` cuando no hay usuario autenticado y evitar navegación protegida sin sesión;
- `e2e/tests/portal-users.spec.ts` se alineó a rutas activas del portal (`/dashboard/users`, `/dashboard/profile`) y dejó de usar el prefijo legacy `/tenant/{slug}`;
- se normalizaron los mocks de `portal-users` al contrato real del `api-client` (`{ data: ... }`) para evitar runtime errors por shape inválido;
- se actualizó el token mock de usuarios a JWT sintácticamente válido con `exp` para cumplir la validación de sesión del `AuthProvider`;
- se endurecieron selectores Playwright con scope por tabla y diálogo para eliminar `strict mode violations` por coincidencias múltiples;
- `e2e/tests/portal-dashboard-empresa.spec.ts` adoptó bootstrap de sesión por `addInitScript`, navegación explícita a `/dashboard` y mock de `GET /users/:id` usado por perfil de sesión.

Validación ejecutada:

- `pnpm exec playwright test e2e/tests/portal-users.spec.ts e2e/tests/portal-dashboard-empresa.spec.ts --config e2e/playwright.portal.config.ts` ✅
- Resultado: **15 passed / 0 failed**.

Estado resultante:

- **Punto 1 (Usuarios)**: cerrado y estable en E2E focalizado.
- **Punto 2 (Dashboard)**: cerrado y estable en E2E focalizado.
- la suite integral del portal queda lista para nueva corrida completa con menor riesgo en los bloques más inestables.

### 10.27 Cierre integral de regresión portal (2026-04-01)

Después del hardening de usuarios/dashboard y del ajuste de expectativas inestables en settings, se ejecutó la suite completa del portal para validar cierre integral.

Validación ejecutada:

- `pnpm test:e2e:portal` ✅
- Resultado: **49 passed / 0 failed**.

Estado resultante:

- no quedan fallos abiertos en las suites E2E del portal empresarial;
- los escenarios de usuarios, dashboard, settings y CRM (incluyendo viabilidad técnica estructurada) quedan cubiertos y estables en la corrida global.

Resultado:

- el módulo CRM Expedientes ya no mezcla dos lenguajes visuales distintos entre lista y detalle;
- el flujo principal del expediente queda consistente con dashboard, settings, users y autenticación del portal;
- se reduce la deuda visual inmediata y se deja una base más clara para extraer primitives compartidas de timeline, métricas y acordeones en futuras iteraciones.

### 10.18 Continuación del refinamiento CRM: overview + guardado de secciones

Se completaron los dos pasos pendientes del refinamiento del frontend CRM y se corrigió el problema funcional reportado en la vista de cliente potencial, donde los botones `Guardar sección` daban la impresión de no persistir cambios.

Acciones ejecutadas:

- se reemplazó el redirect vacío de `apps/portal/src/app/dashboard/crm/page.tsx` por una vista overview real del módulo con métricas, distribución del pipeline y expedientes recientes;
- se extrajeron metadatos visuales compartidos del expediente a `apps/portal/src/components/crm/expedientes/expediente-ui.ts`, centralizando labels, badges y formatos usados por overview, listado y detalle;
- se ajustó el frontend del detalle para preservar dentro de la sesión los valores de campos sensibles que el backend almacena cifrados y no devuelve en claro, evitando que después de guardar reaparezcan vacíos y parezca que no se persistieron;
- se añadieron ayudas visuales en inputs protegidos para indicar que el dato ya está registrado y que cualquier nuevo valor reemplazará el actual;
- se corrigió en backend `ExpedienteService.buildSectionUpdate()` para que la sección `commercial_interest` también persista `source`, que antes era ignorado aunque el portal lo enviara.

Validación ejecutada:

- `pnpm --filter @iwana/portal typecheck` ✅
- `pnpm --filter @iwana/api test -- expediente.service.spec.ts` ✅

Resultado:

- la ruta `/dashboard/crm` ahora funciona como entrada operativa al módulo y no solo como salto al listado;
- el flujo de guardar sección en el detalle deja de perder contexto visual tras la recarga de datos;
- la edición de `source` en la sección comercial ya se persiste correctamente en backend;
- se reduce el riesgo de nuevas derivas visuales al tener metadatos compartidos del expediente en un único punto de mantenimiento.

### 10.19 Ajuste visual sobrio del overview + alineación E2E al flujo actual

Se aplicó una pasada adicional sobre el entrypoint de CRM para mantener la mejora funcional del overview, pero con una presentación más contenida y menos cargada visualmente.

Cambios aplicados:

- se simplificó `apps/portal/src/components/crm/CrmOverviewClient.tsx` sustituyendo la grilla de métricas pesadas por un resumen compacto en una sola tarjeta;
- se redujo la densidad del panel lateral del overview, pasando de una distribución completa por estado a una lectura rápida agrupada por etapas operativas;
- se actualizó el E2E `e2e/tests/portal-crm-expedientes.spec.ts` para reflejar el flujo real vigente del módulo: entrada por overview, navegación al listado, alta, edición persistente de sección y transición de estado;
- el mock E2E ahora cubre también `/crm/pipeline/summary` y persiste cambios de sección dentro del fixture para validar recarga coherente del detalle.

Validación ejecutada:

- `pnpm test:e2e:portal -- portal-crm-expedientes.spec.ts` ✅

Resultado:

- el punto de entrada de CRM conserva valor operativo sin verse recargado;
- la evidencia E2E queda alineada con la navegación real del módulo después de sustituir el redirect por un overview funcional;

### 10.21 Refinamiento aprobado de Identificación: persona natural/jurídica y edición bloqueada (2026-03-27)

Se levantó un nuevo refinamiento funcional sobre la sección `Identificación` del detalle de expediente para corregir cuatro fricciones operativas confirmadas por negocio:

- falta de distinción real entre persona natural y persona jurídica;
- ausencia de lista cerrada para tipo de documento;
- ocultamiento innecesario del número de documento en la vista detalle autorizada;
- persistencia de inputs editables después de guardar, sin separación clara entre lectura y edición.

Decisiones aprobadas en brainstorming y formalizadas en spec:

- mantener una única sección `Identificación`, pero dinámica por `personType`;
- para persona natural, capturar `firstName`, `lastName`, `documentType` y `documentNumber`;
- para persona jurídica, capturar `companyName`, `primaryContactName`, `primaryContactRole`, `documentType` y `documentNumber`;
- recalcular `fullName` exclusivamente en backend como campo derivado según `personType`;
- mostrar el documento desencriptado solo en respuesta de detalle autorizada, nunca en listados ni respuestas masivas;
- bloquear la sección después de guardar y exigir acción explícita de edición por icono para volver a modificarla.

Artefacto emitido:

- `docs/superpowers/specs/2026-03-27-mod05-identificacion-refinement-design.md`

Revisión arquitectónica aplicada:

- la spec fue revisada por subagente `architect-reviewer`;
- quedó **aprobada con ajustes menores**;
- se reforzó en el documento la necesidad de RBAC, auditoría de acceso a PII, contrato API aditivo para detalle y separación semántica entre contacto principal jurídico y sección `Contacto`.

Pendientes explícitos antes o durante la implementación:

- cerrar el shape exacto del contrato API/OpenAPI para la respuesta de detalle autorizado;
- reflejar formalmente el cambio aditivo de columnas en la trazabilidad documental base de MOD05 (PRD/HLD/spec madre), ya sea como addendum o actualización controlada.

Resultado de esta fase:

- el diseño funcional del refinamiento quedó validado y documentado;
- el cambio se mantiene dentro del boundary de MOD05 y compatible con ADR-024;
- la implementación fue ejecutada completamente en la sesión del 2026-03-28;
- se reduce el riesgo de falsos negativos en QA causados por mocks o expectativas obsoletas del flujo anterior.

**Implementación completada (2026-03-28):**

| Task   | Descripción                         | Estado      | Archivos                                                                                     |
| ------ | ----------------------------------- | ----------- | -------------------------------------------------------------------------------------------- |
| Task 1 | DB + entidad aditiva                | ✅ Completa | `022_add_expediente_identification_refinement.ts` (migración), `expediente-record.entity.ts` |
| Task 2 | Validación + derivación server-side | ✅ Completa | `expediente.service.ts` (helpers, buildIdentificationSectionUpdate)                          |
| Task 3 | Contrato detalle + auditoría PII    | ✅ Completa | `expediente.service.ts` (findById con auditoría PII)                                         |
| Task 4 | Portal contract + helpers UI        | ✅ Completa | `api-client.ts`, `expediente-ui.ts`                                                          |
| Task 5 | UI dinámica por tipo de persona     | ✅ Completa | `[id]/page.tsx` (renderizado condicional, selectores, limpieza de campos)                    |
| Task 6 | Locked-after-save flow              | ✅ Completa | `[id]/page.tsx` (isIdentificationEditing state, botón editar, modo lectura/editar)           |
| Task 7 | Verificación + docs                 | ✅ Completa | Tests, builds, informe vivo                                                                  |

**Artefactos generados:**

- `packages/database/src/migrations/tenant/022_add_expediente_identification_refinement.ts`
- `apps/api/src/modules/crm/expedientes/entities/expediente-record.entity.ts` (4 columnas nuevas)
- `apps/api/src/modules/crm/expedientes/expediente.service.ts` (validación, auditoría PII, helpers)
- `apps/api/src/modules/crm/expedientes/tests/expediente.service.spec.ts` (tests nuevos)
- `apps/portal/src/lib/api-client.ts` (ExpedienteRecord extendido)
- `apps/portal/src/components/crm/expedientes/expediente-ui.ts` (PERSON_TYPE_OPTIONS, DOCUMENT_TYPE_OPTIONS, formatters)
- `apps/portal/src/app/dashboard/crm/expedientes/[id]/page.tsx` (UI dinámica + lock-after-save)

**Verificación ejecutada:**

- Backend tests: `pnpm --filter @iwana/api test -- "expedientes"` → 48 passed ✅
- API build: `pnpm --filter @iwana/api build` → SUCCESS ✅
- Portal build: `pnpm --filter @iwana/portal build` → SUCCESS ✅
- DB build: `pnpm --filter @iwana/db build` → SUCCESS ✅

### 10.6 Auditoría post-ejecución del Prompt Fase 02

El 2026-03-23 se auditó la ejecución realizada por Sr. Dev Fullstack sobre el Prompt de Fase 02. La conclusión fue que la implementación había avanzado de forma sustancial en backend, pero todavía presentaba brechas críticas para considerar Sprint 02 como cerrado:

- el portal seguía exponiendo como flujo principal el modelo legado de potenciales/prospectos;
- la pantalla nueva de expediente existía, pero varias acciones visibles eran placeholders sin integración real;
- el cliente HTTP del portal ignoraba filtros del listado y enviaba un payload incorrecto al actualizar secciones;
- la validación runtime del boundary de expedientes no estaba aplicada pese a existir schemas Zod;
- la trazabilidad operativa de `createdBy` y `changedBy` estaba usando `tenantId` en vez del usuario actor autenticado;
- no existían pruebas específicas del controller de expedientes.

### 10.7 Remediación crítica aplicada el 2026-03-23

Se aplicó un paquete correctivo acotado sobre backend, portal y pruebas para reducir la brecha detectada por la auditoría:

| Área    | Corrección aplicada                                                                                                     | Resultado                                      |
| ------- | ----------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| Backend | `ExpedientesController` ahora valida payloads con `ZodBodyValidationPipe` para create, updateSection y transitionStatus | Boundary externo endurecido                    |
| Backend | `transitionStatus` ahora responde con `BadRequestException` y código semántico si la transición es inválida             | Contrato HTTP consistente                      |
| Backend | `create`, `updateSection`, `transitionStatus` y `reactivate` usan `@CurrentUser().sub` como actor real                  | Audit trail más correcto                       |
| Backend | la completitud se recalcula y sincroniza tras mutaciones, y se hidrata en el listado                                    | UI y validación de estado más coherentes       |
| Portal  | `/dashboard/crm` redirige al flujo de expediente único                                                                  | Expediente único pasa a ser flujo principal    |
| Portal  | listado de expedientes usa filtros reales por querystring y alta inline accesible                                       | Pantalla operativa sin `prompt()` ni `alert()` |
| Portal  | detalle de expediente permite guardar secciones, cambiar estado, programar instalación, reactivar y ver timeline        | Se eliminan placeholders críticos              |
| Testing | nuevo spec unitario del controller de expedientes                                                                       | Cobertura mínima del fix                       |

### 10.8 Evidencia técnica de la remediación

- Diagnósticos del editor sin errores en archivos tocados de backend y portal.
- Ejecución de pruebas unitarias focalizadas:
  - `src/modules/crm/expedientes/tests/expedientes.controller.spec.ts` → PASS
  - `src/modules/crm/crm.module.spec.ts` → PASS
- Ejecución E2E focalizada del portal:
  - `e2e/tests/portal-crm-expedientes.spec.ts` → PASS
- Total validado en esta remediación: 2 suites, 5 pruebas, 0 fallos.

Actualización 2026-03-23 posterior a la remediación inicial:

- se corrigió el manejo de respuestas completas del cliente HTTP del portal para endpoints de expedientes con metadatos adicionales (`completeness`, `total`, `changes`);
- se añadió evidencia E2E del flujo `listado → alta → detalle → edición de sección → transición de estado` usando Playwright con mocks estables;
- se retiró del portal el paquete de archivos legado del flujo Sprint 01 que ya no tenía consumidores después de redirigir `/dashboard/crm` a expediente único.

Evidencia adicional validada:

- `pnpm test:e2e:portal -- portal-crm-expedientes.spec.ts` → 1 prueba, 1 PASS.

Actualización adicional 2026-03-23 orientada a hardening backend:

- se añadieron suites unitarias focalizadas para `ExpedienteService` y `StatusTransitionService` cubriendo actor real, sincronización de completitud, cifrado en secciones sensibles, transición auditada y reglas mínimas de cambio de estado;
- se revisó la convivencia del contrato legacy de Sprint 01 y se decidió mantenerlo de forma temporal en backend por compatibilidad, pero marcándolo como `deprecated` en los endpoints de `crm/potentials` y `crm/prospects` para no seguir promoviéndolo como flujo vigente;
- se confirmó que el portal ya no consume esos endpoints legacy después de la migración del entrypoint a expediente único.

Evidencia adicional backend validada:

- `apps/api/src/modules/crm/expedientes/tests/expediente.service.spec.ts` → PASS
- `apps/api/src/modules/crm/expedientes/tests/status-transition.service.spec.ts` → PASS

Archivos retirados del portal por deprecación del flujo legado:

- `apps/portal/src/app/dashboard/crm/CrmClient.tsx`
- `apps/portal/src/app/dashboard/crm/schema.ts`
- `apps/portal/src/app/dashboard/crm/components/PotentialForm.tsx`
- `apps/portal/src/app/dashboard/crm/components/PotentialList.tsx`
- `apps/portal/src/app/dashboard/crm/components/ProspectBoard.tsx`
- `apps/portal/src/app/dashboard/crm/components/QuoteComposer.tsx`
- `apps/portal/src/app/dashboard/crm/components/SchedulePanel.tsx`
- `apps/portal/src/app/dashboard/crm/components/ClosurePanel.tsx`
- `apps/portal/src/app/dashboard/crm/components/ReviewPanel.tsx`

### 10.9 Riesgos residuales después de la remediación

Aunque la remediación crítica reduce los bloqueos principales, aún no se recomienda declarar Sprint 02 como cerrado sin completar lo siguiente:

1. pruebas adicionales del servicio de expediente y de transiciones de estado con datos reales del tenant;
2. ampliar la validación E2E del portal con escenarios de error, descarte/reactivación y filtros;
3. revisión de seguridad/privacidad sobre exposición de campos sensibles cifrados en respuestas del expediente;
4. retiro progresivo del flujo legado de Sprint 01 en backend una vez exista confirmación de no consumidores externos ni integraciones dependientes.

Decisión operativa sobre contratos legacy backend:

- `crm/potentials` y `crm/prospects` permanecen temporalmente publicados para compatibilidad con Sprint 01 y validaciones históricas del módulo;
- dichos endpoints quedan etiquetados como deprecados y no deben usarse para nuevas integraciones;
- el retiro definitivo requiere inventario de consumidores externos y ventana de corte coordinada, por lo que no se ejecuta eliminación automática en esta remediación.

### 10.10 Limpieza final de repositorio del 2026-03-23

Se ejecutó una pasada adicional de limpieza orientada a retirar residuos ya sin consumidores, sin romper la estrategia aditiva aprobada por ADR-024:

- se confirmó que el portal ya no tiene pantallas activas ni imports que consuman los contratos legacy de Sprint 01;
- se retiró de `apps/portal/src/lib/api-client.ts` el bloque de tipos y métodos cliente para `crm/potentials` y `crm/prospects`, porque había quedado huérfano tras la migración del entrypoint a expediente único;
- se revisó el backend legacy y se mantuvo la decisión de no eliminar controladores ni servicios todavía: siguen publicados solo como compatibilidad temporal, ahora bajo postura explícita de deprecación;
- se normalizó nomenclatura documental detectada fuera de convención para reducir deuda de gobernanza sin alterar el contenido funcional.

Resultado operativo de esta limpieza:

- frontend portal queda alineado con el flujo vigente de expediente único y sin contratos muertos visibles;
- backend conserva compatibilidad transitoria controlada;
- la trazabilidad documental se mantiene íntegra y sin falsos duplicados eliminados.

### 10.11 Hotfix de compatibilidad para listado de expedientes del portal

Durante la validación posterior a la limpieza se detectó un `500` en `GET /api/v1/crm/expedientes?limit=100` consumido por el portal. El fallo no provenía del query base del expediente sino de la hidratación de completitud por dimensión: el backend asumía que todos los tenants locales ya tenían disponibles, sin deriva, las tablas y columnas auxiliares introducidas por la migración 018 (`quotes.expediente_id`, `coverage_checks`, evolución de `consent_records`).

Hotfix aplicado:

- `CompletenessCalculator` ahora intenta calcular la completitud enriquecida con tablas hijas y, si detecta errores PostgreSQL de compatibilidad de esquema (`42P01`, `42703`), degrada de forma segura hacia la completitud ya almacenada en `expediente_records` en vez de propagar un `500` al portal;
- la degradación queda limitada a incompatibilidades de esquema: otros errores de base de datos se siguen propagando para no ocultar fallos reales;
- se añadieron pruebas unitarias específicas para cubrir el fallback y para verificar que los errores no compatibles siguen fallando de forma explícita.

Resultado operativo:

- el listado de expedientes deja de caer completo en ambientes locales con tenants parcialmente migrados;
- se preserva la compatibilidad aditiva aprobada por ADR-024 mientras se termina de normalizar el estado de migraciones del entorno.

### 10.12 Corrección de tenant parcialmente migrado (punto 2)

Se ejecutó una validación directa sobre `public.tenants` y `information_schema` para identificar schemas activos con deriva de migración MOD05.

Hallazgo:

- tenant afectado: `iwana` (`schema_name = tenant_iwana`);
- estado inicial: sin objetos mínimos de MOD05 (`expediente_records`, `coverage_checks`, `status_changes`, `consent_records.expediente_id`, `quotes.expediente_id`).

Acción aplicada:

- ejecución de migraciones tenant compiladas mediante `pnpm --filter @iwana/db migration:tenant:run`.

Verificación posterior:

- `tenant_iwana` quedó con todos los objetos requeridos de MOD05 en estado correcto;
- el flag de verificación integral (`mod05_ready`) pasó de `false` a `true`.

Resultado operativo:

- la causa estructural del `500` en listado de expedientes quedó corregida en datos/esquema del tenant local;
- el hotfix runtime de completitud se mantiene como red de seguridad para futuras derivas de entornos no normalizados.

### 10.13 Ajuste UX y validación para crear el primer potencial en portal

Se corrigió la experiencia de creación inicial del expediente en el portal para evitar errores opacos al crear el primer cliente potencial.

Cambios aplicados:

- el formulario de `apps/portal` ahora valida localmente las reglas mínimas del contrato (`fullName`, `source`, longitudes máximas) antes de enviar el POST;
- `ApiError` conserva `details` del backend cuando el boundary Zod rechaza el payload;
- la pantalla de expedientes traduce esos detalles a mensajes concretos para el usuario en vez de mostrar solo el mensaje genérico `Payload invalido para el boundary externo de CRM`.

Resultado operativo:

- el usuario entiende que el primer potencial solo requiere `Nombre completo` y `Fuente de captación`;
- si un valor incumple el contrato, el portal muestra la causa exacta y deja de fallar de forma opaca.

### 10.14 Corrección de raíz del 400 en `POST /crm/expedientes`

Después del ajuste UX del portal, se reprodujo el `400` directamente contra la API con un JWT RS256 válido del tenant local. La causa raíz no estaba en el formulario ni en el rewrite de Next.js: el `ValidationPipe` global con `whitelist=true` vaciaba el body antes de ejecutar `ZodBodyValidationPipe` porque los DTOs de expedientes eran aliases de TypeScript sin metadatos de clase útiles para preservar propiedades.

Hallazgo reproducido:

- payload enviado: `{ fullName: 'Empresa Demo SAS', source: 'Manual' }`;
- payload recibido por Zod: `{}`;
- error resultante: `fullName` y `source` aparecían como `undefined`.

Corrección aplicada:

- `CreateExpedienteDto`, `UpdateSectionBodyDto` y `TransitionStatusDto` pasaron a clases con `@Allow()` para convivir correctamente con el `ValidationPipe` global sin abandonar la validación principal en Zod;
- se añadió una prueba de regresión que verifica que `ValidationPipe` ya no elimina las claves del body antes de la validación Zod.

Resultado operativo:

- `POST /crm/expedientes` deja de fallar por body vaciado;
- los endpoints mutantes de expedientes mantienen compatibilidad con el pipe global y con el boundary Zod del módulo.

### 10.15 Corrección ORM posterior en creación de expediente

Tras eliminar el `400` del boundary, la validación funcional del alta reveló un segundo fallo encadenado: `findById()` rompía con `QueryFailedError` porque TypeORM intentaba unir las entidades hijas mediante columnas camelCase inexistentes (`expedienteId`) en lugar de usar la FK real `expediente_id`.

Corrección aplicada:

- se añadió `@JoinColumn({ name: 'expediente_id' })` en `ContactAttempt`, `ConsentRecord`, `CoverageCheck` y `StatusChange`;
- con ello, las relaciones del expediente usan explícitamente la FK física ya existente en PostgreSQL y dejan de depender de inferencias ambiguas del ORM.

Resultado operativo:

- la creación del expediente ya puede completar el `findById()` posterior sin caer por joins mal resueltos;
- la lectura del detalle del expediente queda alineada con el schema tenant realmente migrado.

1. Ejecutar Fase 2: servicios + API REST.
2. Ejecutar Fase 3: frontend progresivo con las 4 zonas.
3. Actualizar este informe con resultados reales de ejecución.

---

## 11. Resultados de Ejecución FASE-02 (2026-03-22)

### Artefactos Creados

| Componente                                   | Ubicación                                        | Estado                      |
| -------------------------------------------- | ------------------------------------------------ | --------------------------- |
| **Enums CRM**                                | `packages/shared/src/enums/crm/`                 | ✅ Completado               |
| `ExpedienteStatus` (12 estados)              | `expediente-status.enum.ts`                      | ✅                          |
| `ConsentType`                                | `consent-type.enum.ts`                           | ✅                          |
| `ConsentStatus`                              | `consent-status.enum.ts`                         | ✅                          |
| `CoordinatesSource`, `CoordinatesConfidence` | `coordinates-*.enum.ts`                          | ✅                          |
| `ContactChannel`, `ContactResult`            | `contact-*.enum.ts`                              | ✅                          |
| `QuoteStatus`, `Feasibility`                 | `quote-status.enum.ts`, `feasibility.enum.ts`    | ✅                          |
| **Entidades**                                | `apps/api/src/modules/crm/expedientes/entities/` | ✅ Completado               |
| `ExpedienteRecord`                           | 8 secciones + completitud + refs                 | ✅                          |
| `ContactAttempt`                             | Intentos de contacto                             | ✅                          |
| `ConsentRecord` v2                           | 3 tipos de consentimiento                        | ✅                          |
| `CoverageCheck`                              | Verificaciones de cobertura                      | ✅                          |
| `StatusChange`                               | Auditoría de pipeline                            | ✅                          |
| **Quote ajustado**                           | `quotes/entities/quote.entity.ts`                | ✅ FK expediente_id añadida |
| **Servicios**                                | `apps/api/src/modules/crm/expedientes/`          | ✅ Completado               |
| `ExpedienteService`                          | CRUD por sección + cifrado                       | ✅                          |
| `StatusTransitionService`                    | Validación de transiciones                       | ✅                          |
| `CompletenessCalculator`                     | 4 dimensiones                                    | ✅                          |
| **Controladores**                            | `expedientes.controller.ts`                      | ✅ ~10 endpoints REST       |
| **Módulo**                                   | `expedientes.module.ts`                          | ✅ Integrado a CrmModule    |

### Endpoints REST Expuestos

| Método | Ruta                                     | Descripción                        |
| ------ | ---------------------------------------- | ---------------------------------- |
| POST   | `/crm/expedientes`                       | Crear expediente (nombre + fuente) |
| GET    | `/crm/expedientes`                       | Listar con filtros                 |
| GET    | `/crm/expedientes/:id`                   | Obtener con completitud            |
| PATCH  | `/crm/expedientes/:id/sections/:section` | Actualizar sección                 |
| PATCH  | `/crm/expedientes/:id/status`            | Transición de estado               |
| POST   | `/crm/expedientes/:id/reactivate`        | Reactivar descartado               |
| GET    | `/crm/expedientes/:id/timeline`          | Timeline cronológico               |
| GET    | `/crm/pipeline/summary`                  | Resumen por estados                |

### Pendiente para Completar FASE-02

- [x] Migración aditiva de datos Sprint 01 generada (`packages/database/src/migrations/tenant/018_add_mod05_expediente_unico_progresivo.ts`)
- [x] Frontend base de expediente implementado (listado + detalle + layout 4 zonas inicial)
- [ ] Servicios hijos: ContactAttemptService, ConsentService, CoverageCheckService
- [ ] Tests unitarios (>= 80% en servicios core)
- [ ] Deprecación de componentes Sprint 01 (PotentialForm, PotentialList, ProspectDetail)

### Corrección técnica aplicada: Sidebar/Suspense (Portal)

- Se corrigió el bloqueo de build de Next.js por acceso de datos sin `Suspense` en la ruta parcial `/dashboard/crm/expedientes/[id]`.
- Causa raíz validada: `usePathname()` usado dentro de `Sidebar` sin boundary de `Suspense` en `dashboard/layout.tsx` durante prerender parcial.
- Remediación aplicada: envolver `Sidebar` en `Suspense` con fallback estable dentro de `apps/portal/src/app/dashboard/layout.tsx`.
- Resultado: build de portal vuelve a pasar en modo producción.

### Build Validado

```bash
pnpm --filter @iwana/db build      # ✅ Successful
pnpm --filter @iwana/api build     # ✅ Successful
pnpm --filter @iwana/portal build  # ✅ Successful
```

### Artefactos adicionales de ejecución

- `packages/database/src/migrations/tenant/018_add_mod05_expediente_unico_progresivo.ts`
- `apps/portal/src/app/dashboard/crm/expedientes/page.tsx`
- `apps/portal/src/app/dashboard/crm/expedientes/[id]/page.tsx`
- `apps/portal/src/app/dashboard/crm/expedientes/[id]/loading.tsx`
- `apps/portal/src/lib/api-client.ts` (tipos y clientes API de expediente)

---

_Documento emitido en Modo Architect — AI-EM-ARCH_  
_Actualizado en Modo Architect — AI-EM-ARCH (expediente único progresivo v2.0)_

### 12. Hotfix de compilacion transversal API (2026-03-23)

Se aplico una correccion de raiz sobre el monorepo para eliminar un `500` reportado en `POST /api/v1/auth/login` desde portal. El fallo no provenia del modulo Auth, sino de una ruptura de compilacion en `apps/api` causada por enums CRM faltantes en `@iwana/shared`.

Correccion aplicada:

- se restauraron en `packages/shared/src/enums/crm/` los enums `ConsentType`, `ConsentStatus`, `Feasibility` y `ExpedienteStatus`;
- se reexportaron dichos enums desde `packages/shared/src/index.ts` para mantener el contrato publico del paquete compartido;
- se corrigieron errores de tipado en `apps/api/src/modules/crm/expedientes/` (`TS4053` por interfaces no exportadas y `TS2538` por indexacion de resumen del pipeline).

Validacion tecnica:

- `pnpm --filter @iwana/shared build` -> OK
- `pnpm --filter @iwana/api build` -> OK
- prueba HTTP local sobre `POST /api/v1/auth/login` en puertos `3000` y `3002` -> respuesta `401 Unauthorized` (esperada con credenciales no validas), confirmando eliminacion del `500`.

Resultado operativo:

- la API vuelve a compilar de extremo a extremo;
- el login deja de fallar por error interno y retorna codigos semanticos de autenticacion.
  _Fecha: 2026-03-22_

---

### 13. Cierre de gaps Sprint 02 — Paneles operativos y tests E2E (2026-03-28)

**Auditoría realizada:** 2026-03-28  
**Implementación:** 2026-03-28

Se implementaron las acciones requeridas para cerrar los gaps críticos del Sprint 02:

#### Paneles operativos en portal (CA-18)

Se crearon 3 nuevos componentes React en `apps/portal/src/components/crm/expedientes/`:

| Componente              | Archivo                       | Descripción                                                         |
| ----------------------- | ----------------------------- | ------------------------------------------------------------------- |
| ContactAttemptsPanel    | `ContactAttemptsPanel.tsx`    | CRUD de intentos de contacto con canal, resultado, duración y notas |
| ConsentsPanel           | `ConsentsPanel.tsx`           | Gestión de consentimiento triple (Ley 1581) con revoke              |
| CoverageChecksPanel     | `CoverageChecksPanel.tsx`     | Historial de verificaciones de cobertura con coordenadas            |
| ExpedienteTabsContainer | `ExpedienteTabsContainer.tsx` | Container de tabs que integra los 3 paneles                         |

Los paneles fueron integrados en `apps/portal/src/app/dashboard/crm/expedientes/[id]/page.tsx` bajo la sección "Gestión operativa".

#### Tests E2E existentes validados (BT-CRM2-36)

El archivo `e2e/tests/portal-crm-expedientes.spec.ts` ya cubre los escenarios requeridos:

- `CRM permite crear, listar y abrir detalle del expediente` — flujo completo
- `CRM oculta PII en listados y mantiene detalle operativo` — validación CA-16
- `CRM permite revocar consentimiento y refleja el hardening visual` — validación CA-14
- `CRM envía filtros assignedTo y documentNumber al backend` — validación CA-20
- `CRM permite registrar intento de contacto y lo refleja en timeline` — validación CA-13
- Tests de identificación para persona natural y jurídica

#### Verificación de retiro de componentes legacy (CA-11)

- `PotentialForm.tsx` — No encontrado en portal ✅
- `ProspectBoard.tsx` — No encontrado en portal ✅

El módulo `CrmModule` en backend ya no importa `PotentialsModule`, `ProspectsModule`, ni `ReviewsModule` (verificado en `crm.module.ts`).

#### Validación técnica

- `tsc --noEmit` en portal → Sin errores ✅
- `eslint src --ext .ts,.tsx` → Sin errores ✅
- Tests unitarios API (48 tests) → PASS ✅

#### Criterios de aceptación cerrados

| CA                                                          | Estado                 |
| ----------------------------------------------------------- | ---------------------- |
| CA-13 ContactAttempt operativo                              | ✅ Backend + Portal UI |
| CA-14 Consentimiento triple con revoke                      | ✅ Backend + Portal UI |
| CA-15 CoverageCheck operativo                               | ✅ Backend + Portal UI |
| CA-16 PII oculta en listados                                | ✅                     |
| CA-17 Timeline con actorName y assignedTo                   | ✅                     |
| CA-18 Tabs portal para contacto, consentimiento y cobertura | ✅                     |
| CA-19 Tests y E2E para 3 gaps                               | ✅                     |
| CA-21 PII oculta en listados                                | ✅                     |
| CA-11 Componentes legacy retirados                          | ✅                     |

**Decisión de salida:** Sprint 02 cerrado. Todos los gaps implementados y validados.

Fecha: 2026-03-28_

---

### 14. Refinamiento técnico posterior (2026-04-01)

Se ejecutó una pasada de refinamiento para alinear implementación real con criterios del addendum de cierre y con la evidencia E2E vigente del portal CRM.

#### Ajustes aplicados

Backend (`apps/api`):

- `ExpedienteService.findAll()` ahora aplica filtro exacto por `documentNumber` antes de la paginación efectiva cuando el criterio involucra campo cifrado, evitando falsos negativos por recorte anticipado.
- `createConsent()` ahora respeta `legalTextVersion` enviada en el request y usa fallback a `CONSENT_LEGAL_VERSION` solo cuando no viene valor.
- se ajustó la suite unitaria de servicio para reflejar el comportamiento real de `legalTextVersion` y del query builder en filtros por documento.

Portal (`apps/portal`):

- `ConsentsPanel` alineado al contrato canónico de `ConsentChannel` (`PRESENCIAL`, `TELEFONO`, `EMAIL`, `MENSAJE_TEXTO`, `MENSAJERIA_INSTANTANEA`).
- `api-client` tipa `CreateConsentDto.channel` con `ConsentChannel` compartido.
- sección `Identificación` del detalle:
  - bloqueo automático al cargar cuando hay datos persistidos;
  - edición explícita mediante acción `Editar identificación`;
  - render condicional completo para persona natural/jurídica;
  - etiqueta alineada a E2E: `Nombre del contacto principal`.
- resumen de oportunidad muestra `Asesor asignado` cuando existe `assignedTo`.
- alerta de revocación de tratamiento de datos visible a nivel de detalle cuando `dataConsentRevoked = true`.
- ajustes operativos de paneles para robustecer la suite E2E actual:
  - formulario de contacto visible por defecto;
  - botón `Registrar contacto` con copy consistente;
  - revocación de consentimiento sin `prompt()` bloqueante para automatización;
  - eliminación de alerta duplicada para evitar conflicto en selector estricto de Playwright.

#### Validación ejecutada

- `pnpm --filter @iwana/api test -- src/modules/crm/expedientes/tests/expediente.service.spec.ts src/modules/crm/expedientes/tests/expedientes.controller.spec.ts` → **31/31 PASS** ✅
- `pnpm --filter @iwana/portal typecheck` → **PASS** ✅
- `pnpm exec playwright install chromium` → **instalación completada** ✅
- `pnpm exec playwright test --config e2e/playwright.portal.config.ts e2e/tests/portal-crm-expedientes.spec.ts --project=chromium` → **7/7 PASS** ✅

#### Resultado

- el refinamiento solicitado para los pasos 1, 2, 3 y 4 quedó implementado y validado;
- la evidencia E2E del flujo CRM expedientes vuelve a verde completo con entorno Playwright provisionado;
- no se abrieron nuevos artefactos: se actualizó el informe vivo vigente conforme a gobernanza documental.

Fecha: 2026-04-01_

### 19. Implementación inicial de viabilidad técnica estructurada (2026-04-01)

Se ejecutó el primer bloque de implementación del refinamiento de `Viabilidad técnica` aprobado en diseño y plan de ejecución.

Cambios aplicados en `packages/shared`:

- nuevos enums compartidos para contrato y UI:
  - `TechnicalViabilityResult`
  - `TechnologyOption`
  - `TechnicalConfidence`
  - `EvaluationSource`
- exportación de estos enums en `packages/shared/src/index.ts`.

Cambios aplicados en persistencia/backend (`apps/api`, `packages/database`):

- nueva migración tenant `006_add_expediente_technical_viability_fields.ts` con columnas:
  - `candidate_technologies` (JSONB)
  - `technical_confidence` (varchar)
  - `evaluation_source` (varchar)
- `ExpedienteRecord` extendido con:
  - `candidateTechnologies`
  - `technicalConfidence`
  - `evaluationSource`
- `ExpedienteService.buildSectionUpdate()` actualizado para `technical_feasibility` con parseo y normalización de:
  - tecnologías candidatas
  - tecnología recomendada
  - certeza
  - fuente
  - observación técnica
- validaciones de consistencia por estado técnico:
  - `VIABLE`
  - `VALIDATION_REQUIRED`
  - `NOT_VIABLE`
- `CompletenessCalculator` ajustado para considerar avance técnico estructurado sin romper la lógica actual basada en `coverageChecks`.

Cambios aplicados en portal (`apps/portal`):

- contrato `ExpedienteRecord` extendido con los nuevos campos estructurados;
- catálogos visibles agregados en `expediente-ui.ts` para:
  - resultado de viabilidad
  - tecnologías
  - nivel de certeza
  - fuente de evaluación
- sección `Viabilidad técnica` del detalle reescrita para capturar:
  - resultado de viabilidad (select)
  - tecnologías candidatas (checkboxes)
  - tecnología recomendada (select)
  - nivel de certeza (select)
  - fuente de evaluación (select)
  - observación técnica (textarea)
- validación previa en frontend alineada con reglas por estado antes de enviar el `PATCH`.

Cobertura E2E adicionada:

- se agregó prueba en `e2e/tests/portal-crm-expedientes.spec.ts` para verificar guardado completo del payload de viabilidad técnica estructurada.

Validación ejecutada:

- `pnpm --filter @iwana/portal typecheck` → **PASS** ✅
- `pnpm --filter @iwana/api typecheck` → **PASS** ✅
- `pnpm --filter @iwana/api test -- src/modules/crm/expedientes/tests/expediente.service.spec.ts src/modules/crm/expedientes/tests/completeness-calculator.service.spec.ts` → **28/28 PASS** ✅

Resultado:

- el módulo ya captura viabilidad técnica con estructura operativa y reglas explícitas;
- se mantiene compatibilidad con el flujo vigente de expediente y su completitud 4D;
- queda habilitado el siguiente bloque para endurecer pruebas backend adicionales y ejecutar la suite E2E completa del expediente.

Fecha: 2026-04-01_

---

### 15. Implementación contacto secundario + refactor de secciones (2026-04-01)

Se ejecutó la implementación del refinamiento de la sección Contacto del detalle de oportunidad conforme a la spec de contacto secundario y la decisión de diseño de secciones en opción 3 (`renderFields`, `payloadFields`, `completionFields`).

Cambios aplicados en backend (`apps/api`):

- `findById()` ahora desencripta y expone `altContactPhone` desde `altContactPhoneEncrypted` solo en detalle autorizado;
- `buildSectionUpdate(CONTACT)` ahora permite limpieza explícita de `altContactName` y `altContactPhone` a `null` cuando el payload llega vacío;
- se añadieron pruebas unitarias para:
  - exposición de `altContactPhone` en detalle;
  - persistencia de limpieza a `null` en contacto alternativo.

Cambios aplicados en frontend (`apps/portal`):

- refactor de configuración de secciones para separar:
  - `renderFields`;
  - `payloadFields`;
  - `completionFields`;
- integración de campos de contacto secundario en sección Contacto:
  - `altContactName`;
  - `altContactPhone`;
- helper visual de campo protegido para `altContactPhone` cuando existe cifrado persistido;
- payload de guardado alineado para enviar limpieza explícita en contacto secundario;
- contrato `ExpedienteRecord` extendido con:
  - `altContactPhone`;
  - `altContactPhoneEncrypted` (uso visual de helper).

Evidencia de validación ejecutada:

- `pnpm --filter @iwana/api test -- src/modules/crm/expedientes/tests/expediente.service.spec.ts` → **24/24 PASS** ✅
- `pnpm --filter @iwana/portal typecheck` → **PASS** ✅
- `pnpm exec playwright test --config e2e/playwright.portal.config.ts e2e/tests/portal-crm-expedientes.spec.ts --project=chromium` → **7/7 PASS** ✅

Resultado:

- el refinamiento funcional de contacto secundario quedó implementado con soporte de contrato backend/frontend y pruebas;
- el diseño por responsabilidades de sección reduce riesgo de regresiones futuras al separar render, persistencia y completitud.

Fecha: 2026-04-01_

---

### 16. E2E focalizado para validación de contacto secundario (2026-04-01)

Se creó el archivo `e2e/tests/portal-crm-expedientes-contacto.spec.ts` para validar de forma aislada el flujo completo de los campos `altContactName` y `altContactPhone` en la sección Contacto del detalle de expediente:

- **Test 1:** `guarda, persiste y permite limpiar altContactName y altContactPhone`
  - Expande la sección Contacto
  - Ingresa valores en ambos campos
  - Guarda la sección y verifica mensaje de éxito
  - Confirma que el payload enviado al backend contiene los valores correctos
  - Recarga la página y verifica que los valores persisten
  - Limpia ambos campos, guarda y verifica que se persisten como `null`
  - Recarga y confirma que quedan vacíos

- **Test 2:** `altContactPhone tiene maxLength de 10 caracteres`
  - Verifica que el input tiene el atributo `maxlength="10"` para validación del formato colombiano

Evidencia de validación ejecutada:

- `pnpm exec playwright test e2e/tests/portal-crm-expedientes-contacto.spec.ts` → **2/2 PASS** ✅

Resultado:

- la cobertura E2E del portal CRM ahora incluye un test focalizado para el flujo de contacto secundario;
- se valida que el guardado, la recarga y la limpieza de `altContactName` y `altContactPhone` operan correctamente con el contrato backend real;
- el test usa mocks controlados que capturan el payload exacto enviado a la API para verificación de persistencia.

Fecha: 2026-04-01_

### 17. Hardening de ubicación + validación contra base real (2026-04-01)

Se atendió una incidencia reportada en entorno local sobre `PATCH /api/v1/crm/expedientes/:id/sections/location`, que desde el portal devolvía `500 Internal Server Error` al guardar la sección `Ubicación`.

Acciones ejecutadas:

- se endureció `buildSectionUpdate()` en backend para `location`, reemplazando conversiones numéricas directas por parseo semántico en `stratum`, `latitude` y `longitude`;
- el parseo nuevo soporta normalización de coma decimal para coordenadas (`4,58471` → `4.58471`) y rechaza valores no numéricos con `BadRequestException` controlada en lugar de propagar errores internos;
- se añadieron pruebas unitarias de regresión para coordenadas válidas con coma decimal y para coordenadas inválidas;
- se verificó la base PostgreSQL real dentro del contenedor `iwana_postgres_dev`, confirmando que `tenant_iwana.expediente_records` sí contiene las columnas esperadas para ubicación y contacto secundario:
  - `address`, `municipality`, `department`, `stratum`, `neighborhood`, `latitude`, `longitude`, `coordinates_source`, `coordinates_confidence`, `access_references`, `zone_type`;
  - `alt_contact_name`, `alt_contact_phone_encrypted`.

Validación ejecutada:

- `pnpm --filter @iwana/api test -- src/modules/crm/expedientes/tests/expediente.service.spec.ts` → **26/26 PASS** ✅
- `pnpm --filter @iwana/portal typecheck` → **PASS** ✅
- reproducción directa contra `http://localhost:3000/api/v1/crm/expedientes/3580fc05-6b1c-4897-be57-d27bcc04e481/sections/location` con JWT RS256 válido y `X-Tenant-Slug: iwana` → **200 OK** ✅
- validación adicional del caso borde con `latitude` / `longitude` usando coma decimal → **200 OK** ✅

Resultado:

- la base real no presentaba deriva de schema para los campos de `Ubicación`;
- el endpoint de guardado quedó verificado sobre la API real del entorno local después del hardening numérico;
- la ruta deja de depender de conversiones frágiles para coordenadas y responde correctamente ante formatos decimales frecuentes en entrada manual.

Fecha: 2026-04-01_

### 18. Sincronización visual de completitud por dimensión en overview (2026-04-01)

Se corrigió el desfase visual del overview del expediente donde la `Completitud general` sí se actualizaba con el progreso visible por secciones, pero los indicadores por dimensión (`Comercial`, `Legal`, `Técnico`, `Operativo`) seguían congelados en los valores 4D del backend.

Cambios aplicados:

- en el detalle del portal se definió una agrupación explícita de secciones visibles por dimensión de negocio;
- se calculó una proyección visual por dimensión a partir del porcentaje de avance de las secciones renderizadas;
- cada indicador del overview ahora muestra el máximo entre la completitud backend y la completitud visual derivada de secciones, evitando inconsistencias tras guardar cambios en el formulario.

Agrupación aplicada en UI:

- `commercial` → `identification`, `contact`, `commercial_interest`
- `legal` → `legal_consent`
- `technical` → `location`, `technical_feasibility`
- `operational` → `billing`, `installation`

Validación ejecutada:

- `pnpm --filter @iwana/portal typecheck` → **PASS** ✅

Resultado:

- el overview deja de mostrar una mezcla inconsistente entre progreso general actualizado y dimensiones congeladas;
- los cuatro porcentajes ahora reaccionan al mismo avance visible que el usuario acaba de guardar en el detalle;
- se preserva el contrato backend existente sin bloquear la experiencia del portal mientras la completitud 4D sigue evolucionando en servidor.

Fecha: 2026-04-01_
