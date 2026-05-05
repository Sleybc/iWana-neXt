# ADR-026: Consolidación del Pipeline CRM de 12 a 8 Estados

**Estado:** Aprobado  
**Fecha:** 2026-04-16  
**Autor:** AI-EM-ARCH  
**Aprobador:** CTO Humano  
**PRD relacionado:** docs/prds/PRD-MOD05-CRM-SUBSCRIBERS-v1.0.md  
**HLD relacionado:** docs/hlds/HLD-MOD05-ARQUITECTURA-v2.0.md  
**Spec correctivo relacionado:** docs/superpowers/specs/2026-05-05-crm-pipeline-completeness-read-model-design.md

---

## Contexto

El pipeline CRM actual (Expediente Único Progresivo) tiene 12 estados:

```
NUEVO_POTENCIAL → CONTACTADO → PENDIENTE_DATOS → PRECALIFICADO →
VALIDANDO_COBERTURA → VIABLE_COMERCIALMENTE → EN_COTIZACION →
PENDIENTE_DECISION → LISTO_PARA_INSTALACION → INSTALACION_AGENDADA →
CLIENTE_ACTIVO → DESCARTADO
```

Tras análisis funcional con el CTO, se identificaron 4 estados que no aportan valor operativo y generan fricción innecesaria:

1. **CONTACTADO** — Solo valida que exista teléfono o email, pero la completitud por dimensión ya indica si hay datos de contacto. Un lead con teléfono ya está "contactado" por definición.

2. **PENDIENTE_DATOS** — No tiene validación de campos. Es un estado intermedio que solo indica "faltan datos", pero la completitud por dimensión ya muestra qué falta sin necesidad de un estado.

3. **VIABLE_COMERCIALMENTE** — No tiene validación real (retorna `{valid: true}` vacío). Si la cobertura es viable, se avanza a cotización directamente.

4. **PENDIENTE_DECISION** — `EN_COTIZACION` ya cubre "cotización enviada, esperando decisión del cliente". No hay proceso formal separado de espera de decisión.

## Decisión

Consolidar el pipeline a **8 estados**:

```
NUEVO_POTENCIAL → PRECALIFICADO → VALIDANDO_COBERTURA → EN_COTIZACION →
LISTO_PARA_INSTALACION → INSTALACION_AGENDADA → CLIENTE_ACTIVO → DESCARTADO
```

### Mapeo de estados eliminados

| Estado eliminado      | Se mapea a                                        | Justificación                                                     |
| --------------------- | ------------------------------------------------- | ----------------------------------------------------------------- |
| CONTACTADO            | Absorbido por NUEVO_POTENCIAL → PRECALIFICADO     | La transición a PRECALIFICADO ya requiere datos de contacto       |
| PENDIENTE_DATOS       | Absorbido por PRECALIFICADO                       | La completitud por dimensión guía al asesor sin estado intermedio |
| VIABLE_COMERCIALMENTE | Absorbido por VALIDANDO_COBERTURA → EN_COTIZACION | Si cobertura es viable, se avanza directo a cotización            |
| PENDIENTE_DECISION    | Absorbido por EN_COTIZACION                       | Cotización enviada = esperando decisión                           |

### Transiciones permitidas (8 estados)

```
NUEVO_POTENCIAL → PRECALIFICADO (requiere: documento, nombre, contacto, dirección, municipio)
PRECALIFICADO → VALIDANDO_COBERTURA (requiere: coordenadas o dirección completa)
VALIDANDO_COBERTURA → EN_COTIZACION (requiere: cobertura viable)
VALIDANDO_COBERTURA → DESCARTADO (cobertura no viable)
EN_COTIZACION → LISTO_PARA_INSTALACION (requiere: completitud general >= 75%; si es < 100%, avanza con advertencia de faltantes)
EN_COTIZACION → DESCARTADO (cliente rechaza)
LISTO_PARA_INSTALACION → INSTALACION_AGENDADA (requiere: ticketId, workOrderId)
INSTALACION_AGENDADA → CLIENTE_ACTIVO (requiere: completitud general = 100% en 7 secciones + checklist)
Cualquier estado → DESCARTADO (requiere: motivo)
DESCARTADO → NUEVO_POTENCIAL (reactivar)
```

### Impacto por segmento de negocio

| Segmento    | Flujo típico                                                        | Diferencia notable                                            |
| ----------- | ------------------------------------------------------------------- | ------------------------------------------------------------- |
| RESIDENTIAL | Flujo estándar de 7 pasos                                           | Puede saltar VALIDANDO_COBERTURA si dirección ya está en zona |
| SOHO        | Mismo que residencial                                               | Sin diferencia en pipeline                                    |
| PYME        | EN_COTIZACION toma más tiempo (aprobación gerencia para descuentos) | Reglas de aprobación por monto dentro de EN_COTIZACION        |
| CORPORATE   | EN_COTIZACION extendido con aprobación dirección                    | Flujo de aprobación más largo                                 |
| GOVERNMENT  | EN_COTIZACION con proceso de licitación pública                     | Puede haber proceso de licitación                             |
| WHOLESALE   | Negociación directa                                                 | Similar a CORPORATE                                           |

La complejidad por segmento se maneja con **reglas de aprobación dentro de EN_COTIZACION**, no con más estados.

## Alternativas consideradas

### 1. Mantener 12 estados

- **Descartada.** Los 4 estados eliminados no tienen validación real ni aportan valor operativo. Generan clics innecesarios en la UI y confusión en métricas de conversión.

### 2. Reducir a 6 estados (eliminar también VALIDANDO_COBERTURA y EN_COTIZACION)

- **Descartada.** VALIDANDO_COBERTURA tiene validación real (check de cobertura técnica). EN_COTIZACION tiene validación real (plan seleccionado). Ambos son pasos operativos necesarios.

### 3. Consolidar a 8 estados (elegida)

- **Aceptada.** Elimina redundancia sin perder granularidad operativa. Los 8 estados restantes tienen validaciones reales y representan pasos significativos en el ciclo de vida del lead.

## Consecuencias

### Positivas

- Pipeline más ágil: menos clics, menos confusión.
- Métricas de conversión más claras (menos embudos intermedios).
- Validaciones más estrictas en cada transición.
- Compatible con todos los segmentos de negocio sin estados adicionales.

### Negativas

- Migración de datos existentes (estados legacy → nuevos estados).
- Actualización de frontend (labels, colores, transiciones).
- Actualización de StatusTransitionService y tests.

### Riesgos

- Datos existentes en estados eliminados necesitan mapeo correcto. Mitigación: migración aditiva que mapea CONTACTADO→PRECALIFICADO, PENDIENTE_DATOS→PRECALIFICADO, VIABLE_COMERCIALMENTE→VALIDANDO_COBERTURA, PENDIENTE_DECISION→EN_COTIZACION.
- Frontend del portal puede tener dependencias en estados eliminados. Mitigación: actualizar expediente-ui.ts y api-client.ts en la misma fase.

## Nota correctiva 2026-05-05

La aprobacion del CTO sobre el pipeline de 8 estados queda extendida al correctivo operativo documentado en `docs/superpowers/specs/2026-05-05-crm-pipeline-completeness-read-model-design.md`, que fija adicionalmente:

1. completitud general por 7 secciones oficiales;
2. umbral >= 75% para habilitar `EN_COTIZACION -> LISTO_PARA_INSTALACION`;
3. requisito de 100% general para cierre completo antes de `CLIENTE_ACTIVO`;
4. uso de ports/read models para eliminar lecturas cross-module dentro de CRM.

## Plan de migración

```sql
-- Migración de estados en expediente_records
UPDATE expediente_records SET status = 'PRECALIFICADO' WHERE status IN ('CONTACTADO', 'PENDIENTE_DATOS');
UPDATE expediente_records SET status = 'VALIDANDO_COBERTURA' WHERE status = 'VIABLE_COMERCIALMENTE';
UPDATE expediente_records SET status = 'EN_COTIZACION' WHERE status = 'PENDIENTE_DECISION';

-- Migración de estados en status_changes
UPDATE status_changes SET from_status = 'PRECALIFICADO' WHERE from_status IN ('CONTACTADO', 'PENDIENTE_DATOS');
UPDATE status_changes SET from_status = 'VALIDANDO_COBERTURA' WHERE from_status = 'VIABLE_COMERCIALMENTE';
UPDATE status_changes SET from_status = 'EN_COTIZACION' WHERE from_status = 'PENDIENTE_DECISION';
UPDATE status_changes SET to_status = 'PRECALIFICADO' WHERE to_status IN ('CONTACTADO', 'PENDIENTE_DATOS');
UPDATE status_changes SET to_status = 'VALIDANDO_COBERTURA' WHERE to_status = 'VIABLE_COMERCIALMENTE';
UPDATE status_changes SET to_status = 'EN_COTIZACION' WHERE to_status = 'PENDIENTE_DECISION';
```

## Referencias

- PRD maestro §4.3 (Portales personalizados)
- PRD maestro §5.1 (CRM, RF-CRM-01 pipeline de ventas)
- HLD-MOD05-ARQUITECTURA-v2.0.md (diagrama de estados)
- ADR-024 (migración a Expediente Único)
- ADR-022 (política de ejecución modular por fases)
