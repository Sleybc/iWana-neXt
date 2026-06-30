# PLAN - Taxation MVP tributos por cliente

**Version:** 1.0  
**Estado:** Aprobado  
**Fecha:** 2026-04-22  
**Modo activo:** Mixto  
**Autor:** AI-EM-ARCH  
**PRD de referencia:** docs/prds/PRD-TAXATION-PARTIES-COMMERCIAL-REDESIGN-v1.0.md  
**HLD de referencia:** docs/hlds/HLD-MOD07-TAXATION-v1.0.md  
**HLD complementario:** docs/hlds/HLD-MOD05-ARQUITECTURA-v2.0.md  
**ADRs relacionados:** docs/adrs/ADR-029-Bounded-Context-Taxation-Catalogo-Unificado.md, docs/adrs/ADR-030-Modelo-Party-Multi-Rol.md, docs/adrs/ADR-031-Rediseno-Tributario-Comercial-Impuestos-Reglas-Simulador.md  
**Spec aprobado:** docs/specs/2026-04-22-taxation-mvp-tributos-por-cliente-design.md  
**Prompt de ejecución:** docs/prompts/PROMPT-TAXATION-MVP-TRIBUTOS-CLIENTE-v1.0.md

---

## 1. Objetivo del sprint

Implementar el MVP tributario centrado en tributos por cliente, manteniendo `TaxationModule` como dueño del catálogo y desplazando la operación visible a un perfil tributario por cliente con checklist, sugerencia editable de IVA por estrato y lectura clara en Suscriptor 360.

---

## 2. Backlog

### P0 — Modelo y DB (bloqueante)

| ID | Tarea | Responsable | Estado |
| --- | --- | --- | --- |
| BT-TAXMVP-01 | Diseñar y crear tablas/entidades para `subscriber_tax_profile` y `subscriber_tax_assignment` o equivalente tenant-safe | Sr. Dev Fullstack | Planificada |
| BT-TAXMVP-02 | Crear migración reversible para el submodelo tributario del cliente | Sr. Dev Fullstack | Planificada |
| BT-TAXMVP-03 | Definir enums y snapshots para estado de asignación (`SUGGESTED`, `CONFIRMED`, `MANUAL_ADJUSTMENT`) | Sr. Dev Fullstack | Planificada |
| BT-TAXMVP-04 | Modelar origen de tasa (`CATALOG`, `MANUAL`) y tratamiento tributario efectivo por cliente | Sr. Dev Fullstack | Planificada |

### P1 — Backend Taxation + Subscribers

| ID | Tarea | Responsable | Estado |
| --- | --- | --- | --- |
| BT-TAXMVP-05 | Ajustar presets de `TaxationModule` para que el catálogo mantenga tributo base y no exponga tratamientos de IVA como presets visibles del MVP | Sr. Dev Fullstack | Planificada |
| BT-TAXMVP-06 | Implementar servicio para sugerencia de IVA por estrato editable | Sr. Dev Fullstack | Planificada |
| BT-TAXMVP-07 | Implementar CRUD o upsert del perfil tributario del cliente en el bounded context dueño del cliente | Sr. Dev Fullstack | Planificada |
| BT-TAXMVP-08 | Exponer endpoint de lectura del perfil tributario del cliente para Suscriptor 360 | Sr. Dev Fullstack | Planificada |
| BT-TAXMVP-09 | Exponer endpoint de configuración tributaria por cliente para flujo de facturación | Sr. Dev Fullstack | Planificada |
| BT-TAXMVP-10 | Garantizar que municipio no dispare tributos territoriales automáticamente para clientes residenciales | Sr. Dev Fullstack | Planificada |

### P2 — Frontend portal

| ID | Tarea | Responsable | Estado |
| --- | --- | --- | --- |
| BT-TAXMVP-11 | Simplificar `TaxCatalogManager` para operación enfocada solo en catálogo | Sr. Dev Fullstack | Planificada |
| BT-TAXMVP-12 | Retirar del flujo principal la operación visible de `TaxApplicationRulesManager` y simulador | Sr. Dev Fullstack | Planificada |
| BT-TAXMVP-13 | Crear UI de configuración tributaria por cliente con checklist y tasas fijas/variables | Sr. Dev Fullstack | Planificada |
| BT-TAXMVP-14 | Mostrar sugerencia de IVA por estrato con copy clara y estado editable | Sr. Dev Fullstack | Planificada |
| BT-TAXMVP-15 | Incorporar bloque de perfil tributario en Suscriptor 360 con estados y trazabilidad | Sr. Dev Fullstack | Planificada |
| BT-TAXMVP-16 | Actualizar `apps/portal/src/lib/api-client.ts` con contratos y endpoints del perfil tributario del cliente | Sr. Dev Fullstack | Planificada |

### P3 — Calidad, OpenAPI y documentación

| ID | Tarea | Responsable | Estado |
| --- | --- | --- | --- |
| BT-TAXMVP-17 | Actualizar OpenAPI con endpoints nuevos o cambiados | Sr. Dev Fullstack | Planificada |
| BT-TAXMVP-18 | Implementar tests unitarios de servicios y componentes del MVP | Sr. Dev Fullstack | Planificada |
| BT-TAXMVP-19 | Implementar tests de integración tenant-safe del perfil tributario por cliente | Sr. Dev Fullstack | Planificada |
| BT-TAXMVP-20 | Implementar E2E del flujo: alta contextual -> configuración tributaria -> visualización en Suscriptor 360 | Sr. Dev Fullstack | Planificada |
| BT-TAXMVP-21 | Actualizar informe vivo con hallazgos, desviaciones y evidencia de salida | Sr. Dev Fullstack | Planificada |

---

## 3. Dependencias y blockers

1. Validar si el refinamiento MVP requiere addendum formal en PRD/HLD antes de merge final.
2. Confirmar el punto exacto del bounded context donde vivirá el perfil tributario del cliente sin romper boundaries con `Taxation` y `Billing`.
3. Verificar si el flujo de configuración de facturación ya tiene pantalla destino reutilizable o si requiere pantalla nueva.

---

## 4. Definition of Done

1. El catálogo de tributos sigue operativo y aislado en `TaxationModule`.
2. Existe perfil tributario por cliente con asignaciones auditables.
3. La configuración tributaria del cliente usa checklist simple y soporta tasas fijas y variables.
4. El sistema sugiere tratamiento de IVA por estrato, pero facturación puede confirmarlo o ajustarlo.
5. Suscriptor 360 muestra el perfil tributario de forma clara.
6. No hay disparo automático general de tributos territoriales por municipio de residencia.
7. OpenAPI, tests e informe vivo quedan actualizados.

---

## 5. Riesgos

| Riesgo | Prioridad | Acción |
| --- | --- | --- |
| El perfil tributario del cliente termina modelado dentro de `Taxation` | Alta | Bloquear y corregir boundary antes de continuar |
| El flujo portal mantiene conceptos de reglas complejas y confunde al usuario | Alta | Validar copy y simplificación UX antes de cerrar frontend |
| El municipio termina usado como disparador general de tributos | Alta | Añadir validaciones de negocio y cobertura de pruebas |
| Cambios normativos futuros de IVA por estrato se codifican rígidamente | Media | Encapsular política de sugerencia en un servicio específico |

---

## 6. Criterio de aprobación de salida

- Backend y frontend validados en verde.
- Migraciones reversibles.
- Cobertura >= 80% en slices core tocados.
- OpenAPI actualizada.
- Informe vivo actualizado.
- Sin violaciones de boundary Modulith.

---

*Plan emitido como alternativa operativa al paso de `writing-plans`, no disponible como skill en esta sesión.*