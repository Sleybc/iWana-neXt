# Informe — Privacy · Textos legales · B8

**Versión:** 1.0  
**Fecha:** 2026-10-30  
**Agente:** `fe-platform`  
**Estado:** GO

## Archivos del bloque

- `apps/portal/src/components/privacy/PrivacyWorkspace.tsx`
- `apps/portal/src/components/privacy/PrivacyWorkspace.spec.tsx`
- `docs/informes/INFORME-PRIVACY-TEXTOS-LEGALES-B8-v1.0.md`

La implementación reutiliza `SectionAccordion` de `@iwana/ui`; no requiere cambios de API, contratos, consumidores, finalidades ni componentes compartidos.

## Trazabilidad de aceptación

| Criterio                     | Evidencia                                                                                                                                                                                               |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| CA-LT-14                     | `PrivacyWorkspace.spec.tsx`: comprueba que la lista principal contiene la versión vigente, excluye la reemplazada y muestra «Historial de versiones (1)» con `aria-expanded="false"`.                   |
| CA-LT-15                     | `PrivacyWorkspace.spec.tsx`: abre el historial, verifica «Publicada el» y la fecha de reemplazo de la siguiente versión; abre el peek y verifica el aviso exacto, la huella completa y «Copiar huella». |
| CA-LT-16                     | `PrivacyWorkspace.spec.tsx`: comprueba que no hay acordeón sin versiones reemplazadas y que una cuenta con solo `privacy.read` ve las secciones vigentes e historial sin «Crear nueva versión».         |
| CA-LT-17                     | `node .agents/skills/iwana-identity-ui-review/scripts/audit-ui.mjs apps/portal/src/components/privacy/PrivacyWorkspace.tsx`: código 0, sin hallazgos.                                                   |
| Cálculo de orden e historial | Prueba unitaria independiente `buildLegalTextVersionSections`: tipos Política → Aviso → Autorización, versiones históricas recientes primero y fecha inmediata de reemplazo por tipo.                   |

## Verificación

| Paquete           | Comando                                                                                                                     | Resultado                                                                                                             |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `@iwana/portal`   | `pnpm --filter @iwana/portal exec jest --runInBand --silent --no-cache`                                                     | Código 0; 331 suites pasaron, 0 fallidas; 3.355 pruebas pasaron y 1 quedó omitida (3.356 total). Duración: 437,752 s. |
| `@iwana/portal`   | `pnpm --filter @iwana/portal typecheck`                                                                                     | Código 0.                                                                                                             |
| `@iwana/portal`   | `pnpm --filter @iwana/portal lint`                                                                                          | Código 0; 42 warnings en archivos ajenos al diff, 0 errores.                                                          |
| Auditoría visual  | `node .agents/skills/iwana-identity-ui-review/scripts/audit-ui.mjs apps/portal/src/components/privacy/PrivacyWorkspace.tsx` | Código 0; sin hallazgos.                                                                                              |
| Prueba focalizada | `pnpm --filter @iwana/portal exec jest --runInBand --silent --no-cache src/components/privacy/PrivacyWorkspace.spec.tsx`    | Código 0; 1 suite, 14 pruebas pasaron.                                                                                |

La lista completa detectó 331 archivos de prueba antes de ejecutar Jest. La corrida completa desactivó la caché de Jest (`--no-cache`) y se ejecutó directamente, sin caché de Turbo.
La única prueba omitida es `InventoryClient.spec.tsx` («registra una solicitud de baja sin aplicar movimiento inmediato»), marcada explícitamente `it.skip` por una limitación de eventos sintéticos con React 19 + jsdom; el comentario del test indica que el flujo está verificado con Playwright.

## Deuda nueva por severidad

| Severidad | Deuda nueva |
| --------- | ----------: |
| P0        |           0 |
| P1        |           0 |
| P2        |           0 |
| P3        |           0 |

Los 42 warnings de lint corresponden a archivos fuera del alcance y no son deuda introducida por B8.

## Ajuste visual posterior — 2026-10-30

Se corrigieron dos detalles P3 preexistentes por indicación del usuario:

- La casilla nativa deshabilitada atenuaba la marca en oscuro. Ahora conserva el input real, marcado y deshabilitado, con apariencia explícita y una marca de verificación blanca sobre azul en claro y azul sobre lima en oscuro. Usa tokens existentes, foco compartido y apariencia nativa en colores forzados. La finalidad contractual permanece bloqueada.
- Las filas usaban `flex-wrap`, por lo que los títulos largos desplazaban la insignia y la huella. Ahora usan una cuadrícula con una columna flexible para el texto y otra reservada para los metadatos; en móvil todas las filas sitúan los metadatos debajo y alineados a la derecha. La fecha se presenta en una línea propia y el título puede ajustarse sin desplazar la columna de metadatos. Se aplica también a las filas históricas.

Verificación posterior al ajuste (sin nueva corrida global, por tratarse de cambios locales de presentación):

| Comando                                                                                                                                | Código | Resultado                                                                                                    |
| -------------------------------------------------------------------------------------------------------------------------------------- | -----: | ------------------------------------------------------------------------------------------------------------ |
| `pnpm --filter @iwana/portal exec jest --runInBand --silent --no-cache src/components/privacy/PrivacyWorkspace.spec.tsx`               |      0 | 1 suite y 14 pruebas pasaron, 0 omitidas; incluye aserciones de casilla obligatoria marcada y deshabilitada. |
| `pnpm --filter @iwana/portal typecheck`                                                                                                |      0 | Sin errores.                                                                                                 |
| `pnpm --filter @iwana/portal exec eslint src/components/privacy/PrivacyWorkspace.tsx src/components/privacy/PrivacyWorkspace.spec.tsx` |      0 | Sin warnings ni errores.                                                                                     |
| `node .agents/skills/iwana-identity-ui-review/scripts/audit-ui.mjs apps/portal/src/components/privacy/PrivacyWorkspace.tsx`            |      0 | Sin hallazgos.                                                                                               |

La verificación realizada cubre código, semántica e interacciones; no incluye una inspección visual en navegador. Deuda nueva P0: 0, P1: 0, P2: 0, P3: 0.
