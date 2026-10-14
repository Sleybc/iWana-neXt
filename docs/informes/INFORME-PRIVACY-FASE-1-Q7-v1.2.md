# INFORME — Privacy Fase 1 · Q7

**Versión:** 1.2  
**Fecha:** 2026-10-14  
**Responsable:** AI-FE-PLATFORM  
**Estado:** A24 integrado en el portal; contrato de canal y conversión verificados.

## Resultado

La captura de autorización solicita un medio real en el expediente, el alta directa y la ficha 360°. El selector es obligatorio y no tiene un valor preseleccionado. La captura del expediente quedó montada en el detalle existente. La conversión conserva el canal capturado y no vuelve a solicitarlo. Las etiquetas visibles traducen los canales conocidos y presentan los valores históricos como «Medio histórico»; nunca muestran el nombre de la superficie como canal.

El portal consume los contratos publicados: `createDataAuthorizationSchema.channel` valida `ConsentChannel`, y `CreateSubscriberSchema.authorizationChannel` es obligatorio cuando hay autorizaciones. No se modificó backend ni `@iwana/shared`.

## Evidencia CA ↔ test

| Criterio                 | Evidencia                                                                                                                                                                                                                                                |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| CA-UX-PRIV-31            | `privacy-channel-capture.portal.spec.tsx`: el alta presenta la versión del texto y las finalidades sin marcar; envía un único medio junto con la autorización.                                                                                           |
| CA-UX-PRIV-33            | `privacy-channel-capture.portal.spec.tsx`: el expediente requiere un medio válido sin selección inicial, ofrece los cinco canales y no presenta `CRM_EXPEDIENTE` como canal.                                                                             |
| CA-UX-PRIV-50            | `privacy-channel-capture.portal.spec.tsx`: la ficha solicita el medio una vez y traduce valores históricos sin mostrar `FICHA_360`.                                                                                                                      |
| Conversión de expediente | `portal-crm-expedientes.spec.ts`: captura Teléfono, transiciona el expediente existente a `LISTO_PARA_INSTALACION` y verifica Teléfono en la ficha del suscriptor convertido. La transición y las respuestas del servidor están mockeadas en Playwright. |

## Verificación

| Comando                                                                                                                                                                                                                                                                                                             | Resultado                                                                                                          |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `pnpm exec turbo run test --filter=@iwana/portal --force`                                                                                                                                                                                                                                                           | Pasa: 298/298 suites; 2.996 tests aprobados, 1 omitido (2.997 total); Turbo: 2 tareas, 0 cache hits.               |
| `pnpm exec playwright test --config e2e/playwright.portal.config.ts -g "conserva el medio de autorización del expediente" --reporter=line`                                                                                                                                                                          | Pasa: 1 E2E. El recorrido usa la transición existente `LISTO_PARA_INSTALACION` y comprueba el medio en ficha 360°. |
| `pnpm --filter @iwana/portal typecheck`                                                                                                                                                                                                                                                                             | Pasa, exit code 0.                                                                                                 |
| `node .agents/skills/iwana-identity-ui-review/scripts/audit-ui.mjs apps/portal/src/components/crm/expedientes/ConsentsPanel.tsx apps/portal/src/components/crm/subscribers/SubscriberForm.tsx apps/portal/src/components/privacy/CompliancePanel.tsx 'apps/portal/src/app/dashboard/crm/expedientes/[id]/page.tsx'` | Sin hallazgos en las rutas analizadas.                                                                             |

El E2E cubre la integración de la interfaz con respuestas HTTP mockeadas; no representa una corrida contra una API levantada.

## Deuda nueva por severidad

- **Nueva:** no se identificó deuda P0–P3 introducida por A24.
- **Heredada, P2:** sigue pendiente una corrida E2E portal contra API viva. La matriz de CA y las brechas de cobertura restantes se mantienen según el informe Q7 v1.1.

## Trazabilidad

- `docs/prompts/PROMPT-PRIVACY-HABEAS-DATA-FASE-1-v1.3.md` §1 A24 y §2 Q7Δ1.
- `docs/specs/2026-10-14-privacy-fase-1-ux-spec.md` §§7.2 y 17.
- `packages/shared/src/schemas/privacy/authorizations.ts` y `packages/shared/src/schemas/subscriber.schema.ts` — contratos consumidos.
