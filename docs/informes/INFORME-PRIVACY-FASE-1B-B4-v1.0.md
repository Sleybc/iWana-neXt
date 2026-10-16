# Informe — `privacy` Fase 1b · B4 portal

**Fecha:** 2026-10-16  
**Estado:** Parcial; bloqueado para la redacción de suscriptores y expedientes.  
**Alcance:** §2.12 de `PROMPT-PRIVACY-FASE-1B-v1.0.md`.

## Resultado

Se completó la parte de `PrivacyRequestDetail` que depende de los contratos de privacidad publicados en S1. Para una solicitud de supresión, «Resolver» consulta la vista previa, presenta los conteos traducidos por categoría, el número de expedientes candidatos y los bloqueos en español. La casilla de confirmación inicia desmarcada; «Resolver y anonimizar» requiere una vista previa elegible, la casilla marcada y una respuesta. El cuerpo incluye `erasure.confirm` y los candidatos mostrados por el servidor. Ante `PRIVACY_ERASURE_CANDIDATES_CHANGED`, se carga de nuevo la vista previa y se exige confirmar otra vez.

El detalle también presenta el plazo de traslado, la insignia «Traslado extemporáneo» y, cuando existe una supresión ejecutada, su fecha y categorías en español. El cliente API consume `ErasurePreview` y `ResolveDataSubjectRequest` desde `@iwana/shared`.

## [BLOQUEO] Redacción de suscriptores y expedientes

No se modificaron `SubscribersListClient`, `SubscriberDetailClient` ni `ExpedientesLandingClient`. El contrato compartido disponible todavía no expone `privacyRestricted` en `SubscriberListItem`, el registro del suscriptor 360° ni el tipo portal de expediente. El prompt asigna esos cambios de contrato/proyección a B3; el orquestador informó que B3 se detuvo por un conflicto de propiedad: §2.11 incluye `crm/contacts/**`, ruta que §4 no concede a B3. Sin el tipo/proyección publicado y sin autoridad sobre esa ruta, no hay base segura para decidir qué campos renderizar o suprimir.

## Verificación

| Comando                                                                                                             | Resultado                                                                            |
| ------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `pnpm --filter @iwana/portal exec jest src/components/privacy/PrivacyRequestDetail.spec.tsx --no-cache --runInBand` | 1 suite aprobada, 4 tests aprobados, 0 fallidos; sin caché y sin `--passWithNoTests` |
| `pnpm --filter @iwana/portal typecheck`                                                                             | Aprobado                                                                             |
| ESLint sobre los cuatro archivos modificados                                                                        | Aprobado, 0 errores y 0 warnings                                                     |
| `node .agents/skills/iwana-identity-ui-review/scripts/audit-ui.mjs` sobre los componentes de privacidad tocados     | Sin hallazgos                                                                        |
| `git diff --check` en los archivos modificados                                                                      | Sin errores                                                                          |

## Deuda nueva por severidad

| Severidad | Nueva deuda introducida |
| --------- | ----------------------: |
| P0        |                       0 |
| P1        |                       0 |
| P2        |                       0 |
| P3        |                       0 |

El bloqueo de B3 es externo a estos cambios y no se cuenta como deuda introducida por B4. La prueba de redacción no se ejecutó porque el contrato requerido aún no está disponible. No se añadieron datos personales, ciphertext, HMAC ni claves.
