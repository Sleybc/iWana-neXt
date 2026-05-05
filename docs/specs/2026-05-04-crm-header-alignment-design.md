# 2026-05-04 — CRM header alignment

**Tipo:** SPEC correctivo  
**Estado:** En revision  
**Fecha:** 2026-05-04  
**Modulo:** Portal empresarial CRM (`apps/portal/src/components/crm/**`)

## 1. Contexto

Durante la revision visual del portal se detecto un drift espacial en vistas CRM: el `PageHeader` superior y el contenedor principal inmediatamente inferior no comparten el mismo marco horizontal. El resultado es una desalineacion visible entre el bloque del titulo y la card operativa principal, especialmente evidente en:

- `CrmOverviewClient`
- `SubscribersListClient`

La misma composicion aparece en otras vistas del modulo CRM, por lo que la correccion debe aplicarse como patron del modulo y no como parche aislado de una sola pantalla.

## 2. Problema

Hoy varias vistas CRM renderizan:

1. `PageHeader` como bloque superior independiente.
2. Un contenedor principal debajo con `px-6` o `mx-6`.

Eso provoca que el header use un ancho visual distinto al del panel principal. En pantallas donde el primer contenedor inferior ya esta enmarcado por gutter horizontal, el titulo queda fuera de ese mismo eje y no se alinea con los demas contenedores del sistema.

## 3. Objetivo

Unificar el marco horizontal del modulo CRM para que:

- el borde izquierdo del `PageHeader` coincida con el borde izquierdo del panel principal;
- el borde derecho del `PageHeader` coincida con el borde derecho del panel principal;
- el patron se mantenga consistente entre overview, listados y vistas CRM que reutilicen la misma composicion;
- no se altere el contrato global de `PageHeader`.

## 4. Enfoque aprobado

### Opcion A — Ajuste localizado por modulo CRM

Mantener `PageHeader` sin cambios y envolver header + contenido principal dentro del mismo gutter externo por vista.

**Ventajas:** minimo riesgo, corrige el problema real, evita regresiones globales.  
**Desventajas:** la regla queda aplicada a nivel de modulo y no dentro del componente base.  
**Decision:** **aprobada**.

### Opcion B — Cambiar `PageHeader` global

Mover la regla de gutter al componente compartido.

**Ventajas:** centraliza el patron.  
**Desventajas:** puede romper pantallas no CRM ya alineadas correctamente.  
**Decision:** descartada.

### Opcion C — Crear wrapper CRM nuevo

Introducir una primitive adicional solo para layout externo del modulo.

**Ventajas:** deja el patron mas explicito.  
**Desventajas:** agrega estructura nueva para un problema espacial acotado.  
**Decision:** descartada.

## 5. Alcance

### Incluido

- Vistas CRM con `PageHeader` seguido de panel principal enmarcado:
  - `apps/portal/src/components/crm/CrmOverviewClient.tsx`
  - `apps/portal/src/components/crm/subscribers/SubscribersListClient.tsx`
  - `apps/portal/src/components/crm/subscribers/SubscribersLandingClient.tsx`
  - `apps/portal/src/components/crm/subscribers/SubscriberDetailClient.tsx`
  - `apps/portal/src/app/dashboard/crm/expedientes/page.tsx`
- Ajustes de wrapper exterior (`px-6`, `mx-6`, `space-y-6`) estrictamente necesarios para alinear header y primer panel.

### Excluido

- Cambios a `apps/portal/src/components/layout/PageHeader.tsx`
- Cambios de copy, CTA, filtros, tablas o jerarquia interna de cards
- Cambios en contratos API, comportamiento de formularios o logica de negocio

## 6. Diseno tecnico

### 6.1 Regla de composicion

Las vistas CRM afectadas deben usar un mismo wrapper horizontal para el `PageHeader` y el contenido principal inmediato.

Patron objetivo:

```tsx
<div className="space-y-6 pb-6">
  <div className="px-6 space-y-6">
    <PageHeader ... />
    <ContenedorPrincipal />
  </div>
</div>
```

Cuando la vista use `mx-6` en cards sueltas, la correccion puede consistir en mover ambas piezas al mismo wrapper o en normalizar el primer bloque de contenido para que comparta el mismo gutter del header. La prioridad es la alineacion visual, no imponer una unica implementacion interna.

### 6.2 Regla de seguridad

La correccion solo afecta el layout exterior del modulo CRM:

- sin tocar espaciado interno de cards salvo que sea imprescindible para conservar continuidad visual;
- sin alterar estados, paginacion, formularios, tablas o loading;
- sin cambiar `PageHeader` global ni prop API.

### 6.3 Patron del modulo

Si durante la barrida aparece otra vista CRM con el mismo anti-patron (`PageHeader` fuera del gutter y panel principal dentro de `px-6`/`mx-6`), se corrige en la misma pasada para no dejar el modulo inconsistente.

## 7. Validacion

El correctivo se considera cerrado cuando se cumple todo lo siguiente:

1. `CrmOverviewClient` y `SubscribersListClient` quedan alineados visualmente con sus paneles principales.
2. Las vistas CRM incluidas en el alcance no conservan el anti-patron de header fuera del marco horizontal del contenido principal.
3. `pnpm --filter @iwana/portal typecheck`, `test` y `lint` permanecen en verde.
4. El informe vivo `docs/informes/INFORME-MOD02-DASHBOARD-EMPRESA-v1.0.md` incorpora una nota breve de este correctivo visual.

## 8. Riesgos y mitigacion

| Riesgo | Mitigacion |
|---|---|
| Cambiar una pantalla ya alineada | Limitar la barrida a vistas CRM con el patron exacto header + panel principal desalineado |
| Introducir doble gutter | Revisar por vista si conviene envolver ambos bloques o mover el gutter al wrapper compartido |
| Convertir el ajuste en refactor global | Mantener `PageHeader` intacto y encapsular el cambio en CRM |

## 9. Resultado esperado

El modulo CRM debe recuperar un alineamiento horizontal consistente entre el bloque de titulo y el primer contenedor operativo, de forma equivalente a los demas contenedores del sistema, sin introducir cambios globales en el header compartido.
