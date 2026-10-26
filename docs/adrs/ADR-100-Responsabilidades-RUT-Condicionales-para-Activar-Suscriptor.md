# ADR-100: Las responsabilidades del RUT solo se exigen a quien tiene RUT obligatorio

**Versión:** 1.0
**Estado:** Aprobado
**Fecha:** 2026-10-26
**Aprobado por:** CTO Humano — 2026-10-26, con E1 = (a), E2 = vacío y E3 = sí
**Autor:** AI-EM-ARCH
**Modo activo:** Architect + EM
**Aprobación requerida:** CTO. Cambia una regla de completitud fiscal que bloquea activar suscriptores y crear contratos (RF-SUB-06′ de MOD05 Fase 04).
**Módulos:** MOD05 CRM Suscriptores (dueño de la regla) · MOD13 Red y Aprovisionamiento (consumidor: activación comercial tras la red) · facturación electrónica futura (consumidor del dato)
**Relacionado:** [ADR-093](ADR-093-Tratamiento-IVA-Internet-por-Punto-y-Linea-de-Servicio.md) (Aprobado; el dato es del adquirente para la factura) · [ADR-027](ADR-027-Conversion-Expediente-Subscriber-Two-Stage.md) (enmendado por MOD13) · [ADR-098](ADR-098-IPAM-y-Aprovisionamiento-Certificado-MOD13.md) (Aprobado; R11) · [PRD MOD05 Fase 04](../prds/PRD-MOD05-CRM-SUBSCRIBERS-FASE-04-v1.0.md) RF-SUB-06′
**Plan:** [2026-10-26-mod05-rut-condicional](../plans/2026-10-26-mod05-rut-condicional.md)

---

## Contexto

En el G7 de MOD13 había que regularizar la OT `OTE-20260828-001` (caso de origen). La verificación previa en solo lectura (2026-10-25) encontró que su suscriptor no se activaría: tiene contacto real y responsabilidad de IVA, pero el campo «Responsabilidades del RUT» está vacío. El CTO observó que **no todos los suscriptores necesitan RUT**.

En Colombia, una persona natural no responsable de IVA, sin actividad empresarial, no está obligada a inscribirse en el RUT. Para el adquirente sin responsabilidades, la factura electrónica usa el código `R-99-PN` («No aplica, otros»). Ese código ya es una de las opciones del catálogo.

### Verificación en código (2026-10-26, árbol de `main` en `40f7e1e6`)

| Pieza | Regla actual |
| --- | --- |
| `packages/shared/src/schemas/subscriber.schema.ts` · `rutResponsibilitiesSchema` | `.min(1)` en el alta de persona natural y de persona jurídica; opcional en la edición |
| `apps/api/.../subscriber-fiscal-completeness.service.ts` · `evaluateSubscriberFiscalCompleteness` | `RUT_RESPONSIBILITIES` falta si la lista está vacía, **para cualquier tipo de persona** |
| `apps/api/.../subscriber-queue-predicates.ts` · `FISCAL_INCOMPLETE_SQL` | Paridad SQL de la misma regla (chip «datos fiscales incompletos» de la lista) |
| `subscriber-status-transition.service.ts:156` | `assertComplete` antes de pasar a `ACTIVE` |
| `contracts.service.ts` (dos rutas de creación) | `assertComplete` antes de crear un contrato |
| Portal: `SubscriberForm.tsx`, `SubscriberSections.tsx` | «Selecciona al menos una responsabilidad del RUT» al crear y al guardar la sección fiscal |
| Facturación | No hay consumidor del dato todavía: ningún módulo emite la factura electrónica |

**Datos (`tenant_iwana`, solo lectura):** los 3 suscriptores son persona natural `NO_RESPONSABLE` con el campo vacío. Llegaron por conversión de expediente, que no lo pide. Con la regla actual, ninguno se puede activar ni contratar sin declarar algo en el RUT.

**Problemas:**
- La regla obliga a declarar una responsabilidad del RUT a quien no tiene RUT. La única salida honesta es marcar `R-99-PN`, pero la UI no lo explica, y el usuario lo lee como «el sistema exige RUT».
- RF-SUB-06′ declara el catálogo «provisional, sujeto al dictamen del contador», y el dictamen sigue pendiente. La obligatoriedad universal no viene de una norma citada; es una decisión de producto.

---

## Decisión

### D1. Exigir las responsabilidades del RUT solo a quien tiene RUT obligatorio

`rutResponsibilities` es obligatorio (al menos un código) si se cumple **alguna** de estas condiciones:
- `personType = JURIDICA` (toda persona jurídica tiene NIT y RUT);
- `vatResponsibility = RESPONSABLE` (ser responsable de IVA exige inscripción en el RUT).

Para `personType = NATURAL` con `vatResponsibility = NO_RESPONSABLE`, el campo es **opcional**. Puede quedar vacío o llevar los códigos que el suscriptor sí tenga, incluido `R-99-PN`.

La regla vive en **una sola función de `@iwana/shared`**, `isRutResponsibilitiesRequired({ personType, vatResponsibility })`. La usan el esquema Zod, la evaluación de completitud del API y el formulario del portal. La paridad SQL (`FISCAL_INCOMPLETE_SQL`) se ajusta con una prueba que la compare con la función.

### D2. Vacío significa «no declarado», no se rellena con `R-99-PN`

El sistema **no escribe** `R-99-PN` por su cuenta. Una lista vacía significa «sin responsabilidades del RUT declaradas». Al emitir la factura electrónica, cuando exista ese módulo, el emisor traducirá el vacío a `R-99-PN`. Esa traducción queda como contrato para el consumidor futuro (§Consecuencias).

Motivo: guardar `R-99-PN` sin que nadie lo haya declarado fabricaría una declaración fiscal (el mismo criterio de ADR-088 D5). Además, un dato derivado mezclado con uno declarado impide distinguirlos después.

### D3. Sin migración de datos

Los suscriptores existentes con la lista vacía no se tocan. Con D1, los de persona natural no responsable dejan de contar como incompletos. Los de persona jurídica o responsables de IVA con la lista vacía siguen incompletos y siguen apareciendo en el chip de la lista, que es lo correcto.

---

## Escalaciones al CTO (resueltas el 2026-10-26)

**Resolución:** el CTO aprobó las tres recomendaciones:
- E1 = (a): el RUT solo se exige a jurídicas o responsables de IVA;
- E2: el vacío se guarda vacío;
- E3 = sí: se decide antes del dictamen del contador, con el riesgo declarado.

**E1. ¿Qué regla se adopta?**
- **(a) Recomendada.** D1: obligatorio solo para jurídicas o responsables de IVA.
- **(b)** Opcional para todos. Más simple, pero deja sin dato a jurídicas y responsables de IVA, que sí lo tienen y lo necesitan en la factura.
- **(c)** Mantener la regla y explicar en la UI que quien no tiene RUT marca «No aplica, otros». No cambia código de dominio, pero sigue obligando a declarar algo y no corrige los suscriptores que llegan por expediente.

**E2. ¿El vacío se guarda vacío (D2) o se rellena con `R-99-PN` al guardar?** Se recomienda **vacío**.

**E3. Dictamen del contador.** Esta decisión no lo sustituye. Si el dictamen fija otra regla, se emite un ADR nuevo. Se recomienda **aceptar** este riesgo y dejarlo declarado.

---

## Consecuencias

**Positivas**

- Las personas naturales sin RUT se pueden activar y contratar sin declaraciones artificiales. El caso de origen de MOD13 se regulariza sin tocar su ficha fiscal.
- La regla queda en un solo lugar compartido por el API, el portal y el esquema, en lugar de tres copias.

**Negativas y costes**

- Cambia el contrato del alta (`createSubscriberSchema`): el campo pasa a ser condicional. Los clientes que enviaban `[]` para personas naturales no responsables dejan de recibir 400. Esto relaja la validación; no rompe a ningún cliente.
- El futuro emisor de facturas debe traducir el vacío a `R-99-PN`. Se declara en este ADR y en el informe de cierre para que el HLD de facturación lo herede.
- Si el suscriptor cambia a `RESPONSABLE` o a jurídica, la lista vacía vuelve a ser incompleta y bloquea el siguiente contrato o la activación. Es el comportamiento buscado, y el formulario lo pide en el mismo guardado.

**Impacto declarado**

| Dimensión | Impacto |
| --- | --- |
| Multi-tenant | Ninguno. Regla de código, igual para todos. Sin migración |
| Seguridad | Ninguno. No hay PII nueva ni permisos nuevos |
| Escala | Ninguno |
| Regulación | La regla queda alineada con la inscripción obligatoria en el RUT; el dictamen del contador sigue pendiente (E3) |
| Boundaries | Sin cambios. MOD05 sigue siendo dueño de la completitud. MOD13 la consume por el listener existente |

---

## Riesgos

| # | Riesgo | Mitigación |
| --- | --- | --- |
| R1 | El API, el SQL y el portal vuelven a divergir | Función única en `@iwana/shared` y prueba de paridad SQL ↔ función contra Postgres real |
| R2 | Se relaja también la validación de jurídicas por error | Pruebas en tabla: los 4 cruces de `personType` × `vatResponsibility`, con lista vacía y con lista llena |
| R3 | La facturación futura emite el vacío tal cual y la DIAN lo rechaza | Contrato declarado en D2; el informe de cierre lo deja como dependencia del HLD de facturación |

---

## Alternativas descartadas

**A1. Rellenar `R-99-PN` con una migración en los suscriptores existentes.** Fabrica declaraciones fiscales y no resuelve las altas futuras. Ver D2.

**A2. Quitar el campo de la completitud y validarlo solo en la factura.** Pospone el error al momento de facturar, cuando el suscriptor ya está activo y es más caro corregirlo. D1 mantiene la exigencia donde sí corresponde.
