# ADR-025: Modelo de Dos Dimensiones para Subscriber (personType + customerSegment)

**Estado:** Propuesto  
**Fecha:** 2026-04-16  
**Autor:** AI-EM-ARCH  
**Aprobador requerido:** CTO Humano  
**PRD relacionado:** docs/prds/PRD-MOD05-CRM-SUBSCRIBERS-v1.0.md

---

## Contexto

El PRD maestro §6.4 define la entidad Subscriber con un campo `personType` (NATURAL | JURIDICAL) que determina el tratamiento fiscal. Sin embargo, el ISP colombiano opera con **seis segmentos de negocio** claramente diferenciados (Residencial, SOHO, PYME, Corporativo, Gobierno, Mayorista) que impactan el tipo de plan, SLA, provisioning y estrategia comercial, pero **no impactan el tratamiento IVA**.

La implementación existente usa un enum `SubscriberType` con valores RESIDENTIAL/COMMERCIAL/CORPORATE que mezcla dimensión fiscal con dimensión de negocio, generando confusión y limitando la expresividad del modelo.

## Decisión

Adoptar **dos dimensiones ortogonales** en la entidad Subscriber:

1. **`personType`** (NATURAL | JURIDICA) — Dimensión fiscal que determina régimen tributario, tipo de documento y tratamiento IVA.
2. **`customerSegment`** (RESIDENTIAL | SOHO | PYME | CORPORATE | GOVERNMENT | WHOLESALE) — Dimensión de negocio que determina tipo de plan, SLA, provisioning y estrategia comercial.

### Regla clave: customerSegment NO afecta el IVA

El cálculo de IVA depende exclusivamente de `personType` + `stratum`:

| personType | stratum    | vatTreatment |
| ---------- | ---------- | ------------ |
| NATURAL    | 1-2        | EXEMPT       |
| NATURAL    | 3          | EXCLUDED     |
| NATURAL    | 4-6        | STANDARD     |
| JURIDICA   | cualquiera | STANDARD     |

Esto incluye al segmento GOVERNMENT: las entidades gubernamentales colombianas **pagan IVA al 19%** en servicios de Internet (no están exentas).

### Combinaciones más frecuentes

| Combinación           | Ejemplo                              | IVA           | Plan típico            |
| --------------------- | ------------------------------------ | ------------- | ---------------------- |
| NATURAL + RESIDENTIAL | Juan Pérez, estrato 3                | EXCLUDED      | Fibra 100Mbps Hogar    |
| NATURAL + SOHO        | María López, consultor independiente | Según estrato | Fibra 100Mbps SOHO     |
| JURIDICA + PYME       | Tech SAS, NIT 900.123.456-7          | STANDARD      | Fibra Simétrica 50Mbps |
| JURIDICA + CORPORATE  | Banco X S.A.                         | STANDARD      | DIA 100Mbps Dedicado   |
| JURIDICA + GOVERNMENT | Alcaldía Municipal                   | STANDARD      | Gobierno Conectividad  |
| JURIDICA + WHOLESALE  | WISP Regional S.A.S.                 | STANDARD      | Tránsito IP 1Gbps      |

## Alternativas consideradas

### 1. Un solo campo SubscriberType (existente)

- **Descartada.** Mezcla dimensión fiscal con dimensión de negocio. No permite representar una persona natural con negocio (NATURAL + SOHO) ni una entidad gubernamental (JURIDICA + GOVERNMENT con IVA 19%).

### 2. personType con subtipos (NATURAL_RESIDENTIAL, NATURAL_SOHO, etc.)

- **Descartada.** Genera explosión combinatoria. El tratamiento IVA se calcula igual para NATURAL independientemente del segmento. Los subtipos son redundantes con customerSegment.

### 3. Dos dimensiones separadas (elegida)

- **Aceptada.** Permite máxima flexibilidad sin redundancia. El motor IVA es simple y correcto. Los segmentos de negocio son extensibles sin afectar la lógica fiscal.

## Consecuencias

### Positivas

- El motor IVA es simple, correcto y fácil de auditar.
- Los seis segmentos de negocio se representan fielmente.
- Se pueden agregar nuevos segmentos sin cambiar la lógica fiscal.
- El modelo es consistente con la realidad del mercado ISP colombiano.

### Negativas

- Se agrega un campo obligatorio más al formulario de creación de subscriber.
- Se requiere validación cruzada (NATURAL sin estrato → error; JURIDICA sin NIT → error).

### Riesgos

- Confusión en la UI entre personType y customerSegment. Mitigación: labels claros, tooltips explicativos, validación por schema discriminado.

## Referencias

- PRD maestro §6.4 (entidad Subscriber)
- PRD maestro §5.1 (CRM, RF-CRM-07, RF-CRM-09)
- PRD maestro §5.2 (Billing, RF-BIL-09 motor IVA)
- PRD-MOD05-CRM-SUBSCRIBERS-v1.0.md
- ADR-002 (multi-tenant por schema)
- ADR-024 (migración a Expediente Único)
