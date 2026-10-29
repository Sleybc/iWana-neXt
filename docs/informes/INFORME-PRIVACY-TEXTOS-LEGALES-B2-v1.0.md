# Informe — Privacy, textos legales B2

**Versión:** 1.1  
**Estado:** Cerrado — CA-LT-13 en verde  
**Fecha:** 2026-10-29

## Alcance del cierre

Se continuó sobre el diff existente de portal. Se estabilizaron las dependencias de hooks, la rama `MARKDOWN` y las referencias legales con reintento. La sección «Finalidades» se solicita y se renderiza solo con `privacy.manage`; el backend rechaza el `PUT` sin ese permiso (evidencia HTTP en el informe B1). No se publicó contenido en el tenant de Iwana ni se modificaron archivos de MOD13.

La configuración Jest transforma las dependencias ESM aprobadas por E1. El setup de `jest-axe` ahora se carga solo cuando el entorno tiene `document`, de modo que los specs SSR mantienen entorno Node.

## Criterios del bloque

| Criterio | Resultado | Evidencia |
| --- | --- | --- |
| CA-LT-13 | Verde | `audit-ui.mjs` terminó sin hallazgos en las rutas modificadas por B2. |
| Manejo de 404 | Verde | Un 404 oculta una referencia sin publicar y no muestra error. |
| Otros errores y reintento | Verde | Errores distintos de 404 muestran reintento; la prueba vuelve a cargar y actualiza el estado. |
| Acceso a finalidades | Verde | `LegalTextsSurface` consulta y muestra finalidades solo cuando `canManage`; el PUT recibe 403 sin `privacy.manage` (prueba HTTP B1). |
| Dependencias de hooks | Verde | ESLint focalizado no emite advertencias ni errores. |
| Jest ESM y regresión portal | Verde | Suite completa ejecutada con la configuración final. |

## Evidencia sin caché de Turbo

Las pruebas se invocaron directamente con Jest, sin `turbo run` ni reproducción de resultados de Turbo.

| Comando | Resultado | Alcance |
| --- | --- | --- |
| `pnpm --filter @iwana/portal exec jest --runInBand --silent` | 330 suites aprobadas; 3326 pruebas aprobadas, 1 omitida (3327 total) | Suite completa del portal. La omitida preexistente es `InventoryClient.spec.tsx:2244`, test de solicitud de baja, ajeno a B2. |
| `pnpm --filter @iwana/portal typecheck` | Salida 0 | TypeScript del portal. |
| ESLint focalizado de los componentes y specs de B2 | Salida 0 | Sin errores ni advertencias de hooks. |
| `node .agents/skills/iwana-identity-ui-review/scripts/audit-ui.mjs` sobre las rutas modificadas de privacidad y captura | Sin hallazgos | CA-LT-13. |
| `LegalTextReferences.spec.tsx --runInBand --no-cache` | 1 suite, 2 pruebas aprobadas | 404 frente a otros errores y reintento; también está dentro de la suite completa. |
| `privacy-channel-capture.portal.spec.tsx --runInBand --no-cache` | 1 suite, 3 pruebas aprobadas | Captura de autorización, fixture de finalidades y formato. |

## Deuda nueva por severidad

| Severidad | Deuda nueva introducida por B2 |
| --- | --- |
| Alta | Ninguna. |
| Media | Ninguna. |
| Baja | Ninguna. |

## Pendientes preexistentes o fuera del bloque

- **Media, externa:** el typecheck global de API permanece bloqueado por el fixture WFM de MOD13 (`findRouterSummariesByIds`); no afecta al typecheck del portal y B2 no tocó ese fixture.
- **Baja, preexistente:** la suite integral conserva una prueba marcada `it.skip` en `InventoryClient.spec.tsx:2244`, fuera del alcance de privacidad.
- No se midió cobertura del portal en este cierre. No se hizo commit ni publicación en un tenant.