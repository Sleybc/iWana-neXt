# INFORME — MOD05 deuda de código · B3 portal · v1.0

**Fecha:** 2026-10-17  
**Estado:** completo; sin commit  
**Agente:** `fe-platform`  
**Base:** `main` en `09af7f60` más el árbol de trabajo de B0, B1 y B2, sin commitear y sin tocar.  
**Contrato:** [PROMPT-MOD05-DEUDA-CODIGO-v1.0.md](../prompts/PROMPT-MOD05-DEUDA-CODIGO-v1.0.md) §2.6 y bloque B3 de §4; [delta v1.1](../prompts/PROMPT-MOD05-DEUDA-CODIGO-v1.1.md) §2.2 y fila B3 de §2.3 (D-M05 = A).  
**Plan:** [2026-10-17-mod05-deuda-codigo.md](../plans/2026-10-17-mod05-deuda-codigo.md).  
**Skills leídas como documentación:** `core-components`, `frontend-dev-guidelines`, `iwana-identity-ui-review` (modo diseño), `system-vocabulary-review`; de apoyo, `wcag-audit-patterns`.

## Resultado

El portal consume el contrato de B1 tal como lo publicó en `@iwana/shared` (`VatResponsibility`, `RUT_RESPONSIBILITIES`, `legalRepresentative`, `fiscalCompleteness`, `SUBSCRIBER_FISCAL_DATA_INCOMPLETE` y `SUBSCRIBER_FISCAL_MISSING_FIELDS`), sin duplicar tipos. No se tocó `apps/api` ni `packages`. No hubo `[BLOQUEO]`.

| Punto | Entrega |
| --- | --- |
| 1 | `SubscriberForm` y `SubscriberSections` dejan `taxRegime` y capturan «Responsabilidad de IVA» (Responsable / No responsable) y «Responsabilidades del RUT» (selección múltiple con O-13 «Gran contribuyente», O-15 «Autorretenedor», O-23 «Agente de retención de IVA», O-47 «Régimen simple de tributación», R-99-PN «No aplica, otros»). Son obligatorios en el alta manual; el payload ordena el RUT según el catálogo |
| 2 | `JuridicaPersonFields`: DV obligatorio y validado en vivo; el representante legal se captura con nombre completo, tipo y número de documento en lugar del input de UUID. El payload envía `legalRepresentative` y nunca `legalRepresentativeId`. El detalle muestra `legalRepresentative.displayName` y nunca el documento; cambiar de representante exige los tres campos |
| 3 | `SubscriberHeader`, `VatTreatmentBanner` y `subscriber-ui` dejan de mostrar `taxRegime` (`TAX_REGIME_META` retirado) y muestran la responsabilidad de IVA. RUT vacío: «Responsabilidades del RUT pendientes de completar» |
| 4 | Si `fiscalCompleteness.complete` es `false`, el encabezado avisa «Faltan datos fiscales para activar o contratar» con la lista `missing` en español y el botón «Completar datos fiscales», que lleva a la pestaña Datos. La sección nueva «Datos fiscales» edita IVA y RUT; DV y representante se editan en «Identificación». El diálogo de cambio de estado, el alta de contrato y la conversión del expediente a contrato muestran el mismo aviso ante el 422 `SUBSCRIBER_FISCAL_DATA_INCOMPLETE`, sin el mensaje ni el código técnico |
| 5 | Los 3 tests en rojo quedaron en verde sin debilitar aserciones (detalle abajo). Se agregaron 22 tests de los puntos 1 a 4 |

### Archivos

- **Nuevos:**
  - `subscriber-fiscal.ts`: etiquetas, espejo del DV y lectura del 422;
  - `SubscriberFiscalFields.tsx`: IVA con `RadioCardGroup` y RUT con `CheckboxCard`, ambos de `@iwana/ui`;
  - `FiscalDataIncompleteAlert.tsx`: un solo aviso, sobre `PortalAlert`;
  - `mod05-deuda-fiscal-ui.portal.spec.tsx`.
- **Modificados** (todos en `components/crm/subscribers/`, salvo los dos últimos):
  - `SubscriberForm`, `JuridicaPersonFields`, `SubscriberSections`, `SubscriberHeader`, `VatTreatmentBanner`, `subscriber-ui`;
  - `SubscriberStatusTransitionDialog`, `CreateContractDialog`, `ConvertExpedienteToContractDialog`;
  - `SubscriberDetailClient` (solo conecta `onCompleteFiscalData`);
  - `lib/api-client.ts`: solo `SubscriberRecord`, que toma de `SubscriberDetail` los campos fiscales y retira `legalRepresentativeId`;
  - specs: `SubscriberSections.spec`, `subscriber-contact-pending.portal.spec`, `mod05-iva-punto-servicio-ui.spec` y `components/privacy/privacy-channel-capture.portal.spec`.

### Los 3 tests que estaban en rojo

| Suite | Causa | Corrección |
| --- | --- | --- |
| `SubscriberSections.spec.tsx` | No compilaba: `legalRepresentativeId` ya no existe en el contrato | Fixture al contrato nuevo (`legalRepresentative`, `vatResponsibility`, `rutResponsibilities`, `fiscalCompleteness`); aserciones intactas |
| `subscriber-contact-pending.portal.spec.tsx` | No compilaba por la misma causa. Al compilar, dos casos dependían del formulario y del orden de las secciones | Fixture al contrato nuevo; el alta selecciona IVA y RUT, que ahora son obligatorios. El botón de guardar se ubica por la región «Contacto» y no por el índice `[1]`, que cambió con la sección nueva |
| `privacy-channel-capture.portal.spec.tsx` (formulario de autorización) | El alta no llamaba a `onSave`: faltaban IVA y RUT | El alta selecciona IVA y RUT. El conteo de 3 casillas de finalidades se acota al grupo «Autorizaciones para el tratamiento de datos» (las del RUT son otro control); sigue exigiendo exactamente 3, todas sin marcar |

`mod05-iva-punto-servicio-ui.spec.tsx` (CA-UX-IVA-19) cambió de forma: el banner ya no es vacío por contrato (§2.6), así que la prueba verifica que no aparezcan el régimen legado ni el tratamiento de IVA por suscriptor, y sí la responsabilidad de IVA y del RUT.

## Decisiones y observaciones

- **O1 · Espejo del DV en el portal.** `calculateNitVerificationDigit` vive en `apps/api/src/common/crypto/` y no en shared. Como B3 no puede tocar `packages`, el portal lleva un espejo en `subscriber-fiscal.ts`, con los mismos 15 pesos y el mismo límite. Lo verifican vectores calculados con la regla de la API: `900123456 → 8`, `900111222 → 1`, `800197268 → 4`, `860034313 → 7`; 15 dígitos se aceptan y 16 se rechazan. **Recomendación:** mover la función a `@iwana/shared` y borrar el espejo y la copia de `inventory/SupplierFormDrawer.tsx`, que usa solo 11 pesos y diverge desde 12 dígitos. Queda fuera de la propiedad de B3.
- **O2 · El aviso fiscal en el contrato** no lleva el botón «Completar datos fiscales», porque los diálogos de contrato no reciben navegación. El aviso del encabezado sí lo lleva.
- **O3 · El representante en edición** se captura vacío, porque el documento no viaja en la respuesta (§2.3). Solo se envía si se llenan los tres campos; de lo contrario no se toca.
- **O4 · El alta de suscriptor (`SubscriberForm`)** valida el DV en el cliente antes de enviar, con mensajes en español. Los errores de Zod en inglés de los campos nuevos se reemplazan por mensajes de producto.
- **Accesibilidad:**
  - IVA es un grupo de radios con `legend`; RUT, un `fieldset` con ayuda enlazada por `aria-describedby`.
  - Los errores usan `role="alert"`; el DV marca `aria-invalid`.
  - Las tarjetas de sección pasan a `section` con `h3`, lo que las vuelve regiones con nombre.
  - Los controles nuevos miden al menos 44 px.
- **Vocabulario:** no se muestra ningún enum crudo. Los códigos del RUT van como dato técnico secundario, en mono, junto a su etiqueta.

## Evidencia

| Verificación | Resultado |
| --- | --- |
| Línea base antes de editar, `jest --ci` de `@iwana/portal` | 3 suites en rojo (`SubscriberSections.spec`, `subscriber-contact-pending.portal.spec`, `privacy-channel-capture.portal.spec`); 1 test fallido, 1 omitido, 3 035 aprobados de 3 037 |
| Suite **completa** de `@iwana/portal`, `jest --ci --no-cache` | **304/304 suites; 3 065 aprobados, 1 omitido (preexistente), 0 fallos** (de 3 066) |
| Spec nuevo `mod05-deuda-fiscal-ui.portal.spec.tsx` | 22/22 |
| `tsc --noEmit` de `@iwana/portal` | exit 0 |
| `eslint` sobre los 19 archivos tocados | 0 errores; 2 avisos preexistentes de `react-hooks/exhaustive-deps` en `SubscriberDetailClient.tsx:89,108`, líneas no tocadas |
| `audit-ui.mjs` sobre los 13 archivos de UI tocados | P0 0 · P1 0 · P2 0 · P3 3, heurísticos `[revisar]`: spinners dentro de botones, preexistentes y no de carga primaria. Descartados. Exit 0 |
| `pnpm exec turbo run test --force --continue` | exit 0 · 10/10 tareas, 0 en caché. Por paquete: `shared` 20 suites / 179 tests · `ui` 5 / 34 · `web` 36 / 229 · `db` 74 / 417 · `worker` 21 / 171 · `portal` 304 / 3 065 (1 omitido) · `api` 392 de 396 suites (4 omitidas) / 5 294 (15 omitidos). 0 fallos. pnpm no tuvo que descargar Node: se usó el Node instalado (v24.18.0) sin error de red |

Todos los valores de prueba son sintéticos: NIT `900123456-8`, documentos `1000000001` y `1000000009`, y correos `@example.test`. Ninguna PII, ciphertext, HMAC ni clave real. La ruta de este informe se verificó libre antes de crearla. No se creó commit.
