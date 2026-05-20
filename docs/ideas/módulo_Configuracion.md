# 1. Principio de diseño del módulo Configuración

## 1.1 Objetivo real

El módulo debe actuar como:
**Control Plane del sistema (System Control Plane)**

No como:

- settings genéricos
- tablas de configuración
- parámetros sueltos

## 1.2 Propiedades obligatorias

El módulo debe cumplir:

- Multi-tenant-aware (todo es por schema o override por tenant)
- Versionable (SCD Tipo 2 o snapshots)
- Auditado (append-only change log)
- Validado por schema (Zod/JSON Schema)
- Cacheable (Redis)
- Event-driven (cambios disparan invalidación + side effects)
- UI-driven (no solo backend config)
- Extensible sin migraciones frecuentes

## 2. Taxonomía de configuraciones del sistema (core brainstorming)

Te propongo estructurarlo en 8 dominios de configuración.

### 2.1 Identidad del sistema (System Identity Config)

Configuraciones globales del ISP tenant:

- Nombre del ISP
- Branding (logo, colores, tema UI)
- Dominio de acceso (custom domain)
- Idioma base
- Zona horaria
- Formato de facturación (localización Colombia DIAN)
- Prefijos de documentos (facturas, OTs, tickets)
- Numeración consecutiva global

Esto es crítico para multi-tenant SaaS futuro.

### 2.2 Configuración de seguridad y acceso (Security Control Plane)

Ya parcialmente cubierto en MOD01, pero aquí como configuración central:

- TTL de JWT / Refresh tokens
- Políticas MFA:
  - obligatorio por rol
  - enforcement por módulo
- Políticas de password:
  - longitud
  - rotación
  - historial
- Rate limits globales
- IP allowlist / blocklist por tenant
- Session concurrency rules
- Expiración inactividad por rol
- Auditoría:
  - nivel de logging (INFO/WARN/DEBUG)
  - retención (7 años ya definido)

### 2.3 Configuración de negocio (Business Rules Engine)

Este es el núcleo más crítico del sistema.

- Estratos socioeconómicos -> reglas IVA
- Reglas de corte por mora:
  - días soft suspend
  - hard disconnect
- Reglas de reconexión automática
- Penalizaciones / cargos adicionales
- Reglas de prorrateo billing
- Ciclos de facturación:
  - mensual, quincenal, semanal
- Políticas de instalación:
  - SLA máximo por zona
- Reglas de cancelación de contrato

Esto debería evolucionar a un:
**Business Rules Engine declarativo (JSON rules / DSL)**

### 2.4 Configuración de red (NMS / Provisioning Control Plane)

Crítico para ISP real:

- Pools PPPoE
- Pools DHCP/IPoE
- VLAN ranges
- Templates MikroTik (queues, bridges)
- OLT profiles:
  - Huawei
  - ZTE
  - VSOL
- Parámetros RADIUS:
  - timeout
  - retry policy
- QoS templates globales
- Thresholds de alertas NMS:
  - Rx power ONU
  - CPU OLT
  - bandwidth saturation

Este bloque es altamente dinámico y requiere versionado.

### 2.5 Configuración de WFM (Workforce Control Plane)

- Horarios laborales por:
  - región
  - sitio
  - cuadrilla
- Duración estándar de trabajos:
  - instalación
  - soporte
- SLA por tipo de orden
- Reglas de asignación automática:
  - proximidad
  - carga de trabajo
- Capacidad por técnico
- Calendarios:
  - festivos Colombia
  - festivos por municipio

Este bloque es clave para el ADR-037 y ADR-039.

### 2.6 Configuración de inventario (Asset Control Plane)

- Categorías dinámicas de inventario
- Ciclos de vida (ya definidos en PRD)
- Depreciación:
  - lineal / acelerada
- Umbrales de vida útil
- Reglas de pérdida:
  - responsable automático
  - descuento nómina (flag legal)
- Reglas de transferencia entre estados

### 2.7 Configuración comercial y pricing (Commercial Control Plane)

- Catálogo de planes default
- Bundles base
- Promociones globales
- Reglas de descuentos por segmento
- Pricing floors / ceilings
- Activación de promociones programadas
- Compatibilidad entre productos

Aquí hay fuerte interacción con:

- MOD06 Comercial
- MOD07 TaxationModule

### 2.8 Configuración de integraciones (Integration Control Plane)

Este bloque evita refactor futuro crítico:

- Siigo / Alegra:
  - credenciales
  - mapping de cuentas contables
- Wompi / PayU / PSE:
  - webhooks
  - retries
- WhatsApp Business API:
  - templates
- MikroTik API:
  - endpoints por nodo
- OLTs:
  - credenciales por fabricante
- MinIO:
  - buckets por tenant
- Typesense:
  - index per tenant

### 2.9 Configuración de observabilidad (Observability Control Plane)

- Logs:
  - nivel global
  - nivel por módulo
- Métricas:
  - retention
  - sampling rate
- Tracing:
  - enable/disable por tenant
- Alerting:
  - thresholds
  - canales (email, webhook)

## 3. Diseño arquitectónico recomendado (crítico)

### 3.1 No usar tabla settings key-value

Anti-pattern:

settings (key, value)

### 3.2 Diseño recomendado: Config Domain Model

Entidad base:

- ConfigNamespace
  - id
  - name (security, billing, wfm, nms)
  - tenantId
- ConfigDefinition
  - key
  - type (string | number | boolean | json | enum)
  - schema (Zod/JSON Schema)
  - defaultValue
  - scope (global | tenant | role)
- ConfigValue
  - namespaceId
  - key
  - value
  - version
  - effectiveFrom
  - effectiveTo
  - updatedBy

### 3.3 Pattern clave

Configuration = Event Sourced Light.

Cada cambio genera:

- ConfigUpdatedEvent
- Cache invalidation
- Optional rehydration of dependent modules

## 4. UI/UX del módulo Configuración

Debe ser tipo:

Admin Console de AWS / Vercel / Stripe.

### Layout sugerido

- Sidebar por dominios:
  - Seguridad
  - Negocio
  - Red
  - WFM
  - Inventario
  - Comercial
  - Integraciones
  - Observabilidad

### Componentes clave

- Config editor JSON con validación Zod
- Toggle switches para flags
- Version history viewer
- Diff viewer entre versiones
- Apply to tenant / rollback

## 5. Casos críticos que debes cubrir desde el inicio

### 5.1 Multi-tenant overrides

- global default
- tenant override
- role override

### 5.2 Feature flags reales

Ejemplos:

- enable_new_wfm_scheduler
- enable_tax_simulator_v2
- enable_mikrotik_auto_provisioning

Esto evita refactor futuro brutal.

### 5.3 Versionado obligatorio

Nunca sobrescribir sin:

- version snapshot
- audit trail

### 5.4 Configuración reactiva (event-driven)

Ejemplo:

- cambia SLA -> recalcula tickets abiertos
- cambia pricing -> recalcula cotizaciones futuras
- cambia VLAN pool -> afecta provisioning

## 6. Riesgo si no se diseña bien

Si haces Configuración como CRUD simple:

- duplicas lógica en 8 módulos
- pierdes consistencia de negocio
- no puedes hacer rollback seguro
- no puedes hacer multi-tenant real
- terminas con refactor total del core

## 7. Recomendación de implementación por fases

### Fase 1 (MVP sólido)

- namespaces
- key-value versionado
- feature flags
- tenant override

### Fase 2

- UI admin avanzada
- diff/versioning
- rule engine básico

### Fase 3

- DSL de reglas (billing + WFM + NMS)
- config-as-code export/import
- staging vs production configs

## 8. Decisión de arquitectura recomendada

El módulo de Configuración debe ser tratado como un Core Platform Module (MOD00) transversal, no como un módulo funcional.
