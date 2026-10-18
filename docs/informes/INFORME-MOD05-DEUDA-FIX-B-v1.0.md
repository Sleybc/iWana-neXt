# INFORME-MOD05-DEUDA-FIX-B-v1.0

**Fecha:** 2026-10-17  
**Bloque:** B — normalización fiscal de NIT-DV en el portal  
**Alcance:** `apps/portal` y este informe. No se modificaron fuentes de `apps/api` ni de `packages`.

## Cambios

- El portal importa `calculateNitVerificationDigit`, `parseExpedienteNit` y `NitFormatError` desde `@iwana/shared`. Se retiró el algoritmo duplicado de [subscriber-fiscal.ts](../../apps/portal/src/components/crm/subscribers/subscriber-fiscal.ts) y la copia local de 11 pesos de [SupplierFormDrawer.tsx](../../apps/portal/src/components/inventory/SupplierFormDrawer.tsx).
- El formulario de suscriptores separa un NIT-DV válido y conserva el NIT base y el DV en sus campos. Un DV incorrecto se señala y no se envía. El campo comunica el error con `aria-invalid`, `aria-describedby` y `role="alert"`.
- El formulario de proveedores normaliza NIT-DV con el parser compartido, calcula el DV con la utilidad compartida y bloquea la búsqueda o continuación si el NIT-DV es inválido.
- Se añadieron pruebas para alta de persona jurídica y creación de proveedor con NIT sintético de 15 dígitos, además de rechazo de DV incorrecto en ambos formularios.

## Evidencia

- **Suites dirigidas:** 2 suites, 29 tests, 0 fallos. Comando: `pnpm --config.use-node-version=24.18.0 --filter @iwana/portal exec jest --no-cache --runInBand --cacheDirectory C:\appiw\.cache\jest src/components/crm/subscribers/mod05-deuda-fiscal-ui.portal.spec.tsx src/components/inventory/SupplierFormDrawer.spec.tsx`.
- **Suite completa de portal sin caché:** 304 suites pasadas; 3069 tests pasados, 1 omitido, 0 fallos (3070 total). Comando: `pnpm --config.use-node-version=24.18.0 --filter @iwana/portal exec jest --no-cache --runInBand --cacheDirectory C:\appiw\.cache\jest`.
- **Typecheck de portal:** código 0 en la ejecución independiente antes y después del Turbo. Comando: `pnpm --config.use-node-version=24.18.0 --filter @iwana/portal typecheck`.
- **Lint de portal:** código 0; 0 errores y 45 advertencias del repositorio. No hubo advertencias en los archivos productivos modificados.
- **Auditoría mecánica de UI:** `audit-ui.mjs` ejecutado sobre los cuatro archivos productivos de portal modificados; código 0, sin hallazgos.
- **Turbo inicial:** `pnpm --config.use-node-version=24.18.0 exec turbo run build lint test typecheck --force --continue` terminó con 20 tareas exitosas de 30 y 10 tareas fallidas. En las salidas se observaron `EPERM`/`EACCES`, módulos no resueltos y error de escritura de Turbopack; el typecheck independiente volvió a pasar con código 0.
- **Re-verificación V4′:** una corrida posterior del mismo comando Turbo informó 30/30 tareas exitosas y 0 cacheadas, incluyendo build, lint, test y typecheck. La cobertura del paquete Portal midió 82,58% statements / 86,33% lines en `SubscriberForm.tsx` y 100%/100% en `JuridicaPersonFields.tsx`; la cobertura total del paquete no se usa como umbral de módulo core. Ver [informe V4′](INFORME-MOD05-DEUDA-V4-GATES-v1.1.md).

## Resultado

El cambio funcional y la suite completa de portal están verificados. La re-verificación posterior informó Turbo 30/30 tareas exitosas; V4′ conserva por separado los gates abiertos de cobertura del contrato compartido y de entorno de V1′. Los formularios usan únicamente valores sintéticos en las pruebas.
