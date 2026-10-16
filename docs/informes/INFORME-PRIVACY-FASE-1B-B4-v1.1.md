# Informe — Privacidad fase 1B, B4 (v1.1)

**Estado:** implementado y verificado en portal. No se modificaron paquetes compartidos ni API/backend.

## Alcance

La UI de suscriptores, oportunidades y contratos ahora distingue datos bloqueados de datos anonimizados. Las pantallas bloqueadas no montan controles de edición; los campos personales vacíos de registros anonimizados se presentan como «Anonimizado». La insignia «Titular anonimizado · {fecha}» aparece en las cabeceras de suscriptor y oportunidad y en `ContractCard` y `ContractDetailDrawer`. Solo enlaza con `privacy.read` y un identificador de solicitud disponible.

| Superficie                         | Comportamiento implementado                                                                                                                                                                                                                                                                                                                                                       |
| ---------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Listado y detalle de suscriptores  | Redacta nombre, contacto, documento y ubicación en estado bloqueado. El detalle bloqueado muestra solo cabecera y aviso; oculta pestañas y acciones. El estado anonimizado usa valores vacíos marcados.                                                                                                                                                                           |
| Listado y detalle de oportunidades | Redacta nombre y municipio; oculta metadatos libres y pestañas cuando el acceso está bloqueado. El detalle anonimizado presenta los campos personales en modo de solo lectura.                                                                                                                                                                                                    |
| Contratos                          | La tarjeta y el drawer muestran la marca y fecha. En bloqueo se ocultan datos personales y acciones de edición. En anonimización, alias, direcciones, notas y datos fiscales vacíos dicen «Anonimizado»; los campos personales del formulario quedan vacíos y de solo lectura. Medio de pago, ciclo de facturación, ciudad y otros datos comerciales conservados siguen visibles. |
| Presentación compartida local      | `privacyDisplayValue` evita renderizar los textos literales `null` y `undefined` y traduce el centinela `ANONIMIZADO`. El badge conserva su semántica de insignia y el enlace usa el foco interactivo del portal.                                                                                                                                                                 |

El route caller `apps/portal/src/app/dashboard/crm/expedientes/[id]/page.tsx` se editó de forma acotada para pasar al header los marcadores del bootstrap y `privacy.read`, y para no montar pestañas/acciones en el estado bloqueado. El contrato del bootstrap de B3 ya incluye estos marcadores en `expediente`; `ExpedienteDetailSummary` conserva ese tipo correcto.

Verifiqué la navegación existente: el portal implementa `/dashboard/privacy?requestId=...` y `PrivacyWorkspace` consume `requestId`. La ruta literal `/privacy/requests/{id}` del delta no está implementada; el badge usa la ruta funcional existente.

## Verificación

- Portal, sin caché: `pnpm --filter @iwana/portal exec jest --no-cache --runInBand` sobre 11 suites de privacidad y CRM: **11 suites aprobadas, 86 tests aprobados, 0 fallidos**. Incluye la regresión de `PrivacyRequestDetail` y pruebas de restricción, campos anonimizados, marca, enlace/permisos y datos comerciales conservados.
- Tipos: `pnpm --filter @iwana/portal typecheck` — aprobado.
- Formato: Prettier sobre los archivos portal modificados; `prettier --check` — aprobado.
- Diff: `git diff --check` en los archivos de B4 — sin errores.
- `audit-ui.mjs`: **P0: 0, P1: 0, P2: 0, P3: 2**. Los dos P3 heurísticos apuntan a spinners dentro de botones para acciones en curso del drawer, no a carga primaria de páginas o tablas; descartados tras inspección manual.
- WCAG: revisión manual de nombres accesibles y foco del enlace, insignia no interactiva cuando falta el permiso, avisos de bloqueo semánticos y ausencia de controles editables en superficies bloqueadas. No se añadieron tokens. Jest mostró advertencias no bloqueantes de `ts-jest` (`allowJs`) y React `act(...)` en la suite del listado.

## Deuda nueva

| Severidad | Deuda introducida |
| --------- | ----------------- |
| P0        | Ninguna           |
| P1        | Ninguna           |
| P2        | Ninguna           |
| P3        | Ninguna           |

La insignia usa la ruta funcional del portal indicada arriba; implementar el path literal del delta requeriría una definición de navegación independiente.
