# INFORME MOD05 — IVA por punto de servicio · T9

**Versión:** 1.0 · **Fecha:** 2026-10-12 · **Bloque:** T9 — soporte privado de estrato C-API-3 v1.2  
**Estado:** Completado  
**Referencias:** [ADR-093](../adrs/ADR-093-Tratamiento-IVA-Internet-por-Punto-y-Linea-de-Servicio.md) · [Plan v1.2](../plans/2026-10-12-mod05-iva-punto-servicio.md) · [Prompt v1.2](../prompts/PROMPT-MOD05-IVA-PUNTO-SERVICIO-v1.2.md) · [Spec UX](../specs/2026-10-12-mod05-iva-punto-servicio-ux-spec.md)

## Entrega

Se publicó en `@iwana/shared` C-API-3 v1.2 para contratos: los esquemas de creación, actualización y punto de servicio no aceptan `stratumEvidenceMediaId`; el campo se conserva en la respuesta. Un guard dedicado devuelve 400 cuando el cliente incluye ese campo, aunque el pipe global pudiera retirarlo antes de validar el DTO.

`ContractsModule` importa `MediaModule` y expone carga, retiro y acceso firmado de soporte por contrato. Solo ADMIN, SALES, SUPPORT y SYSTEM_ADMIN con permiso de gestión pueden modificar el soporte; los roles con permiso de lectura pueden solicitar acceso firmado. La carga aplica `MediaUsage.GENERAL` — 10 MiB y los MIME PNG, WebP, JPEG, GIF e icono; PDF no permitido — y verifica que el punto sea residencial, de estrato 1–3 y de suscriptor natural. El asset se asocia desde el servidor; al reemplazarlo o retirarlo se elimina lógicamente el anterior. En contratos activos, el cambio recalcula el snapshot y registra auditoría.

La URL firmada dura como máximo 300 segundos. La auditoría `STRATUM_EVIDENCE_ACCESS` incluye actor y contrato sin guardar la URL. La disponibilidad de evidencia para el cálculo fiscal requiere un asset `GENERAL` que `MediaService` encuentre en el tenant y que no esté eliminado. Un id heredado inexistente o no verificable produce tratamiento `STANDARD` y un aviso sin PII.

La carga y el acceso firmado fallan cerrados con 503 si el almacenamiento no cumple la configuración privada: `STORAGE_DRIVER=minio`, bucket no público y `S3_PUBLIC_BASE_URL` ausente o vacía. `MediaService.upload` asigna `publicUrl` cuando se usa el driver local, se declara un bucket público o se configura una URL pública; por ello T9 no expone esa respuesta ni registra su URL y no intenta firmar en esas configuraciones. `media/**` no fue modificado.

La documentación OpenAPI declara límites de carga, MIME admitidos y la forma `{ data: { signedUrl, expiresAt } }` del acceso firmado.

## Rutas entregadas

- Shared: `packages/shared/src/schemas/contract.schema.ts` y `contract.schema.spec.ts`.
- Contratos API: `apps/api/src/modules/crm/contracts/contracts.controller.ts`, `contracts.module.ts`, `contracts.service.ts`, `dto/`, `entities/contract.entity.ts` y `guards/reject-client-stratum-evidence.guard.ts`.
- Pruebas: `apps/api/src/modules/crm/contracts/tests/contracts.controller.spec.ts`, `contracts.service.spec.ts` y `contracts.service.postgres.integration.spec.ts`.

## Evidencia

| Comando | Resultado |
| --- | --- |
| `pnpm exec turbo run test --filter=@iwana/api --force` | 330 suites pasaron, 4 omitidas; 4.646 tests pasaron, 15 omitidos; cero fallos. Turbo: 4/4 tareas exitosas, 0/4 en caché. |
| `E2E_TENANT_SLUG=iwana pnpm --filter @iwana/api exec jest --config jest.integration.config.js --runTestsByPath src/modules/crm/contracts/tests/contracts.service.postgres.integration.spec.ts --runInBand` | 1 suite y 13 tests pasaron contra PostgreSQL real (`127.0.0.1:5433/dbiw`); sin suites omitidas. |
| `pnpm --filter @iwana/shared exec jest src/schemas/contract.schema.spec.ts --runInBand` | 1 suite y 6 tests pasaron. |
| `pnpm --filter @iwana/api exec jest --runInBand src/modules/crm/contracts/tests/contracts.service.spec.ts src/modules/crm/contracts/tests/contracts.controller.spec.ts` | 2 suites y 42 tests pasaron, incluidos los tres casos de almacenamiento público/local y los tres casos equivalentes de acceso firmado. |
| Prettier y `git diff --check` para las rutas de T9 | Pasaron. |

La integración PostgreSQL cubre: SALES carga soporte residencial de estrato 2 y activa como `EXEMPT`; cuerpo cliente con `stratumEvidenceMediaId` responde 400 en los cinco endpoints de entrada; soporte no residencial responde 422; un asset asociado a otro contrato no da acceso desde este contrato; signed-url expira en ≤300 s y su auditoría no contiene URL; DELETE en contrato activo deja el tratamiento en `STANDARD`, retira el asset y audita; un contrato heredado con id inexistente resuelve `STANDARD`. También conserva los casos T3: estrato 3 con soporte → `EXCLUDED`, sin soporte → `STANDARD`, concepto/uso faltante y persona jurídica residencial → 422, y recálculo auditado de `/service-point`.

## Deuda nueva por severidad

- **P0 crítica:** 0.
- **P1 alta:** 0.
- **P2 media — condición operativa:** la carga y el acceso al soporte no están disponibles con almacenamiento local, bucket público o `S3_PUBLIC_BASE_URL` configurada; en esos casos se responde 503 para evitar URL permanente. El despliegue que necesite esta función debe usar MinIO con bucket privado y sin base URL pública.
- **P3 baja:** 0.

No se hizo commit.
