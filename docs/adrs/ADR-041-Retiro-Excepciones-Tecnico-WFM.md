# ADR-041: Retiro de Excepciones por Tecnico en WFM

**Version:** 1.0  
**Estado:** Aprobado  
**Fecha:** 2026-05-22  
**Autor:** AI-EM-ARCH  
**Modulo:** MOD09 Programacion / WFM  
**Aprobacion CTO:** Aprobado el 2026-05-22  
**PRD relacionado:** docs/prds/PRD-MOD09-PROGRAMACION-WFM-v1.0.md  
**HLD relacionado:** docs/hlds/HLD-MOD09-PROGRAMACION-WFM-v1.0.md  
**Spec relacionada:** docs/specs/2026-05-22-mod09-wfm-field-operations-sin-excepciones-design.md  
**ADR antecedente:** docs/adrs/ADR-037-Bounded-Context-Programacion-WFM.md

---

## Contexto

La configuracion de Operacion de campo en portal expone actualmente una seccion de **Excepciones por tecnico** respaldada por contratos, servicios y persistencia reales en WFM.

Ese diseño fue util como corte transitorio para Fase 01, pero hoy introduce un boundary funcional incorrecto:

- mezcla reglas estructurales de agenda con ausencias personales;
- convierte a WFM en owner visible de una capacidad que producto desea sacar del modulo;
- mantiene una semantica ambigua entre operacion de agenda, permisos, licencias y disponibilidad individual.

El contexto de producto aprobado para este corte es:

1. no existe aun modulo de Recursos Humanos;
2. el modulo de Recursos Humanos se construira despues de este ajuste;
3. el sistema aun no esta en produccion;
4. se prefiere limpiar el boundary ahora en lugar de consolidar una convivencia transitoria larga.

La arquitectura vigente ya reconoce a WFM como bounded context owner de agenda, Work Orders y disponibilidad puntual ligera via `TechnicianAvailability`, segun ADR-037. Sin embargo, la capacidad `wfm_technician_business_overrides` agrega reglas personales recurrentes visibles en settings y hoy altera la precedencia de la ventana operativa por encima de cierres especiales y horario base.

La decision a documentar no crea todavia un modulo RR. HH.; solo retira de WFM la capacidad visible de excepciones personales y deja preparado el future owner correcto.

---

## Decision

Se adopta el retiro limpio de **Excepciones por tecnico** del producto WFM.

La decision incluye:

1. retirar la seccion visible de Excepciones por tecnico de la pantalla de field operations;
2. dejar la experiencia de configuracion WFM limitada a horario base de empresa, horario por sede y cierres especiales;
3. dejar de considerar `WfmTechnicianBusinessOverride` como capability vigente de producto;
4. reencaminar el ownership conceptual de ausencias personales, permisos, licencias y reglas individuales recurrentes hacia un futuro modulo de Recursos Humanos;
5. redefinir la precedencia operativa objetivo en WFM sin reglas personales manuales visibles.

Precedencia objetivo de la ventana operativa despues del retiro:

1. cierre especial o festivo aplicable;
2. horario por sede;
3. horario base de empresa.

Cuando exista RR. HH., la precedencia objetivo evolucionara a:

1. ausencia aprobada por RR. HH.;
2. cierre especial o festivo;
3. horario por sede;
4. horario base de empresa.

Hasta que RR. HH. exista, WFM no debe volver a exponer en settings una capacidad de excepcion personal recurrente.

---

## Consecuencias

### Positivas

- Se corrige el boundary funcional antes de produccion.
- La pantalla de field operations recupera foco en reglas estructurales de agenda.
- Se reduce la ambiguedad semantica entre operacion y ausencias personales.
- Se simplifica el handoff para el futuro modulo de RR. HH.
- Se evita consolidar deuda conceptual en UI, API y base de datos.

### Costos y tradeoffs

- Deben actualizarse PRD, HLD, specs, planes e informe vivo para retirar referencias aprobadas previamente.
- Deben limpiarse contratos backend/frontend, servicios, entidad y pruebas asociados a `technician-business-overrides`.
- El ajuste requiere migracion o retiro controlado de tabla tenant-aware y sus indices.
- El cambio mueve un boundary funcional y queda autorizado por aprobacion CTO registrada el 2026-05-22.

### Riesgos aceptados

- `TechnicianAvailability` seguira existiendo como capacidad puntual de agenda mientras no exista RR. HH., pero no debe usarse como justificacion para reintroducir la seccion retirada.
- Puede quedar una dependencia tecnica temporal interna de disponibilidad individual durante el cleanup; si ocurre, debe quedar encapsulada y no visible al usuario.
- Los artefactos historicos que documentaban precedencia con override tecnico deben quedar corregidos o marcados como reemplazados.

---

## Reglas de implementacion

1. No dejar copy transicional en la UI de field operations.
2. No reemplazar Excepciones por tecnico por otro nombre que siga modelando ausencias personales en WFM.
3. No introducir integracion ficticia con RR. HH.; si el modulo no existe, se documenta como future owner y nada mas.
4. No ampliar el alcance hacia nomina, permisos, vacaciones o flujo de aprobacion.
5. Mantener multi-tenancy por schema y limpieza local al bounded context WFM.
6. Actualizar pruebas focalizadas de portal, API y E2E que hoy dependen de `/wfm/technician-business-overrides`.
7. Mantener `TechnicianAvailability` fuera de la pantalla de settings salvo nueva decision formal.

---

## Alternativas consideradas

### A1: Mantener Excepciones por tecnico en WFM con otro nombre

Descartada. Cambia el copy, pero no corrige el ownership conceptual ni la deuda de boundary.

### A2: Mantener una solucion puente visible hasta construir RR HH

Descartada. El sistema aun no esta en produccion y el costo de corregir ahora es menor que el de sostener convivencia funcional incorrecta.

### A3: Mover inmediatamente toda disponibilidad individual a RR HH

Descartada por ahora. RR. HH. no existe aun y esta ADR no diseña ese modulo; solo retira la capacidad visible incorrecta de WFM.

---

## Aprobacion CTO

Si. Aprobado por CTO el 2026-05-22.

Motivo: esta decision modifica el boundary funcional aprobado de WFM y redefine el ownership conceptual de disponibilidad individual recurrente.

---

## Referencias

- AGENTS.md
- docs/roles/_historico/Perfil_IA_EM_Architect_Unificado_v1.md
- docs/adrs/ADR-037-Bounded-Context-Programacion-WFM.md
- docs/prds/PRD-MOD09-PROGRAMACION-WFM-v1.0.md
- docs/hlds/HLD-MOD09-PROGRAMACION-WFM-v1.0.md
- docs/specs/2026-05-15-mod09-wfm-operating-hours-design.md
- docs/specs/2026-05-22-mod09-wfm-field-operations-sin-excepciones-design.md
