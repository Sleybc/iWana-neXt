# INFORME-PRIVACY-FASE-1-Q6-v1.0

**Fecha:** 2026-10-14  
**Bloque:** Q6 — alertas de solicitudes de datos personales  
**Estado:** implementación Q6 entregada; gates finales de API y typecheck API/shared aprobados después del cierre de Q5.

## Entrega

- Se registra el repeatable global `privacy-due-alerts` a las 07:00 `America/Bogota`, con `jobId` fijo.
- El barrido consulta tenants `ACTIVE` no eliminados. Encola un hijo por tenant con `jobId` `privacy-due-alerts:<schema>:<yyyy-mm-dd>` y payload limitado a tenant, schema y fecha civil de Bogotá.
- El procesador reconstruye `TenantContext`, ejecuta R2 mediante `markDesisted` y obtiene `dueCounts` de Q3. BullMQ conserva el hijo completado para que un nuevo barrido de la misma fecha no vuelva a encolarlo.
- `IPermissionHoldersReadPort` y su adapter consultan usuarios activos con correo utilizable y permiso efectivo. La consulta contempla el permiso base de ADMIN y perfiles activos, vigentes, no eliminados y de alcance global.
- El correo contiene únicamente conteos y el enlace a la bandeja. Si no hay destinatarios se emite una señal de métrica y el job termina sin fallo.
- `PrivacyDueAlertsProcessor`, su cola y las métricas quedan registrados mediante una edición puntual de `privacy.module.ts`.

## Evidencia de verificación

| Verificación                                                            | Resultado real                                                                                                                                                                                                                                |
| ----------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Unitarias del procesador y del adapter de destinatarios                 | **2 suites, 8 tests aprobados**. Incluyen programación y zona horaria, fecha civil Bogotá, deduplicación de barridos, ventana que cruza Semana Santa, R2, correo sin PII y tenant sin destinatarios.                                          |
| Integración `privacy-due-alerts.processor.postgres.integration.spec.ts` | **1 suite, 1 test aprobado**, contra PostgreSQL real en `127.0.0.1:5433/dbiw`. Creó y eliminó un schema efímero; verificó R2, evento/auditoría y conteos de Q3 atravesando Semana Santa. El mensaje no expone identificadores de solicitudes. |
| ESLint focalizado en Q6, adapter de permisos y módulos registrados      | **Aprobado**, sin diagnósticos.                                                                                                                                                                                                               |
| `pnpm exec turbo run test --filter=@iwana/api --force`                  | **Aprobado:** 350 suites, 4.847 tests aprobados; 4 suites y 15 tests omitidos. Turbo ejecutó 4 tareas, con **0 cache hit**.                                                                                                                   |
| Typecheck API/shared                                                    | **Aprobado:** 4/4 tareas, con **0 cache hit** y sin errores. Los diagnósticos transitorios de CRM registrados antes del cierre de Q5 quedaron resueltos.                                                                                      |

## Deuda nueva por severidad

- **P2 — métrica sin backend de métricas:** el repositorio no expone un proveedor de métricas de aplicación. Q6 emite `privacy_due_alerts_no_recipients_total` como evento JSON en el logger de Nest, etiquetado con `schemaName`; queda observable en logs, pero no se agrega como contador consultable en un backend de métricas. La adopción de un sink requiere la decisión de plataforma correspondiente.

Los diagnósticos transitorios de typecheck de CRM se resolvieron antes de esta evidencia final; ambos gates quedaron aprobados después de integrar los cambios de Q5.
