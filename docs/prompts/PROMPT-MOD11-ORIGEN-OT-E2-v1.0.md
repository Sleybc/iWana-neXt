# PROMPT DE EJECUCIÓN — MOD11 Origen de la OT · E2: la puerta de despacho

**Versión:** 1.0
**Fecha:** 2026-09-15
**Generado por:** AI-EM-ARCH
**Agente destinatario:** **AI-SR-FULL** (`sr-backend`) · **C:** `sec-eng` (condición de cierre)
**Estado:** **Ejecutable.** E1 cerrado en GO y auditado; T0 cerrado en GO y auditado.

## Vínculos de trazabilidad

- Plantilla base: `docs/prompts/TEMPLATE-PROMPT-EJECUCION-FASE-MODULO.md` (v1.2, **En revisión**)
- Spec: `docs/specs/2026-09-14-mod11-origen-ot-design.md` v1.0 — **§3.1, §3.6, §3.6.1, §3.6.2 y §3.8 son de lectura obligatoria**
- Plan: `docs/plans/2026-09-14-mod11-origen-ot.md` v1.0
- ADR marco: [ADR-091](../adrs/ADR-091-Origen-de-la-OT-Despacho-y-Agenda-Actos-Separados.md) (Aprobado) §D1, §D3, §D5, §D6 · [ADR-076](../adrs/ADR-076-Unicidad-Trabajo-Campo-Activo-Por-Origen.md) (Aprobado)
- Dictamen de seguridad: `docs/informes/INFORME-MOD11-ORIGEN-OT-SEC-ENG-DICTAMEN-v1.0.md`
- Informe de E1: `docs/informes/INFORME-MOD11-ORIGEN-OT-E1-v1.0.md` — **§6 y §7 son tu punto de partida**

---

## 1. Qué abre E2

E1 dejó el esquema listo: `schedule_event_id` y `planned_window_*` admiten nulo, y la identidad vive en `(tenant_id, origin_context, origin_ref, work_type)` con guarda en base e índice parcial.

**Pero todavía nadie crea una OT sin cita.** El único constructor sigue siendo el puerto de agenda, con evento y ventana obligatorios en su input. E2 abre el acto de **despachar**: la OT nace de la necesidad —origen, tipo de trabajo y sitio—, y la ventana llega después (E3).

## 2. Lo que ya está decidido y no se reabre

| Decisión | Fuente |
| --- | --- |
| `CREATED` queda **fuera del pool reclamable**; la bolsa es **de supervisión** | Dictamen `sec-eng` + ADR-091 §D6 c.1 |
| **La sede es obligatoria** al despachar | ADR-091 §D6 c.3 |
| El contratista tiene **paridad** con el técnico | ADR-091 §D6 c.2 |
| La identidad es la de ADR-076, no el evento | ADR-091 §D2 |

Si alguna te parece equivocada durante la ejecución, es `[CONSULTA]` a AI-EM-ARCH, **no** decisión tuya.

## 3. Pasos

1. **Relaja el input del puerto y reutiliza la guarda.** E1 dejó `findActiveExecutionOrderByOrigin` explícitamente reutilizable (informe E1 §7, P1). **No la dupliques**: el despacho y la agenda comparten una sola guarda de unicidad. El input de agenda deja de exigir evento y ventana como obligatorios; el camino de agenda sigue pasándolos y su comportamiento no cambia.

2. **Abre la creación por despacho** con `originContext` **explícito** y `organizationSiteId` **obligatorio**. Nada de heredar el default `MANUAL`: ese default es hoy lo que hace indistinguible «se creó a mano» de «nadie declaró nada». Sin sitio, la OT nace muerta —`assertSupervisionScope` es fail-closed y ningún comando de coordinación podría moverla—, así que se **rechaza**.

3. **Decide los dos huecos de §3.8 y justifícalos en el informe.** No los heredes:
   - **`PROVISIONING` no tiene camino**: o se le da uno, o se retira. Una etiqueta que la UI ofrece y nada produce es deuda que se arrastra.
   - **El salto que pierde el origen real**: una tarea nacida en `BILLING` o `SYSTEM` llega a la OT como `TASKS`. Conserva el origen de primer nivel o acepta la pérdida — explícitamente.

4. **Sustituye los dos tripwires que E1 dejó.** Están en `toListItem` (servicio) y en el detalle del controlador, y hoy lanzan `Error` pelado. **En cuanto exista la primera OT sin ventana dejan de ser inalcanzables**, y la asimetría importa: el del detalle rompe una pantalla; **el de la lista rompe la consola entera, para todos, con un 500**.

   Las rutas de lectura deben **tolerar el nulo y devolver 200**. Eso toca el contrato en `@iwana/shared`: los campos de evento y ventana pasan a admitir nulo en la respuesta.

5. **Inventaria qué rompe en el portal.** Hacer nulable el contrato es seguro en el servidor y **puede romper el cliente** si alguna vista asume cadena. No lo arregles —es E4—, pero **déjalo listado con ruta**, o E4 lo descubrirá en producción.

## 4. Tests

6. **CA-05** — se crea una OT con origen, tipo de trabajo y **sitio**, sin ventana y sin técnico, y nace en `CREATED`. **Despachar sin sitio se rechaza**; despachar sin `originContext` explícito se rechaza.
7. **CA-06 — verificado desde la agenda, no desde la OT.** La OT sin cita **no reserva ni consume capacidad**: el técnico sigue pudiendo recibir un evento en ese rango. Comprobarlo desde MOD11 no prueba nada.
8. **CA-07** — asignarle técnico la lleva a `ASSIGNED` y **persiste de verdad** (apoyado en T0; verifica contra base).
9. **CA-08 — por negación y en los cinco sitios.** Una OT en `CREATED` **no aparece en el pool reclamable** de técnicos **ni de contratistas**. Los cinco sitios de la spec §3.6.2 —`assertActorAccess`, el `WHERE` de `list()`, `computeAllowedActions`, el guard y el oracle de test— deben **coincidir**. Comprobar solo que el supervisor la ve deja el hallazgo abierto.
10. **CA-08b** — una OT en `CREATED` **con sitio** es asignable por un supervisor con alcance sobre esa sede, y **no** por uno sin él.
11. **CA-08c** — el despacho rechaza un origen sin camino y conserva la trazabilidad que decidiste en el paso 3.
12. **La consola no se cae.** Con al menos una OT sin ventana viva, el listado responde **200** y el detalle responde **200**. Este es el test que separa «E2 funciona» de «E2 rompió la operación».
13. Conteo real: jest directo, `--ci --runInBand`, sin turbo y sin `--passWithNoTests`. La suite de `tasks` **no baja de 651**.

## 5. Restricciones no negociables

- **No toques el DDL.** E1 agotó la migración; si crees necesitar una, **detente y emite `[BLOQUEO]`**.
- **No debilites el control de capacidad.** La OT sin cita no reserva nada; cuando reciba ventana (E3), el chequeo de conflicto de MOD09 corre **sin excepción ni atajo**. E2 no abre ningún camino que lo eluda.
- **No hagas reclamable la bolsa de `CREATED`.** Está dictaminado. Incluirla exigiría acotar el pool por sede, que es capacidad que **no existe** hoy para técnicos.
- **No construyas pantalla.** El copy y el flujo del despacho son de AI-PROD-UX; E2 entrega la superficie de API.
- **Sin FK cross-module** (ADR-047 regla 6). Toda operación dentro del schema del tenant.
- Sin PII real en fixtures ni tests.
- Si al abrir el despacho aparece **cualquier ruta donde el acceso se decida sobre datos no persistidos**, detente y emite `[BLOQUEO]`: es dictamen de `sec-eng`.

## 6. Entregables

- Puerta de despacho con `originContext` y sitio obligatorios; contrato nuevo en `@iwana/shared`.
- Guarda de unicidad **compartida** con el camino de agenda, sin duplicar.
- Tripwires sustituidos por manejo real; lectura tolerante a nulo.
- Tests CA-05 a CA-08c más el de la consola viva (punto 12).
- Informe en `docs/informes/` con: la decisión del paso 3 y su justificación, el inventario del paso 5 con rutas, y deuda por severidad.

## 7. Stop/go

**GO si y solo si:**

- Se crea una OT sin ventana y sin técnico, en `CREATED`, con sitio y origen explícitos (CA-05).
- Despachar sin sitio o sin origen **se rechaza** (CA-05).
- La OT sin cita **no consume capacidad**, verificado desde la agenda (CA-06).
- `CREATED` **no aparece** en el pool de técnicos ni contratistas, y los **cinco sitios coinciden** (CA-08).
- **Listado y detalle responden 200** con una OT sin ventana viva (punto 12).
- Suite de `tasks` sin regresión (≥ 651), con conteo real.
- **Dictamen de `sec-eng`** confirmando que los cinco sitios quedaron coherentes.

**NO-GO si:** los tripwires siguen en pie cuando ya puede existir una OT sin ventana. Eso no es un tramo incompleto: es la consola caída para todos los usuarios, con la causa escrita por nosotros.
