# Diseño MVP — Tributos por cliente

**Versión:** 1.0
**Estado:** Aprobado
**Fecha:** 2026-04-22
**Modo:** Architect
**Módulos afectados:** MOD07 Taxation, MOD05 CRM/Subscribers, Portal tenant-aware
**Autor:** AI-EM-ARCH
**Referencias:** `docs/prds/PRD-TAXATION-PARTIES-COMMERCIAL-REDESIGN-v1.0.md`, `docs/hlds/HLD-MOD07-TAXATION-v1.0.md`, `docs/hlds/HLD-MOD05-ARQUITECTURA-v2.0.md`, `docs/hlds/HLD-MOD05-PARTIES-DEPENDENCY-v2.1-addendum.md`, `docs/superpowers/specs/2026-04-21-taxation-bounded-context-design.md`, `docs/superpowers/specs/2026-04-20-reglas-comerciales-design.md`

**Aprobación:** CTO aprueba este refinamiento MVP el 2026-04-22.

---

## 1. Contexto

El modelo visible de `definiciones + reglas + simulador` resultó demasiado abstracto para la operación diaria. El usuario promedio no piensa en motores tributarios, sino en preguntas directas:

- qué tributos existen,
- cuáles le aplican a este cliente,
- quién los confirmó,
- y cómo se ven en Suscriptor 360.

El MVP debe simplificar el lenguaje y el flujo sin romper el ownership del catálogo ya definido para `TaxationModule`.

---

## 2. Objetivo del MVP

Implementar una experiencia operativa simple donde:

1. `TaxationModule` mantiene un catálogo maestro de tributos reutilizable por tenant.
2. El cliente tiene un perfil tributario propio, editable por el área de facturación.
3. El alta del cliente captura contexto mínimo para sugerencias, sin obligar a configurar toda la tributación en ese momento.
4. Suscriptor 360 muestra el resultado tributario final con lenguaje de negocio.

---

## 3. Decisiones de diseño confirmadas

| Área | Decisión MVP |
|---|---|
| Ownership catálogo | `TaxationModule` sigue siendo dueño del catálogo |
| Flujo visible | Catálogo -> asignación al cliente -> Suscriptor 360 |
| Reglas visibles | Fuera del flujo principal del MVP |
| Tasa | Mixta: fija en catálogo y variable al asignar |
| IVA por estrato | Sugerido por sistema, editable por facturación |
| Municipio | No dispara tributos territoriales de forma general |
| Tributos territoriales | Aplican en casos específicos, sobre todo entidades públicas o jurídicas con obligación propia |

---

## 4. Modelo mental objetivo

### 4.1 Para el usuario de alta o instalación

Debe capturar solo los datos que ayudan a formar una sugerencia inicial:

- segmento,
- tipo de cliente,
- estrato,
- datos básicos de operación.

No debe enfrentarse a reglas tributarias complejas.

### 4.2 Para el área de facturación

Debe operar un checklist de tributos por cliente.

Cada tributo puede quedar en uno de tres estados:

- sugerido,
- confirmado,
- ajustado manualmente.

### 4.3 Para Suscriptor 360

Debe mostrar el perfil tributario final del cliente, no la lógica interna que lo produjo.

---

## 5. Alcance funcional

### 5.1 En alcance

1. Catálogo simple de tributos.
2. Asignación de tributos por cliente desde facturación.
3. Visualización del perfil tributario en Suscriptor 360.
4. Sugerencia editable de tratamiento de IVA por estrato.
5. Soporte a tributos fijos y variables.

### 5.2 Fuera de alcance

1. Motor visible de reglas tributarias.
2. Simulador tributario para operación cotidiana.
3. Disparo automático de tributos territoriales por municipio de residencia.
4. Automatización masiva por cambios normativos.

---

## 6. Comportamiento tributario MVP

### 6.1 Catálogo de tributos

Cada tributo del catálogo debe responder solo estas preguntas:

- nombre,
- categoría,
- si tiene tasa fija o variable,
- si está activo,
- nota operativa corta.

Ejemplos de catálogo:

- IVA
- Retención en la fuente
- ReteIVA
- ReteICA
- Estampilla Pro-Cultura
- Estampilla Pro-Adulto Mayor

### 6.2 Tasa fija vs variable

- Fija: se define en catálogo y se reutiliza al asignar.
- Variable: el tributo existe en catálogo, pero su tasa se solicita al asignarlo al cliente.

### 6.3 IVA por estrato

El sistema sugiere tratamiento, pero no lo impone.

Política operativa vigente para MVP:

- estrato 1-2 -> sugerir IVA exento
- estrato 3 -> sugerir IVA excluido

Si la norma cambia, la política debe poder ajustarse sin reescribir el catálogo.

### 6.4 Tributos territoriales

Los tributos territoriales no deben aplicarse por vivir en un municipio determinado.

Principio validado con negocio:

- una entidad pública en Colombia es una persona jurídica y puede tener tributos propios,
- un cliente residencial ubicado en ese mismo municipio no debe recibir esos tributos por ese hecho.

Por tanto, el municipio es contexto jurisdiccional del tributo, pero no criterio automático general de aplicación.

---

## 7. Arquitectura recomendada

### 7.1 Boundaries

- `TaxationModule` mantiene `tax_definitions`.
- El perfil tributario del cliente debe vivir en el bounded context dueño del cliente, no en `Taxation`.
- Para el MVP, ese perfil debe colgar de Subscribers/CRM y exponerse a Portal y Billing vía puerto de lectura.

### 7.2 Nuevo submodelo sugerido

Se recomienda un submodelo tributario del cliente compuesto por:

- `subscriber_tax_profile`
- `subscriber_tax_assignment`

Con propósito separado:

- `subscriber_tax_profile`: estado general, datos fuente de sugerencia, fecha de confirmación, responsable.
- `subscriber_tax_assignment`: un tributo aplicado al cliente, con tasa efectiva, tratamiento y estado.

### 7.3 Estado por asignación

Cada asignación tributaria debe poder registrar:

- `status`: `SUGGESTED | CONFIRMED | MANUAL_ADJUSTMENT`
- `rateSource`: `CATALOG | MANUAL`
- `treatment`: `STANDARD | EXEMPT | EXCLUDED | FIXED` cuando aplique
- `reason`: texto corto auditable, por ejemplo `Estrato 2`

---

## 8. Vistas objetivo

### 8.1 Catálogo de impuestos

Pantalla simple de mantenimiento del catálogo.

No debe pedir al usuario configurar reglas tributarias.

### 8.2 Configuración tributaria en facturación

Checklist por cliente:

- marca tributos activos,
- muestra sugerencias,
- pide tasa cuando sea variable,
- permite confirmar o ajustar.

### 8.3 Suscriptor 360

Vista de lectura clara con tres bloques:

1. datos relevantes para entender el perfil,
2. tributos activos,
3. trazabilidad funcional.

---

## 9. Contratos orientativos

### 9.1 Lectura de perfil tributario

```ts
interface SubscriberTaxAssignmentSnapshot {
  taxDefinitionId: string;
  taxName: string;
  effectiveRate: number | null;
  treatment: 'STANDARD' | 'EXEMPT' | 'EXCLUDED' | 'FIXED' | null;
  status: 'SUGGESTED' | 'CONFIRMED' | 'MANUAL_ADJUSTMENT';
  reason: string | null;
}

interface SubscriberTaxProfileSnapshot {
  subscriberId: string;
  segment: string;
  stratum: number | null;
  profileStatus: 'PENDING_REVIEW' | 'CONFIGURED';
  assignments: SubscriberTaxAssignmentSnapshot[];
}
```

### 9.2 Operación mínima esperada

- listar tributos del catálogo,
- guardar asignaciones tributarias del cliente,
- leer perfil tributario del cliente,
- recalcular sugerencia de IVA al cambiar el estrato.

---

## 10. Riesgos y pendientes

1. La política exacta de IVA por estrato debe tratarse como regla operativa configurable y, cuando aplique, marcar `requiere verificación con fuente oficial`.
2. El HLD de Subscribers y el PRD del programa deben alinearse formalmente si esta simplificación se adopta como baseline definitivo.
3. Billing futuro deberá consumir el perfil tributario confirmado, no inferirlo solo desde catálogo.

---

## 11. Recomendación final

Para el MVP, la mejor arquitectura visible no es un motor de reglas expuesto al usuario, sino un catálogo maestro en `Taxation` y un perfil tributario por cliente dentro del bounded context del cliente.

Eso preserva el diseño modular, baja la complejidad operativa y prepara el terreno para reglas avanzadas en una iteración posterior sin obligar a reeducar al usuario final desde ahora.