# INFORME-MOD05-DEUDA-FIX-C-v1.0

**Fecha:** 2026-10-18 · **Gate:** G-1 · CD-04 en el portal · **Bloque:** `fe-platform` · **Base:** `e2348a42`, con los cambios A/B de la Ola 2 sin commit.

## Resultado

**GO para G-1.** Con `privacyRestricted = true` el detalle del suscriptor muestra la responsabilidad de IVA, las responsabilidades del RUT y el aviso de datos fiscales faltantes en solo lectura, sin acciones de edición y sin el botón de completar; el resto de los campos personales sigue en «Datos bloqueados». La corrida final de `@iwana/portal` pasó sin caché: **305 suites, 3073 tests aprobados, 1 omitido, 0 fallos**; el typecheck del paquete terminó con código 0.

## Cambio (solo `apps/portal`)

`SubscriberHeader.tsx`, tres hunks:

- `fiscalIncomplete` ya no exige `canEditSubscriber` y conserva el resto de la regla: `!subscriber.anonymizedAt && status !== CANCELLED && fiscalCompleteness?.complete === false` ([SubscriberHeader.tsx:49-54](../../apps/portal/src/components/crm/subscribers/SubscriberHeader.tsx)). Así el aviso de faltantes se muestra también en el detalle restringido.
- `VatTreatmentBanner` se renderiza sin la condición `!privacyRestricted` ([SubscriberHeader.tsx:110-113](../../apps/portal/src/components/crm/subscribers/SubscriberHeader.tsx)). La lista blanca de la API ya decide qué viaja en el detalle restringido: `vatResponsibility`, `rutResponsibilities` y `fiscalCompleteness` ([subscribers.controller.ts:782-807](../../apps/api/src/modules/crm/subscribers/subscribers.controller.ts)).
- El aviso recibe `onComplete={canEditSubscriber ? onCompleteFiscalData : undefined}` ([SubscriberHeader.tsx:118](../../apps/portal/src/components/crm/subscribers/SubscriberHeader.tsx)): en solo lectura no hay botón; cuando hay permiso de edición, el botón sigue funcionando.

No se tocó `SubscriberDetailClient.tsx` ni `SubscriberSections.tsx`; el resto de campos personales ya se bloqueaba por `canEditSubscriber`.

Nota de no regresión: la API calcula `privacyRestricted` exigiendo `anonymizedAt === null` ([subscribers.controller.ts:719-720](../../apps/api/src/modules/crm/subscribers/subscribers.controller.ts)), de modo que quitar la condición del banner no cambia el caso anonimizado (que ya lo veía).

## Pruebas

Los tests del encabezado de ([mod05-deuda-fiscal-ui.portal.spec.tsx:846](../../apps/portal/src/components/crm/subscribers/mod05-deuda-fiscal-ui.portal.spec.tsx)) cubren la presentación fiscal. Se añadió además una prueba de composición sobre `SubscriberDetailClient` en ([SubscriberDetailClient.mod05-deuda.portal.spec.tsx:96](../../apps/portal/src/components/crm/subscribers/SubscriberDetailClient.mod05-deuda.portal.spec.tsx)):

- **Restringido** ([SubscriberDetailClient.mod05-deuda.portal.spec.tsx:101](../../apps/portal/src/components/crm/subscribers/SubscriberDetailClient.mod05-deuda.portal.spec.tsx)): verifica IVA y RUT visibles, los faltantes legibles, ausencia de CTA y acciones de edición, y que valores personales sintéticos no aparezcan mientras se muestra «Datos bloqueados».
- **No restringido** ([SubscriberDetailClient.mod05-deuda.portal.spec.tsx:149](../../apps/portal/src/components/crm/subscribers/SubscriberDetailClient.mod05-deuda.portal.spec.tsx)): verifica el botón del aviso y que abre la pestaña Datos con controles fiscales editables.

Los dos tests previos del encabezado conservan la regresión restringida/no restringida en aislamiento.

Evidencia focal previa conservada del cambio del encabezado (no corresponde a la corrida final de abajo):

- **Rojo:** con el cambio revertido (archivo idéntico a `HEAD`, verificado con `git diff HEAD --stat` vacío), `jest mod05-deuda-fiscal-ui.portal.spec.tsx -t "CD-04"` → `1 failed, 24 skipped, 1 passed, 26 total`; falla exactamente «muestra IVA, RUT y el aviso de faltantes en solo lectura cuando el detalle está restringido». Log en `.cache/g1-cd04-red.log`.
- **Verde:** con el cambio restaurado, la spec completa → `26 passed, 26 total`. Log en `.cache/g1-focused-green.log`.

Evidencia final de esta verificación:

- **Suite completa de portal sin caché:** `pnpm --filter @iwana/portal exec jest --runInBand --no-cache` → **305/305 suites**, **3073 passed, 1 skipped, 3074 total**, 0 fallos; 361.715 s.
- **Typecheck:** `pnpm --filter @iwana/portal typecheck` → exit 0. Se repitió después del formato del test y volvió a terminar con exit 0.
- **Prueba focal después del formato:** `pnpm --filter @iwana/portal exec jest src/components/crm/subscribers/SubscriberDetailClient.mod05-deuda.portal.spec.tsx --runInBand --no-cache` → **1/1 suite, 2/2 tests aprobados**.
- **Formato:** `pnpm exec prettier --check apps/portal/src/components/crm/subscribers/SubscriberDetailClient.mod05-deuda.portal.spec.tsx` → sin diferencias.

La suite reportó warnings de React `act()` y navegación de jsdom en pruebas ajenas a CD-04; Jest finalizó con exit 0 y sin tests fallidos.

## Alcance y límites

- Solo `apps/portal`; sin cambios en `apps/api` ni en `packages`.
- Solo valores sintéticos en los tests; sin datos personales.
- Sin commit. La corrida V4″ puede volver a ejecutar los gates globales del delta v1.2.
