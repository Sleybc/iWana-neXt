# INFORME - MOD11 Ejecucion Operativa / Tareas Definicion

**Version:** 1.2  
**Estado:** Ejecución autorizada — G1 aprobado; G4 en curso  
**Fecha:** 2026-07-27  
**Modo activo:** Mixto  
**Autor:** AI-EM-ARCH  
**Clasificacion:** Uso interno

---

## 1. Objetivo

Consolidar el paquete documental necesario para evaluar y trazar un nuevo bounded context de ejecucion operativa transversal sin romper MOD10 Service Assurance ni MOD09 Programacion / WFM.

---

## 2. Decisiones tomadas

| Decision | Estado | Referencia |
| --- | --- | --- |
| Proponer `TasksModule` como owner de tareas operativas | Aprobado (CTO 2026-06-23) | docs/adrs/ADR-046-Bounded-Context-Tasks-Ejecucion-Operativa.md |
| Mantener `AssuranceModule` como owner de tickets, SLA y PQR | Alineado a ADR aprobado | docs/adrs/ADR-038-Bounded-Context-Service-Assurance.md |
| Mantener `WfmModule` como owner de agenda y Work Orders ligeras/transitorias | Alineado a ADR aprobado | docs/adrs/ADR-037-Bounded-Context-Programacion-WFM.md |
| Separar `Programacion` de la OT enriquecida de ejecucion de campo | Aprobado por CTO | docs/adrs/ADR-047-Separacion-Programacion-y-OT-Ejecucion.md |
| Usar `Operaciones` como nombre visible del modulo | Aprobado por CTO | docs/specs/2026-06-22-mod11-operaciones-tareas-design.md |
| Usar `MOD11` como numeracion documental | Aprobado por CTO | docs/prds/PRD-MOD11-EJECUCION-OPERATIVA-TAREAS-v1.0.md |
| No toda solicitud debe crear ticket; todo trabajo ejecutable debe materializarse en tarea | Aprobado para diseno funcional | docs/prds/PRD-MOD11-EJECUCION-OPERATIVA-TAREAS-v1.0.md |
| El modal de `Agendar tarea` debe pasar a un flujo `Crear tarea` con agenda opcional | Aprobado para diseno objetivo | docs/specs/2026-06-23-mod11-crear-tarea-agenda-opcional-design.md |

---

## 3. Artefactos creados

| Artefacto | Ruta | Estado |
| --- | --- | --- |
| Spec de diseño | docs/specs/2026-06-22-mod11-operaciones-tareas-design.md | Aprobado |
| Spec UI modal crear tarea | docs/specs/2026-06-23-mod11-crear-tarea-agenda-opcional-design.md | Listo para implementacion |
| PRD | docs/prds/PRD-MOD11-EJECUCION-OPERATIVA-TAREAS-v1.0.md | Aprobado |
| HLD | docs/hlds/HLD-MOD11-EJECUCION-OPERATIVA-TAREAS-v1.0.md | Aprobado |
| ADR | docs/adrs/ADR-046-Bounded-Context-Tasks-Ejecucion-Operativa.md | Aprobado |
| ADR de separacion agenda vs OT | docs/adrs/ADR-047-Separacion-Programacion-y-OT-Ejecucion.md | Aprobado |
| Plan de implementación | docs/plans/2026-06-22-mod11-ejecucion-operativa-tareas-fase-01.md | Ejecutado Fase 01 |
| Plan de implementacion modal crear tarea | docs/plans/2026-06-23-mod11-modal-crear-tarea-agenda-opcional.md | Listo para ejecucion fullstack |
| Plan agenda + OT de ejecucion | docs/plans/2026-06-24-mod09-mod11-programacion-centro-agendamiento-y-ot-ejecucion.md | Listo para ejecucion fullstack |
| Prompt de ejecución | docs/prompts/PROMPT-MOD11-EJECUCION-OPERATIVA-TAREAS-FASE-01-v1.0.md | Aprobado |
| Prompt agenda + OT de ejecucion | docs/prompts/PROMPT-MOD09-MOD11-PROGRAMACION-CENTRO-AGENDAMIENTO-OT-v1.0.md | Aprobado |
| Informe Fase 01 | docs/informes/INFORME-MOD11-EJECUCION-OPERATIVA-FASE-01-v1.0.md | Aprobado |
| Checklist Fase 01 | docs/quality/CHECKLIST-MOD11-EJECUCION-OPERATIVA-FASE-01-v1.0.md | Aprobado |
| Informe de definicion | docs/informes/INFORME-MOD11-EJECUCION-OPERATIVA-DEFINICION-v1.0.md | Aprobado |

---

## 4. Actualizaciones cruzadas realizadas

| Documento | Ajuste |
| --- | --- |
| docs/specs/2026-06-22-mod11-operaciones-tareas-design.md | Se incorpora politica de intake unificado y se referencia el spec UI del modal objetivo. |
| docs/prds/PRD-MOD11-EJECUCION-OPERATIVA-TAREAS-v1.0.md | Se agrega politica funcional ticket vs tarea vs agenda y se explicita la OT enriquecida como owner futuro de ejecucion de campo. |
| docs/hlds/HLD-MOD11-EJECUCION-OPERATIVA-TAREAS-v1.0.md | Se aterriza el frente web para que Programacion siga coordinando agenda y MOD11 absorba la OT enriquecida. |
| docs/prds/PRD-MOD09-PROGRAMACION-WFM-v1.0.md | Se corrige el boundary para dejar a WFM como owner de agenda y OT ligera/transitoria. |
| docs/prds/PRD-MOD10-SERVICE-ASSURANCE-v1.0.md | Se aclara que MOD10 puede originar trabajo operativo, pero no debe ser owner de la ejecucion transversal propuesta para MOD11. |
| docs/hlds/HLD-MOD10-SERVICE-ASSURANCE-v1.0.md | Se agrega MOD11 como bounded context relacionado y se explicita la separacion ticket vs tarea. |

La trazabilidad entre MOD09 y MOD11 queda ampliada con el spec de 2026-06-24 y con ADR-047, que redefine el owner de la OT enriquecida sin mover agenda fuera de WFM.

---

## 5. Alcance definido para Fase 01

- Crear tareas manuales y originadas desde otros modulos.
- Capturar solicitudes de telefono, WhatsApp, oficina o integraciones sin forzar ticket en todos los casos.
- Diferenciar responsable y destinatario.
- Permitir destinatario cliente o interno.
- Mantener agenda opcional y vinculo logico con WFM.
- Mantener vinculo logico con tickets de MOD10.
- Definir una matriz clara para cuando una oportunidad CRM, un ticket o una agenda deben coexistir con la tarea.
- Dejar ownership claro sin colapsar boundaries aprobados.

---

## 6. Bloqueantes y gates

| Bloqueante | Severidad | Accion requerida |
| --- | --- | --- |
| ADR-046 no aprobado | Resuelto | Aprobado CTO 2026-06-23; Fase 01 ejecutada |
| PRD maestro aun sin MOD11 | Media | Actualizar roadmap maestro solo tras aprobacion del nuevo boundary |
| Armonizacion documental con MOD09 | Media | Integrar referencias cruzadas cuando se cierre el trabajo local existente |

---

## 7. Riesgos residuales

- Riesgo de duplicar estados entre ticket y tarea si no se respeta la separacion de ownership.
- Riesgo de convertir `WorkOrderTask` o la `WorkOrder` ligera de WFM en sustituto permanente de la OT enriquecida.
- Riesgo de introducir PII en labels o descripciones del destinatario si el contrato no se disciplina desde el inicio.
- Riesgo de mantener dos flujos paralelos de creacion si el modal actual de Programacion no se consolida sobre el contrato de `TasksModule`.

---

## 8. Paquete listo para ejecucion

- El PRD ya define la politica funcional de intake: ticket para casos que requieren control de caso, tarea para todo trabajo ejecutable y agenda solo cuando existe compromiso temporal.
- El spec UI del modal objetivo ya fija estructura, copy, secciones, reglas de visibilidad y matriz de decisiones para CRM, Mesa de ayuda y captura manual.
- El HLD ya alinea frontend y backend sobre una evolucion `Task -> ScheduleEvent -> ExecutionOrder`, dejando la `WorkOrder` ligera solo como compatibilidad transitoria cuando aplique.
- El plan `docs/plans/2026-06-23-mod11-modal-crear-tarea-agenda-opcional.md` deja lista la ejecucion fullstack con archivos objetivo, pruebas y verificaciones.

---

## 9. Recomendacion EM-ARCH

[ESCALACION AL CTO]

**Prioridad:** Alta  
**Contexto:** El modulith ya separa ticketing y scheduling, pero aun no tiene owner claro para la ejecucion operativa transversal.  
**Opciones evaluadas:** absorber tareas en MOD10, absorber tareas en MOD09, o crear MOD11 como bounded context propio.  
**Recomendacion:** Mantener ADR-046 para tareas y ejecutar ADR-047 usando `MOD11` como owner de OT enriquecida, manteniendo `AssuranceModule` para tickets y `WfmModule` para agenda/OT ligera.  
**Decision requerida antes de:** iniciar implementacion productiva del nuevo modulo.

---

## 10. Estado de salida

Paquete documental listo para ejecucion fullstack. La siguiente accion recomendada es implementar la separacion agenda vs OT de ejecucion: `Programacion` coordina agenda, `MOD11` ejecuta la OT enriquecida y consume inventario desde custodia operativa del tecnico/cuadrilla.

- 2026-06-23: Las tareas operativas que requieren visita de campo ahora crean `visit-requests` con origen `TASKS` y se enrutan a agenda o pendientes mediante el mismo helper compartido usado por CRM y Mesa de ayuda. La captura generica desde Programacion queda degradada a solicitud manual excepcional.
- 2026-06-24: Se ejecuto la primera bajada fullstack de `ExecutionOrder` en MOD11. Backend: nuevas entidades tenant-aware, migracion `046`, rutas `/tasks/execution-orders/*` y creacion de OT al confirmar agenda desde WFM. Frontend: `Operaciones` incorpora drawer de OT de ejecucion y `Programacion` agrega CTA para abrirla. Validacion ejecutada: suites focalizadas backend/portal y typecheck puntual en verde.

### Salvedad vigente

La trazabilidad de materiales ya opera desde `technicianCustodyId` y `finalDisposition`, pero el bounded context formal de Inventario/Almacen aun no existe en el repo. La integracion actual queda implementada como adaptador MVP de custodia operativa, lista para sustituirse por puerto tipado cuando Inventario sea owner activo.

---

## 11. Ampliacion de definicion 2026-07-27

La auditoria multiagente del flujo `/dashboard/scheduling/agenda` → tarea → OT de instalación concluye:

- `ExecutionOrder` debe ser la única verdad visible de ejecución.
- Agenda debe supervisar y resolver excepciones, no ejecutar.
- la `WorkOrder` ligera permanece temporalmente como proyección oculta;
- una OT terminal es inmutable y las correcciones crean seguimiento;
- técnico o contratista asignado ejecuta mediante permiso de capacidad;
- el cierre se gobierna por plantilla versionada;
- sincronización e inventario requieren el patrón tenant-aware de ADR-068 (Aprobado).

### Paquete documental agregado

| Artefacto | Ruta | Estado |
| --- | --- | --- |
| ADR de integracion | `docs/adrs/ADR-068-Sincronizacion-OT-Ejecucion-Proyecciones-Operativas.md` (Aprobado) | CTO aprobó el 2026-07-27 |
| Spec UX | `docs/specs/2026-07-27-mod09-mod11-ot-instalacion-coordinador-design.md` | En revisión |
| Contrato DS | `docs/specs/2026-07-27-mod09-mod11-ot-instalacion-ds-contrato.md` | En revisión |
| Contrato API/eventos | `docs/specs/2026-07-27-mod09-mod11-ot-instalacion-contrato-api.md` | En revisión |
| Plan de ejecución | `docs/plans/2026-07-27-mod09-mod11-ot-instalacion-redesign.md` | En revisión |
| Checklist QA/AppSec | `docs/quality/CHECKLIST-MOD09-MOD11-OT-INSTALACION-v1.0.md` | NO-GO |
| Prompts por fase | `docs/prompts/PROMPT-MOD09-MOD11-OT-INSTALACION-FASE-00-CONTENCION-v1.0.md` a `FASE-04-GATE-QA-v1.0.md` | Bloqueados por gates |

### Estado de salida actualizado

**G4 EN CURSO.** CTO aprobó ADR-068 y reconcilió la gobernanza de Media/Assets. La implementación se ejecuta contract-first; G5/G6/G7 siguen pendientes de evidencia real. AI-EM-ARCH mantiene decisiones y gates; los agentes ejecutores son responsables del código por carril.

### Estado de implementación verificado — 2026-07-27

La revisión independiente confirma materializados los controles estructurales de tenant, outbox/relay, idempotencia HMAC, tombstone transaccional, guards, versionado optimista y DTOs mínimos base. El estado de producción permanece **NO-GO** por P1 pendientes: proyecciones efectivas de eventos; receipt/saga de inventario; plantilla y acciones permitidas; contrato OpenAPI completo; rate limiting `429`; y boundaries Media, cuadrillas, follow-up y redrive. Estos últimos permanecen fail-closed (`503`) sin recibos ni URLs ficticias.

---

## 12. Review cruzado multiagente 2026-07-27

| Rol | Dictamen | Ajustes incorporados | Estado |
| --- | --- | --- | --- |
| AI-DS-OWNER | Aprobable en G2; 0 bloqueantes documentales | ownership `OperationalSidePeek`/`ExecutionOrderSummary`, API/estados, primitives reales, tokens/contraste, sizes, extensión `ProgressMeter`, congelación G2/G3/G4 | Firma G2 espera G1 |
| AI-SR-FULL | G3 documental aprobable; costo XL; 0 bloqueantes documentales | coreografia MOD09→MOD11, saga MOD11→MOD12, API/eventos exactos, ADR-048, persistencia, relay/crash-window, MOD12 y ownership | G3 espera tipos/OpenAPI reales |
| AI-SR-QA | Cobertura documental suficiente | QA-01 a QA-50, E2E vertical, convergencia completa, cuadrillas, outbox/DLQ, numeración, evidencia y gates G1–G7 | G6 futuro; G4 bloqueado |
| AI-SEC-ENG | G3 técnicamente viable; 0 bloqueantes documentales | Atomicidad idempotencia/audit-intent, evidencia Media/Assets, autorización exhaustiva, offline seguro y STRIDE/ASVS incorporados | G1 humano pendiente; G6 futuro |

### Correcciones de arquitectura registradas

- MOD09 publica `VisitScheduledV1`, cambios de ventana/recurso y cancelación; no importa servicios MOD11.
- MOD11 solicita `InventoryConsumptionRequestedV1` durante ejecución; el cierre no dispara movimientos.
- Confirmaciones MOD12 posteriores son settlements append-only y no mutan el resultado terminal.
- El contrato API exige tipos en `@iwana/shared` y OpenAPI máquina-legible antes de congelar.
- MOD12 queda alineado en `docs/prds/PRD-MOD12-INVENTARIO-SCM-v1.0.md` y `docs/hlds/HLD-MOD12-INVENTARIO-SCM-v1.0.md`.
- Fase 00 puede contener P0 bajo ADR-046/047 mediante G4 separado; Fases 01–03 esperan G1.
- Cada CUD sensible vincula atómicamente idempotencia, mutación, outbox y audit-intent; la saga propaga un `intentId` estable.
- La evidencia consume Media/Assets (ADR-034/035), no acepta URL arbitraria y exige tenant+OT, MIME real, cuarentena, hash/timestamps de servidor y reautorización.
- La autorización queda cerrada endpoint×permiso×ABAC, incluida administración de plantillas, acceso a media y re-drive.
- Idempotencia usa HMAC versionado, recibo minimizado y tombstone no-PII; Task 7A gobierna el lifecycle y la reconciliación PostgreSQL↔MinIO.
- ADR-034/035 quedan reconciliados como aprobados por la confirmación explícita del CTO.

### Próximo gate

1. AI-SR-FULL materializa contrato tipado/OpenAPI y ejecuta el carril backend G3.
2. AI-EM-ARCH valida el diff y mantiene G4 congelado.
3. AI-FE-PLATFORM ejecuta experiencia después de que el contrato real esté publicado.
4. AI-SR-QA/AI-SEC-ENG realizan G6; AI-EM-ARCH recomienda G7.

No se escribió código productivo durante esta fase arquitectónica.

---

## 13. Threat model STRIDE y trazabilidad ASVS L2

### Trust boundaries

1. Portal autenticado → API MOD11.
2. API → transacción PostgreSQL del schema tenant.
3. Outbox tenant → worker/BullMQ → consumidores MOD09/MOD12/Auditoría.
4. MOD11 → Media/Assets → StoragePort/MinIO privado.
5. URL firmada temporal → cliente autorizado.

| STRIDE | Amenaza principal | Control contractual | Evidencia G6 |
| --- | --- | --- | --- |
| Spoofing | suplantar actor, tenant, técnico o cuadrilla | JWT/tenant aprobado, tenant explícito en jobs, asignación y membresía revalidadas | QA-01, QA-03, QA-04, QA-10, QA-32 |
| Tampering | alterar versión, comando, evento, evidencia o movimiento | `If-Match`, hash idempotente, outbox/inbox, checksum de servidor, ledger/settlement append-only | QA-06 a QA-09, QA-28, QA-38, QA-42, QA-45, QA-46 |
| Repudiation | negar un CUD o re-drive | audit-intent durable y fail-closed, `intentId`, `correlationId`, actor y timestamps de servidor | QA-39, QA-42 a QA-44 |
| Information disclosure | BOLA/cross-tenant, PII en DTO/log o media expuesta | matriz permiso×ABAC, 404 antienumeración, DTO minimizado, bucket privado y URL firmada corta | QA-01, QA-02, QA-21, QA-30, QA-35, QA-45, QA-48 |
| Denial of service | abuso de endpoints, uploads, retries o DLQ | rate limit, límites de tamaño/tipo, retry/backoff/DLQ y re-drive restringido | QA-33, QA-39, QA-46, QA-47 |
| Elevation of privilege | usar permisos implícitos, assignment revocado o administración indebida | capabilities explícitas sin herencia, ABAC por recurso y revalidación por comando | QA-02 a QA-04, QA-31, QA-32, QA-40, QA-47 |

Trazabilidad al baseline OWASP ASVS L2 del repo:

| Familia de control ASVS L2 | Contrato/plan | Evidencia |
| --- | --- | --- |
| Autenticación y sesión | pipeline JWT/tenant; ningún dato del payload concede identidad | QA-01, QA-10 |
| Control de acceso | matriz exhaustiva endpoint×permiso×ABAC y política uniforme 401/403/404 | QA-02 a QA-04, QA-47, QA-48 |
| Validación y lógica de negocio | DTO/Zod, `If-Match`, gate de cierre, terminalidad, idempotencia | QA-05 a QA-08, QA-23, QA-29, QA-31, QA-42, QA-43 |
| Protección de datos y comunicaciones | minimización PII, storage privado, URL firmada y TLS | QA-21, QA-30, QA-34, QA-45, QA-48, QA-49 |
| Archivos y recursos | magic bytes, allowlist, tamaño, cuarentena, checksum y vínculo tenant+OT | QA-45, QA-46, QA-48 |
| Logging y auditoría | audit-intent durable, redacción, retry/DLQ y correlación | QA-21, QA-30, QA-39, QA-42, QA-44 |
| API y servicios | OpenAPI, errores tipados, rate limit, replay, eventos versionados | QA-22, QA-29, QA-33, QA-35, QA-38, QA-43, QA-47 |

El modelado es documental. AI-SEC-ENG debe confirmar controles reales y cerrar QA-50 en G6; no sustituye pruebas ni concepto Legal.
