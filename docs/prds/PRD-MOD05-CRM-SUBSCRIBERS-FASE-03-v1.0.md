# PRD - MOD05 CRM Módulo Subscriber — Fase 03 (Conversión Two-Stage + Vista 360°)

**Version:** 1.0  
**Estado:** Aprobado  
**Fecha:** 2026-04-17  
**Modo activo:** Architect  
**Autor:** AI-EM-ARCH  
**Trazabilidad base:** docs/prds/PRD_Sistema_ISP_Colombia_v2_2.md  
**PRD padre:** docs/prds/PRD-MOD05-CRM-SUBSCRIBERS-v1.0.md  
**PRD Fase 02:** docs/prds/PRD-MOD05-CRM-SUBSCRIBERS-FASE-02-v1.0.md  
**PRD complementario:** docs/prds/PRD-MOD05-CRM-AUTO-PIPELINE-v1.0.md  
**HLD relacionado:** docs/hlds/HLD-MOD05-ARQUITECTURA-v2.0.md  
**ADRs aplicables:** ADR-002, ADR-004, ADR-016, ADR-019, ADR-022, ADR-024, ADR-025, ADR-026  
**ADR nuevo requerido:** ADR-027 (conversión Expediente → Subscriber en dos etapas)  
**Identidad corporativa:** docs/identity/Manual_Implementacion_Identidad_Iwana.md — Obligatorio respetar en el portal

---

## 1. Contexto y motivación

La línea Subscriber ya cuenta con backend base y con frontend portal inicial, pero aún mantiene un vacío funcional entre el cierre comercial del expediente y la vida operativa del cliente. Ese vacío hoy se expresa en tres problemas:

1. el pipeline del expediente no orquesta de forma explícita la creación del subscriber;
2. la vista 360° del cliente existe solo como estructura básica y no consolida el contexto operativo y comercial requerido por el PRD del sistema;
3. el operador no dispone de una lectura unificada del cliente post-conversión manteniendo trazabilidad con el expediente origen.

Esta fase cierra ese gap mediante un modelo de conversión en dos etapas y una vista Subscriber 360° alineada visual y operativamente con el detalle de expediente.

---

## 2. Objetivo de la fase

Implementar la fase operativa que conecta el pipeline CRM con la entidad Subscriber y completa la experiencia de gestión del cliente en portal.

El resultado esperado es:

1. crear automáticamente un subscriber en estado `PROSPECT` cuando el expediente llegue a `LISTO_PARA_INSTALACION`;
2. activar automáticamente ese subscriber a `ACTIVE` cuando el expediente llegue a `CLIENTE_ACTIVO`;
3. cancelar automáticamente el subscriber `PROSPECT` si el expediente vinculado termina en `DESCARTADO`;
4. ocultar del pipeline CRM los expedientes completados o descartados por defecto, sin perder trazabilidad;
5. entregar una vista Subscriber 360° con patrón visual espejo del expediente detail, organizada en tabs y secciones guardables.

---

## 3. Alcance

### 3.1 En scope

- Migración de `subscribers` para soportar `expedienteId`, `convertedAt` y `activatedAt`.
- Eventos de dominio para el pipeline del expediente y para el ciclo de vida del subscriber.
- Refactor de creación automática a modelo two-stage: `PROSPECT` en `LISTO_PARA_INSTALACION` y `ACTIVE` en `CLIENTE_ACTIVO`.
- Cancelación automática del subscriber prospecto al descartar el expediente.
- Override manual controlado para creación de subscriber por administrador con justificación obligatoria.
- Filtro por defecto para excluir expedientes `CLIENTE_ACTIVO` y `DESCARTADO` del pipeline abierto.
- Endpoint de guardado por sección para Subscriber 360°.
- Refactor del portal de detalle subscriber para replicar el patrón de expediente: header, tabs, sections, progreso y seguimiento.
- Tablero 360° con datos implementados y placeholders explícitos para módulos futuros.

### 3.2 Fuera de scope

- Implementación real de facturación, pagos, tickets, dispositivos, provisioning o consumo.
- Reutilización estructural de componentes entre expediente y subscriber en esta fase.
- Integraciones nuevas entre CRM y módulos externos fuera de los puertos ya definidos.
- Cambios al stack, al modelo multi-tenant por schema o al boundary del CrmModule.

---

## 4. Requerimientos funcionales

### 4.1 Conversión del expediente a subscriber

| ID | Requerimiento | Prioridad |
| --- | --- | --- |
| RF-S360-01 | Al transicionar un expediente a `LISTO_PARA_INSTALACION`, el sistema debe crear o reutilizar un subscriber vinculado por `expedienteId` en estado `PROSPECT`. | MVP |
| RF-S360-02 | La creación automática debe ser idempotente por tenant + `expedienteId`. | MVP |
| RF-S360-03 | Al transicionar el expediente a `CLIENTE_ACTIVO`, el subscriber vinculado debe pasar de `PROSPECT` a `ACTIVE`. | MVP |
| RF-S360-04 | Al transicionar el expediente a `DESCARTADO`, el subscriber vinculado en `PROSPECT` debe pasar automáticamente a `CANCELLED`. | MVP |
| RF-S360-05 | El subscriber creado automáticamente debe conservar trazabilidad del expediente origen, fecha de conversión y fecha de activación. | MVP |

### 4.2 Gestión manual controlada

| ID | Requerimiento | Prioridad |
| --- | --- | --- |
| RF-S360-06 | Debe mantenerse `POST /crm/subscribers` como vía de creación manual solo para `TENANT_ADMIN` o superior. | MVP |
| RF-S360-07 | La creación manual debe exigir `manualOverrideReason` obligatorio con mínimo 10 caracteres. | MVP |
| RF-S360-08 | La creación manual puede incluir `expedienteId` opcional para vincular un expediente incompleto. | MVP |
| RF-S360-09 | Toda creación manual debe registrar auditoría diferenciada. | MVP |

### 4.3 Subscriber 360°

| ID | Requerimiento | Prioridad |
| --- | --- | --- |
| RF-S360-10 | La página `/dashboard/crm/subscribers/[id]` debe ofrecer una vista 360° espejo del expediente detail. | MVP |
| RF-S360-11 | La vista debe incluir 6 tabs: Vista general, Datos, Servicios, Financiero, Cumplimiento y Seguimiento. | MVP |
| RF-S360-12 | La tab Vista general debe resumir identidad, origen, servicio activo y trazabilidad del expediente. | MVP |
| RF-S360-13 | La tab Datos debe permitir edición por secciones con guardado individual. | MVP |
| RF-S360-14 | La tab Servicios debe mostrar contratos, cotizaciones y plan activo, dejando equipos y provisioning como stub explícito. | MVP |
| RF-S360-15 | La tab Financiero debe mostrar datos fiscales editables y placeholders claros para facturación y pagos. | MVP |
| RF-S360-16 | La tab Cumplimiento debe mostrar consentimientos, solicitudes ARCO y consentimientos heredados del expediente origen. | MVP |
| RF-S360-17 | La tab Seguimiento debe consolidar timeline de conversión, cambios de estado y eventos relevantes. | MVP |
| RF-S360-18 | La vista debe incluir link inverso al expediente origen cuando exista `expedienteId`. | MVP |

### 4.4 Pipeline CRM

| ID | Requerimiento | Prioridad |
| --- | --- | --- |
| RF-S360-19 | El listado de expedientes debe excluir por defecto estados `CLIENTE_ACTIVO` y `DESCARTADO`. | MVP |
| RF-S360-20 | Debe existir opción explícita para mostrar expedientes completados cuando el usuario lo requiera. | MVP |
| RF-S360-21 | El expediente completado debe seguir accesible por búsqueda directa y desde el Subscriber 360°. | MVP |

---

## 5. Requerimientos no funcionales

| ID | Requerimiento | Prioridad |
| --- | --- | --- |
| RNF-S360-01 | Mantener multi-tenancy por schema y resolución de tenant vigente. | MVP |
| RNF-S360-02 | No acceder a tablas de otros módulos fuera del boundary CRM. | MVP |
| RNF-S360-03 | Usar eventos de dominio intra-módulo; no introducir BullMQ para esta orquestación. | MVP |
| RNF-S360-04 | Mantener validación Zod en todos los boundaries nuevos o extendidos. | MVP |
| RNF-S360-05 | No recalcular IVA en frontend; el backend mantiene la fuente de verdad. | MVP |
| RNF-S360-06 | Zero PII en logs, tests y documentación. | MVP |
| RNF-S360-07 | El frontend debe conservar identidad iWana y contraste AA. | MVP |
| RNF-S360-08 | Los placeholders de módulos futuros deben ser explícitos y no simular datos inexistentes. | MVP |

---

## 6. Modelo funcional y de datos

### 6.1 Ciclo de vida aprobado

```text
Expediente:
NUEVO_POTENCIAL → PRECALIFICADO → VALIDANDO_COBERTURA → EN_COTIZACION
                                                      ↓
                                            LISTO_PARA_INSTALACION
                                                      ↓ crea Subscriber(PROSPECT)
                                            INSTALACION_AGENDADA
                                                      ↓
                                            CLIENTE_ACTIVO
                                                      ↓ activa Subscriber(ACTIVE)

Excepción aprobada:
DESCARTADO post-conversión → cancela Subscriber(PROSPECT)
```

### 6.2 Extensión mínima de datos en subscriber

| Campo | Tipo | Uso |
| --- | --- | --- |
| `expedienteId` | uuid nullable | Trazabilidad con expediente origen |
| `convertedAt` | timestamptz nullable | Fecha de conversión a `PROSPECT` |
| `activatedAt` | timestamptz nullable | Fecha de activación a `ACTIVE` |

### 6.3 Composición del 360°

El Subscriber 360° debe agregarse desde estas fuentes del bounded context CRM:

- `Subscriber`
- `SubscriberContact`
- `Contract`
- `Quote`
- `HabeasDataConsent`
- `ArcoRequest`
- resumen del `ExpedienteRecord` origen
- `ContactAttempt`, `StatusChange`, `ConsentRecord` y eventos derivados relevantes del expediente

Facturas, pagos, tickets, consumo, equipos y provisioning quedan señalados como capacidades futuras integrables por puertos o módulos especializados.

---

## 7. Diseño de experiencia del portal

La experiencia del Subscriber 360° debe replicar los principios del detalle de expediente, no solo sus colores:

1. header superior con back button, nombre comercial o persona, badges de estado y metadata clave;
2. tabs horizontales con patrón y jerarquía visual consistente;
3. tab Datos organizada en cards por sección, grid dos columnas, porcentaje de completitud y guardado por sección;
4. timeline en Seguimiento con filtros y orden cronológico descendente;
5. Vista general con cards ejecutivas y stubs honestos para módulos no implementados.

No se comparte implementación interna de componentes con expediente en esta fase. Sí se replica patrón visual y de interacción.

---

## 8. Criterios de aceptación

| CA | Descripción |
| --- | --- |
| CA-S360-01 | La transición a `LISTO_PARA_INSTALACION` crea un subscriber `PROSPECT` sin duplicados. |
| CA-S360-02 | La transición a `CLIENTE_ACTIVO` activa el subscriber vinculado y registra `activatedAt`. |
| CA-S360-03 | La transición a `DESCARTADO` cancela el subscriber `PROSPECT` vinculado. |
| CA-S360-04 | El pipeline abierto ya no muestra por defecto expedientes `CLIENTE_ACTIVO` ni `DESCARTADO`. |
| CA-S360-05 | La vista Subscriber 360° muestra las 6 tabs aprobadas y respeta el patrón visual de expediente. |
| CA-S360-06 | El guardado por sección funciona con validación parcial y feedback de carga. |
| CA-S360-07 | El enlace inverso entre subscriber y expediente funciona cuando existe trazabilidad. |
| CA-S360-08 | Los módulos no implementados aparecen como placeholders explícitos, sin datos ficticios. |
| CA-S360-09 | `pnpm --filter @iwana/api typecheck` y `pnpm --filter @iwana/portal typecheck` pasan sin errores. |
| CA-S360-10 | Existen pruebas para conversión, activación, cancelación y guardado por sección. |

---

## 9. Dependencias y decisiones cerradas

### Dependencias directas

- `docs/prds/PRD-MOD05-CRM-SUBSCRIBERS-v1.0.md`
- `docs/prds/PRD-MOD05-CRM-SUBSCRIBERS-FASE-02-v1.0.md`
- `docs/prds/PRD-MOD05-CRM-AUTO-PIPELINE-v1.0.md`
- `docs/hlds/HLD-MOD05-ARQUITECTURA-v2.0.md`
- futuro `docs/adrs/ADR-027-Conversion-Expediente-Subscriber-Two-Stage.md`

### Decisiones cerradas para ejecución

1. la conversión inicia en `LISTO_PARA_INSTALACION`, no en `CLIENTE_ACTIVO`;
2. `LEAD` queda reservado para alta manual o legado;
3. un expediente descartado post-conversión cancela al subscriber prospecto vinculado;
4. no se comparten componentes entre expediente y subscriber en esta fase;
5. la creación manual se permite solo con autorización administrativa y razón obligatoria;
6. el expediente completado sale del pipeline visible, pero no se elimina.

---

**Resultado esperado:** fase aprobada y lista para ejecución fullstack, con boundaries claros entre conversión operativa, trazabilidad comercial y experiencia 360° del cliente.