# ADR-105: Jobs de dominio procesados en la API

**Versión:** 1.0
**Estado:** Aprobado
**Aprobado por:** CTO, 2026-11-07 (§6, punto 1). El punto 2 (corregir la skill y auditar las seis colas) queda como encargo aparte
**Fecha:** 2026-11-07
**Autor:** AI-EM-ARCH
**Modo activo:** Architect
**Módulos:** `apps/api` (consumidores de dominio), `apps/worker` (consumidores de infraestructura), skill `bullmq-specialist`
**Relacionado:** [spec H-EXP v1.1](../specs/2026-11-07-privacy-h-exp-retencion-spec.md) §6 · [ADR-094](ADR-094-Modelo-Proteccion-Datos-Personales-Habeas-Data.md) D7
**Origen:** decisión del CTO del 2026-11-07 sobre H-EXP: el job de vencimiento de la retención se procesa en la API (opción B), no por una ruta interna llamada desde el worker.

---

## 1. Contexto

La skill `bullmq-specialist` dice que la API solo encola y que el worker procesa. El código ya no lo cumple: seis colas se consumen con `@Processor` dentro de `apps/api`:

| Cola | Archivo |
| --- | --- |
| Generación de facturación | `billing/generation/billing-generation.processor.ts` |
| Alertas de vencimiento de privacidad | `privacy/alerts/privacy-due-alerts.processor.ts` (programada en `onApplicationBootstrap` con `repeat`) |
| Solicitudes de ejecución de inventario | `inventory/services/inventory-execution-request.processor.ts` |
| Eventos de ejecución de red | `network/network-execution-event.processor.ts` |
| Reconciliación de aprovisionamiento | `network/network-provisioning-reconciler.processor.ts` |
| Alta masiva de usuarios | `users/users-bulk-create.processor.ts` |

Todas tienen algo en común: necesitan servicios y participantes de varios módulos del Modulith dentro de una transacción tenant. Llevarlas al worker obligaría a duplicar ese código o a abrir un canal HTTP interno con su propia autenticación. La spec H-EXP v1.0 proponía ese canal (token RS256, ruta interna, rotación de claves), que es una frontera de confianza nueva.

## 2. Decisión

Un job se procesa **en la API** cuando su trabajo necesita servicios de dominio de más de un módulo o la transacción tenant que esos servicios ya gestionan. Se procesa **en el worker** cuando es de infraestructura: purgas, envíos, tareas que no tocan reglas de dominio.

Un consumidor en la API cumple estas condiciones:

1. El payload lleva solo identificadores técnicos (`tenantId`, `runId`, versión), validados con Zod estricto en `packages/shared`. Nunca schema, slug, PII, HMAC ni secretos.
2. El consumidor resuelve el schema desde `public.tenants` por ID, exige estado activo y fija `SET LOCAL search_path` en cada transacción.
3. El job no elige el objeto del dominio sobre el que actúa: el consumidor relee el estado y revalida todas las reglas. Así, quien pudiera escribir en Redis solo puede adelantar una corrida, no forzar un efecto.
4. Idempotencia por un ledger persistido en PostgreSQL, no solo por el `jobId` de BullMQ.
5. Concurrencia acotada por cola y trabajo en lotes pequeños, para no competir con las peticiones HTTP.
6. Errores saneados (`@SanitizeFailedReason` o equivalente) y apagado ordenado.

## 3. Consecuencias

- H-EXP no necesita ruta interna, token de workload ni gestión de claves nuevas.
- La API comparte proceso con trabajo de fondo. Si una cola crece, se puede levantar la misma imagen de la API con un perfil que solo consuma colas, sin cambiar este ADR.
- La skill `bullmq-specialist` debe corregirse para describir las dos clases de jobs. Es un cambio aparte.

## 4. Alternativas descartadas

- **Ruta interna con token firmado (spec H-EXP v1.0, opción A):** frontera de confianza nueva, con replay, rotación y exposición en el proxy por resolver, para un job diario de baja frecuencia.
- **Motor en el worker importando módulos de la API:** rompe los límites del Modulith.
- **Solo cron del servidor llamando al CLI:** depende de la operación de cada ISP; queda como respaldo manual.

## 5. Fuera de alcance

Migrar las seis colas existentes o revisar si cumplen todas las condiciones de §2: se audita aparte.

## 6. Decisiones del CTO requeridas

1. Aprobar la regla de §2 y sus condiciones.
2. Encargar la corrección de la skill `bullmq-specialist` y la auditoría de las seis colas existentes contra §2.
