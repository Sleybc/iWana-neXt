# PROMPT — MOD09–MOD11 OT de instalacion Fase 03 Plantillas y evidencias

**Version:** 1.0  
**Estado:** Emitido — G4 congelado (2026-07-27)  
**Fecha:** 2026-07-27  
**Modo activo:** Ejecucion multi-carril  
**Generado por:** AI-EM-ARCH  
**Ejecutores:** AI-SR-FULL, AI-DATA-ENG on-demand, AI-FE-PLATFORM  
**Reviews:** AI-PROD-UX, AI-DS-OWNER, AI-SEC-ENG, AI-SR-QA, Legal/Regulatorio externo  
**Plantilla base:** `docs/prompts/TEMPLATE-PROMPT-EJECUCION-FASE-MODULO.md`

## Contratos congelados (G4)

- **Contrato de API congelado.** Tipos: `packages/shared/src/contracts/operations/execution-orders.ts`. OpenAPI: `apps/api/openapi/tasks-execution-orders.v1.json`.
- **Contrato de componente congelado.** Spec: `docs/specs/2026-07-27-mod09-mod11-ot-instalacion-ds-contrato.md` v1.1.
- **Nombres congelados (G4).** Ver informe vivo §9.
- **Condiciones aceptadas de G3.** Ver informe vivo §9.

---

## 1. Objetivo exacto de la fase

Implementar catálogo versionado, snapshot por OT, gate de cierre, evidencia segura, conformidad y conciliación de inventario.

**Entra:** Tasks 5 y 8 más UI administrativa/ejecución necesaria.  
**No entra:** afirmar validez jurídica sin concepto oficial; motor de formularios arbitrario; reapertura de terminales.

## 2. Artefactos de entrada obligatorios

- ADR-068 aprobado por el CTO el 2026-07-27;
- specs UX, DS y API congeladas;
- concepto Legal/Regulatorio sobre firma, consentimiento, retención y geolocalización;
- plan, checklist y resultado de fases anteriores.

## 3. Instrucciones

1. Activar skills backend, datos, frontend, seguridad, WCAG y TDD aplicables.
2. Congelar schema permitido de plantilla; rechazar expresiones/componentes arbitrarios.
3. Hacer versiones publicadas inmutables y conservar snapshot/referencia reconstructible por OT.
4. Implementar gate determinista y errores 422 accionables.
5. Consumir Media/Assets conforme ADR-034/035: `mediaAssetId` ligado por servidor a tenant+OT, MIME real, allowlist/tamaño, cuarentena, hash y timestamps de servidor, descarga reautorizada y URL firmada corta.
6. Integrar MOD12 mediante comando/evento idempotente; nunca repositorio cruzado.
7. Probar serial, tipo de custodia, `responsibleRefId`, cuadrilla/membresia vigente, cantidad, concurrencia, reintento, rechazo y reconciliación.
8. Probar misma clave con payload distinto, fallo después de confirmación MOD12 y eliminación del fallback de movimiento ficticio.
9. Ejecutar Task 7A y cerrar QA-45, QA-46 y QA-48, incluido recibo `202`, fault injection PostgreSQL↔MinIO, reconciliación y limpieza de huérfanos.

## 4. Restricciones no negociables

- Cero PII innecesaria en eventos/logs.
- Sin URL permanente o secreto de almacenamiento en respuestas/logs.
- Sin edición de versión publicada ni OT terminal.
- Sin confirmar inventario antes de confirmación MOD12.
- Sin diseño legal inventado.

## 5. Entregables

- Catálogo y administración por permiso.
- Snapshot/gate de cierre.
- Evidencia/conformidad bajo política aprobada.
- Integración y reconciliación de inventario.
- Tests, migraciones reversibles, OpenAPI, checklist e informe.

## 6. Criterios de aceptacion

- CA-03-01: nuevas versiones no alteran OT existentes.
- CA-03-02: cierre incompleto enumera faltantes y no cambia estado.
- CA-03-03: evidencia ajena/reutilizada/en cuarentena/MIME falso se rechaza; la válida es autorizada, verificable y auditable sin filtrar storage.
- CA-03-04: reintento/concurrencia no duplica movimiento.
- CA-03-05: rechazo de MOD12 queda visible y recuperable.

## 7. Stop/go

Detener sin concepto legal requerido, ante schema arbitrario, almacenamiento inseguro, URL de evidencia arbitraria, ausencia de cuarentena/validación real, boundary violation o falta de idempotencia.

## 8. Salida

G5 implementado con concepto externo referenciado y migraciones/pruebas verdes; queda sujeto a review G6 de experiencia, QA y AppSec.
