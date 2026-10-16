# Informe — Privacidad fase 1B, B4 (v1.2)

**Fecha:** 2026-10-16  
**Estado:** Cambios implementados; pruebas focalizadas y suite completa de portal aprobadas. La corrida agregada de Turbo no quedó totalmente verde: falló la tarea de API.

## Alcance

- **C4:** se agregó a `ERASURE_BLOCKER_LABELS` el texto solicitado para `TOO_MANY_CANDIDATES`: «Hay demasiados expedientes para resolver desde la pantalla. Usa el procedimiento de emergencia del Oficial de protección de datos». La prueba de `PrivacyRequestDetail` confirma que se presenta el mensaje en español y no el código interno.
- **C7:** `ExpedienteSections` considera restringida la sección cuando `privacyRestricted !== false`, en concordancia con la guarda de `page.tsx`. La prueba cubre el caso en que el campo no está presente; el aviso de restricción se muestra y no se montan formularios ni acciones.

## Verificación

- Ruta de este informe libre antes de crearlo: sí.
- Prueba focalizada, sin caché: `pnpm --filter @iwana/portal exec jest src/components/privacy/PrivacyRequestDetail.spec.tsx src/components/crm/expedientes/sections/ExpedienteSections.spec.tsx --no-cache --runInBand` — **2 suites aprobadas, 10 tests aprobados, 0 fallidos**.
- `git diff --check` sobre los cuatro archivos de B4 — sin errores.
- La corrida focalizada mostró avisos no bloqueantes de `ts-jest` (`allowJs`) y deprecación de `punycode`.
- Suite completa del portal, sin caché: **303 suites, 3 043 tests aprobados, 1 omitido (3 044 total)**.
- `pnpm exec turbo run test --force --continue`: **9/10 tareas exitosas, 0 tareas servidas desde caché**; la tarea de API falló. Por ello el agregado de pruebas no está completamente verde.
- Typecheck: **8/8 tareas exitosas**. Lint: **8/8 tareas exitosas**. Build: **7/7 tareas exitosas reportadas**; la corrida fue interrumpida por raíz después de obtener el resumen.
- API: `GET /api/v1/health` respondió **HTTP 200**.
- Cobertura no medida en las pruebas focalizadas.

## Deuda nueva

| Severidad | Deuda introducida |
| --- | --- |
| P0 | Ninguna |
| P1 | Ninguna |
| P2 | Ninguna |
| P3 | Ninguna |

