# PLAN - MOD05 CRM Sprint 02

**Version:** 1.1  
**Estado:** Aprobado con cierre extendido  
**Fecha:** 2026-03-26  
**Modo activo:** EM  
**Autor:** AI-EM-ARCH  
**PRD de referencia:** docs/prds/PRD-MOD05-CRM-DEFINICION-v2.0.md  
**Addendum de cierre:** docs/prds/PRD-MOD05-CRM-ADDENDUM-CIERRE-v2.1.md  
**HLD de referencia:** docs/hlds/HLD-MOD05-ARQUITECTURA-v2.0.md  
**ADR relacionado:** docs/adrs/ADR-024-Migracion-CRM-Expediente-Unico.md  
**Informe soporte:** docs/informes/INFORME-MOD05-DEFINICION-v1.0.md

---

## 1. Objetivo del sprint

Implementar el rediseno de CRM con Expediente Unico Progresivo, reemplazando el modelo dual PotentialLead/ProspectCase de Sprint 01 con un registro maestro unificado de 8 secciones, 12 estados, completitud 4D, consentimiento triple y entidades hijas de trazabilidad. Este plan se extiende para cerrar los tres gaps auditados: CRUD operativo de ContactAttempt, gestion independiente de ConsentRecord v2 y historial funcional de CoverageCheck.

---

## 2. Backlog

### P0 — Fundacion (bloqueante)

| ID | Tarea | Responsable | Estado |
| --- | --- | --- | --- |
| BT-CRM2-01 | Crear entidad ExpedienteRecord (~60 columnas, 8 secciones) | Sr. Dev Fullstack | Completada |
| BT-CRM2-02 | Crear entidades hijas: ContactAttempt, ConsentRecord v2, CoverageCheck, StatusChange | Sr. Dev Fullstack | Completada |
| BT-CRM2-03 | Crear migracion tenant para tablas expediente + hijas | Sr. Dev Fullstack | Completada |
| BT-CRM2-04 | Implementar ExpedienteService: create, findAll, findById, updateSection | Sr. Dev Fullstack | Completada |
| BT-CRM2-05 | Implementar StatusTransitionService con reglas por estado | Sr. Dev Fullstack | Completada |
| BT-CRM2-06 | Implementar CompletenessCalculator con 4 dimensiones | Sr. Dev Fullstack | Completada |

### P1 — Controller y validacion

| ID | Tarea | Responsable | Estado |
| --- | --- | --- | --- |
| BT-CRM2-07 | Implementar ExpedientesController con 8 endpoints REST | Sr. Dev Fullstack | Completada |
| BT-CRM2-08 | Crear Zod schemas: CreateExpediente, UpdateSection, TransitionStatus | Sr. Dev Fullstack | Completada |
| BT-CRM2-09 | Implementar ZodBodyValidationPipe generico | Sr. Dev Fullstack | Completada |
| BT-CRM2-10 | Cifrado AES-256-GCM de 6 campos PII | Sr. Dev Fullstack | Completada |

### P2 — Portal empresarial

| ID | Tarea | Responsable | Estado |
| --- | --- | --- | --- |
| BT-CRM2-11 | Crear pagina listado expedientes con creacion inline y filtros | Sr. Dev Fullstack | Completada |
| BT-CRM2-12 | Crear pagina detalle expediente: 8 secciones accordion, guardar por seccion | Sr. Dev Fullstack | Completada |
| BT-CRM2-13 | Implementar transicion de estado y reactivacion en portal | Sr. Dev Fullstack | Completada |
| BT-CRM2-14 | Implementar timeline: changes, activities, metadata con actor real | Sr. Dev Fullstack | Completada |
| BT-CRM2-15 | Crear CrmOverviewClient: metricas pipeline, resumen, recientes | Sr. Dev Fullstack | Completada |
| BT-CRM2-16 | Crear expediente-ui.ts con EXPEDIENTE_STATUS_META y formatters | Sr. Dev Fullstack | Completada |
| BT-CRM2-17 | Retirar componentes legacy del portal (PotentialForm, ProspectBoard, etc.) | Sr. Dev Fullstack | Completada |

### P3 — Integracion y calidad

| ID | Tarea | Responsable | Estado |
| --- | --- | --- | --- |
| BT-CRM2-18 | Implementar puertos de integracion (9 puertos, 2 reales + 7 stubs) | Sr. Dev Fullstack | Completada |
| BT-CRM2-19 | Tests unitarios del controller de expedientes | Sr. Dev Fullstack | Completada |
| BT-CRM2-20 | Actualizar api-client.ts con tipos y metodos CRM | Sr. Dev Fullstack | Completada |

### P4 — Remediacion y hotfixes

| ID | Tarea | Responsable | Estado |
| --- | --- | --- | --- |
| BT-CRM2-21 | HF: CompletenessCalculator degradacion segura (42P01/42703) | Sr. Dev Fullstack | Completada |
| BT-CRM2-22 | HF: Migraciones tenant normalizar schema MOD05 | Sr. Dev Fullstack | Completada |
| BT-CRM2-23 | HF: Validacion local portal pre-POST + ApiError con detalles | Sr. Dev Fullstack | Completada |
| BT-CRM2-24 | HF: DTOs con @Allow() para ValidationPipe global | Sr. Dev Fullstack | Completada |
| BT-CRM2-25 | HF: @JoinColumn explicito en entidades hijas | Sr. Dev Fullstack | Completada |
| BT-CRM2-26 | Refinamiento UX: overview, timeline, metadata, lenguaje | Sr. Dev Fullstack | Completada |

### P5 — Cierre de gaps criticos

| ID | Tarea | Responsable | Estado |
| --- | --- | --- | --- |
| BT-CRM2-27 | Crear enums CRM faltantes en shared/src: ContactChannel, ContactResult, EvidenceMode | Sr. Dev Fullstack | Completada |
| BT-CRM2-28 | Crear ContactAttemptService + Zod schema + endpoints POST/GET por expediente | Sr. Dev Fullstack | Completada |
| BT-CRM2-29 | Crear ConsentRecordService + Zod schema + endpoints POST/GET/revoke por expediente | Sr. Dev Fullstack | Completada |
| BT-CRM2-30 | Crear CoverageCheckService + Zod schema + endpoints POST/GET por expediente | Sr. Dev Fullstack | Completada |
| BT-CRM2-31 | Agregar assignedTo, actorName y dataConsentRevoked al agregado expediente y timeline | Sr. Dev Fullstack | Completada |
| BT-CRM2-32 | Crear migracion tenant incremental para campos nuevos e indice por assignedTo | Sr. Dev Fullstack | Completada |
| BT-CRM2-33 | Ocultar PII en listados y restringir ipAddress de consentimientos por rol | Sr. Dev Fullstack | Completada |
| BT-CRM2-34 | Agregar tabs portal para intentos de contacto, consentimientos y cobertura | Sr. Dev Fullstack | Completada |
| BT-CRM2-35 | Retirar PotentialsModule, ProspectsModule y ReviewsModule del backend | Sr. Dev Fullstack | Completada |
| BT-CRM2-36 | Ampliar pruebas unitarias, boundary y E2E para cubrir los 3 gaps y hardening | Sr. Dev Fullstack | En curso |

---

## 3. Resumen de ejecucion

| Metrica | Valor |
| --- | --- |
| Total tareas | 36 |
| Completadas | 35 |
| En curso | 1 |
| Planificadas para cierre | 0 |
| Bloqueadas | 0 |
| Velocidad | Sprint 02 casi listo para cierre; solo faltan pruebas ampliadas |

---

## 4. Riesgos residuales y criterio de cierre

| Riesgo | Prioridad | Accion |
| --- | --- | --- |
| ContactAttempt sin CRUD operativo | Alta | Ejecutar BT-CRM2-28 |
| Consentimiento triple sin gestion independiente | Alta | Ejecutar BT-CRM2-29 |
| CoverageCheck sin historial funcional | Alta | Ejecutar BT-CRM2-30 |
| Revision seguridad campos cifrados | Media | Ejecutar BT-CRM2-33 |
| Retiro flujo legacy backend | Media | Ejecutar BT-CRM2-35 |
| Enums CRM sin fuente .ts en shared/src | Media | Ejecutar BT-CRM2-27 |

### Estado actual del cierre

- Los tres gaps operativos principales ya cuentan con enums, DTOs, endpoints backend y consumo desde el api-client del portal.
- El detalle del expediente ya permite registrar y listar intentos de contacto, consentimientos y verificaciones de cobertura.
- El agregado ya soporta `assignedTo`, `dataConsentRevoked`, `actorName` y migración tenant incremental.
- La suite unitaria del servicio ya cubre ocultamiento de PII, revocación de consentimiento y asignación del expediente.
- Las suites de controller y boundary DTO ya cubren los contratos nuevos de contacto, consentimiento, cobertura y asignación.
- El wiring legacy dejó de formar parte del `CrmModule`; para cerrar BT-CRM2-36 solo faltan pruebas E2E ampliadas.

### Gate de cierre

- Sprint 02 solo se considera cerrado cuando BT-CRM2-27 a BT-CRM2-36 esten completadas.
- El cierre exige cobertura >= 80% en servicios core + hijos, E2E del portal actualizados y ausencia de PII en listados.
- El addendum de cierre y el prompt Fase 02 v1.1 son parte obligatoria de este gate.

---

*Plan actualizado por AI-EM-ARCH para absorber el cierre de gaps dentro de Sprint 02 sin abrir una fase separada.*
