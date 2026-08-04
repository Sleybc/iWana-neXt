# PROMPT DE EJECUCIÓN — Unicidad de trabajo de campo activo (anti-duplicación de visitas)

**Módulo:** MOD09 Programación / WFM
**Código:** MOD09-ANTIDUP
**Fase:** ANTIDUPLICACION-VISITAS · Corte C-A
**Versión:** 1.0
**Fecha:** 2026-08-04
**Generado por:** AI-EM-ARCH (modo Architect + Orchestrator)
**Agentes destinatarios:** AI-SR-FULL (backend), AI-FE-PLATFORM (portal)
**Revisor obligatorio:** AI-SR-QA
**Consulta:** AI-PROD-UX (copy y estados), AI-DS-OWNER (solo si falta variante de chip)
**ADR habilitante:** [ADR-076](../adrs/ADR-076-Unicidad-Trabajo-Campo-Activo-Por-Origen.md)
**Spec de experiencia:** [2026-08-04-mod09-antiduplicacion-visitas-ux-spec.md](../specs/2026-08-04-mod09-antiduplicacion-visitas-ux-spec.md)
**Informe de origen:** [INFORME-MOD09-DUPLICACION-AGENDAMIENTO-VISITAS-v1.0.md](../informes/INFORME-MOD09-DUPLICACION-AGENDAMIENTO-VISITAS-v1.0.md)

---

## 0. Contexto (ya diagnosticado — no repetir el análisis)

`/dashboard/scheduling/pending-visits` permite agendar dos veces el mismo trabajo real.
El diagnóstico completo está en el informe de origen; **no lo rehagas**.

Lo esencial: la unicidad del trabajo de campo se ancló en `visit_requests`, un artefacto
**previo** a la agenda. `SCHEDULED` está excluido del predicado del índice único
(`035_harden_visit_requests_indexes.ts:23-28`) y del conjunto de duplicados activos
(`visit-requests.service.ts:66-71`), de modo que en cuanto el trabajo queda agendado el
sistema vuelve a creer que ese origen no tiene nada activo.

Cuatro rutas verificadas desembocan en dos eventos + dos órdenes de trabajo + dos
órdenes de ejecución para un solo trabajo real (V1, V3, V4, V5 del informe), y una
quinta (V8) despacha visitas para casos ya resueltos por canal remoto.

**El eje de unicidad correcto es la unidad de trabajo de origen** — expediente o
ticket — **nunca el suscriptor ni el nodo** (ADR-076 D1). Un mismo suscriptor puede
tener legítimamente una instalación de segundo servicio y un ticket de soporte
simultáneos; un mismo nodo, una falla de fibra y un mantenimiento programado.

---

## 1. Objetivo exacto de la fase

**Resultado esperado:** para una misma unidad de origen y tipo de trabajo no puede
existir más de un trabajo de campo activo, salvo que una persona lo declare
explícitamente y deje motivo trazable. Y ningún camino de la interfaz deja al operador
en un estado sin salida que lo empuje a duplicar.

### Lo que sí entra

| # | Alcance | Rol |
| --- | --- | --- |
| E0 | **Tests de no regresión de trabajo legítimo, escritos ANTES de cualquier guarda** | AI-SR-QA |
| E1 | Cierre del ciclo de vida: cancelar evento y `moveToPending` dejan solicitud + orden de trabajo + orden de ejecución consistentes | AI-SR-FULL |
| E2 | Ampliación de `ExecutionOrderSchedulingPort` con cancelación desde agenda | AI-SR-FULL |
| E3 | Guarda de dominio por unidad de origen en creación y agendamiento, con `pg_advisory_xact_lock` al inicio de la transacción y respuesta `409` con referencia operativa | AI-SR-FULL |
| E4 | Bloqueo pesimista en `scheduleVisitRequest` | AI-SR-FULL |
| E5 | Marca explícita de visita adicional con motivo obligatorio, persistido y auditado | AI-SR-FULL |
| E6 | Normalización (`trim`) de `origin_ref` en persistencia y comparación | AI-SR-FULL |
| E7 | CTA de origen consciente del estado (spec §4) | AI-FE-PLATFORM |
| E8 | Advertencia de colisión en el diálogo de confirmación con salida justificada (spec §5) | AI-FE-PLATFORM |
| E9 | Contrato OpenAPI actualizado para `409` y para la marca de visita adicional | AI-SR-FULL |

### Lo que NO entra en este corte

- **Índice único sobre `schedule_events`** (ADR-076 D2.3). Está condicionado a que E1–E4
  estén en producción y exista migración de limpieza por tenant. Corte posterior.
- Indicador derivado en el listado, chip de bandeja y filtro (spec §6 y §9, corte C-B):
  exigen ampliar el contrato de listado.
- Retiro de solicitud por resolución remota (spec §10, corte C-C): exige ampliar
  `AssuranceFieldServicePort`.
- Cualquier cambio en el eje de unicidad hacia `subscriber_id`, `contract_id` o
  `subject_ref_id`. **Está prohibido por ADR-076 regla 1.**
- Reescribir la bandeja o el flujo de despacho. Este corte no rediseña nada.

---

## 2. Artefactos de entrada obligatorios

- **ADR habilitante:** ADR-076 — reglas de implementación 1 a 10 son el contrato
- **Spec de experiencia:** §4 y §5 para E7/E8; §2 para la taxonomía de copy
- **Informe:** vectores V1 a V8, con archivo:línea
- **ADRs vigentes:** ADR-037 (boundaries WFM), ADR-039 (reglas 5-7), ADR-047 y ADR-068
  (contrato MOD09↔MOD11), ADR-066 (migraciones no transaccionales)
- **Código backend:** `apps/api/src/modules/wfm/services/visit-requests.service.ts`,
  `schedule-events.service.ts`, `work-orders.service.ts`,
  `apps/api/src/modules/tasks/ports/execution-order-scheduling.port.ts`
- **Código portal:** `apps/portal/src/components/scheduling/ScheduleVisitRequestConfirmDialog.tsx`,
  `visit-request-origin-orchestration.ts`, `ExpedienteSchedulingActions.tsx`,
  `scheduling-visit-request-sync.ts`
- **Skills:** `nestjs-expert`, `postgresql`, `database-migration`, `testing-patterns`,
  `test-driven-development`, `core-components`, `tailwind-patterns`,
  `system-vocabulary-review`, `frontend-dev-guidelines`

---

## 3. Orden de ejecución y por qué

**El orden no es negociable.**

1. **E0 primero.** Los tests de no regresión de trabajo legítimo se escriben y pasan
   *antes* de introducir ninguna guarda. Sin esa red, cualquier guarda puede bloquear
   trabajo válido sin que nadie lo note.
2. **E1 + E2 después.** Mientras cancelar un evento deje la solicitud en un estado sin
   salida, el operador seguirá siendo empujado a duplicar aunque la guarda exista. Y
   mientras `moveToPending` genere órdenes huérfanas, cualquier índice único futuro
   fallará al crearse contra datos reales.
3. **E3 + E4 + E5 + E6.** La guarda propiamente dicha.
4. **E7 + E8.** La experiencia, encima de un servidor que ya rechaza.
5. **E9** al cierre.

---

## 4. Restricciones duras

1. **Boundaries.** La guarda de dominio consulta únicamente `schedule_events`, tabla de
   la que WFM es owner. Prohibida cualquier lectura de tablas de CRM, Assurance, Tasks o
   Inventario (ADR-037 regla 2, ADR-076 regla 2).
2. **La guarda vive en el servidor.** La verificación de cliente existente en
   `PendingVisitRequestsView.tsx:526-542` se conserva como mejora de experiencia, jamás
   como control. El `409` debe producirse aunque el cliente la omita.
3. **El advisory lock se toma al inicio de la transacción**, antes de cualquier lectura
   de validación, con clave derivada de la unidad de origen. No reutilices la clave
   `(tenant, fecha)` de `work-orders.service.ts:77`: protege el consecutivo, no la
   unicidad de negocio.
4. **Nada de UUID como información principal** en mensajes visibles (ADR-039 regla 7).
   El `409` devuelve la referencia operativa del trabajo existente.
5. **Multi-tenant.** Todo acceso resuelve tenant desde contexto aprobado y usa
   `SET LOCAL search_path` por transacción. Nunca hardcodear schema.
6. **Sin PII** en logs, mensajes de error ni notas de orden de trabajo más allá del
   nombre de cliente que la bandeja ya muestra.
7. **Migraciones reversibles.** Si E5 requiere columna nueva, la migración tenant lleva
   `down` funcional y numeración correlativa.

---

## 5. Trampas conocidas de este código

- `schedule-events.service.spec.ts:615-681` **congela el comportamiento defectuoso de
  `moveToPending` como si fuera el contrato**. Al corregir E1 ese test romperá. Es
  correcto: reescríbelo, no lo adaptes para que siga pasando.
- `visit-requests.service.spec.ts:313-357` prueba solo el manejo del error `23505` con
  el driver simulado. El índice real nunca se ejecuta. No lo tomes como evidencia de que
  la deduplicación funciona.
- La idempotencia de MOD11 es **por `scheduleEventId`**. Si `moveToPending` genera un
  evento nuevo al reagendar, esa idempotencia no te protege: conservar el mismo
  `scheduleEventId` es más barato que cancelar y recrear.
- `execution_order_idempotency_records` cubre comandos de ejecución, **no** la creación
  desde agenda. No asumas cobertura que no existe.
- `runInTenantSchema` abre transacción sin nivel explícito: es READ COMMITTED. No
  intentes resolverlo elevando el aislamiento (ADR-076 A4).
- El contenedor de "Advertencias operativas" de `ScheduleVisitRequestConfirmDialog.tsx:121-130`
  ya existe y duplica `PortalAlert` con clases `amber` locales. Consolídalo al implementar
  E8 en lugar de añadir un tercer patrón.

---

## 6. Criterios de aceptación

### Backend

1. Crear una solicitud para una unidad de origen que ya tiene trabajo activo responde
   `409` con la referencia operativa del trabajo existente, no crea fila nueva.
2. Lo mismo al intentar agendar.
3. Con la marca explícita de visita adicional y motivo, la operación procede; el motivo
   queda persistido, auditado con actor y propagado a la orden de trabajo.
4. Sin motivo, la marca de visita adicional se rechaza con mensaje accionable.
5. Dos agendamientos concurrentes sobre la misma solicitud producen **exactamente** un
   evento, una orden de trabajo y una orden de ejecución, y no dejan al técnico
   doble-agendado.
6. Cancelar un evento deja la solicitud reprogramable y cancela orden de trabajo y orden
   de ejecución en la misma transacción.
7. `moveToPending` seguido de reagendar no produce más de una orden activa ni deja
   órdenes huérfanas.
8. `origin_ref` con espacios colisiona con su forma normalizada.

### No regresión (E0 — bloqueante)

9. Reinstalar tras cancelar sigue siendo posible.
10. Dos tickets simultáneos del mismo suscriptor generan dos visitas sin bloqueo.
11. Dos tickets sobre el mismo nodo generan dos trabajos sin bloqueo.
12. Un trabajo manual sin ticket no queda bloqueado.

### Portal

13. Los criterios de aceptación de la spec §4.3 (E1 de spec, seis criterios) y §5.9
    (E2 de spec, nueve criterios) se cumplen íntegros.
14. El camino feliz sin colisión no cambia: mismo texto de botón, sin campo de motivo,
    sin alerta.

### Transversales

15. `pnpm lint`, `pnpm typecheck` y `pnpm test` en verde **con `Cached: 0`** en los
    paquetes tocados. Un `pnpm test` verde desde caché de turbo no es evidencia.
16. Cobertura ≥80% en el servicio tocado.
17. OpenAPI actualizado para `409` y para la marca de visita adicional.
18. Gates G6.5 de [ADR-069](../adrs/ADR-069-Gates-G6.5-Merge-Readiness.md) satisfechos.

---

## 7. Evidencia obligatoria de cierre

- Salida de tests con `Cached: 0` visible.
- Test de concurrencia con su aserción de conteo.
- Los cuatro tests de no regresión (criterios 9 a 12) nombrados explícitamente.
- Captura o traza del `409` con su cuerpo de respuesta.
- Verificación en navegador de E7 y E8 en 375 px y escritorio, claro y oscuro.
- Actualización de este informe:
  `docs/informes/INFORME-MOD09-DUPLICACION-AGENDAMIENTO-VISITAS-v1.0.md` → sección de
  cierre con el estado de cada vector (V1 a V8: cerrado / diferido / abierto).

---

## 8. Cuándo detenerte y consultar

Detente y escala a AI-EM-ARCH si:

- Concluyes que la guarda necesita leer tablas de otro bounded context.
- Encuentras que el eje de unicidad por unidad de origen produce falsos positivos sobre
  un caso operativo real no previsto en ADR-076.
- La corrección de E1 exige cambiar el contrato MOD09↔MOD11 más allá de la cancelación
  ya aprobada.
- Detectas duplicados preexistentes en datos que impidan avanzar sin migración de
  limpieza.

No inventes tokens, variantes de componente ni vocabulario de producto: eso se solicita
a AI-DS-OWNER y AI-PROD-UX respectivamente.
