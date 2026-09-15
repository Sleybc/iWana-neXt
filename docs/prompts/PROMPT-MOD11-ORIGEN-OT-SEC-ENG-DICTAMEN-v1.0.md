# PROMPT DE EJECUCIÓN — MOD11 Origen de la OT · Dictamen de seguridad sobre `CREATED`

**Versión:** 1.0
**Fecha:** 2026-09-14
**Generado por:** AI-EM-ARCH
**Agente destinatario:** **AI-SEC-ENG** (`sec-eng`)
**Estado:** **Ejecutable.** Precede a G1: el CTO condicionó la aprobación de ADR-091 (propuesto) a este dictamen.
**Naturaleza:** revisión de diseño. **No se escribe código ni se modifica el comportamiento.**

## Vínculos de trazabilidad

- ADR marco: [ADR-091](../adrs/ADR-091-Origen-de-la-OT-Despacho-y-Agenda-Actos-Separados.md) (propuesto) §D3 y fila de Seguridad
- Spec: `docs/specs/2026-09-14-mod11-origen-ot-design.md` v1.0 — **§3.6 es el objeto del dictamen**
- Plan: `docs/plans/2026-09-14-mod11-origen-ot.md` v1.0
- Relacionado: [ADR-047](../adrs/ADR-047-Separacion-Programacion-y-OT-Ejecucion.md) (Aprobado) · [ADR-076](../adrs/ADR-076-Unicidad-Trabajo-Campo-Activo-Por-Origen.md) (Aprobado)

---

## 1. Qué se te pregunta

ADR-091 (propuesto) vuelve alcanzable el estado `ExecutionOrderStatus.CREATED` —una OT despachada, **sin técnico y sin cuadrilla**—, que hoy nunca ocurre.

**El control de acceso ya contempla ese estado y lo excluye**, en dos sitios que replican la misma regla:

- `assertActorAccess` (`execution-orders.service.ts`): `isUnassignedPool = isUnassigned && isTechnician && order.status !== ExecutionOrderStatus.CREATED`
- el `WHERE` de `list()`: `assigned_technician_id IS NULL AND assigned_crew_id IS NULL AND status <> 'CREATED'`

Como `CREATED` es inalcanzable hoy, **esa exclusión no protege nada**: es una guarda escrita para un caso que nunca se produce. Al volverlo alcanzable, la guarda despierta.

**Dictamina cuál de las dos salidas es correcta, y con qué controles.**

| Salida | Riesgo que introduce |
| --- | --- |
| **Mantener la exclusión** | La OT despachada sin asignar es invisible para todo técnico: nadie puede reclamarla. La bolsa existe solo para supervisión |
| **Incluir `CREATED` en el pool** | Cualquier técnico o contratista del tenant ve **todo** el trabajo despachado: esa rama **no impone alcance por sede** |

## 2. Lo que debes verificar por ti mismo

No des por buena la lectura anterior. En particular:

1. **Que ambos sitios digan de verdad lo mismo.** La lista y `assertActorAccess` replican la regla en lenguajes distintos —SQL y TypeScript—. Una divergencia produce filas listadas que dan 404 al abrirse, o lo contrario: filas ocultas que sí son accesibles por id.
2. **Si hay un tercer sitio.** Busca toda ruta donde el acceso a una OT se decida sobre `assignedTechnicianId`, `assignedCrewId` u `organizationSiteId`, incluidas las de evidencias, consumos, actividades y el portal. La regla puede estar replicada en más de dos lugares.
3. **Qué alcance impone hoy `organization_site_id`.** Existe en la OT desde la migración 098 y sobrevive sin evento de agenda, pero **la lectura lo trata como filtro opcional de consulta, no como alcance impuesto**. Confirma si es así: de ello depende que «acotar por sede» sea configuración o trabajo nuevo.
4. **`CONTRACTOR` frente a `TECHNICIAN`.** Comparten rama en la regla del pool. Si el contratista es un tercero, ver todo el trabajo despachado del tenant no es el mismo riesgo que para un empleado.
5. **Qué ve el actor sin rol de supervisión en la respuesta**, no solo si puede abrirla: dirección de servicio, etiqueta de cliente y suscriptor son dato personal.

## 3. Restricciones

- **Eres auditor de solo lectura.** No modifiques código, migraciones ni contratos. El dictamen es el entregable.
- **No decidas por el CTO la bandeja operativa.** Si tu dictamen depende de si la bolsa es para supervisión o para técnicos, dilo como condición y no elijas tú.
- Si al revisar encuentras que **el acceso a una OT se decide hoy sobre datos no persistidos**, es hallazgo de severidad propia y va en el informe aunque quede fuera de esta pregunta. Existe un defecto conocido de esa familia en `assign()` (tramo T0 de la spec hermana): no lo repitas como hallazgo nuevo, pero **sí reporta cualquier otro**.
- Sin PII real en ejemplos.

## 4. Entregable

Informe en `docs/informes/` con:

1. **Veredicto**: cuál de las dos salidas, y por qué.
2. **Controles exigidos** para que esa salida sea aceptable —si alguno es trabajo nuevo y no configuración, dilo explícitamente.
3. **Inventario de los sitios** donde la regla está replicada, con ruta y línea.
4. **Hallazgos por severidad**, separando lo que bloquea la aprobación de ADR-091 (propuesto) de lo que es deuda.
5. **Condiciones que dependan de una decisión del CTO**, enunciadas como tales.

## 5. Stop/go

**GO si:** el veredicto está fundado en lectura del código —no en la descripción de este prompt—, el inventario de sitios replicados está completo, y cada control exigido dice si es configuración o trabajo nuevo.

**NO-GO si:** el dictamen se limita a repetir el planteamiento de §1 sin verificar los dos sitios, o si elige la salida asumiendo quién debe usar la bolsa en vez de declararlo como condición.
