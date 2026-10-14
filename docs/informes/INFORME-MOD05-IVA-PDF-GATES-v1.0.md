# INFORME MOD05 — verificación consolidada de gates IVA y D-PDF

**Versión:** 1.0 · **Fecha:** 2026-10-13
**Rol:** AI-GATE-VERIFIER · verificación auxiliar
**Alcance:** cierre conjunto D-PDF P1–P3 e IVA T1–T12; código y base en modo de verificación.

## Veredicto

**NO-GO.** Typecheck, lint y la corrida Turbo conjunta están verdes y sin caché. La integración requerida contra `dbiw` no queda en verde: el spec de contratos ejecutó 19 casos y 7 fallaron porque el `CHECK` restaurado `chk_media_assets_usage` todavía rechaza `STRATUM_EVIDENCE`. La corrida amplia de integración reportó además suites omitidas. El contrato OpenAPI del endpoint de evidencia conserva una descripción de formatos que contradice el allowlist vigente.

No apliqué migraciones, no creé bases y no agregué la Adenda 2 al informe G6, porque el gate es NO-GO. El destino de este informe estaba libre inmediatamente antes de escribirlo.

## Tabla de gates

| Gate | Estado | Evidencia |
|---|---|---|
| Typecheck de API, portal, shared y db | **cumple** | `pnpm --filter @iwana/api typecheck`, `@iwana/portal typecheck`, `@iwana/shared typecheck`, `@iwana/db typecheck`: exit 0 en los cuatro paquetes (`tsc --noEmit`). |
| Lint de API, portal, shared y db | **cumple** | `pnpm --filter <paquete> lint`: exit 0 en los cuatro. Warnings: API 7, portal 45, shared 0, db 5; ningún error de lint. |
| Tests Turbo, cuatro paquetes | **cumple** | `pnpm exec turbo run test --filter=@iwana/api --filter=@iwana/portal --filter=@iwana/shared --filter=@iwana/db --force`: exit 0; 7/7 tareas, `Cached: 0 cached, 7 total`. |
| Conteo API | **cumple** | 339 suites aprobadas, 4 omitidas (343 total); 4.797 tests aprobados, 15 omitidos (4.812 total). Corrida API fresca posterior a los tests QA; Turbo 0 cached. |
| Conteo portal | **cumple** | 296 suites aprobadas; 2.990 tests aprobados y 1 omitido. Turbo forzado en la corrida conjunta. |
| Conteo shared | **cumple** | 14 suites y 148 tests aprobados. |
| Conteo db | **cumple** | 62 suites y 381 tests aprobados. |
| Integración de contratos y P2 en `dbiw` | **falla** | `DB_HOST=127.0.0.1 DB_PORT=5433 DB_NAME=dbiw E2E_TENANT_SLUG=iwana pnpm --filter @iwana/api test:integration`: exit 1; 1 suite fallida, 2 omitidas, 9 aprobadas (10/12); 7 tests fallidos, 14 omitidos, 41 aprobados (62 total). El spec PostgreSQL de Contracts/P2 sí se ejecutó: 19 casos, 12 aprobados, 7 fallidos, 0 omitidos. El rechazo ocurre al persistir fixtures de `STRATUM_EVIDENCE` por `chk_media_assets_usage`, restaurado tras el `down` temporal de 026. |
| Criterio de no omitir integraciones P2 | **falla parcial** | `apps/api/src/modules/crm/contracts/tests/contracts.service.postgres.integration.spec.ts`: la prueba dirigida se ejecutó con PostgreSQL disponible y 0 casos omitidos; fallaron 7 por el CHECK citado. La corrida amplia sí reportó 2 suites y 14 tests omitidos, sin que el resumen consolidado identifique sus nombres. |
| Cobertura de módulos core | **cumple** | Corrida QA sin integración: `media` 93,33 % statements / 80,00 % branches; `crm/contracts` 93,48 % / 94,17 %. En el `pnpm test:coverage` completo anterior a la spec extra de QA, `taxation` registró 95,45 % / 86,67 % y `commercial` 95,45 % / 80,13 %. No se usa la cifra vieja de media/contracts; QA midió de nuevo el denominador completo sin integración. |
| OpenAPI para endpoints nuevos | **falla** | `apps/api/src/modules/crm/contracts/contracts.controller.ts:241-242`: `ApiBody` aún describe PNG/WebP/JPEG/GIF/icono y dice que no admite PDF; el contrato real acepta PDF/JPEG/PNG/WEBP y rechaza GIF/iconos. Informe SEC, hallazgo P3. |
| Migraciones reversibles y registro | **cumple estáticamente** | Migraciones públicas 026 y tenant 144/145 incluyen `down()` y están registradas en sus runners. `pnpm --filter @iwana/db exec jest src/migrations/tenant/migration-order.spec.ts --runInBand`: 1 suite, 6 tests aprobados. |
| Integraciones 026 y 145 en CI (G6.5) | **sin evidencia de ejecución CI** | `.github/workflows/ci.yml:203-207,494` configura `DB_NAME=test` y ejecuta la suite de integración de `@iwana/db`; `packages/database/jest.integration.config.js:14` incluye specs `*.integration.spec.ts`, incluidos 026 y 145. Es verificación estática del cableado, no evidencia de una corrida CI verde para este SHA. |
| No PII en logs | **cumple en el diff revisado** | Búsqueda de `logger.*`/`console.*` en módulos tocados y revisión de las adiciones: eventos nuevos registran ids/uso/tenant, MIME/tamaño o mensajes genéricos; no se añaden documentos, nombres, correo, teléfono, URL firmadas ni payloads personales. No se encontraron nuevas llamadas `console.*` con PII. |
| Boundaries | **cumple en revisión acotada** | Inspección estática de ContractsModule y puertos exportados; `pnpm --filter @iwana/api exec jest src/modules/commercial/tests/tax-boundary.spec.ts --runInBand`: 1 suite, 3 tests aprobados. No se despachó un boundary-reviewer separado en esta verificación; no se presenta como una revisión integral independiente. |
| Vulnerabilidades críticas | **no aplica** | El diff no modifica manifests ni lockfile; no se ejecutó `pnpm audit --audit-level=critical`. |

## Integración: resultado y límite

La suite P2 y la integración de contratos no se omitieron. De los 19 casos dirigidos, 7 fallaron al preparar o persistir un asset dedicado porque `dbiw` mantiene el CHECK previo. La 026 se había aplicado temporalmente para una ejecución P2 previa que pasó 19/19 y luego se revirtió con autorización; este cierre no la reaplicó. Los casos que no necesitan persistir `STRATUM_EVIDENCE` sí avanzaron. La migración de esquema para esos casos queda para la integración CI aislada con `DB_NAME=test` de G6.5.

La integración amplia de API terminó con 2 suites omitidas y 14 tests omitidos. No se atribuye un motivo a esas omisiones porque el resumen capturado no identifica las suites. Por ello, el resultado global de integración no satisface el gate verde.

## Cobertura y seguridad

La corrida focalizada final de QA incluyó todos los archivos productivos de `apps/api/src/modules/media` y `apps/api/src/modules/crm/contracts` en el denominador, sin integración: `media` alcanzó 93,33 % statements y exactamente 80,00 % branches; `crm/contracts`, 93,48 % y 94,17 %. Resultado: 10 suites / 200 tests aprobados, 0 omitidos. Los resultados y matriz stop/go están en `INFORME-MOD05-IVA-PDF-QA-v1.0.md`.

La revisión SEC clasificó la falta de antivirus para PDF como deuda Media/P2 y no bloqueante por sí sola bajo almacenamiento privado y acceso firmado. Registró además la discrepancia OpenAPI Baja/P3 en `contracts.controller.ts:241`, que sí deja incompleto el gate documental OpenAPI. No se identificaron hallazgos críticos o altos en el alcance SEC.

## Rutas para dos commits

Las listas se generaron desde `git status --porcelain=v1 -uall` al preparar este informe. Commit 1 incluye cambios de código/producto, migraciones, contratos y el script SQL de solo lectura; commit 2 contiene documentación. `OTHER=0` fuera de `apps/**`, `packages/**`, el SQL indicado y `docs/**`.

**Commit 1 — código (116 rutas):**

```text
apps/api/src/modules/audit/audit-sanitize.policy.spec.ts
apps/api/src/modules/audit/audit-sanitize.policy.ts
apps/api/src/modules/commercial/catalog.controller.http.spec.ts
apps/api/src/modules/commercial/catalog.persistence-tenant-isolation.spec.ts
apps/api/src/modules/commercial/controllers/catalog.controller.ts
apps/api/src/modules/commercial/dto/catalog-query.dto.spec.ts
apps/api/src/modules/commercial/dto/catalog-query.dto.ts
apps/api/src/modules/commercial/dto/create-catalog-item.dto.ts
apps/api/src/modules/commercial/dto/update-catalog-item.dto.ts
apps/api/src/modules/commercial/entities/catalog-item.entity.ts
apps/api/src/modules/commercial/entities/plan-detail.entity.ts
apps/api/src/modules/commercial/ports/commercial-catalog-read.adapter.ts
apps/api/src/modules/commercial/ports/commercial-catalog-read.port.ts
apps/api/src/modules/commercial/services/catalog.service.ts
apps/api/src/modules/commercial/tests/bundle.service.spec.ts
apps/api/src/modules/commercial/tests/catalog.service.spec.ts
apps/api/src/modules/commercial/tests/commercial-catalog-read.adapter.spec.ts
apps/api/src/modules/crm/contracts/contracts.controller.ts
apps/api/src/modules/crm/contracts/contracts.module.ts
apps/api/src/modules/crm/contracts/contracts.service.ts
apps/api/src/modules/crm/contracts/dto/contract-response.dto.ts
apps/api/src/modules/crm/contracts/dto/create-contract-from-expediente.dto.ts
apps/api/src/modules/crm/contracts/dto/create-contract.dto.spec.ts
apps/api/src/modules/crm/contracts/dto/create-contract.dto.ts
apps/api/src/modules/crm/contracts/dto/update-contract.dto.ts
apps/api/src/modules/crm/contracts/dto/update-service-point.dto.ts
apps/api/src/modules/crm/contracts/entities/contract.entity.ts
apps/api/src/modules/crm/contracts/guards/reject-client-stratum-evidence.guard.spec.ts
apps/api/src/modules/crm/contracts/guards/reject-client-stratum-evidence.guard.ts
apps/api/src/modules/crm/contracts/tests/contracts.controller.spec.ts
apps/api/src/modules/crm/contracts/tests/contracts.service.postgres.integration.spec.ts
apps/api/src/modules/crm/contracts/tests/contracts.service.spec.ts
apps/api/src/modules/crm/contracts/utils/contract-plan-id.util.ts
apps/api/src/modules/crm/subscribers/dto/subscriber-tax-profile-snapshot.dto.ts
apps/api/src/modules/crm/subscribers/subscriber-tax-profile.service.ts
apps/api/src/modules/crm/subscribers/subscribers.controller.ts
apps/api/src/modules/crm/subscribers/tests/subscriber-tax-profile.service.spec.ts
apps/api/src/modules/crm/tests/adr065-ola7-sin-cota.spec.ts
apps/api/src/modules/media/evidence-asset.provider.spec.ts
apps/api/src/modules/media/media.controller.spec.ts
apps/api/src/modules/media/media.module.spec.ts
apps/api/src/modules/media/media.service.spec.ts
apps/api/src/modules/media/media.service.ts
apps/api/src/modules/taxation/commercial-tax-alias.controller.spec.ts
apps/api/src/modules/taxation/dto/list-tax-definition-query.dto.spec.ts
apps/api/src/modules/taxation/dto/tax-rule.dto.spec.ts
apps/api/src/modules/taxation/ports/internet-vat-resolver.adapter.ts
apps/api/src/modules/taxation/ports/internet-vat-resolver.port.ts
apps/api/src/modules/taxation/ports/tax-catalog-read.adapter.spec.ts
apps/api/src/modules/taxation/services/internet-vat-resolver.ts
apps/api/src/modules/taxation/services/tax-presets.seeder.spec.ts
apps/api/src/modules/taxation/tax-rules.controller.http.spec.ts
apps/api/src/modules/taxation/taxation.module.ts
apps/api/src/modules/taxation/tests/internet-vat-resolver.spec.ts
apps/api/src/modules/taxation/tests/tax-application.service.spec.ts
apps/api/src/modules/taxation/tests/tax-definition.service.spec.ts
apps/portal/src/components/commercial/catalog/AdditionalProductsPanel.tsx
apps/portal/src/components/commercial/catalog/AdditionalServicesPanel.tsx
apps/portal/src/components/commercial/catalog/PlanCatalogFormPeek.spec.tsx
apps/portal/src/components/commercial/catalog/PlanCatalogFormPeek.tsx
apps/portal/src/components/commercial/catalog/PlanCatalogPanel.spec.tsx
apps/portal/src/components/commercial/catalog/PlanCatalogPanel.tsx
apps/portal/src/components/commercial/catalog/PlanCatalogTable.spec.tsx
apps/portal/src/components/commercial/catalog/PlanCatalogTable.tsx
apps/portal/src/components/commercial/catalog/catalog-filter-params.spec.ts
apps/portal/src/components/commercial/catalog/catalog-filter-params.ts
apps/portal/src/components/commercial/catalog/catalog-tax-options.spec.ts
apps/portal/src/components/commercial/catalog/catalog-tax-options.ts
apps/portal/src/components/commercial/catalog/plan-catalog-columns.spec.ts
apps/portal/src/components/commercial/catalog/plan-catalog-helpers.ts
apps/portal/src/components/crm/expedientes/SeguimientoTab.spec.tsx
apps/portal/src/components/crm/subscribers/ContractCard.spec.tsx
apps/portal/src/components/crm/subscribers/ContractDetailDrawer.tsx
apps/portal/src/components/crm/subscribers/ConvertExpedienteToContractDialog.tsx
apps/portal/src/components/crm/subscribers/CreateContractDialog.tsx
apps/portal/src/components/crm/subscribers/ServiciosTab.tsx
apps/portal/src/components/crm/subscribers/SubscriberDetailClient.tsx
apps/portal/src/components/crm/subscribers/SubscriberTabsContainer.tsx
apps/portal/src/components/crm/subscribers/SubscribersListClient.spec.tsx
apps/portal/src/components/crm/subscribers/SubscribersListClient.tsx
apps/portal/src/components/crm/subscribers/TaxProfileBlock.tsx
apps/portal/src/components/crm/subscribers/VatTreatmentBanner.tsx
apps/portal/src/components/crm/subscribers/crm-contract-dialogs.portal.spec.tsx
apps/portal/src/components/crm/subscribers/mod05-iva-punto-servicio-ui.spec.tsx
apps/portal/src/components/crm/subscribers/stratum-evidence-api.portal.spec.ts
apps/portal/src/components/crm/subscribers/stratum-evidence-upload.portal.spec.tsx
apps/portal/src/components/crm/subscribers/stratum-evidence.spec.ts
apps/portal/src/components/crm/subscribers/stratum-evidence.ts
apps/portal/src/lib/api-client.ts
packages/database/src/entities/media-asset.entity.ts
packages/database/src/migrations/public/025_platform_users_password_reset_required.spec.ts
packages/database/src/migrations/public/026_media_usage_stratum_evidence.integration.spec.ts
packages/database/src/migrations/public/026_media_usage_stratum_evidence.spec.ts
packages/database/src/migrations/public/026_media_usage_stratum_evidence.ts
packages/database/src/migrations/public/index.ts
packages/database/src/migrations/tenant/144_vat_service_point.integration.spec.ts
packages/database/src/migrations/tenant/144_vat_service_point.ts
packages/database/src/migrations/tenant/145_contract_stratum_evidence_unique.integration.spec.ts
packages/database/src/migrations/tenant/145_contract_stratum_evidence_unique.spec.ts
packages/database/src/migrations/tenant/145_contract_stratum_evidence_unique.ts
packages/database/src/migrations/tenant/runner.ts
packages/shared/src/commercial/catalog-tax-contract.spec.ts
packages/shared/src/commercial/catalog-tax-contract.ts
packages/shared/src/commercial/index.ts
packages/shared/src/enums/taxation/index.ts
packages/shared/src/enums/taxation/internet-vat.contract.spec.ts
packages/shared/src/enums/taxation/internet-vat.types.ts
packages/shared/src/enums/taxation/network-type.enum.ts
packages/shared/src/enums/taxation/service-usage.enum.ts
packages/shared/src/enums/taxation/vat-concept.enum.ts
packages/shared/src/enums/taxation/vat-legal-basis.enum.ts
packages/shared/src/index.ts
packages/shared/src/schemas/contract.schema.spec.ts
packages/shared/src/schemas/contract.schema.ts
packages/shared/src/schemas/tax-profile-snapshot.ts
scripts/audit-contract-fiscal-pii-readonly.sql
```

**Commit 2 — documentación (41 rutas, incluido este informe):**

```text
docs/adrs/ADR-025-Subscriber-Modelo-Dos-Dimensiones.md
docs/adrs/ADR-093-Tratamiento-IVA-Internet-por-Punto-y-Linea-de-Servicio.md
docs/informes/INFORME-MOD05-IVA-PDF-GATES-v1.0.md
docs/informes/INFORME-MOD05-IVA-PDF-P1-v1.0.md
docs/informes/INFORME-MOD05-IVA-PDF-P2-v1.0.md
docs/informes/INFORME-MOD05-IVA-PDF-P3-v1.0.md
docs/informes/INFORME-MOD05-IVA-PDF-QA-v1.0.md
docs/informes/INFORME-MOD05-IVA-PDF-SEC-v1.0.md
docs/informes/INFORME-MOD05-IVA-PUNTO-SERVICIO-G6-v1.0.md
docs/informes/INFORME-MOD05-IVA-PUNTO-SERVICIO-T1-v1.0.md
docs/informes/INFORME-MOD05-IVA-PUNTO-SERVICIO-T10-v1.0.md
docs/informes/INFORME-MOD05-IVA-PUNTO-SERVICIO-T11-v1.0.md
docs/informes/INFORME-MOD05-IVA-PUNTO-SERVICIO-T11-v1.1.md
docs/informes/INFORME-MOD05-IVA-PUNTO-SERVICIO-T11-v1.2.md
docs/informes/INFORME-MOD05-IVA-PUNTO-SERVICIO-T12-v1.0.md
docs/informes/INFORME-MOD05-IVA-PUNTO-SERVICIO-T2-v1.0.md
docs/informes/INFORME-MOD05-IVA-PUNTO-SERVICIO-T3-v1.0.md
docs/informes/INFORME-MOD05-IVA-PUNTO-SERVICIO-T4-v1.0.md
docs/informes/INFORME-MOD05-IVA-PUNTO-SERVICIO-T5-v1.0.md
docs/informes/INFORME-MOD05-IVA-PUNTO-SERVICIO-T6-v1.0.md
docs/informes/INFORME-MOD05-IVA-PUNTO-SERVICIO-T7-v1.0.md
docs/informes/INFORME-MOD05-IVA-PUNTO-SERVICIO-T8-v1.0.md
docs/informes/INFORME-MOD05-IVA-PUNTO-SERVICIO-T9-v1.0.md
docs/plans/2026-10-12-mod05-iva-punto-servicio.md
docs/plans/2026-10-12-mod05-iva-soporte-pdf.md
docs/prompts/PROMPT-MOD05-IVA-PDF-LAUNCH-v1.0.md
docs/prompts/PROMPT-MOD05-IVA-PDF-LAUNCH-v1.1.md
docs/prompts/PROMPT-MOD05-IVA-PDF-LAUNCH-v1.2.md
docs/prompts/PROMPT-MOD05-IVA-PDF-v1.0.md
docs/prompts/PROMPT-MOD05-IVA-PUNTO-SERVICIO-LAUNCH-v1.0.md
docs/prompts/PROMPT-MOD05-IVA-PUNTO-SERVICIO-LAUNCH-v1.1.md
docs/prompts/PROMPT-MOD05-IVA-PUNTO-SERVICIO-LAUNCH-v1.2.md
docs/prompts/PROMPT-MOD05-IVA-PUNTO-SERVICIO-LAUNCH-v1.3.md
docs/prompts/PROMPT-MOD05-IVA-PUNTO-SERVICIO-LAUNCH-v1.4.md
docs/prompts/PROMPT-MOD05-IVA-PUNTO-SERVICIO-LAUNCH-v1.5.md
docs/prompts/PROMPT-MOD05-IVA-PUNTO-SERVICIO-v1.0.md
docs/prompts/PROMPT-MOD05-IVA-PUNTO-SERVICIO-v1.1.md
docs/prompts/PROMPT-MOD05-IVA-PUNTO-SERVICIO-v1.2.md
docs/prompts/PROMPT-MOD05-IVA-PUNTO-SERVICIO-v1.3.md
docs/prompts/PROMPT-MOD05-IVA-PUNTO-SERVICIO-v1.4.md
docs/specs/2026-10-12-mod05-iva-punto-servicio-ux-spec.md
```

**Rutas ajenas:** no se encontró ninguna ruta sin relación con IVA/D-PDF. La ruta más adyacente por su nombre es `apps/api/src/modules/crm/tests/adr065-ola7-sin-cota.spec.ts`, un test histórico de ADR-065 cuyo cambio solo agrega mocks para las nuevas dependencias de `ContractsService`, necesarios para que el test siga componiendo tras IVA/D-PDF. `ADR-025` y la spec de `SeguimientoTab` cambiaron por la actualización del contrato IVA.

## Gates abiertos

- Corregir y verificar la descripción OpenAPI de la carga de evidencia contractual.
- Ejecutar las integraciones de contratos/P2 en un entorno permitido con la 026 aplicada y la 145 disponible, sin migrar `dbiw`; adjuntar conteo completo y sin skips relevantes.
- Adjuntar la corrida CI con `DB_NAME=test` para G6.5 (integraciones de 026 y 145).

**Cierre:** veredicto final **NO-GO**. No se agregó «Adenda 2» al informe G6.
