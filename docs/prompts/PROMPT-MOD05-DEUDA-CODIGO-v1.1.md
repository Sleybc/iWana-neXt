# PROMPT — MOD05 · Deuda de código · Delta v1.1 · Conversión desde expediente y momento de exigir los datos fiscales

**Versión:** 1.1 (delta sobre [v1.0](PROMPT-MOD05-DEUDA-CODIGO-v1.0.md); lo que no se toca sigue vigente) · **Fecha:** 2026-10-17 · **Emisor:** AI-EM-ARCH · **Estado:** Contrato congelado; **D-M05 = A** aprobada por el CTO (2026-10-17)
**Origen:**
- [B1 v1.0](../informes/INFORME-MOD05-DEUDA-B1-v1.0.md): `[BLOQUEO]` tras S2;
- [B2 v1.0](../informes/INFORME-MOD05-DEUDA-B2-v1.0.md): R5 a R8 implementadas, sin integración.

## 0. Causa (defecto del emisor)

La pasada regla → campo de v1.0 trazó el **alta manual**, pero no la **conversión automática desde el expediente** (`SubscriberCreationService`). Hechos verificados:

| # | Hecho | Fuente |
| --- | --- | --- |
| H13 | La conversión crea el suscriptor en `PROSPECT` y hoy **infiere** el régimen: `JURIDICA → COMMON` y `NATURAL → SIMPLIFIED` | `subscriber-creation.service.ts:136-160`; `vat-treatment.service.ts:53` |
| H14 | El expediente **no** captura las responsabilidades del RUT ni la identidad del representante legal: solo `primary_contact_name` y `primary_contact_role`, en texto libre | `001_create_expediente_records.ts` |
| H15 | El CHECK de la 154 (`person_type <> 'JURIDICA' OR legal_representative_party_id IS NOT NULL`) es `NOT VALID`, pero igual aplica a **toda fila nueva**: una conversión de persona jurídica fallaría | `154_subscriber_legal_representative_party.ts` |
| H16 | La 153 deja `vat_responsibility` en `NOT NULL` | `153_subscriber_vat_responsibility.ts` |
| H17 | `PROSPECT → ACTIVE` ya es una transición con precondiciones (como `LEAD → PROSPECT`). Crear un contrato **no** exige hoy un suscriptor `ACTIVE` | `subscriber-status-transition.service.ts:18-29`; `contracts.service.ts` |
| H18 | En el entorno de los agentes, PostgreSQL (`127.0.0.1:5433`) estaba arriba y abierto, pero el agente no lo alcanzó. Redis está en **6380** (`.env.development:41`), no en 6399 | Verificado por AI-EM-ARCH |

## 1. D-M05 (decide el CTO)

| Opción | Efecto |
| --- | --- |
| **A (recomendada): exigir los datos fiscales al activar y al contratar** | La conversión crea el `PROSPECT` **sin inventar**: `vatResponsibility` en `NULL`, RUT vacío, representante en `NULL` y DV solo si viene (validado). La transición `PROSPECT → ACTIVE` y el **alta de un contrato** exigen el bloque fiscal completo. El alta manual lo sigue exigiendo desde el inicio |
| B: capturarlos en el expediente antes de convertir | Amplía el formulario, el DTO y la DDL del expediente: es otra fase |
| C: seguir infiriendo como hoy | Inventa un dato tributario que va a la factura electrónica. Descartada |

**Motivo de A:**
- un prospecto todavía no factura ni firma;
- la factura electrónica (responsabilidades del RUT) y la firma del contrato (representante legal) aparecen al contratar o activar;
- y el sistema deja de inventar el régimen, que es justo el defecto que M03 corrige.

## 2. Contrato (si D-M05 = A)

### 2.1 Migración tenant `157_subscriber_fiscal_completeness` (B0)

```sql
ALTER TABLE subscribers ALTER COLUMN vat_responsibility DROP NOT NULL;
ALTER TABLE subscribers DROP CONSTRAINT <check de representante de la 154>;
ALTER TABLE subscribers ADD CONSTRAINT ck_subscribers_fiscal_complete_when_active
  CHECK (
    status IN ('LEAD', 'PROSPECT', 'CANCELLED')
    OR (
      vat_responsibility IS NOT NULL
      AND (person_type <> 'JURIDICA' OR legal_representative_party_id IS NOT NULL)
    )
  ) NOT VALID;
```

- **Qué cubre:** `NOT VALID` deja pasar las filas heredadas. Las filas nuevas y las que cambian de estado lo cumplen.
- **Qué no cubre en BD:** el RUT no vacío y el DV para `ACTIVE`. Eso lo valida la API (R13), porque un CHECK sobre `cardinality` rompería las filas heredadas que se editan.
- **`down`:** restaura la 154 y la 153 tal como estaban; antes informa con conteos si hay filas sin `vat_responsibility`.
- La 153 y la 154 **no se editan**: ya están en `main`.

### 2.2 Reglas nuevas y ajustadas

| R | Regla |
| --- | --- |
| R1′ | El **alta manual** exige `vatResponsibility` y al menos una responsabilidad del RUT. La **conversión** no los infiere: los deja vacíos |
| R3′ | El alta manual de persona jurídica exige el DV. La conversión lo guarda solo si el expediente lo trae, y entonces lo valida |
| R4′ | El alta manual de persona jurídica exige el representante legal. La conversión lo deja en `NULL` |
| R13 | **Completitud fiscal:** `vatResponsibility` no nulo y al menos una responsabilidad del RUT; si es persona jurídica, además NIT con DV válido y representante legal. Se exige en `PROSPECT → ACTIVE` y en **toda alta de contrato** (incluida la que sale del expediente). Si falta algo: 422 `SUBSCRIBER_FISCAL_DATA_INCOMPLETE`, con `missing: ('VAT_RESPONSIBILITY' \| 'RUT_RESPONSIBILITIES' \| 'NIT_VERIFICATION_DIGIT' \| 'LEGAL_REPRESENTATIVE')[]`, sin PII |
| R14 | El **detalle** del suscriptor expone `fiscalCompleteness: { complete: boolean, missing: […] }` para que el portal muestre qué falta y permita completarlo en las secciones editables |
| R15 | `vat-treatment.service.ts` deja de producir `taxRegime`: `resolveTaxRegime` se retira |

### 2.3 Propiedad y orden

| Bloque | Cambio |
| --- | --- |
| B0 | La 157 (único que edita `runner.ts`), su spec y su integración con dos schemas: conversión `JURIDICA` sin representante → aceptada en `PROSPECT`; paso a `ACTIVE` sin datos → rechazado por el CHECK |
| B1 | R1′, R3′, R4′, R13, R14 y R15 en `crm/subscribers/**`. La regla de completitud vive en **un solo lugar** (`SubscriberFiscalCompletenessService` en `crm/subscribers`), que usan la transición y el alta de contrato. `contracts` no la duplica. Agrega `SUBSCRIBER_FISCAL_DATA_INCOMPLETE` y `fiscalCompleteness` al contrato de shared |
| B2 | Sin cambios de alcance. Solo ejecuta la integración pendiente (H18) y coordina con B1 la línea de `contracts.service.ts` donde se invoca la validación: **B1 la escribe** y B2 no toca esa línea |
| B3 | Suma a §2.6 el aviso «Faltan datos fiscales para activar o contratar» con la lista `missing`, y la edición de esos campos en el detalle |

### 2.4 Pasada regla → campo (lo nuevo)

| Regla | Campo o ruta | Test |
| --- | --- | --- |
| R1′, R3′ y R4′ | `SubscriberCreationService` sin inferencia; alta manual con exigencia | Integración: conversión `JURIDICA` sin RUT ni representante → `PROSPECT` creado con `vat_responsibility` `NULL`. HTTP: alta manual sin RUT → 400 |
| R13 | Transición `PROSPECT → ACTIVE` y alta de contrato | HTTP: activar o contratar sin datos → 422 con `missing` exacto; completar y repetir → 200/201 |
| R14 | `fiscalCompleteness` en el detalle | Unidad sobre las 4 causas |
| R15 | `vat-treatment.service.ts` | Unidad: el servicio no devuelve `taxRegime` |
| 157 | CHECK `NOT VALID` | Integración con dos schemas |

**Cruce con estados (A22):**
- `LEAD`, `PROSPECT` y `CANCELLED` no exigen completitud;
- `SUSPENDED → ACTIVE` sí la exige, porque el CHECK la evalúa;
- un titular **bloqueado** (Fase 1b) no puede editar sus datos fiscales (409), así que no puede completarse ni activarse mientras dure el bloqueo.

## 3. Entorno (H18)

- PostgreSQL: `127.0.0.1:5433`; la base desechable es `iwana_it_g7_ci`.
- Redis: `127.0.0.1:6380`, con las credenciales de `.env.development`.
- Si el entorno del agente no alcanza `localhost` o Docker, es un **bloqueo de entorno** del agente: se reporta con el comando y el error exactos, sin cambiar la configuración del repo.
- `tenant_test` de `iwana_it_g7_ci` se migra hasta la **157** antes de la integración de la API, nunca en `dbiw`.
