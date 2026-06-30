# PROMPT - MOD03 Configuracion Empresarial Fase 01

**Version:** 1.0  
**Estado:** En revision  
**Fecha:** 2026-03-17  
**Modo activo:** Mixto

## Vinculos de trazabilidad

- Plantilla base: docs/prompts/TEMPLATE-PROMPT-EJECUCION-FASE-MODULO.md
- PRD del modulo: docs/prds/PRD-MOD03-CONFIGURACION-EMPRESA-v1.0.md
- HLD del modulo: docs/hlds/HLD-MOD03-CONFIGURACION-EMPRESA-v1.0.md
- Backlog tecnico base: docs/plans/PLAN-MOD03-CONFIGURACION-EMPRESA-BACKLOG-v1.0.md
- Informe relacionado: docs/informes/INFORME-MOD03-DEFINICION-v1.0.md
- Prompt arquitectonico origen: docs/hlds/HLD-MOD03-CONFIGURACION-EMPRESA-v1.0.md

## Modulo

- Nombre: Configuracion Empresarial
- Codigo: MOD03
- Fase: CONFIGURACION-EMPRESA-FASE-01
- Version: 1.0
- Fecha: 2026-03-17
- Generado por: AI-EM-ARCH
- Nombre de archivo destino: docs/prompts/PROMPT-MOD03-CONFIGURACION-EMPRESA-FASE-01-v1.0.md

---

## 1. Objetivo exacto de la fase

- Resultado esperado: convertir la ruta protegida de configuracion empresarial del portal en una capacidad funcional completa para consultar y actualizar perfil empresarial y configuracion operativa del tenant autenticado, con auditoria, validacion y enforcement de ownership por campo.
- Lo que si entra:
  - creacion del contrato `PATCH /api/v1/tenants/me/profile`,
  - endurecimiento de `PATCH /api/v1/tenants/me/settings`,
  - formularios funcionales en `apps/portal/src/app/dashboard/settings/page.tsx`,
  - bloque de seguridad organizacional con `mfa_required_all`,
  - validaciones backend/frontend,
  - auditoria de cambios,
  - pruebas backend y frontend/E2E,
  - actualizacion del informe vivo.
- Lo que no entra:
  - cambios de stack o de tenancy,
  - CRUD completo de usuarios o roles,
  - licenciamiento o enablement comercial de modulos,
  - hacer editables `features.billing` o `maxSubscribers`,
  - cambios de plataforma en apps/web.

## 2. Artefactos de entrada obligatorios

- PRD del modulo: docs/prds/PRD-MOD03-CONFIGURACION-EMPRESA-v1.0.md
- HLD del modulo: docs/hlds/HLD-MOD03-CONFIGURACION-EMPRESA-v1.0.md
- ADRs aplicables: ADR-016, ADR-018, ADR-019, ADR-022, ADR-023
- Sprint plan aplicable: docs/plans/PLAN-MOD03-CONFIGURACION-EMPRESA-BACKLOG-v1.0.md
- Prompt arquitectonico origen: docs/hlds/HLD-MOD03-CONFIGURACION-EMPRESA-v1.0.md
- Artefactos faltantes detectados:
  - confirmacion final de ownership de `name` si existiera restriccion administrativa adicional,
  - regla de validacion definitiva de NIT si negocio requiere formato mas estricto que el tecnico base.

## 3. Instrucciones para Sr. Dev Fullstack

1. Implementar primero backend y contratos para evitar que el frontend se construya sobre supuestos.
2. Crear `PATCH /api/v1/tenants/me/profile` con DTO separado de platform DTOs y limitarlo a campos tenant-managed.
3. Mantener `PATCH /api/v1/tenants/me/settings`, pero filtrar o rechazar cualquier clave platform-managed.
4. No permitir desde portal la escritura de `features.billing` ni de `maxSubscribers`.
5. Convertir `apps/portal/src/app/dashboard/settings/page.tsx` en una pantalla funcional con tres bloques: Perfil Empresarial, Configuracion Operativa y Seguridad.
6. Implementar formularios independientes por seccion para reducir acoplamiento entre agregados y facilitar auditoria.
7. Reutilizar los contratos self-service `me`, `me/settings` y `me/summary` cuando sirvan como fuente comun; no consultar endpoints globales `tenants/:id`.
8. Aplicar validaciones frontend alineadas al backend para email, pais, moneda, telefono, URL y campos legales.
9. Mantener la ruta dentro de apps/portal y preservar el shell empresarial ya aprobado.
10. Actualizar el informe vivo del modulo con resultados, desvíos, riesgos y decision de salida.

## 4. Restricciones no negociables

- No romper boundaries del modulith ni mover ownership fuera de TenantModule.
- No acceder a tablas de otro modulo directamente.
- No usar endpoints globales de plataforma como atajo desde portal.
- No introducir datos reales, PII, secretos, tokens ni credenciales en codigo, tests, logs o documentacion.
- No hacer editable ningun campo marcado como platform-managed en el HLD.
- No omitir auditoria en operaciones de escritura.
- No cerrar la fase sin pruebas suficientes de tenancy, permisos y flujo funcional.

## 5. Entregables tecnicos obligatorios

- Codigo backend para `PATCH /api/v1/tenants/me/profile`.
- Refuerzo de codigo backend para `PATCH /api/v1/tenants/me/settings` con enforcement de ownership.
- Codigo frontend funcional de la pantalla `dashboard/settings`.
- Cliente tipado del portal para lectura y escritura self-service.
- Tests unitarios/integracion backend y pruebas frontend/E2E segun aplique.
- Ajustes de OpenAPI o contratos documentados si cambian endpoints expuestos.

## 6. Entregables documentales obligatorios

- Actualizacion del informe vigente en docs/informes/INFORME-MOD03-DEFINICION-v1.0.md o del informe vivo que lo reemplace durante ejecucion.
- Evidencia de calidad en docs/quality/ si la fase produce hallazgos o reportes formales.
- Actualizacion de PRD/HLD solo si hay desviacion aprobada y necesaria.
- Decision stop/go documentada si surge bloqueo tecnico, conflicto de ownership o necesidad de volver editable un campo platform-managed.

## 7. Criterios de aceptacion

- CA-01: la ruta `apps/portal/src/app/dashboard/settings/page.tsx` deja de ser placeholder y carga datos reales del tenant autenticado.
- CA-02: `ADMIN` puede editar perfil empresarial tenant-managed y configuracion operativa basica sin usar apps/web.
- CA-03: `ACCOUNTANT`, `NOC` y `SUPPORT` solo leen lo permitido y no tienen capacidades de escritura indebidas.
- CA-04: el portal no consume endpoints globales `tenants/:id` para esta capacidad.
- CA-05: `features.billing` y `maxSubscribers` no son editables desde este flujo MVP.
- CA-06: los cambios quedan auditados con oldValue/newValue y actor identificable.
- CA-07: existe evidencia automatizada del flujo `login -> dashboard/settings -> guardar cambios` al menos para ADMIN.

## 8. Criterio de stop/go

- Detenerse inmediatamente si:
  - la implementacion requiere editar campos platform-managed para cumplir el alcance,
  - aparece necesidad de migracion estructural no prevista,
  - el equipo pretende reutilizar endpoints globales `tenants/:id` como solucion principal,
  - la validacion de datos legales exige una regla regulatoria no confirmada.
- Documentar causa en: docs/informes/INFORME-MOD03-DEFINICION-v1.0.md
- Escalar a: CTO + Architect governance
- Recomendacion esperada: mantener el alcance en self-service tenant-aware con ownership por campo explicitado y sin invadir capacidades de plataforma.

## 9. Criterio de salida de la fase

- Backend validado: existen contratos self-service de lectura y escritura dentro del alcance aprobado.
- Frontend validado: la pagina de configuracion empresarial es funcional, accesible y coherente con el shell del portal.
- Base de datos validada: no se introducen cambios estructurales fuera del alcance sin aprobacion adicional.
- Tests en verde: hay evidencia suficiente de permisos, tenancy y flujo principal.
- Documentacion archivada: informe vivo actualizado y trazabilidad completa entre PRD, HLD, backlog y prompt.
