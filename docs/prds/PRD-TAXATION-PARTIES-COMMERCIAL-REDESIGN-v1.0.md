---
title: 'PRD — Taxation (MOD07) + Parties (MOD08) + Rediseño tributario MOD06'
version: '1.0'
owner: 'Arquitectura de Soluciones / Producto'
date: '2026-04-21'
status: 'Aprobado'
approvedAt: '2026-04-21'
approvedBy: 'CTO Humano'
classification: 'Confidencial — Uso Interno'
modules: ['MOD06', 'MOD07', 'MOD08']
relatedADRs: ['ADR-029', 'ADR-030', 'ADR-031']
references:
  - docs/prds/PRD_Sistema_ISP_Colombia_v2_3.md
  - docs/prds/PRD-ADDENDUM-TAXATION-PARTIES-v1.0.md
  - docs/adrs/ADR-029-Bounded-Context-Taxation-Catalogo-Unificado.md
  - docs/adrs/ADR-030-Modelo-Party-Multi-Rol.md
  - docs/adrs/ADR-031-Rediseno-Tributario-Comercial-Impuestos-Reglas-Simulador.md
  - docs/hlds/HLD-MOD07-TAXATION-v1.0.md
  - docs/hlds/HLD-MOD08-PARTIES-v1.0.md
  - docs/hlds/HLD-MOD06-TAXATION-DEPENDENCY-v1.1-addendum.md
  - docs/hlds/HLD-MOD05-PARTIES-DEPENDENCY-v2.1-addendum.md
  - docs/specs/2026-04-21-taxation-bounded-context-design.md
  - docs/specs/2026-04-21-parties-multi-rol-design.md
  - docs/specs/2026-04-20-reglas-comerciales-design.md
---

## 1. Resumen ejecutivo

Este PRD consolida los requisitos para tres entregas coordinadas que nacen de una misma sesión de diseño arquitectónico:

1. **MOD07 — Taxation.** Catálogo unificado de impuestos del tenant como bounded context propio. Consumido por Commercial, Purchasing y Billing vía puerto tipado.
2. **MOD08 — Parties.** Maestro de terceros multi-rol del tenant. Soporta que una misma persona u organización sea cliente, proveedor, empleado, contratista o vendedor simultáneamente.
3. **MOD06 — Rediseño tributario.** Reemplazo del naming `Clasificaciones + Reglas de asignación` por `Impuestos + Reglas de aplicación + Simulador`, con Commercial dueño solo de las reglas de aplicación y Taxation dueño del catálogo.

Los tres trabajos son dependientes y se entregan como programa coordinado.

## 2. Problema de negocio

| Problema                                       | Impacto actual                                   |
| ---------------------------------------------- | ------------------------------------------------ |
| Catálogo tributario dentro de Commercial       | Bloquea Purchasing/Payroll sin refactor          |
| Clasificaciones tributarias con naming confuso | Negocio no entiende qué hace cada sección        |
| `User` y `Subscriber` no modelan multi-rol     | Al entrar Purchasing/RRHH se duplicará identidad |
| `TaxRegime` con solo `SIMPLIFIED`/`COMMON`     | Insuficiente para regímenes de proveedores       |
| Deuda técnica: columnas duplicadas de estrato  | Ambigüedad en queries y migraciones              |

## 3. Objetivos

- Publicar `TaxationModule` con catálogo, presets Colombia y puerto `ITaxCatalogReadPort`.
- Publicar `PartiesModule` con `Party + PartyContact + PartyRole + UserAccount.partyId` y puerto `IPartyReadPort`.
- Rediseñar la pestaña tributaria de Commercial: Impuestos (lectura a Taxation) + Reglas de aplicación + Simulador.
- Migrar datos existentes de forma aditiva, sin pérdida, con ventana controlada.
- Cerrar deuda técnica de columnas duplicadas `estrato_min`/`estrato_max` → `stratum_from`/`stratum_to`.

## 4. Alcance

### 4.1 Dentro de alcance

- Código backend (`apps/api`) para MOD07 y MOD08.
- Cambios en `apps/api/src/modules/commercial/*` para consumir Taxation y reestructurar reglas.
- Frontend (`apps/portal`) con nuevos componentes `TaxCatalogManager`, `TaxApplicationRulesManager`, `TaxSimulatorPanel`.
- Migraciones TypeORM reversibles para schema tenant.
- Seeder de presets Colombia para provisioning.
- Tests unitarios, integración y E2E según módulo.
- Actualización de OpenAPI y `apps/portal/src/lib/api-client.ts`.

### 4.2 Fuera de alcance

- Integración DANE / DIAN / RUES.
- Versionado histórico SCD2 sobre `TaxDefinition.baseRate`.
- Cálculo financiero final de facturas (Billing futuro).
- Deduplicación automática de Parties (solo merge manual en v1).
- Renombre físico de tabla `users` a `user_accounts` (ADR operativo separado).
- Implementación de `PurchasingModule`, `HrModule`, `BillingModule`.

## 5. Requerimientos funcionales

### 5.1 Taxation (RF-TAX)

- **RF-TAX-01.** `TENANT_ADMIN` y roles con permiso tributario pueden consultar el catálogo filtrando por `context = SALES | PURCHASE | BOTH`.
- **RF-TAX-02.** El provisioning de tenant siembra presets Colombia: `IVA_19`, `IVA_EXENTO`, `IVA_EXCLUIDO`, `RETE_FUENTE_SERVICIOS`, `RETE_ICA`, `ESTAMPILLA_DEPARTAMENTAL`. Todos con `origin = SYSTEM`.
- **RF-TAX-03.** El tenant puede crear, editar, activar/desactivar `CUSTOM`. No puede editar ni eliminar `SYSTEM`; sí duplicarlos.
- **RF-TAX-04.** Cada impuesto lleva `code`, `name`, `category`, `jurisdictionLevel`, `municipalityCode?`, `baseRate?`, `treatment`, `context`, `origin`, `isActive`.
- **RF-TAX-05.** Commercial, Purchasing (futuro) y Billing (futuro) consumen únicamente `ITaxCatalogReadPort`. No acceden a tablas.
- **RF-TAX-06.** Todas las operaciones CUD son auditadas.
- **RF-TAX-07.** `code` es único por tenant. Se bloquea creación con colisión.

### 5.2 Parties (RF-PAR)

- **RF-PAR-01.** Maestro único de terceros por tenant (`Party`).
- **RF-PAR-02.** Un `Party` puede tener N roles activos simultáneos del conjunto `CUSTOMER | SUPPLIER | EMPLOYEE | CONTRACTOR | SALES_AGENT`.
- **RF-PAR-03.** Los roles llevan `validFrom` y pueden desactivarse con `validTo` preservando historial.
- **RF-PAR-04.** Contactos múltiples por `Party` (EMAIL, PHONE, ADDRESS) con `isPrimary` único por tipo.
- **RF-PAR-05.** `UserAccount` puede vincularse opcionalmente a un `Party` vía `partyId`. Cuentas operativas conservan `partyId = null`.
- **RF-PAR-06.** Unique `(documentType, documentNumber)` entre activos. Consolidación por merge manual con `mergedIntoPartyId`.
- **RF-PAR-07.** CRM, Purchasing (futuro) y RRHH (futuro) acceden al maestro únicamente vía `IPartyReadPort`.
- **RF-PAR-08.** Todas las operaciones CUD son auditadas y respetan política PII.
- **RF-PAR-09.** Listado de terceros filtra por rol, estado, tipo de documento y texto de nombre.

### 5.3 Rediseño tributario Commercial (RF-CTX)

- **RF-CTX-01.** La pestaña tributaria muestra tres secciones independientes: `Impuestos` (lectura a Taxation), `Reglas de aplicación`, `Simulador`.
- **RF-CTX-02.** Cada regla soporta condiciones: segmento, tipo de persona, rango de estrato (`stratumFrom`/`stratumTo`), municipio, base mínima, producto/plan, vigencia y prioridad.
- **RF-CTX-03.** El resultado de una regla es una lista de aplicaciones (`TaxApplicationSnapshot[]`) con `taxDefinitionId`, `treatment`, `effectiveRate`, `ruleId`, `priorityMatched`.
- **RF-CTX-04.** El simulador recibe inputs (segmento, persona, estrato, municipio, producto, base) y devuelve impuestos aplicables, regla ganadora y motivo de prioridad.
- **RF-CTX-05.** `tax_classifications` se conserva como legacy durante la migración y se deprecará al cerrar el corte.
- **RF-CTX-06.** Se eliminan columnas duplicadas `estrato_min`/`estrato_max`. Se conservan `stratum_from`/`stratum_to`.
- **RF-CTX-07.** Tributos territoriales se registran manualmente como `TaxDefinition` en Taxation; Commercial solo los consume.

### 5.4 Migración y coexistencia (RF-MIG)

- **RF-MIG-01.** Todas las migraciones son reversibles (up + down) y probadas contra DB de test.
- **RF-MIG-02.** Ningún dato existente se pierde. `tax_classifications` y `tax_rules` viven junto al nuevo modelo durante la ventana.
- **RF-MIG-03.** Cada `Subscriber` activo recibe su `party_id` tras backfill. El vínculo `subscriber.id` se preserva.
- **RF-MIG-04.** Cada `User` con datos de tercero recibe `party_id`. Cuentas operativas mantienen `partyId = null`.
- **RF-MIG-05.** Feature flag `taxation.useCatalog` controla el corte entre motor legacy y nuevo.

## 6. Requerimientos no funcionales

- **NFR-01.** Respuesta de lista de `TaxDefinition` < 200 ms p95 con 200 registros.
- **NFR-02.** Búsqueda `Party` por `(documentType, documentNumber)` < 100 ms p95.
- **NFR-03.** Contactos con PII cifrados o redactados en logs.
- **NFR-04.** Aislamiento tenant garantizado por `search_path` en transacción; tests de isolation obligatorios.
- **NFR-05.** Cobertura ≥ 80% en servicios y controllers core de MOD07 y MOD08.
- **NFR-06.** OpenAPI actualizado antes de cerrar cada fase.

## 7. Personas y casos de uso

- **Administrador tenant.** Consulta catálogo de impuestos, crea reglas de aplicación, simula para un cliente concreto.
- **Operador CRM.** Crea un cliente que internamente alta un `Party` + rol `CUSTOMER` + `Subscriber`.
- **Administrador plataforma.** No accede al catálogo tributario del tenant salvo lectura desde soporte.
- **Futuro comprador.** Creará `Party` + rol `SUPPLIER` + `SupplierProfile` al entrar MOD Purchasing.

## 8. Modelo de datos resumido

Detalle completo en HLDs. Resumen:

- `taxation.tax_definitions` (schema tenant)
- `parties.party` (schema tenant)
- `parties.party_contact` (schema tenant)
- `parties.party_role` (schema tenant)
- `users` adquiere `party_id UUID NULL`
- `subscribers` adquiere `party_id UUID NULL` (pasa a NOT NULL tras backfill)
- `commercial.tax_application_rules` (renombre funcional de `tax_rules`)
- `commercial.tax_rule_applications` (puente hacia `tax_definitions`)

## 9. Contratos expuestos

- `ITaxCatalogReadPort` — ver HLD-MOD07 §5.
- `IPartyReadPort` — ver HLD-MOD08 §5.
- `ITaxApplicationReadPort` — expuesto por Commercial hacia CRM/Billing; devuelve `TaxApplicationSnapshot[]`.

## 10. Criterios de aceptación

- **CA-01.** Catálogo Taxation creado, con presets sembrados al provisionar tenant nuevo.
- **CA-02.** Bloqueo efectivo de edición/eliminación de presets `SYSTEM`.
- **CA-03.** Commercial consume `ITaxCatalogReadPort` y no usa `taxType`/`ratePercentage` desde el nuevo flujo.
- **CA-04.** `PartiesModule` permite crear un `Party` con al menos un rol activo y contactos.
- **CA-05.** Un mismo `Party` puede quedar con `CUSTOMER + SUPPLIER` (o cualquier combinación) sin duplicar identidad.
- **CA-06.** Backfill: todos los `Subscriber` activos tienen `party_id` tras migración. No hay huérfanos.
- **CA-07.** `users.party_id` existe y los que tienen datos de tercero quedan enlazados.
- **CA-08.** La pestaña tributaria de Portal muestra tres secciones y el simulador explica regla ganadora.
- **CA-09.** Migraciones reversibles: `migration:revert` restaura estado previo en DB de test.
- **CA-10.** Aislamiento tenant en pruebas (ver `*.isolation.spec.ts`).
- **CA-11.** Cobertura ≥ 80% en servicios y controllers nuevos.
- **CA-12.** OpenAPI actualizado y verificado.
- **CA-13.** Columnas `estrato_min`/`estrato_max` removidas en migración final.
- **CA-14.** Feature flag `taxation.useCatalog` documentado y operativo.

## 11. Fases de entrega

| Fase | Objetivo                                                                                             | Dependencia      |
| ---- | ---------------------------------------------------------------------------------------------------- | ---------------- |
| F1   | Scaffold y esquema MOD07 + seeder presets                                                            | ADR-029 aprobado |
| F2   | Scaffold y esquema MOD08 (tablas + `users.party_id`)                                                 | ADR-030 aprobado |
| F3   | Consumo de Taxation desde Commercial vía puerto + tabla puente `tax_rule_applications`               | F1               |
| F4   | Rediseño frontend tributario: `TaxCatalogManager`, `TaxApplicationRulesManager`, `TaxSimulatorPanel` | F3               |
| F5   | Backfill Subscribers → Parties + enlace Users                                                        | F2               |
| F6   | Deprecación controlada de `tax_classifications` y columnas duplicadas de estrato                     | F3, F4           |

Las fases se entregan secuencialmente. F1 y F2 pueden trabajarse en paralelo con equipos separados si el recurso lo permite.

## 12. Riesgos

| Riesgo                                                       | Mitigación                                                              |
| ------------------------------------------------------------ | ----------------------------------------------------------------------- |
| Backfill de Subscribers masivo con errores                   | Script idempotente, ejecutado en DB de test, ventana controlada         |
| Presets SYSTEM editados accidentalmente                      | Guard en service + test unitario específico                             |
| Coexistencia legacy prolongada                               | Feature flag + deadline de corte documentado                            |
| PII en logs de Parties                                       | Redactor de logs + test que valida ausencia de `documentNumber` en logs |
| Boundary roto Commercial → Taxation (acceso directo a tabla) | Lint/ESLint rule o test de arquitectura + revisión de imports           |

## 13. Seguridad y auditoría

- Todas las operaciones CUD pasan por `AuditInterceptor`.
- PII con política consistente al PRD v2.3 §13.
- Zod en DTOs; sin `any` implícitos.
- Roles: `TENANT_ADMIN` para CUD; `TENANT_USER` con permisos específicos para lectura.

## 14. Documentación esperada al cierre

- Informe vivo `docs/informes/INFORME-TAXATION-PARTIES-PROGRAMA-v1.X.md` por fase.
- Actualización de OpenAPI servida por `apps/api`.
- Actualización de spec `2026-04-21-taxation-bounded-context-design.md` si hay desvíos.
- Actualización de spec `2026-04-21-parties-multi-rol-design.md` si hay desvíos.
- PRD v2.3 → v2.4 consolidando este PRD y su addendum, una vez completadas las fases.

## 15. Referencias

- ADR-029, ADR-030, ADR-031.
- HLD-MOD07-TAXATION-v1.0.md, HLD-MOD08-PARTIES-v1.0.md.
- Addenda HLD-MOD05 y HLD-MOD06.
- Specs 2026-04-20 y 2026-04-21.
- AGENTS.md.
