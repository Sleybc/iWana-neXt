# INFORME-PRIVACY-FASE-1A-SEC-v1.0

**Fecha:** 2026-10-14  
**Revisor:** AI-SEC-ENG  
**Resultado:** **NO-GO** para el cierre de Fase 1a hasta corregir SEC-01.  
**Método:** revisión estática de código, configuración y contratos documentales; no se ejecutaron pruebas dinámicas ni pentest. Q8 (bloqueo y anonimización) queda fuera de alcance.

## Alcance y fuentes

Se revisaron ADR-094, el plan de Fase 1 v1.4, el prompt de ejecución v1.3 §3 C1, los informes Q1–Q7 más recientes y los PRD/HLD vigentes de MOD05 y Media. El HLD propio de Privacy está diferido hasta antes de G7 según el plan; no se usó como supuesto para aprobar arquitectura. D-POT está incluido porque `PotentialsModule` sigue montado en `CrmModule`.

## Hallazgos

### [SEC-REVIEW] SEC-01 — P1 / Alta — La consulta de prueba de autorización devuelve evidencia sin `no-store` ni auditoría explícita

**Evidencia:** `apps/api/src/modules/privacy/authorizations/authorizations.controller.ts:91-109` protege `GET /privacy/parties/:partyId/authorizations/:id/proof` con `privacy.read`, pero no establece `Cache-Control: no-store` ni registra el acceso. `apps/api/src/modules/privacy/authorizations/authorizations.service.ts:103-113` obtiene una URL de evidencia y la devuelve; el método no llama a auditoría. La ruta de evidencia de solicitudes sí aplica `no-store` y registra el acceso (`apps/api/src/modules/privacy/requests/requests.controller.ts:202-224`, `apps/api/src/modules/privacy/requests/requests.service.ts:526-529`). La URL MinIO está limitada a 300 segundos (`apps/api/src/modules/media/media.service.ts:336-341`).

**Escenario e impacto:** un usuario con permiso de lectura de privacidad consulta la prueba de una autorización y obtiene un enlace bearer a evidencia sensible. Sin `no-store`, intermediarios o el navegador pueden conservar la respuesta; sin evento de acceso, no queda trazabilidad de quién consultó la evidencia. La vigencia de cinco minutos reduce la ventana, pero no elimina la exposición ni la falta de auditoría.

**Guía de corrección:** añadir `Cache-Control: no-store` y una auditoría explícita, sin PII, cada vez que se emita la URL; confirmar que el permiso asignado a esta evidencia sea el nivel mínimo aprobado.

### [SEC-REVIEW] SEC-02 — P2 / Media — En almacenamiento local, la URL llamada “firmada” no vence y el archivo se sirve públicamente

**Evidencia:** `packages/storage/src/adapters/local-fs-storage.adapter.ts:84-86` ignora el TTL y devuelve una URL pública directa. `apps/api/src/main.ts:31-38` expone `/storage/` con caché pública de un año cuando el driver no es MinIO. Privacy solicita 300 segundos (`apps/api/src/modules/media/media.service.ts:336-341`), pero el adaptador local no los aplica. `apps/api/src/app.config.ts:351-354` obliga MinIO en producción y el adaptador documenta que es solo para desarrollo (`packages/storage/src/adapters/local-fs-storage.adapter.ts:15-19`); por eso el hallazgo es condicional a entornos no productivos.

**Escenario e impacto:** si se cargan datos reales en una instancia de desarrollo/local, quien conserve o reciba la URL puede consultar la evidencia indefinidamente y el navegador o proxy puede almacenarla por un año.

**Guía de corrección:** impedir emitir evidencia de privacidad mediante URL pública en el adaptador local, o servirla por un endpoint autenticado y no cacheable. Mantener MinIO como requisito para entornos con datos reales.

## Controles revisados sin hallazgo material

- **Append-only y restricciones:** en la tenant 146, triggers y checks revisados para textos legales, autorizaciones, eventos de solicitudes, marcas, reporte de incidentes, retención, verificación de identidad y tareas (`packages/database/src/migrations/tenant/146_privacy_module.ts:430-448,518-643`). No observé una vía de UPDATE/DELETE que eluda las reglas declaradas.
- **Carga de evidencia:** `apps/api/src/modules/privacy/evidence/privacy-evidence.controller.ts:43-100` exige `privacy.manage`, limita la carga a 20 solicitudes por minuto, un archivo y 10 MiB, devuelve solo id/tipo/tamaño y audita creación sin PII. `apps/api/src/modules/media/media.service.ts:201-224` verifica MIME y bytes mágicos. La URL de privacidad se limita a 300 segundos y el signed-url genérico rechaza `PRIVACY_EVIDENCE` (`apps/api/src/modules/media/media.service.ts:344-372`).
- **Detalle A23:** `apps/api/src/modules/privacy/requests/requests.service.ts:427-489` consulta permisos efectivos antes de descifrar `requester`; la respuesta omite el id del medio y los actores de eventos. Cuando incluye identidad, el controlador establece `no-store` y el servicio registra `REQUEST_IDENTITY_VIEWED` sin PII (`apps/api/src/modules/privacy/requests/requests.controller.ts:101-120`).
- **Suplantación:** `apps/api/src/modules/crm/privacy-adapters/crm-contract-impersonation.adapter.ts:61-135` valida pertenencia de los contratos al titular, exige el `EntityManager` transaccional y bloquea filas para actualizar contratos; los eventos de dominio se emiten después del commit (`apps/api/src/modules/crm/privacy-adapters/crm-contract-impersonation.adapter.ts:18-37`). El flujo de solicitudes está protegido con `privacy.manage`. No observé consultas cross-tenant en las rutas revisadas.
- **Colas, alertas y registros:** el payload del job de alertas lleva tenant/fecha, no datos del titular (`apps/api/src/modules/privacy/alerts/privacy-due-alerts.processor.ts:41-46`); el correo contiene conteos y enlace a la bandeja, no PII (`apps/api/src/modules/privacy/alerts/privacy-due-alerts.processor.ts:242-267`). Los registros de privacy y de potenciales que revisé usan ids, acciones, tenant o estado y no interpolan identidad/contacto.
- **D-POT:** `GET /crm/potentials` requiere JWT, roles y `CRM_EXPEDIENTES_READ`, pagina resultados y ejecuta consultas tenant-scoped (`apps/api/src/modules/crm/potentials/potentials.controller.ts:51-71`, `apps/api/src/modules/crm/potentials/potentials.service.ts:85-115`). Su DTO sí expone nombre, correo, teléfono y notas a esos lectores (`apps/api/src/modules/crm/potentials/potentials.service.ts:207-219`); la exposición está detrás del permiso de lectura vigente y no observé PII en sus auditorías CUD. Confirmar que la matriz RBAC vigente autoriza a todos los roles declarados sigue siendo una comprobación de gobernanza, no un defecto confirmado en este alcance.
- **Request pipeline:** se observaron guards JWT/roles/permisos en las rutas auditadas, rate limiting global y por carga, y uso de contexto tenant en las operaciones revisadas. La configuración de producción Nginx declara TLS 1.3 (`nginx/nginx.prod.conf:53-64,155-161`). Esta revisión estática no confirma el estado del despliegue ni la validación efectiva de certificados.

## Deuda de seguridad nueva

| ID | Severidad | Estado | Deuda |
| --- | --- | --- | --- |
| SEC-01 | P1 / Alta | Bloquea el GO | `proof` de autorización debe responder `no-store` y dejar auditoría explícita sin PII. |
| SEC-02 | P2 / Media | Condicional a storage local | URL pública de evidencia local no respeta expiración ni política de caché; no usarla con datos reales. |

No se confirmó vulnerabilidad crítica. No se reportan cambios de contratos ni correcciones: C1 es auditoría de solo lectura. Repetir revisión enfocada de ambos hallazgos después de su corrección; ejecutar pruebas dinámicas de autorización, caché y enlace firmado antes del cierre final.
