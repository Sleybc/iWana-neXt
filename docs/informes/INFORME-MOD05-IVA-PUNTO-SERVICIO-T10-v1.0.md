# INFORME-MOD05-IVA-PUNTO-SERVICIO-T10-v1.0

**Fecha:** 2026-10-12  
**Bloque:** T10 — Portal / carga del soporte de estrato  
**Estado:** Implementado; tests focales y gate completo de Portal aprobados.

## Cambios entregados

- Los diálogos de creación y conversión guardan primero el borrador y cargan el soporte con `POST /crm/contracts/:id/stratum-evidence`. Si falla la carga, conservan el borrador y el archivo seleccionado; el botón existente vuelve a intentar la carga sin crear otro contrato.
- La edición de borrador y la edición dedicada del punto de servicio reemplazan el soporte con el mismo `POST` y lo quitan con `DELETE /crm/contracts/:id/stratum-evidence`.
- `contractsApi` encapsula ambos endpoints. El POST envía solo multipart `file`; ninguno de los cuerpos de creación o actualización incluye `stratumEvidenceMediaId`. La selección acepta los MIME acordados y valida el límite de 10 MiB.
- Se mantuvieron los textos y estilos de acción existentes.

## Evidencia de CA-UX-IVA-08

`apps/portal/src/components/crm/subscribers/mod05-iva-punto-servicio-ui.spec.tsx` cubre por separado:

1. Crear borrador y cargar el soporte al contrato creado, verificando que el cuerpo no lleva `stratumEvidenceMediaId`.
2. Reemplazar el soporte mediante el POST del contrato.
3. Quitar el soporte mediante DELETE.
4. Fallar la carga, conservar el borrador y reintentar sin duplicarlo.

`apps/portal/src/components/crm/subscribers/stratum-evidence-api.portal.spec.ts` verifica las rutas anidadas, el multipart con solo `file` y DELETE. La corrida focal, posterior al último ajuste, terminó con **3 suites y 39 tests aprobados**:

```text
pnpm --filter @iwana/portal exec jest --runInBand --runTestsByPath \
  src/components/crm/subscribers/mod05-iva-punto-servicio-ui.spec.tsx \
  src/components/crm/subscribers/crm-contract-dialogs.portal.spec.tsx \
  src/components/crm/subscribers/stratum-evidence-api.portal.spec.ts

Test Suites: 3 passed, 3 total
Tests:       39 passed, 39 total
Snapshots:   0 total
```

## Gate Portal

Corrida completa sin caché de Turbo:

```text
pnpm exec turbo run test --filter=@iwana/portal --force

Test Suites: 294 passed, 294 total
Tests:       1 skipped, 2961 passed, 2962 total
Snapshots:   0 total
Turbo:       Tasks 2/2 successful · Cached 0/2 · cache bypass en shared y portal
```

## Auditoría UI

Se ejecutó `node .agents/skills/iwana-identity-ui-review/scripts/audit-ui.mjs` globalmente (rutas predeterminadas `apps/portal/src`, `apps/web/src`, `packages/ui/src`) y, por separado, sobre estos cuatro archivos propios de T10:

- `apps/portal/src/components/crm/subscribers/CreateContractDialog.tsx`
- `apps/portal/src/components/crm/subscribers/ConvertExpedienteToContractDialog.tsx`
- `apps/portal/src/components/crm/subscribers/ContractDetailDrawer.tsx`
- `apps/portal/src/lib/api-client.ts`

En los archivos T10, el resultado fue **P0: 0, P1: 0, P2: 0, P3: 5**. Los cinco P3 son heurísticas de spinner en acciones en curso; no son indicadores de carga primaria de página o tabla. No hubo reglas duras deterministas. El resultado global fue **P0: 0, P1: 4, P2: 52, P3: 28**, con **0** reglas deterministas bloqueantes; los P1 globales son heurísticas marcadas para revisión por la herramienta.

## Rutas entregadas

- `apps/portal/src/components/crm/subscribers/CreateContractDialog.tsx`
- `apps/portal/src/components/crm/subscribers/ConvertExpedienteToContractDialog.tsx`
- `apps/portal/src/components/crm/subscribers/ContractDetailDrawer.tsx`
- `apps/portal/src/lib/api-client.ts` (sección `contractsApi`)
- `apps/portal/src/components/crm/subscribers/mod05-iva-punto-servicio-ui.spec.tsx`
- `apps/portal/src/components/crm/subscribers/crm-contract-dialogs.portal.spec.tsx`
- `apps/portal/src/components/crm/subscribers/stratum-evidence-api.portal.spec.ts`

## Deuda nueva por severidad

| Severidad | Nueva | Detalle |
| --- | ---: | --- |
| P0 | 0 | — |
| P1 | 0 | — |
| P2 | 0 | — |
| P3 | 0 | Los cinco avisos P3 del alcance son heurísticas para spinners de acciones; revisadas y no aplicables a cargas primarias. |
