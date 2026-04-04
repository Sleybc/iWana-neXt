# PLAN - MOD05 Incentivos Backlog Futuro

**Version:** 1.0  
**Estado:** Borrador  
**Fecha:** 2026-04-02  
**Modo activo:** Architect  
**Modulo:** MOD05 / Futuro bounded context de Incentivos  
**Artefactos relacionados:** docs/prds/PRD-MOD05-CRM-ORIGEN-ATRIBUCION-v1.1.md, docs/prompts/PROMPT-MOD05-CRM-ORIGEN-ATRIBUCION-FASE1-v1.1.md, docs/hlds/HLD-MOD05-ARQUITECTURA-v2.0.md

---

## 1. Objetivo

Definir el backlog futuro del subsistema de incentivos para dejar proyectadas las capacidades posteriores al cierre de MOD05 CRM, sin mezclar payout ni productividad dentro del alcance operativo actual del expediente.

Este backlog no autoriza implementación inmediata. Su propósito es ordenar prioridades, boundaries y dependencias para una fase posterior.

---

## 2. Boundary futuro

El sistema de incentivos debe vivir como un bounded context separado del CRM operativo.

### Responsabilidad de MOD05 CRM

1. Capturar canal de captación.
2. Capturar actor originador.
3. Mantener historial de atribución.
4. Emitir o exponer eventos de negocio reutilizables.

### Responsabilidad del futuro módulo Incentivos

1. Gestionar políticas de incentivo.
2. Calcular devengos.
3. Consolidar liquidaciones.
4. Gestionar aprobaciones y pagos.
5. Calcular bonos por productividad y calidad.

---

## 3. Líneas de backlog

### Línea A: Incentivos comerciales

Aplica a actores que originan o cierran oportunidades comerciales.

Casos objetivo:

1. Comisión por vendedor interno.
2. Comisión por partner o vendedor externo.
3. Beneficio por cliente referidor.
4. Incentivos diferenciados por canal, plan o campaña.

### Línea B: Productividad operativa

Aplica a técnicos u otros actores operativos.

Casos objetivo:

1. Bono por meta mensual de instalaciones completadas.
2. Bono por cumplimiento de visitas o cierres técnicos.
3. Bono por calidad, retrabajo bajo o cumplimiento de SLA.
4. Bonos mixtos por productividad + calidad.

### Línea C: Gobierno y liquidación

Capas transversales del futuro sistema.

Casos objetivo:

1. Aprobación manual de liquidaciones.
2. Registro de pago o entrega de beneficio.
3. Auditoría de cambios de política.
4. Corte mensual y trazabilidad histórica.

---

## 4. Fases sugeridas

### Fase futura 1: Incentivos comerciales mínimos

Objetivo: habilitar devengo simple por origen comercial.

Incluye:

1. Políticas de incentivo por actor.
2. Devengo por evento de contrato activo.
3. Historial de devengos por actor.
4. Vista administrativa básica de montos pendientes.

### Fase futura 2: Liquidación y aprobación

Objetivo: consolidar el cierre mensual.

Incluye:

1. Corte por periodo.
2. Liquidación agrupada por actor.
3. Flujo de aprobación.
4. Registro manual de pago o entrega de beneficio.

### Fase futura 3: Productividad técnica

Objetivo: incorporar métricas operativas como fuente de incentivo.

Incluye:

1. Metas mensuales por técnico.
2. Regla de bonos por volumen.
3. Regla de bonos por calidad.
4. Tablero de seguimiento por periodo.

### Fase futura 4: Reglas avanzadas

Objetivo: soportar escenarios comerciales y operativos más complejos.

Incluye:

1. Reglas por campaña.
2. Reglas por canal.
3. Reglas por tipo de plan o ticket promedio.
4. Reglas con umbrales escalonados.
5. Beneficios no monetarios.

---

## 5. Backlog priorizado

| ID | Prioridad | Línea | Ítem |
|----|-----------|-------|------|
| BI-01 | Alta | Comercial | Definir entidad `IncentivePolicy` |
| BI-02 | Alta | Comercial | Definir entidad `IncentiveAccrual` |
| BI-03 | Alta | Comercial | Definir evento de negocio `CONTRACT.ACTIVATED` como disparador de devengo |
| BI-04 | Alta | Comercial | Definir reglas base por actor: SALES, PARTNER, SUBSCRIBER |
| BI-05 | Alta | Gobierno | Definir estados de devengo, liquidación y pago |
| BI-06 | Media | Gobierno | Definir entidad `IncentiveLiquidation` |
| BI-07 | Media | Gobierno | Definir flujo de aprobación y pago |
| BI-08 | Media | Comercial | Definir beneficios no monetarios para referidos |
| BI-09 | Media | Productividad | Definir métricas de productividad técnica |
| BI-10 | Media | Productividad | Definir fuente de eventos operativos para técnicos |
| BI-11 | Baja | Productividad | Diseñar tablero de metas mensuales |
| BI-12 | Baja | Comercial | Diseñar reportería por campaña, canal y actor |

---

## 6. Dependencias previas

Antes de abrir implementación del backlog futuro se recomienda cerrar:

1. MOD05 con origen comercial y atribución en producción funcional.
2. Integridad de la cadena `Expediente -> Quote -> Contract`.
3. Definición clara del evento de negocio que habilita devengo.
4. Contratos estables con los módulos que producirán señales operativas.

---

## 7. Eventos candidatos

| Evento | Origen | Uso futuro |
|--------|--------|------------|
| CONTRACT.ACTIVATED | Contratos CRM | Devengo comercial |
| CONTRACT.SUSPENDED | Contratos CRM | Anulación o ajuste |
| CONTRACT.TERMINATED | Contratos CRM | Reversión o corte |
| EXPEDIENTE.ATTRIBUTED | CRM | Trazabilidad de origen |
| INSTALLATION.COMPLETED | Operación futura | Productividad técnica |
| WORK_ORDER.CLOSED | Operación futura | Productividad y calidad |
| CONTACT_ATTEMPT.SUCCESS | CRM | Métricas de conversión o efectividad |

---

## 8. Riesgos si se adelanta este backlog en MOD05

1. Mezclar lógica económica con expediente operativo.
2. Sobrecargar `ExpedienteRecord` con campos ajenos a su lifecycle.
3. Abrir dependencias prematuras con contratos, pagos o productividad.
4. Diluir el cierre de CRM por expansión anticipada de alcance.

---

## 9. Criterio de apertura futura

Este backlog debería convertirse en PRD o HLD independiente solo cuando se cumplan estas condiciones:

1. El cierre de origen y atribución de MOD05 esté estabilizado.
2. Exista decisión explícita de negocio sobre qué incentivos se pagan, a quién y bajo qué eventos.
3. El CTO apruebe abrir el bounded context de Incentivos como siguiente iniciativa.

---

## 10. Decisión actual

El backlog futuro de incentivos queda registrado como referencia arquitectónica y de producto, pero permanece fuera del alcance aprobado de MOD05.

---

*Documento generado para proyección futura. No autoriza ejecución directa ni modifica el alcance aprobado del CRM actual.*