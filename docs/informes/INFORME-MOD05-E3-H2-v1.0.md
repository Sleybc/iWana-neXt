# INFORME MOD05 E-3 H2 — visibilidad de reintento alineada al endpoint

**Fecha:** 2026-10-15  
**Agente:** `fe-platform`  
**Resultado:** **GO**

## Cambios

- La acción «Reintentar conversión» aparece solo con rol `ADMIN` o `SYSTEM_ADMIN`, permisos listos y `crm.subscribers.manage`.
- Los demás perfiles conservan el motivo del fallo y ven el texto exacto: «Pide a un administrador que reintente la conversión.»
- Durante un reintento, la acción queda deshabilitada; la página impide invocaciones simultáneas, actualiza el bootstrap y presenta mensajes fijos si falla el retry o la recarga.
- Se añadieron pruebas para ambos roles permitidos, SALES/SUPPORT/TECHNICIAN, permiso faltante, salida temprana, retry exitoso, fallos y prevención de solicitudes duplicadas.

## Evidencia

### Pruebas

Comando dirigido:

```powershell
pnpm --filter @iwana/portal exec jest --runInBand --runTestsByPath 'src/app/dashboard/crm/expedientes/[id]/page.spec.tsx' 'src/components/crm/expedientes/ExpedienteConversionBanner.spec.tsx'
```

Resultado: **2 suites aprobadas; 42 tests aprobados**.

Gate Portal sin caché:

```powershell
pnpm exec turbo run test --filter=@iwana/portal --force
```

Resultado: exit 0; **299 suites aprobadas**, **3.024 tests aprobados y 1 omitido**; 2 tareas Turbo completadas, **0 cache hit**.

Cobertura dirigida fresca de las dos suites, con umbrales globales en cero para medir únicamente el subconjunto, comparada con las líneas añadidas sobre `fb3d41ee` y el `statementMap` de Istanbul:

| Archivo                                                                     | Líneas ejecutables cambiadas cubiertas |
| --------------------------------------------------------------------------- | -------------------------------------: |
| `apps/portal/src/app/dashboard/crm/expedientes/[id]/page.tsx`               |                              **38/38** |
| `apps/portal/src/components/crm/expedientes/ExpedienteConversionBanner.tsx` |                              **12/12** |
| **Total**                                                                   |                              **50/50** |

La corrida incluye los caminos de la página que quedaron abiertos en G4: retorno temprano, rechazo del retry, bootstrap no actualizado y error de retry con bootstrap disponible. El comando de cobertura fue `pnpm --filter @iwana/portal exec jest --runInBand --coverage --runTestsByPath 'src/app/dashboard/crm/expedientes/[id]/page.spec.tsx' 'src/components/crm/expedientes/ExpedienteConversionBanner.spec.tsx' --coverageThreshold='{"global":{"statements":0,"branches":0,"functions":0,"lines":0}}' --coverageDirectory=<directorio temporal> --coverageReporters=text-summary --coverageReporters=json-summary --coverageReporters=json`; exit 0, 2 suites y 42 tests.

### Auditoría de UI

```powershell
node .agents/skills/iwana-identity-ui-review/scripts/audit-ui.mjs 'apps/portal/src/components/crm/expedientes/ExpedienteConversionBanner.tsx' 'apps/portal/src/app/dashboard/crm/expedientes/[id]/page.tsx' --json
```

Resultado: exit 0; **0 hallazgos P0, P1, P2 y P3**.

`pnpm exec prettier --write` se aplicó a los cuatro archivos del alcance. La ruta `docs/informes/INFORME-MOD05-E3-H2-v1.0.md` estaba libre antes de crear este informe. `git diff --check` se ejecutó al cierre: sin errores. No se hizo commit.
