# Informe de fase — MOD11 R1.5

**Versión:** 1.0  
**Fecha:** 2026-07-28  
**Owner:** AI-FE-PLATFORM  
**Commit:** `feat(operations): capture customer acceptance in execution workspace`

## Alcance

- El espacio de ejecución captura `customerAcceptance` con la forma contractual
  `{ artifactId, method }` al cerrar una orden.
- La captura vive únicamente en estado React efímero. No se añadió uso de
  `localStorage`, `sessionStorage` ni IndexedDB.
- El modo offline se alimenta de `navigator.onLine` y de los eventos `online`/
  `offline`; mantiene la consulta informativa y bloquea mutaciones.
- Se retiró el control de seguimiento porque el backend actual expone el endpoint,
  pero `createFollowUp` devuelve `503 FOLLOW_UP_BOUNDARY_UNAVAILABLE`. Queda para
  R2.2, sin control no-op en la interfaz.

## Evidencia

| Verificación | Resultado |
| --- | --- |
| `pnpm.cmd --filter @iwana/portal exec jest src/components/operations/ExecutionOrderDrawer.spec.tsx --runInBand` | 71 tests passed |
| `pnpm.cmd --filter @iwana/portal exec jest src/lib/api-client.spec.ts --runInBand` | 5 tests passed |
| `pnpm.cmd --filter @iwana/portal typecheck` | OK |
| `pnpm.cmd --filter @iwana/portal lint` | OK; 39 warnings preexistentes en portal, 0 errores |

## Cobertura de comportamiento y a11y

- Payload de cierre con `artifactId` y métodos visibles en español: firma,
  código de verificación y otra forma.
- Cierre bloqueado cuando la aceptación está incompleta.
- Cero escritura en Storage verificada por test.
- Estados loading, vacío, error, offline, readonly/terminal y forbidden cubiertos.
- Drawer, regiones, labels de campos y alertas comprobados con Testing Library.

## Límites y deuda

- No se cambió backend ni contrato.
- No hay cola ni persistencia offline; el modo offline es deliberadamente
  informativo/readonly hasta que exista un contrato de sincronización.
- La acción de seguimiento permanece publicada por el backend como pendiente de
  R2.2, pero no se ofrece como control en este componente.
