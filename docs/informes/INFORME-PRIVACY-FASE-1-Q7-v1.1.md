# INFORME — Privacy Fase 1 · Q7

**Versión:** 1.1  
**Fecha:** 2026-10-14  
**Responsable:** AI-FE-PLATFORM  
**Estado:** Implementación portal entregada; la captura desde expediente queda bloqueada por la deriva de contrato documentada.

## Resultado

Se implementó el espacio de Privacidad en `/dashboard/privacy`, las superficies de Cumplimiento, la integración de marcas y el detalle de solicitudes contra A23. `api-client.ts` importa `dataSubjectRequestDetailSchema`, `dataSubjectRequestDetailRequestSchema` y el tipo `DataSubjectRequestDetail` de `@iwana/shared`; valida el envelope `{ data: { request, events, tasks } }` con el schema Zod publicado por Q3Δ3. Los E2E usan una API mockeada con respuestas parseadas por ese contrato compartido.

La captura de autorización desde la ficha 360° fija `FICHA_360` en el código de la superficie. La captura del expediente sigue bloqueada en UI: el endpoint legado solicita que el cliente envíe `channel` y no lo determina por contexto; el portal no envía un canal inventado. La captura desde expediente requiere corregir esa derivación en backend y enlazarla con el contrato vigente antes de levantar el bloqueo.

## Alcance implementado

- Bandeja de solicitudes, filtros, semáforo de días hábiles, formulario de radicación y carga de evidencia.
- Detalle A23 con estado, método y fecha de verificación; datos del solicitante solo cuando llegan en la respuesta autorizada; acción **Ver evidencia** solo con `hasRequesterEvidence`.
- Acciones del detalle, plantillas editables, verificación de identidad y CA-53: con identidad pendiente permite traslado y limita la no procedencia a falta de legitimación.
- Solicitud de suplantación desde la ficha 360°, ligada a Party y selección de contratos; confirmación con el número de suspensiones devueltas.
- Cumplimiento, autorizaciones, textos legales, incidentes, inventario declarativo y marcas en ficha y listados.
- Alta directa con texto vigente y autorización de prestación requerida; bloqueos de autorización presentados al usuario; captura de expediente explícitamente deshabilitada por la deriva de contrato indicada arriba.
- Entrada **Privacidad** en Sidebar condicionada por `privacy.read`.

## Verificación

| Comando                                                                                               | Resultado                                                                                                                                                    |
| ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `pnpm --filter @iwana/portal typecheck`                                                               | Pasa, exit code 0.                                                                                                                                           |
| `node .agents/skills/iwana-identity-ui-review/scripts/audit-ui.mjs <rutas Q7 modificadas>`            | Sin hallazgos en las rutas analizadas; P0–P3 = 0.                                                                                                            |
| `pnpm exec playwright test --config e2e/playwright.portal.config.ts e2e/tests/portal-privacy.spec.ts` | 3/3 pasan: radicar → verificar → completar → resolver; suplantación desde ficha 360°; CA-53 con identidad pendiente contra API mockeada.                     |
| `pnpm exec turbo run test --filter=@iwana/portal --force`                                             | Pasa en la corrida final iniciada después de CA-53 y del ajuste de canales: 297/297 suites, 2.993 tests aprobados, 1 omitido, 2.994 en total y 0 cache hits. |

El E2E principal pasa por el parser Zod real del contrato A23 de `@iwana/shared`; el servidor HTTP del test se mantiene mockeado. No se afirma una prueba end-to-end contra un backend levantado.

## Matriz CA ↔ evidencia

`E2E-1` es el recorrido de consulta, verificación, completar y resolver; `E2E-2` es suplantación en ficha 360°; `E2E-53` es la prueba mockeada de CA-53; `labels.spec.ts` cubre traducciones y calendario de días hábiles. “UI; sin test directo” indica que la superficie está implementada, pero la suite no contiene una aserción específica para ese criterio.

| CA-UX-PRIV | Evidencia                                                                                                                                                                |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 01         | `PrivacyWorkspace.tsx` renderiza bandeja y acción de radicación; UI sin test directo de contenido.                                                                       |
| 02         | `PrivacyWorkspace.tsx` enlaza filtros con query params; UI sin test directo de persistencia/restauración.                                                                |
| 03         | Bandeja usa `RequestSummary`; E2E-1 valida el flujo hasta detalle, sin aserción exhaustiva de columnas.                                                                  |
| 04         | `privacy-labels.spec.ts` prueba cálculo de semáforo en días hábiles; cubrimiento directo parcial.                                                                        |
| 05         | La carga mantiene la fila activa mientras refresca; UI sin test directo.                                                                                                 |
| 06         | Estados de carga, vacío, error y permiso existen en `PrivacyWorkspace.tsx`; UI sin test directo por estado.                                                              |
| 07         | Detalle A23 con gating de solicitante por `privacy.manage`; E2E-1 prueba detalle con contrato real Zod, sin dos perfiles de permiso.                                     |
| 08         | `privacy-labels.ts` traduce estados y tipos; `labels.spec.ts` cubre parte de las etiquetas.                                                                              |
| 09         | Formulario con consulta, reclamo y suplantación; E2E-1 y E2E-2 cubren consulta y suplantación. Reclamo sin test directo.                                                 |
| 10         | Fecha contextual se precarga en formulario; UI sin test directo.                                                                                                         |
| 11         | Party y contratos se conservan al radicar desde ficha; E2E-2 verifica `partyId` y selección.                                                                             |
| 12         | Campos de identidad y aplazamiento de verificación; E2E-1 valida consulta con “verificar después”; casos de solicitante alterno sin test directo.                        |
| 13         | Detalle muestra método y fecha verificada; E2E-1 los verifica tras la transición.                                                                                        |
| 14         | `EvidenceUploadField.tsx` aplica formatos y límite de carga; UI sin test directo de los casos de archivo.                                                                |
| 15         | Finalidad solo al retirar autorización; UI sin test directo.                                                                                                             |
| 16         | Validación y conservación de datos ante error; UI sin test directo.                                                                                                      |
| 17         | Visibilidad por `hasRequesterEvidence` y URL bajo demanda están implementadas; UI sin test directo de apertura y `no-store`.                                             |
| 18         | E2E-2 verifica confirmación con el contrato suspendido devuelto; selección múltiple no cubierta en test.                                                                 |
| 19         | Vista de tareas y cierre con nota implementados; UI sin test directo.                                                                                                    |
| 20         | “Fecha estimada para presentar la denuncia” implementada; UI sin test directo.                                                                                           |
| 21         | Controles para las seis transiciones implementados; E2E-1 cubre completar y resolver. Las otras cuatro transiciones carecen de test directo.                             |
| 22         | Formulario de prórroga con motivo y fecha de servidor implementado; UI sin test directo.                                                                                 |
| 23         | Respuesta/canal, fundamento y referencia implementados; E2E-1 cubre resolver, no los fundamentos alternos.                                                               |
| 24         | Plantillas editables implementadas; UI sin test directo de edición/envío.                                                                                                |
| 25         | Presentación de R1–R4 implementada; UI sin test directo por regla.                                                                                                       |
| 26         | Copy y anuncios no agregan PII al historial; sin test automatizado específico de PII visible.                                                                            |
| 27         | Cumplimiento vive dentro de la ficha 360°; E2E-2 navega el panel.                                                                                                        |
| 28         | Resumen de ficha usa proyección resumida; UI sin test directo de ausencia de datos del solicitante.                                                                      |
| 29         | Historial de autorizaciones y estado vigente implementados; UI sin test directo de orden de eventos.                                                                     |
| 30         | Prueba de autorización con hash y URL firmada bajo demanda implementada; UI sin test directo.                                                                            |
| 31         | Texto versionado y finalidades visibles en alta/ficha; captura de expediente bloqueada por el endpoint legado. Sin test directo de captura.                              |
| 32         | Finalidades de prestación/comercial/biometría separadas en captura; UI sin test directo.                                                                                 |
| 33         | `FICHA_360` se fija por contexto y no se solicita al usuario; expediente queda bloqueado hasta corregir la derivación de canal en backend.                               |
| 34         | Marcas en ficha, listado de suscriptores y expedientes vinculados implementadas; UI sin test directo de llamada única por página.                                        |
| 35         | Texto, icono y nombres de marca están en `PrivacyMarks.tsx`; `labels.spec.ts` prueba parte de la traducción.                                                             |
| 36         | Textos legales inmutables se listan en Cumplimiento; UI sin test directo.                                                                                                |
| 37         | Formulario de texto legal y advertencia de inmutabilidad implementados; UI sin test directo.                                                                             |
| 38         | Incidentes y fecha límite SIC implementados; UI sin test directo.                                                                                                        |
| 39         | Acción de marcar como reportado con fecha/referencia implementada; UI sin test directo.                                                                                  |
| 40         | Inventario declarativo muestra los campos del contrato sin conteos; UI sin test directo.                                                                                 |
| 41         | `NO_DECLARADA` se traduce a “Sin declaración registrada”; UI sin test directo.                                                                                           |
| 42         | Controles usan teclado y tamaños de sistema; falta una prueba automatizada WCAG de los recorridos completos.                                                             |
| 43         | Estilos usan tokens existentes; el audit mecánico acotado no encontró reglas duras, pero no reemplaza medición de contraste claro/oscuro.                                |
| 44         | Diseño responsivo implementado; falta E2E de viewport estrecho para tablas y acciones.                                                                                   |
| 45         | Cargas de privacidad y autorizaciones usan skeleton; vacíos/errores implementados; estados no están cubiertos individualmente por tests.                                 |
| 46         | Fixtures usan datos sintéticos; E2E usa nombres y documentos ficticios de prueba.                                                                                        |
| 47         | E2E-1 cubre radicar con verificación aplazada, verificar, completar y resolver; no prueba restricciones de estado en todas las combinaciones.                            |
| 48         | E2E-2 cubre suplantación desde ficha, vínculo al titular y un contrato; no prueba 20 contratos ni fallback a reclamo.                                                    |
| 49         | UI muestra “Vigente” según `isCurrent` y bloquea si falta texto; sin test directo de ambas variantes.                                                                    |
| 50         | Alta directa exige autorización; la conversión de expediente y el alta de contrato dependen de backend. Captura de expediente bloqueada; sin test directo de flujos 422. |
| 51         | Carga desde radicación y ficha implementada con uso restringido; no adjunta archivos en el componente legado del expediente; sin test directo.                           |
| 52         | Marcas se muestran solo con Party asociado en listado de expedientes; UI sin test directo para filas sin vínculo.                                                        |
| 53         | E2E-53 confirma traslado disponible y que el rechazo pendiente solo ofrece `SOLICITANTE_NO_LEGITIMADO`; API mockeada con respuesta conforme al schema A23.               |

## Deuda nueva por severidad

- **P1 — Captura de autorización desde expediente:** el endpoint legado recibe `channel` desde el DTO y no lo deriva por superficie. La captura queda explícitamente deshabilitada en portal y requiere ajuste del backend/A18 antes de reactivarse. Afecta CA-31, CA-33 y parte de CA-50.
- **P2 — Cobertura de interacción:** la mayoría de CA de filtros, estados remotos, transiciones individuales, archivos, autorizaciones, incidentes, inventario, marcas, permisos y accesibilidad solo tienen evidencia de implementación; la matriz enumera las brechas por criterio. Priorizar pruebas para evidencias, transiciones restantes, carga/errores, breakpoints y llamadas de marcas.
- **P2 — Integración viva:** Q7 valida el contrato compartido real con respuestas mockeadas; falta una corrida E2E contra API levantada para verificar el wiring HTTP en conjunto.

## Trazabilidad

- `docs/specs/2026-10-14-privacy-fase-1-ux-spec.md` §§4–13 y 17.
- `docs/prompts/PROMPT-PRIVACY-HABEAS-DATA-FASE-1-v1.3.md` §1 A11, A13, A14, A16, A17, A18, A20, A23 y §2 Q7.
- `packages/shared/src/schemas/privacy/requests.ts` — contrato A23 de detalle.
- `apps/portal/src/lib/api-client.ts` — validación Zod del detalle.
- `e2e/tests/portal-privacy.spec.ts` — E2E-1, E2E-2 y E2E-53.
