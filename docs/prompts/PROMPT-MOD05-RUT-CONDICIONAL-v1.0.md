# PROMPT — MOD05 · Responsabilidades del RUT condicionales · v1.0

**Plan:** `docs/plans/2026-10-26-mod05-rut-condicional.md` · **Decisión:** `docs/adrs/ADR-100-Responsabilidades-RUT-Condicionales-para-Activar-Suscriptor.md`
**Precondición:** G0 ✅. ADR-100 aprobado por el CTO el 2026-10-26 con E1 = (a), E2 = vacío y E3 = sí.

---

## Regla común (ADR-100 D1)

```ts
// packages/shared — único lugar de la regla
export function isRutResponsibilitiesRequired(input: {
  personType: PersonType;
  vatResponsibility: VatResponsibility | null | undefined;
}): boolean {
  return input.personType === PersonType.JURIDICA
      || input.vatResponsibility === VatResponsibility.RESPONSABLE;
}
```

| `personType` | `vatResponsibility` | ¿Exige al menos un código? |
| --- | --- | --- |
| `JURIDICA` | `RESPONSABLE` | Sí |
| `JURIDICA` | `NO_RESPONSABLE` | Sí |
| `NATURAL` | `RESPONSABLE` | Sí |
| `NATURAL` | `NO_RESPONSABLE` | **No** |

`vatResponsibility` nulo no cambia la regla: la completitud ya marca su propio faltante (`VAT_RESPONSIBILITY`). La función devuelve `false` solo para natural, y el faltante de IVA sigue bloqueando.

Nunca se escribe `R-99-PN` automáticamente (D2). Sin migraciones (D3).

---

## §B1 — sr-backend

### Qué construir

1. **`@iwana/shared`:**
   - `isRutResponsibilitiesRequired`, exportada desde el barrel, junto a `RUT_RESPONSIBILITIES` o en `schemas/subscriber.schema.ts`.
   - `rutResponsibilitiesSchema` deja de exigir `.min(1)` por sí mismo y conserva la prohibición de duplicados.
   - En los esquemas de alta natural y jurídica, la obligatoriedad se valida con `superRefine` a nivel de objeto usando la función. El mensaje sigue siendo «Selecciona al menos una responsabilidad del RUT» y el `path` es `['rutResponsibilities']`.
   - En el alta, el campo puede faltar u omitirse cuando no se exige; se normaliza a `[]`.
   - La edición conserva su forma opcional.
2. **API:**
   - `evaluateSubscriberFiscalCompleteness` añade `RUT_RESPONSIBILITIES` solo si `isRutResponsibilitiesRequired(...)` y la lista está vacía.
   - `FISCAL_INCOMPLETE_SQL` aplica la misma condición:
     ```sql
     (s.person_type::text = 'JURIDICA' OR s.vat_responsibility::text = 'RESPONSABLE')
       AND COALESCE(cardinality(s.rut_responsibilities), 0) = 0
     ```
     Respeta el resto del predicado.
   - En la edición, `subscribers.service.ts` valida la combinación resultante (persistida + cambios). Si un cambio a `RESPONSABLE` o a jurídica deja la lista vacía, rechaza con el mismo `VALIDATION_ERROR` y el mismo `path`.
   - Actualiza la descripción OpenAPI de `rutResponsibilities` en `subscribers.controller.ts` («obligatorio para personas jurídicas o responsables de IVA»).
3. Comentarios en español que citen ADR-100 en la función y en el predicado SQL.

### Criterios de aceptación

| CA | Comprobación | Tipo |
| --- | --- | --- |
| CA-01 | `isRutResponsibilitiesRequired` y `evaluateSubscriberFiscalCompleteness` para los 4 cruces × lista vacía/llena (8 casos) | Unitaria en tabla |
| CA-02 | Alta: natural no responsable sin el campo o con `[]` → válido; natural responsable o jurídica con `[]` → error en `rutResponsibilities`; duplicados → error | Unitaria del esquema |
| CA-03 | Activar a `ACTIVE` un suscriptor natural no responsable con la lista vacía, contacto real y demás datos completos → se activa | **Postgres real** |
| CA-04 | Paridad: para los 8 casos sembrados, `FISCAL_INCOMPLETE_SQL` y la función dan el mismo veredicto | **Postgres real** |
| CA-05 | Crear un contrato para natural no responsable sin RUT → se crea; para una jurídica sin RUT → 422 `SUBSCRIBER_FISCAL_DATA_INCOMPLETE` con `missing` que incluye `RUT_RESPONSIBILITIES` | **Postgres real** o unitaria con el servicio real |
| CA-06 | Editar a `RESPONSABLE` con la lista vacía → rechazo; con un código → guarda | Unitaria o integración |

**Postgres real:** sigue el patrón de las integraciones de `crm/subscribers` (`IWANA_DB_INTEGRATION_AVAILABLE=true` y `E2E_TENANT_SLUG` del tenant de pruebas), con datos propios con prefijo identificable que se limpian al final. Nunca `tenant_iwana`. Reporta **el número de tests ejecutados**; 0 no cuenta.

---

## §F1 — fe-platform

### Qué construir

1. `SubscriberForm.tsx` (alta y edición) y `SubscriberSections.tsx` (sección «Datos fiscales») reemplazan la validación fija «al menos una responsabilidad» por `isRutResponsibilitiesRequired({ personType, vatResponsibility })`, importada de `@iwana/shared`. Si B1 aún no la exportó, usa exactamente la firma de este encargo; V2 compila los dos juntos.
2. Cuando no se exige, el campo se rotula como **opcional** y muestra esta ayuda. Revísala con `system-vocabulary-review`; cambia solo si la skill lo pide, y declara el cambio:
   > «Opcional si la persona no tiene RUT. Al facturar se informa como "No aplica, otros".»
3. Si el usuario cambia a «Responsable de IVA» o a persona jurídica con la lista vacía, el error aparece en el mismo guardado, junto al campo.
4. `VatTreatmentBanner.tsx`: con la lista vacía y sin exigencia, muestra «Sin RUT declarado» en lugar de no mostrar nada. Con la lista vacía y exigencia, conserva lo que muestra hoy.
5. No cambies `subscriber-fiscal.ts` (catálogo y etiquetas) ni los diálogos de contrato: muestran `missing` del API, que B1 ya corrige.

### Criterios de aceptación

| CA | Comprobación | Tipo |
| --- | --- | --- |
| CA-07 | Natural no responsable: guarda la sección fiscal sin códigos y el campo dice «opcional» | Prueba de componente |
| CA-08 | Natural responsable o jurídica sin códigos → error junto al campo; con un código → guarda | Prueba de componente |
| CA-09 | Cambiar IVA de no responsable a responsable con la lista vacía → el error aparece sin recargar | Prueba de componente |

---

## §V1 — contract-drift-reviewer

Compara la función y los esquemas de `@iwana/shared` con:
- `create-subscriber.dto.ts` y `update-subscriber.dto.ts`;
- la descripción OpenAPI de `subscribers.controller.ts`;
- `FISCAL_INCOMPLETE_SQL`;
- los formularios del portal.

Busca otros consumidores de `rutResponsibilitiesSchema` o de `RUT_RESPONSIBILITIES` (incluido `apps/web`) que todavía asuman `.min(1)`. Solo lectura. Reporta los hallazgos con `archivo:línea`.

## §V2 — gate-verifier

Gates Before Merge sobre `@iwana/shared`, `@iwana/api` y `@iwana/portal`, sin caché de turbo: lint, typecheck, suites completas, la integración de `crm/subscribers` con conteo real, y la cobertura de las líneas nuevas (≥80 %). Evidencia con comandos y cifras.

---

## §B1-bis — sr-backend (correcciones tras V1 y V2, 2026-10-26)

V2 dejó rojo el gate de suites. AI-EM-ARCH revisó el diff y encontró **dos regresiones reales**. Corrígelas en el código, **no en las pruebas**:

1. **Los errores de campo desaparecen del alta.** `CreateSubscriberSchema` pasó de `z.discriminatedUnion` a `z.union`, porque cada rama lleva ahora `.superRefine` (un `ZodEffects`, que la unión discriminada no admite). Con `z.union`, un alta inválida devuelve un `invalid_union` en la raíz y `flatten()` entrega `fieldErrors: {}`. El portal y los clientes del API pierden los errores por campo (`global-validation-pipes.http.spec.ts:121`).
   **Corrección:** vuelve a `z.discriminatedUnion('personType', [...])` con las dos ramas como `z.object` sin `.superRefine`. Llama a `validateRequiredRutResponsibilities` desde el `.superRefine` que la unión ya tiene (el del correo o teléfono). `naturalSubscriberSchema` y `juridicaSubscriberSchema` no tienen otros consumidores.
2. **La edición bloquea fichas antiguas.** `subscribers.service.ts` valida la combinación efectiva en **toda** edición. Una persona jurídica o responsable de IVA guardada con la lista vacía ya no puede cambiar ni su dirección ni su teléfono: 400 en `subscribers-update-audit.postgres.integration.spec.ts:221`. Antes de ADR-100 esa edición funcionaba, y §B1.2 pedía validar solo cuando el cambio lleva a esa situación.
   **Corrección:** valida solo si el DTO trae `personType`, `vatResponsibility` o `rutResponsibilities`. **No cambies** el fixture de `subscribers-update-audit`: es la prueba de que la regresión se corrigió.

Ajustes de pruebas que sí corresponden, porque la regla cambió:

3. `global-validation-pipes.http.spec.ts:121`: una persona natural sin `vatResponsibility` debe devolver `fieldErrors.vatResponsibility` no vacío. Ya no debe esperar `rutResponsibilities`, porque sin IVA declarado la regla no lo exige. Añade un caso de persona jurídica con la lista vacía que devuelva `fieldErrors.rutResponsibilities`.
4. `global-validation-pipes.http.spec.ts:176`: en la edición aislada, la lista vacía ya es válida en el pipe (la combinación la decide el servicio). Deja solo el caso de duplicados como 400, y añade el caso vacío como 200/201.
5. Portal: `mod05-deuda-fiscal-ui.portal.spec.tsx:892` simula una persona natural no responsable con `missing` que incluye `RUT_RESPONSIBILITIES`. Debe quedar solo `VAT_RESPONSIBILITY`. Es el único archivo del portal que tocas.
6. Unitarias nuevas en `subscribers.service.spec.ts`:
   - editar solo el teléfono de una persona responsable de IVA con la lista vacía → se guarda;
   - cambiar a `RESPONSABLE` con la lista vacía → 400;
   - cambiar a `RESPONSABLE` enviando un código → se guarda.

**`subscriber-enum-parity.postgres.integration.spec.ts`** («no encuentra enums en `tenant_test`»): no lo corrijas, y **no uses `git stash`** (hay cambios de otros frentes sin commitear en `main`). Comprueba en solo lectura que en el `tenant_test` local faltan esos tipos enum (`pg_type` del schema). Si faltan, es un problema del entorno local (pasó en el CI `40195554094`) y se declara.

Vuelve a correr, sin caché:
- la suite completa de `@iwana/api`;
- `global-validation-pipes.http.spec.ts`;
- las 8 integraciones de `crm/subscribers` contra Postgres real;
- las suites de `@iwana/shared` y del portal afectadas.

Entrega el conteo real. No commitees.

---

## Reglas

- Solo `pnpm`. Sin migraciones ni cambios de `tenant_iwana`. No toques `apps/api/src/modules/network/**`.
- Antes de empezar, `git status` de las rutas que vas a tocar. Si hay cambios ajenos, `[BLOQUEO]` y para.
- Sin cachés de jest dentro del repo, sin secretos en la salida y sin PII en logs.
- Nadie commitea ni hace push. Al cerrar entrega los archivos tocados, el conteo real y la lista de desviaciones.
