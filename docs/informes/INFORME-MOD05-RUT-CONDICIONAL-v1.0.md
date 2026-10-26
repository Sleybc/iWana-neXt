# INFORME — MOD05 · Responsabilidades del RUT condicionales · v1.0

**Fecha:** 2026-10-26 · **Autor:** AI-EM-ARCH
**Decisión:** [ADR-100](../adrs/ADR-100-Responsabilidades-RUT-Condicionales-para-Activar-Suscriptor.md) (Aprobado por el CTO el 2026-10-26, con E1 = (a), E2 = vacío y E3 = sí)
**Plan:** [2026-10-26-mod05-rut-condicional](../plans/2026-10-26-mod05-rut-condicional.md) · **Encargo:** [PROMPT-MOD05-RUT-CONDICIONAL-v1.0](../prompts/PROMPT-MOD05-RUT-CONDICIONAL-v1.0.md)
**Veredicto:** G0, G3, G4, G5, G6 y G7 ✅. Encargo cerrado el 2026-10-26: `eaa72683` en `origin/main`. Pasaron en verde el CI `40339347246` y el E2E Web Admin Smoke `40339346899`.

---

## 1. Problema

Antes de este cambio, el sistema exigía al menos una responsabilidad del RUT a **todos** los suscriptores para activarlos o crearles un contrato. La regla estaba copiada en cuatro sitios: el esquema compartido, la completitud fiscal del API, el predicado SQL de la lista y los formularios del portal.

Una persona natural no responsable de IVA no está obligada a tener RUT. Aun así, solo podía activarse marcando «No aplica, otros», y la pantalla no explicaba esa salida.

En `tenant_iwana`, los 3 suscriptores eran personas naturales no responsables de IVA con el campo vacío. Esto bloqueaba la regularización del caso de origen de MOD13 (`OTE-20260828-001`).

## 2. Qué cambió

| Pieza | Cambio |
| --- | --- |
| `@iwana/shared` · `subscriber.schema.ts` | Nueva función `isRutResponsibilitiesRequired({ personType, vatResponsibility })`: devuelve verdadero si es persona jurídica o responsable de IVA. `rutResponsibilitiesSchema` deja de exigir `.min(1)` y sigue prohibiendo duplicados. El alta conserva `z.discriminatedUnion` y aplica la regla en el `.superRefine` de la unión. Si el campo no se envía, queda `[]` |
| API · `subscriber-fiscal-completeness.service.ts` | `RUT_RESPONSIBILITIES` solo falta si la regla lo exige |
| API · `subscriber-queue-predicates.ts` | `FISCAL_INCOMPLETE_SQL` con la misma condición (paridad probada contra Postgres real) |
| API · `subscribers.service.ts` | En la edición, la combinación se valida solo si el DTO trae `personType`, `vatResponsibility` o `rutResponsibilities` |
| API · `subscribers.controller.ts` | Descripción OpenAPI del campo |
| Portal | `SubscriberForm`, `SubscriberSections` y `SubscriberFiscalFields` usan la función compartida. Cuando no se exige, el campo dice «opcional» con la ayuda «Opcional si la persona no tiene RUT. Al facturar se informa como "No aplica, otros".» `VatTreatmentBanner` muestra «Sin RUT declarado» |
| PRD MOD05 Fase 04 | Nota «Desarrollo posterior» bajo RF-SUB-06′ y RF-SUB-14 |

Sin migraciones. Nunca se escribe `R-99-PN` automáticamente (D2).

## 3. Evidencia

**Pruebas de los agentes (sin caché de turbo):**
- `@iwana/shared`: 24 suites y 231 tests.
- `@iwana/api`: 419 suites y 5.607 tests (4 suites y 15 tests omitidos, declarados).
- `@iwana/portal`: 322 suites y 3.259 tests (1 omitido).
- Lint y typecheck en verde en los tres paquetes, sin avisos en los archivos del cambio.

**Integración contra Postgres real:** `subscriber-rut-responsibilities.postgres.integration.spec.ts` activa a una persona natural no responsable sin RUT y compara `FISCAL_INCOMPLETE_SQL` con la función en los 8 casos. Rechaza `tenant_iwana` por diseño.

**Verificación propia de AI-EM-ARCH (sin caché):**
- esquema compartido: 19/19;
- 5 suites del API: 248/248;
- 3 integraciones contra Postgres real: 6/6.

**CI de `main`:** run `40339347246` en verde, con todos sus jobs (lint, typecheck, build y unitarias; integración contra Postgres; E2E portal; E2E R4.1; imágenes; citas ADR). En el log aparecen como PASS `subscriber-rut-responsibilities`, `subscribers-update-audit` y `subscriber-enum-parity`.

## 4. Regresiones encontradas y corregidas (B1-bis)

La revisión de AI-EM-ARCH sobre la primera entrega encontró dos regresiones que el gate-verifier había atribuido a pruebas obsoletas:

1. **Errores por campo vacíos en el alta.** Para añadir la regla, cada rama del esquema se envolvió en `.superRefine`. Eso obligó a cambiar a `z.union`, que entrega `fieldErrors: {}`, y el portal perdía el marcado por campo. Se corrigió volviendo a la unión discriminada con la regla en el refinamiento exterior.
2. **Fichas antiguas que ya no se podían editar.** La edición validaba la regla del RUT en cualquier cambio, así que una persona jurídica o responsable de IVA guardada sin RUT no podía actualizar ni su dirección. El gate-verifier propuso cambiar el fixture de `subscribers-update-audit`; se descartó porque habría ocultado la regresión. Ahora la regla solo se revisa cuando la edición toca los campos que la determinan.

## 5. Deuda y observaciones

1. **Entorno local:** el `tenant_test` local no tiene la tabla `subscribers` ni sus enums, y por eso `subscriber-enum-parity` falla en local. En CI pasa. Lo declaramos como deuda del entorno, no del código.
2. **Facturación electrónica:** el emisor futuro debe traducir la lista vacía a `R-99-PN` (ADR-100 D2). Esto debe heredarlo el HLD de facturación.
3. **Dictamen del contador:** sigue pendiente (E3). Si fija otra regla, hará falta un ADR nuevo.
4. **Cobertura:** las líneas nuevas del esquema (7) y del servicio (5) quedaron cubiertas, pero V2 no conservó la cobertura por línea de todo el diff en una sola corrida.

## 6. Efecto en otros módulos

- **MOD13:** el paso 3-bis del G7 desaparece. El suscriptor del caso de origen se puede regularizar sin declarar el RUT, siempre que el API en ejecución tenga este cambio.
- **Contratos (MOD05):** crear un contrato para una persona natural no responsable ya no exige RUT. Para jurídicas y responsables de IVA no cambia nada.
