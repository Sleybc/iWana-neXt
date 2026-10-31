# INFORME MOD05 — IVA por punto de servicio · T9

**Versión:** 1.1 · **Fecha:** 2026-10-30 · **Bloque:** T9 — soporte privado de estrato C-API-3 v1.2  
**Estado:** Completado · sustituye la regla de almacenamiento de la [v1.0](INFORME-MOD05-IVA-PUNTO-SERVICIO-T9-v1.0.md)  
**Referencias:** [v1.0](INFORME-MOD05-IVA-PUNTO-SERVICIO-T9-v1.0.md) · [ADR-093](../adrs/ADR-093-Tratamiento-IVA-Internet-por-Punto-y-Linea-de-Servicio.md) · [Ensayo G7-M2 v1.2](INFORME-MOD05-G7-M2-ENSAYO-v1.2.md) · [Runbook media MinIO](../runbooks/RUNBOOK-MEDIA-MINIO-v1.0.md)  
**Ruta verificada libre:** `docs/informes/INFORME-MOD05-IVA-PUNTO-SERVICIO-T9-v1.1.md` no existía antes de redactar. Sin commit.

## Qué cambia respecto de la v1.0

La v1.0 sigue vigente en todo salvo en el párrafo de almacenamiento privado y en la deuda P2. Esta versión los reemplaza.

**Motivo.** En desarrollo la carga del soporte de estrato respondía siempre 503 `STRATUM_EVIDENCE_STORAGE_MUST_BE_PRIVATE`, porque `.env.development` define `S3_PUBLIC_BASE_URL` para la marca de plataforma. El ensayo G7-M2 v1.2 (hallazgo 4) lo registró como fail-closed correcto. El riesgo real nunca fue la variable: era que `MediaService` guardara una URL pública permanente para un documento con datos del titular.

## Regla vigente de almacenamiento privado

1. **Los soportes privados nunca reciben URL pública.** `MediaService` trata `STRATUM_EVIDENCE` y `PRIVACY_EVIDENCE` como usos privados: `publicUrl` queda en `null` sea cual sea la configuración, y solo se leen por URL firmada de hasta 300 segundos.
2. **Una sola guarda, en `MediaService`.** `assertPrivateStorage` se aplica a la carga y a la firma de los dos usos, antes de crear el asset o leerlo. Responde 503 con `STRATUM_EVIDENCE_STORAGE_MUST_BE_PRIVATE` o `PRIVACY_EVIDENCE_STORAGE_MUST_BE_PRIVATE` cuando:
   - el driver no es MinIO (el driver local sirve archivos sin autenticación);
   - el bucket se declara público (`S3_BUCKET_PUBLIC=true`);
   - `S3_PUBLIC_BASE_URL` está definida y `NODE_ENV` es `production` o `staging`, porque señala un CDN o proxy delante del bucket que podría servir el objeto por clave.
3. **En `development` y `test` la base URL no bloquea.** El bucket es privado por `minio-init` y la URL apunta al MinIO directo, que exige firma.
4. **Contratos ya no duplica la regla.** Se retiró `_assertStratumEvidenceStorageIsPrivate` de `ContractsService`; la carga y el acceso firmado propagan el 503 de `MediaService`, sin tocar el contrato ni auditar un acceso.
5. **Portal.** El 503 del soporte de estrato se muestra como «La carga de soportes no está disponible en este momento. Contacta al administrador de la plataforma.», en lugar de pedir reintentar. El campo de evidencia de privacidad hace lo mismo con `PRIVACY_EVIDENCE_STORAGE_MUST_BE_PRIVATE`.
6. **Borrado genérico cerrado.** `DELETE /media/:id` (`MediaService.softDelete`) responde 404 para los usos privados, igual que la firma genérica. El retiro del soporte de estrato usa `softDeleteStratumEvidence`, que solo borra assets de ese uso y solo se invoca desde el flujo auditado del contrato.

A diferencia de la v1.0, `media/**` sí se modificó.

## Revisión de seguridad

`sec-eng` revisó el cambio el 2026-10-30: **GO con condiciones**, sin hallazgos P0 ni P1. Verificó que no hay otra ruta de lectura de evidencia en media, que la URL firmada se construye con el cliente S3 y no con la base pública, que las claves de objeto llevan el schema del tenant y que producción no define `S3_PUBLIC_BASE_URL`.

| Condición | Estado |
| --- | --- |
| P2-1: conservar el rechazo por base URL pública en producción | Aplicada, también en `staging` |
| P2-2: guarda única en `MediaService` para estrato y privacidad | Aplicada |
| P2-3: assets privados con `publicUrl` persistida | Sin filas: en dev no hay assets `stratum_evidence` ni `privacy_evidence`; los 36 `execution_evidence` tienen `public_url` nulo |
| P3-1: prueba positiva de la nueva regla | Aplicada, por `NODE_ENV` |
| P2-4: borrado genérico de evidencia | Aplicada (punto 6) |

## Rutas modificadas

- `apps/api/src/modules/media/media.service.ts` y `media.service.spec.ts`.
- `apps/api/src/modules/crm/contracts/contracts.service.ts` y `tests/contracts.service.spec.ts`.
- `apps/portal/src/components/crm/subscribers/stratum-evidence.ts` y `stratum-evidence.spec.ts`.
- `apps/portal/src/components/privacy/EvidenceUploadField.tsx` y `EvidenceUploadField.spec.tsx` (nuevo).

## Evidencia

| Comando | Resultado |
| --- | --- |
| `pnpm --filter @iwana/api exec jest src/modules/media src/modules/crm src/modules/privacy src/modules/platform-branding src/modules/tenant` | 129 suites y 1.468 tests pasaron; 1 suite y 7 tests omitidos (`tenant-migrations-second-schema.spec.ts`, condicionada a base de datos y ajena al cambio). |
| `IWANA_DB_INTEGRATION_AVAILABLE=true pnpm --filter @iwana/api exec jest --config jest.integration.config.js "contracts\|media\|privacy\|stratum"` | 7 de 8 suites y 52 de 53 tests pasaron contra PostgreSQL real (`dbiw`). |
| `pnpm --filter @iwana/portal exec jest src/components/privacy src/components/crm/subscribers` | 35 suites y 337 tests pasaron. |
| `tsc --noEmit` y `eslint` en API y portal | Sin errores. |
| Script contra el MinIO de dev con el adaptador real: sube un PDF bajo `…/stratum_evidence/`, lo lee y lo borra | URL firmada: 200. Ruta pública directa (`S3_PUBLIC_BASE_URL` + clave): 403. Objeto de prueba borrado. |

**Sin verificar en local:**
- `privacy-erasure-api.postgres.integration.spec.ts` exige `DB_NAME` `test` o `iwana_it_*`. Las bases `iwana_it_*` locales no están preparadas: una no tiene `btree_gist` y la otra no tiene migraciones. No toca el código cambiado; la cubre el CI de `main`, que crea la base `test` con roles, extensiones y migraciones.
- No hubo carga desde el navegador: no hay credenciales de usuario de tenant para pruebas en local.

## Deuda por severidad

- **P0 crítica:** 0.
- **P1 alta:** 0.
- **P2 media — bucket privado separado:** antes de habilitar cualquier CDN o proxy público para la marca, separar los usos privados en un bucket propio o en un prefijo excluido de la política anónima. Requiere ADR; no es una corrección de código.
- **P3 baja:** 0. El mensaje de privacidad y el borrado genérico quedaron resueltos en esta versión.

## Documentos afectados

- [Ensayo G7-M2 v1.2](INFORME-MOD05-G7-M2-ENSAYO-v1.2.md), hallazgo 4: el 503 en desarrollo ya no ocurre con `NODE_ENV=development`. El hallazgo queda superado por esta versión; en `staging` con base URL pública la guarda sigue respondiendo 503.
- [Runbook media MinIO](../runbooks/RUNBOOK-MEDIA-MINIO-v1.0.md): sección «Usos privados».
