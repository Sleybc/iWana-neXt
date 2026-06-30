# INFORME: Separacion de Resumen operativo y Agenda en Programacion

**Version:** 1.0  
**Estado:** Completado  
**Fecha:** 2026-06-09  
**Modulo:** WFM Programacion (Portal)  
**Plan ejecutado:** `Resumen Operativo Para Programación y Separación de Agenda`  
**Responsable de ejecucion:** Sr. Dev Fullstack

---

## 1. Resumen ejecutivo

Se separo la experiencia de `Programación` en dos superficies con responsabilidades claras:

1. `/dashboard/scheduling` ahora funciona como dashboard raiz con enfoque de `Resumen operativo`.
2. `/dashboard/scheduling/agenda` concentra la agenda completa, creacion, detalle y despacho.
3. `/dashboard/scheduling/pending-visits` conserva la bandeja operativa y entrega el handoff hacia `Agenda`.

Resultado alcanzado: se elimino la duplicidad entre dashboard y calendario, y se dejo una sola superficie de verdad para programar.

---

## 2. Entregables implementados

### Frontend

1. Se agrego la nueva ruta `apps/portal/src/app/dashboard/scheduling/agenda/page.tsx`.
2. La ruta raiz `apps/portal/src/app/dashboard/scheduling/page.tsx` ahora monta `SchedulingClient` en modo `dashboard`.
3. `SchedulingClient` se refactorizo para soportar `surface="dashboard" | "agenda"`.
4. Se creo `SchedulingDashboard` para componer KPIs, decisiones pendientes, riesgos y estado de jornada.
5. Se movio el handoff desde pendientes y CRM hacia `/dashboard/scheduling/agenda`.
6. Se mantuvo la agenda completa solo en la subruta `agenda`.

### Navegacion y handoff

1. `pending-visits` ahora abre `Agenda` con query state estable.
2. Los deep links de CRM para crear instalaciones abren directamente la agenda.
3. Los roles `TECHNICIAN` y `CONTRACTOR` son redirigidos desde el dashboard raiz hacia la agenda.

### Testing

1. Se actualizaron pruebas unitarias de `SchedulingClient`, `PendingVisitRequestsView` y `expediente-scheduling`.
2. Se alinearon las pruebas E2E de scheduling con la nueva arquitectura de rutas y superficies.

---

## 3. Evidencia funcional

Flujos cubiertos en la implementacion:

1. Entrar a `/dashboard/scheduling` como rol de coordinacion y ver `Programación` como dashboard.
2. Abrir `Agenda` desde el dashboard con CTA dedicado.
3. Entrar a `/dashboard/scheduling` como `TECHNICIAN` o `CONTRACTOR` y aterrizar en agenda.
4. Abrir una solicitud pendiente y despacharla hacia `Agenda`.
5. Abrir agenda desde CRM para crear una instalacion con contexto precargado.

---

## 4. Evidencia de calidad

### Unit tests

Comando:

```bash
pnpm --dir apps/portal test -- src/components/scheduling/SchedulingClient.spec.tsx src/components/scheduling/PendingVisitRequestsView.spec.tsx src/components/crm/expedientes/expediente-scheduling.spec.ts
```

Resultado:

1. `15` pruebas aprobadas.
2. `0` fallas.

### Typecheck

Comando:

```bash
pnpm --dir apps/portal typecheck
```

Resultado:

1. Sin errores de TypeScript en `apps/portal`.

### E2E

1. Se actualizaron los contratos E2E de la suite `portal-wfm-scheduling.spec.ts`.
2. No se ejecuto la suite E2E completa en esta corrida.

---

## 5. Cambios documentales

1. Nuevo informe: `docs/informes/INFORME-WFM-PROGRAMACION-RESUMEN-OPERATIVO-AGENDA-v1.0.md`
2. PRD/HLD/spec funcionales del modulo quedan pendientes de consolidacion documental fina si se requiere trazabilidad formal adicional.

---

## 6. Riesgos y observaciones

1. La suite E2E completa no fue ejecutada en esta corrida, aunque sus expectativas principales quedaron alineadas.
2. El workspace tiene cambios previos no relacionados; no se revirtieron.

---

## 7. Estado final

**Completado**

1. `Programación` ya no renderiza la agenda completa en la raiz.
2. `Agenda` vive en subruta dedicada.
3. `Pending visits` despacha hacia la nueva agenda central.
