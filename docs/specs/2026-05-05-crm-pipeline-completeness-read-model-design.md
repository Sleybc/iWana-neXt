# 2026-05-05 — CRM pipeline, completitud y read models

**Tipo:** SPEC correctivo  
**Estado:** Aprobado  
**Fecha:** 2026-05-05  
**Modulo:** CRM MOD05 (`apps/api/src/modules/crm/**`, `apps/portal/src/app/dashboard/crm/**`, `apps/portal/src/components/crm/**`)

## 1. Contexto

La revision del modulo CRM identifico cuatro desalineaciones que ya afectan operacion, arquitectura y trazabilidad:

1. La documentacion del pipeline sigue mezclando referencias de 12 estados aunque el flujo activo del expediente ya opera con 8 estados.
2. La transicion hacia instalacion no refleja la regla operativa deseada: permitir avance desde `EN_COTIZACION` cuando la informacion general del expediente supere el 75%, informando claramente lo pendiente.
3. La completitud del expediente hoy mezcla calculos de backend y frontend y no llega a 100% segun la regla de negocio solicitada: 7 secciones oficiales completas al 100%.
4. CRM mantiene lecturas cross-module y dependencias directas que deben sustituirse por ports/read models para respetar boundaries del modulith.

La correccion debe resolver el drift documental y tecnico en una sola fase, sin abrir una refactorizacion mas amplia fuera del alcance inmediato.

## 2. Objetivo

Alinear documentos, dominio backend y portal CRM para que:

1. El pipeline oficial quede documentado y operando con 8 estados aprobados por CTO.
2. La completitud general del expediente se calcule sobre 7 secciones oficiales y llegue a 100% solo cuando las 7 esten completas.
3. La transicion `EN_COTIZACION -> LISTO_PARA_INSTALACION` se habilite desde 75% de completitud general, con aviso estructurado de faltantes.
4. CRM deje de depender de lecturas directas cross-module en calculo de completitud, timeline y resolucion de actores, usando ports/read models.

## 3. Enfoque aprobado

### Opcion A — Ajuste incremental con backend como fuente de verdad

Corregir reglas de dominio y portal sin tocar boundaries de forma estructural.

**Ventajas:** menor riesgo, menos cambios.  
**Desventajas:** mantiene deuda de acoplamiento y deja correccion arquitectonica incompleta.  
**Decision:** descartada.

### Opcion B — Parche centrado en portal

Corregir solo la representacion UI y las barreras de transicion visibles al usuario.

**Ventajas:** rapido.  
**Desventajas:** mantiene drift entre backend y frontend; no resuelve boundaries.  
**Decision:** descartada.

### Opcion C — Refactor correctivo acotado del agregado expediente

Consolidar en esta fase:

1. pipeline de 8 estados,
2. calculo de completitud por 7 secciones,
3. regla de paso a instalacion desde 75%,
4. sustitucion de lecturas cross-module por ports/read models.

**Ventajas:** deja una sola fuente de verdad, reduce drift y mejora boundaries.  
**Desventajas:** requiere tocar backend, frontend, docs y tests coordinadamente.  
**Decision:** **aprobada**.

## 4. Alcance

### Incluido

1. Actualizacion de ADR/HLD/PRD relacionados al pipeline CRM.
2. Refactor del calculo de completitud del expediente.
3. Ajuste de `StatusTransitionService` para la regla de instalacion.
4. Ajuste del contrato API para exponer completitud, readiness y faltantes.
5. Ajuste del portal CRM para renderizar la fuente de verdad del backend.
6. Reemplazo de lecturas cross-module por ports/read models dentro de CRM.
7. Tests backend/frontend ligados a completitud, transicion y boundaries.

### Excluido

1. Rediseño visual amplio del detalle CRM.
2. Reemplazo total del flujo legacy fuera del expediente activo.
3. Nuevas automatizaciones de instalacion o provisioning.
4. Refactor general del `page.tsx` del expediente mas alla de lo requerido por esta correccion.
5. Cambios de arquitectura fuera de MOD05 y sus contratos inmediatos.

## 5. Reglas funcionales aprobadas

### 5.1 Pipeline oficial

El pipeline oficial del expediente queda documentado y soportado con 8 estados:

1. `NUEVO_POTENCIAL`
2. `PRECALIFICADO`
3. `VALIDANDO_COBERTURA`
4. `EN_COTIZACION`
5. `LISTO_PARA_INSTALACION`
6. `INSTALACION_AGENDADA`
7. `CLIENTE_ACTIVO`
8. `DESCARTADO`

Los estados legacy se mantienen solo como compatibilidad transitoria de lectura si aun existen datos historicos, pero no forman parte del contrato operativo ni del flujo visible.

### 5.2 Secciones oficiales para completitud

La completitud general del expediente se calcula exclusivamente sobre estas 7 secciones:

1. Identificacion
2. Direccion
3. Contacto
4. Viabilidad tecnica
5. Interes del cliente
6. Cumplimiento legal
7. Soportes documentales

### 5.3 Regla de completitud general

1. Cada seccion produce un porcentaje propio.
2. Una seccion llega a 100% solo cuando todos sus campos requeridos estan completos.
3. La completitud general es el promedio uniforme de las 7 secciones.
4. El expediente llega a 100% general solo cuando las 7 secciones estan al 100%.

### 5.4 Regla de paso a instalacion

Transicion afectada: `EN_COTIZACION -> LISTO_PARA_INSTALACION`

1. Si la completitud general es menor a 75%, la transicion se bloquea.
2. Si la completitud general es mayor o igual a 75% y menor a 100%, la transicion se permite.
3. Si la transicion se permite con pendientes, el sistema debe devolver y mostrar una advertencia con secciones y campos faltantes.
4. Si la completitud general es 100%, la transicion se permite sin advertencias pendientes.

### 5.5 Copy aprobado para el aviso

**Titulo:** `Puedes continuar a instalacion con informacion pendiente`  
**Cuerpo:** `La oportunidad ya supera el 75% de completitud general. Aun faltan datos por cerrar en algunas secciones. Recomendamos completarlos lo antes posible para evitar reprocesos en instalacion.`

## 6. Diseno de dominio backend

### 6.1 Nueva fuente de verdad

Se introduce un servicio dedicado, referido en este spec como `ExpedienteSectionCompletenessService`, con las siguientes responsabilidades:

1. Calcular porcentaje por seccion.
2. Calcular completitud general.
3. Resolver faltantes por seccion y por campo.
4. Resolver el estado de readiness para instalacion.

Este servicio reemplaza el modelo actual donde frontend y backend recalculan partes distintas del progreso.

### 6.2 Modelo de salida esperado

El backend debe exponer un resumen estructurado con este shape minimo:

```ts
interface ExpedienteCompletenessSummary {
  sections: Array<{
    key:
      | 'identification'
      | 'address'
      | 'contact'
      | 'technical_feasibility'
      | 'customer_interest'
      | 'legal_compliance'
      | 'document_support';
    label: string;
    percentage: number;
    isComplete: boolean;
    missingFields: string[];
  }>;
  overallPercentage: number;
  installationReadiness: 'NOT_READY' | 'READY_WITH_PENDING' | 'READY_COMPLETE';
  installationTransitionAllowed: boolean;
  missingRequirements: string[];
}
```

### 6.3 Reglas del servicio

1. `overallPercentage` se calcula solo con las 7 secciones oficiales.
2. `installationTransitionAllowed` depende del umbral de 75%.
3. `missingRequirements` agrega faltantes de todas las secciones incompletas.
4. El servicio no depende de calculos duplicados en portal.

### 6.4 StatusTransitionService

`StatusTransitionService` deja de usar validaciones dispersas para `LISTO_PARA_INSTALACION` y pasa a depender del resumen de completitud:

1. bloquea `< 75%`,
2. permite `75%-99%` con advertencia,
3. permite `100%` sin advertencia pendiente.

La respuesta de transicion debe conservar semantica de error para bloqueos y semantica de exito con warning estructurado para casos permitidos con faltantes.

## 7. Read models y ports

### 7.1 Problema a corregir

CRM hoy realiza lecturas directas de modelos ajenos en puntos donde no deberia acoplarse al storage o a entidades de otros contextos. Esta fase elimina ese patron en los servicios del expediente.

### 7.2 Ports/read models requeridos

Se aprueban al menos estos contratos de lectura:

1. `CrmActorReadPort`
   - resuelve nombre y rol de actores usados en timeline, metadata y trazabilidad;
   - evita lecturas directas desde `User` o `PlatformUser` en servicios del expediente.

2. `CrmQuoteReadPort` o `ExpedienteQuoteReadPort`
   - entrega la informacion minima que el calculo de completitud y el expediente requieran de cotizaciones;
   - evita leer `Quote` directamente desde el servicio/calculadora del expediente.

### 7.3 Regla de boundary

1. CRM conserva ownership del expediente y su trazabilidad.
2. Los datos externos se consumen por interfaces tipadas o read models.
3. Ningun servicio nuevo debe reintroducir lecturas directas cross-module para resolver actores o cotizaciones.

## 8. Diseno frontend portal

### 8.1 Fuente de verdad

El portal deja de recalcular la completitud general como logica primaria. Debe renderizar la completitud resumida enviada por el backend.

### 8.2 Vista objetivo

En `dashboard/crm/expedientes/gestion` se deben mostrar las 7 secciones oficiales con:

1. label,
2. porcentaje,
3. estado completo/incompleto,
4. faltantes cuando aplique.

### 8.3 Estados visuales de readiness

Se aprueban estos estados:

1. `No listo` para `< 75%`
2. `Listo con pendientes` para `75%-99%`
3. `Completo` para `100%`

### 8.4 Comportamiento de la transicion

Cuando el usuario intente avanzar a instalacion:

1. si esta bloqueado, ver mensaje de error con faltantes;
2. si esta permitido con pendientes, ver aviso con el copy aprobado y el detalle de faltantes;
3. si esta completo, avanzar sin advertencia pendiente.

## 9. Archivos objetivo

### Backend

1. `apps/api/src/modules/crm/expedientes/status-transition.service.ts`
2. `apps/api/src/modules/crm/expedientes/completeness-calculator.service.ts`
3. `apps/api/src/modules/crm/expedientes/expediente-section-completeness.service.ts`
4. `apps/api/src/modules/crm/expedientes/expediente.service.ts`
5. `apps/api/src/modules/crm/ports/**`
6. wiring de providers en `apps/api/src/modules/crm/**/*.module.ts`

### Frontend

1. `apps/portal/src/app/dashboard/crm/expedientes/[id]/page.tsx`
2. `apps/portal/src/components/crm/expedientes/sections/constants.ts`
3. `apps/portal/src/components/crm/expedientes/sections/**`
4. `apps/portal/src/components/crm/expedientes/expediente-ui.ts`
5. `apps/portal/src/lib/api-client.ts`

### Documentacion

1. `docs/adrs/ADR-026-Pipeline-CRM-8-Estados.md`
2. `docs/hlds/HLD-MOD05-ARQUITECTURA-v2.0.md`
3. `docs/prds/PRD-MOD05-CRM-DEFINICION-v2.0.md`
4. `docs/prds/PRD-MOD05-CRM-GESTION-COMERCIAL-OPERATIVA-v1.0.md`
5. informe vivo relacionado en `docs/informes/`

## 10. Testing y evidencia

### 10.1 Backend

1. tests del calculo por 7 secciones;
2. tests del 100% general solo cuando las 7 secciones estan completas;
3. tests de transicion a instalacion con `< 75%`, `75%-99%` y `100%`;
4. tests de ports/read models para verificar que CRM ya no hace lecturas directas cross-module.

### 10.2 Frontend

1. tests de render de 7 secciones y porcentaje general;
2. tests del badge `Listo con pendientes`;
3. tests del aviso con faltantes;
4. ajuste o incorporacion de al menos un flujo E2E si el repo ya tiene base reutilizable.

### 10.3 Validacion documental

1. ADR, HLD y PRD deben quedar alineados con 8 estados.
2. El informe vivo debe registrar el correctivo y sus decisiones operativas.

## 11. Riesgos y mitigaciones

| Riesgo | Mitigacion |
|---|---|
| Drift entre completitud backend y portal | El portal solo representa la salida del backend |
| Aumento de alcance por refactor amplio | Limitar la fase a completitud, transicion, read models y documentos |
| Regresion en contratos CRM | Cubrir endpoints y tipos usados por portal antes de cerrar |
| Reintroducir acoplamiento entre modulos | Forzar lectura via ports/read models y revisar wiring de providers |
| Datos legacy con estados antiguos | Mantener compatibilidad de lectura transitoria sin reabrir el pipeline legacy |

## 12. Criterios de aceptacion

1. El modulo CRM queda documentado y operando con 8 estados aprobados.
2. La completitud general se basa en 7 secciones oficiales.
3. El expediente alcanza 100% general solo si las 7 secciones llegan a 100%.
4. La transicion a `LISTO_PARA_INSTALACION` se bloquea por debajo de 75%.
5. La transicion a `LISTO_PARA_INSTALACION` se permite desde 75% con aviso de faltantes.
6. El portal muestra `Listo con pendientes` para expedientes entre 75% y 99%.
7. CRM deja de resolver actores y cotizaciones mediante lecturas directas cross-module en los puntos corregidos.

## 13. Fuera de alcance explicito

1. Automatizacion de instalacion o provisioning.
2. Reemplazo total del flujo legacy de prospects/reviews.
3. Refactor visual completo del expediente.
4. Cambios a otros modulos fuera de los contratos de lectura necesarios.
