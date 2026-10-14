# Informe de entrega — MOD05 IVA por punto de servicio · T4 Catálogo

**Versión:** 1.0  
**Fecha:** 2026-10-12  
**Estado:** DONE  
**Agente:** AI-SR-FULL  
**Contrato:** C-API-3 v1.1, lado Commercial  
**Referencias:** [ADR-093](../adrs/ADR-093-Tratamiento-IVA-Internet-por-Punto-y-Linea-de-Servicio.md) · [Plan de orquestación](../plans/2026-10-12-mod05-iva-punto-servicio.md) · [Prompt de ejecución v1.1](../prompts/PROMPT-MOD05-IVA-PUNTO-SERVICIO-v1.1.md)

## Entrega

Se publicaron en `@iwana/shared` los esquemas y tipos de los campos fiscales del catálogo. El API exige `vatConcept` al crear un ítem y permite omitirlo al actualizar para conservar el dato existente. Los planes aceptan `networkType`, con `FIXED` como valor predeterminado. Las respuestas incluyen `vatConcept` y las de planes incluyen `networkType`; los ítems legados pueden conservar concepto `null`.

El listado admite `missingVatConcept=true` para localizar ítems legados sin clasificación fiscal. Se amplió de forma aditiva el puerto interno `CommercialCatalogReadPort`: sus consultas y snapshots leen el concepto y la red desde el catálogo del tenant en el servidor.

Rutas entregadas:

- `packages/shared/src/commercial/catalog-tax-contract.ts`, `catalog-tax-contract.spec.ts` e `index.ts`.
- DTOs, controlador, servicio y entidades de catálogo en `apps/api/src/modules/commercial/`.
- Puerto y adaptador `commercial-catalog-read` en `apps/api/src/modules/commercial/ports/`.
- Specs de controlador HTTP, servicio, adaptador del puerto y aislamiento de persistencia tenant en `apps/api/src/modules/commercial/`.

## Evidencia

Gate coordinado, ejecutado por el padre sin caché:

```text
pnpm exec turbo run test --filter=@iwana/api --force
Tasks: 4 successful, 4 total
Cached: 0 cached, 4 total
@iwana/api: 330 suites passed, 4 skipped
@iwana/api: 4,640 tests passed, 15 skipped
```

Specs focales de T4:

| Comando | Resultado |
| --- | --- |
| `pnpm --filter @iwana/shared exec jest --runInBand --runTestsByPath src/commercial/catalog-tax-contract.spec.ts` | 1 suite, 3 tests pasados. |
| `pnpm --filter @iwana/api exec jest --runInBand --runTestsByPath src/modules/commercial/catalog.controller.http.spec.ts src/modules/commercial/tests/catalog.service.spec.ts src/modules/commercial/tests/commercial-catalog-read.adapter.spec.ts` | 3 suites, 68 tests pasados. Incluye rechazo HTTP al crear sin concepto, default de red y filtro de legados. |
| `pnpm --filter @iwana/api exec jest --runInBand --runTestsByPath src/modules/commercial/catalog.persistence-tenant-isolation.spec.ts` | 1 suite, 1 test pasado. |

Durante la validación inicial se corrigieron aserciones/fixtures de tests que no reflejaban la firma de TypeORM ni el nuevo campo requerido. No quedó ningún fallo pendiente.

## Deuda nueva por severidad

- **P0:** ninguna.
- **P1:** ninguna.
- **P2:** ninguna.
- **P3:** ninguna.

No se hizo commit.
