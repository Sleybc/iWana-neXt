# Informe — Privacy, textos legales B3 QA

**Versión:** 1.0  
**Estado:** Cerrado — CA-LT-07 a CA-LT-12 en verde  
**Fecha:** 2026-10-29

## Alcance

Se validó el diff existente contra la spec congelada v1.1. Solo se añadieron o ajustaron pruebas unitarias y E2E; no se modificó código productivo, el contrato, ni archivos de MOD13. Los datos de prueba son sintéticos o reproducen la tabla del anexo.

## Archivos de prueba tocados

- `apps/portal/src/components/privacy/LegalTextContent.spec.tsx`
- `apps/portal/src/components/privacy/LegalTextReferences.spec.tsx`
- `apps/portal/src/components/privacy/PrivacyWorkspace.spec.tsx`
- `apps/portal/src/components/privacy/privacy-channel-capture.portal.spec.tsx`
- `e2e/tests/portal-privacy.spec.ts`
- `e2e/tests/portal-crm-expedientes.spec.ts`

## Trazabilidad CA → test

| CA | Resultado | Evidencia |
| --- | --- | --- |
| CA-LT-07 | Verde | `LegalTextContent.spec.tsx`, prueba «CA-LT-07»: `<script>`, `<img onerror>` y `javascript:` no se convierten en nodos ejecutables ni disparan alertas. |
| CA-LT-08 | Verde | `LegalTextContent.spec.tsx`, prueba «CA-LT-08»: la tabla de la §10 del anexo se representa como `<table>` con encabezados semánticos. `LegalTextReferences.spec.tsx` comprueba el peek de solo lectura; CA-LT-11 también verifica la tabla en navegador. |
| CA-LT-09 | Verde | `e2e/tests/portal-crm-expedientes.spec.ts`, «CA-LT-09»: rol `COMMERCIAL`, captura en expediente y texto Markdown vigente sintético. |
| CA-LT-10 | Verde | `privacy-channel-capture.portal.spec.tsx`, «CA-LT-10»: `CONTACTO_COMERCIAL` deshabilitada no aparece en `SubscriberForm`, `CompliancePanel` ni `ConsentsPanel`. La API rechaza una concesión deshabilitada con 422 `PRIVACY_PURPOSE_DISABLED`: `privacy-authorization.adapter.spec.ts` pasó en el suite API de esta corrida y `privacy-purposes.postgres.integration.spec.ts` aporta la evidencia PostgreSQL B1 (1 suite, 1 prueba). |
| CA-LT-11 | Verde | `e2e/tests/portal-privacy.spec.ts`, «CA-LT-11»: verifica el texto del diálogo antes de aceptar, publicación Markdown, peek, tabla, copia de los 64 caracteres de huella, cierre con Escape y restauración de foco. |
| CA-LT-12 | Verde | `PrivacyWorkspace.spec.tsx`, «CA-LT-12»: `privacy.read` permite listar textos legales sin acciones de gestión. `portal-privacy.spec.ts` valida además la vista en navegador. |

## Evidencia de pruebas y cobertura sin caché

Las corridas Jest fueron directas, con `--no-cache` (`Cached: 0`); no se usó Turbo. Las salidas literales fueron:

| Paquete y comando | Resultado |
| --- | --- |
| `pnpm --filter @iwana/api exec jest modules/privacy --runInBand --silent --no-cache --coverage --coverageDirectory=coverage/privacy-b3-final-verified --coverageThreshold='{"global":{"statements":0,"branches":0,"functions":0,"lines":0}}' --coverageReporters=json-summary --collectCoverageFrom='modules/privacy/**/*.ts' --collectCoverageFrom='!modules/privacy/**/*.spec.ts'` | 34 suites, 157 pruebas aprobadas, 0 omitidas. Cobertura del módulo: líneas 96.26 %, sentencias 95.68 %, ramas 85.14 %, funciones 91.78 % (50 archivos fuente). |
| `pnpm --filter @iwana/shared exec jest schemas/privacy --runInBand --silent --no-cache --coverage --coverageDirectory=coverage/privacy-b3-final-verified --coverageThreshold='{"global":{"statements":0,"branches":0,"functions":0,"lines":0}}' --coverageReporters=json-summary --collectCoverageFrom='schemas/privacy/legal-texts.ts' --collectCoverageFrom='schemas/privacy/purposes.ts' --collectCoverageFrom='schemas/privacy/index.ts'` | 4 suites, 22 pruebas aprobadas, 0 omitidas. Líneas, sentencias, funciones y ramas: 100 % (3 archivos fuente). |
| `pnpm --filter @iwana/portal exec jest components/privacy/LegalTextContent.spec.tsx components/privacy/LegalTextReferences.spec.tsx components/privacy/PrivacyWorkspace.spec.tsx components/privacy/privacy-labels.spec.ts components/privacy/privacy-display.spec.tsx components/privacy/privacy-channel-capture.portal.spec.tsx components/crm/subscribers/mod05-deuda-fiscal-ui.portal.spec.tsx components/crm/subscribers/subscriber-contact-pending.portal.spec.tsx --runInBand --silent --no-cache --coverage --coverageDirectory=coverage/privacy-b3-final-verified --coverageThreshold='{"global":{"statements":0,"branches":0,"functions":0,"lines":0}} --coverageReporters=json-summary` más `--collectCoverageFrom` para `PrivacyWorkspace.tsx`, `CompliancePanel.tsx`, `LegalTextContent.tsx`, `LegalTextReferences.tsx`, `use-enabled-purposes.ts`, `SubscriberForm.tsx` y `ConsentsPanel.tsx` | 8 suites, 77 pruebas aprobadas, 0 omitidas. Líneas 89.94 %, sentencias 88.63 %, ramas 80.58 %, funciones 86.93 % (7 archivos fuente). |
| Cobertura agregada ponderada de los tres conjuntos anteriores | 60 archivos fuente; líneas 94.14 %, sentencias 93.33 %, ramas 82.45 %, funciones 89.52 %; 0 líneas, sentencias, ramas o funciones omitidas. |
| `pnpm exec playwright test --config=e2e/playwright.portal.local.config.ts e2e/tests/portal-privacy.spec.ts e2e/tests/portal-crm-expedientes.spec.ts --grep 'CA-LT-(09|11|12)'` | 3 E2E aprobadas, 0 omitidas. Servidor portal local y APIs simuladas; no se publicó en tenant. |
| `pnpm --filter @iwana/portal typecheck` | Salida 0. |
| `pnpm exec eslint` sobre los seis archivos de prueba enumerados arriba | Salida 0, sin diagnósticos. |
| `pnpm exec prettier --check` sobre los seis archivos de prueba enumerados arriba | Salida 0, todos formateados. |

En la primera repetición de CA-LT-11, el test esperó resolver el evento de diálogo después de que el `click()` retornara y agotó el timeout. El handler del test ahora acepta el diálogo en el evento y conserva el mensaje para la aserción; la prueba aislada y la corrida final de los tres E2E pasaron. No fue necesario modificar comportamiento productivo.

## Deuda nueva por severidad

| Severidad | Deuda introducida por B3 |
| --- | --- |
| Alta | Ninguna. |
| Media | Ninguna. |
| Baja | Ninguna. |

## Pendientes preexistentes o fuera del bloque

- **Media, externa, reportada por B1:** el typecheck completo de API señala el fixture WFM de MOD13 (`findRouterSummariesByIds`). B3 no lo tocó; el suite Jest de privacidad sí pasó.
- **B1:** la integración PostgreSQL de la migración y finalidades consta en el informe B1 v1.1 (1 suite y 11 pruebas de migración; 1 suite y 1 prueba de finalidades), sin PII real.
- **B2:** la suite integral del portal tenía una prueba omitida preexistente en `InventoryClient.spec.tsx`, ajena a privacidad. Ninguna prueba de los alcances B3 listados arriba fue omitida.

## Bloqueos

Ninguno.
