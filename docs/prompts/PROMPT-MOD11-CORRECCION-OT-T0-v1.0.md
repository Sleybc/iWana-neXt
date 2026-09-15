# PROMPT DE EJECUCIÓN — MOD11 Corrección de OT · T0: la persistencia escribe lo que los comandos mutan

**Versión:** 1.0
**Fecha:** 2026-09-14
**Generado por:** AI-EM-ARCH
**Agente destinatario:** **AI-SR-FULL** (`sr-backend`)
**Estado:** **Ejecutable.** No depende de ADR-090 (propuesto): es la corrección de un defecto activo.

## Vínculos de trazabilidad

- Plantilla base: `docs/prompts/TEMPLATE-PROMPT-EJECUCION-FASE-MODULO.md` (v1.2, **En revisión**)
- Spec: `docs/specs/2026-09-14-mod11-correccion-ot-design.md` v1.0 — **§2.2 y §4.6 son de lectura obligatoria**
- Plan: `docs/plans/2026-09-14-mod11-correccion-ot.md` v1.0
- ADR marco: [ADR-090](../adrs/ADR-090-Correccion-de-OT-Dueno-del-Dato-y-Anulacion-por-Error.md) (propuesto) · [ADR-068](../adrs/ADR-068-Sincronizacion-OT-Ejecucion-Proyecciones-Operativas.md) (Aprobado)

---

## 1. El defecto

`assign()` muta `order.assignedTechnicianId` en memoria y llama a `persistOrderOptimistically`. El `UPDATE` de esa función escribe **siete columnas** —estado, resultado, versión, `startedAt`, `closedAt`, `closeNotes` y `updatedByUserId`— y **`assignedTechnicianId` no está entre ellas**. Después devuelve el objeto en memoria.

Resultado: la respuesta HTTP 200 muestra el técnico nuevo y **la base conserva el anterior**.

**No es cosmético: es un fallo de control de acceso.** `assertActorAccess` y `assertCustodyAssignment` leen `assignedTechnicianId` de la base. El técnico reasignado **no puede iniciar la OT ni registrar consumos**; el técnico original conserva el acceso. Y nadie se entera, porque la operación responde correctamente.

**Por qué los tests no lo detectan:** `persistOrderOptimistically` tiene un camino alternativo que usa `manager.save()` cuando el manager no expone `createQueryBuilder`. Ese camino sí persiste todo, y es el que se ejercita con mocks. El defecto solo existe contra una base real.

## 2. Por qué esto va primero y solo

`persistOrderOptimistically` es **el cuello de botella físico de toda corrección de una OT**. Mientras su `UPDATE` no escriba los campos corregibles, ninguna propagación desde la agenda funcionará, por bien diseñada que esté. Por eso este tramo es a la vez un bug que corregir y el requisito de todo lo que viene después.

## 3. Pasos

1. Hacer que la persistencia escriba **los campos que cada comando declara mutar**, no solo los siete actuales. `assign()` debe persistir el técnico y la cuadrilla.

2. **No amplíes el `UPDATE` a «todos los campos» sin criterio.** El conjunto acotado de hoy, aunque provocó este defecto, protege por accidente contra mutaciones no intencionadas: una escritura amplia haría que cualquier cambio en memoria llegue a la base, incluidos los que un comando no pretendía tocar. Elige el mecanismo que haga **explícito por comando** qué se persiste, y justifícalo en el informe.

3. **Conserva el control de concurrencia optimista.** El `WHERE` por `version` y el `VERSION_CONFLICT` cuando no afecta exactamente una fila no se tocan: son la garantía de que dos actores no se pisan.

4. Revisa si **algún otro comando** muta en memoria un campo que el `UPDATE` no escribe. Si lo hay, es el mismo defecto con otro nombre: repórtalo, y corrígelo si cabe en este alcance.

## 4. Tests

5. **CA-01 — contra base real, no contra la respuesta.** Tras `assign()`, releer la OT **desde la base** y comprobar que el técnico es el nuevo. Un test que valide el objeto devuelto pasaría hoy y no probaría nada.
6. **CA-02 — el criterio que de verdad importa.** El técnico reasignado **puede** iniciar la OT y registrar consumos; el anterior **no**. Es la consecuencia real del defecto, y la que el usuario percibe.
7. **CA-03** — ampliar la persistencia no habilita mutaciones no intencionadas: un comando que no declara tocar un campo no lo escribe.
8. El test de CA-01/CA-02 debe ejercitar el camino de `createQueryBuilder`, no el de `manager.save()` con mocks. **Un mock que no distinga ambos caminos reproduce el falso verde que ocultó el defecto.** Hay un spec de integración contra Postgres en el módulo: es el sitio natural.
9. Conteo real: jest directo, `--ci --runInBand`, sin turbo y sin `--passWithNoTests`. La suite de `tasks` no baja de **617**.

## 5. Restricciones no negociables

- **No abras `PATCH` sobre la OT.** La corrección de ventana, sitio y tipo de trabajo entra por la agenda (ADR-090 (propuesto) §D1) y es T1. Aquí solo se arregla la persistencia.
- **No toques la propagación, la cancelación ni el reconciliador.** Son T1, T2 y T3.
- **No toques `@iwana/shared`**: no hay cambio de contrato.
- **No relajes el control de concurrencia** para simplificar el `UPDATE`.
- **Sin PII real** en fixtures ni tests.
- Si al ampliar la persistencia descubres otra ruta donde el **control de acceso se decide sobre datos no persistidos**, **detente y emite `[BLOQUEO]`**: eso es dictamen de `sec-eng`, no decisión del ejecutor.

## 6. Entregables

- Persistencia que escribe lo que cada comando declara.
- Tests de CA-01 a CA-03, con el de integración contra base real.
- Informe de fase en `docs/informes/` con el mecanismo elegido en el paso 2 y su justificación, más cualquier otro comando afectado por el mismo defecto.

## 7. Stop/go

**GO si y solo si:**

- Tras `assign()`, el técnico leído **desde la base** es el nuevo (CA-01).
- El técnico reasignado **puede** iniciar la OT y el anterior **no** (CA-02).
- Ningún comando persiste campos que no declara (CA-03).
- El control de concurrencia optimista sigue intacto.
- Suite de `tasks` sin regresión, con conteo real.

**NO-GO si:** el test se apoya en el camino de `manager.save()` con mocks. Ese es exactamente el falso verde que mantuvo el defecto invisible, y validarlo así lo dejaría abierto con apariencia de cerrado.
