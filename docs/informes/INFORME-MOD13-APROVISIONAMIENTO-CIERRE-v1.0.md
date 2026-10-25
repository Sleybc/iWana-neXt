# INFORME — MOD13 · Red y Aprovisionamiento · Fase 01 · Cierre · v1.0

**Fecha:** 2026-10-25 · **Autor:** AI-EM-ARCH · **Estado:** Borrador. G7 queda abierto hasta completar los pasos 3 a 6 de §4, que hace el CTO por la UI.
**Definición:** [PRD v1.1](../prds/PRD-MOD13-RED-APROVISIONAMIENTO-FASE-01-v1.1.md) · [HLD v1.1](../hlds/HLD-MOD13-RED-APROVISIONAMIENTO-FASE-01-v1.1.md) · [ADR-098](../adrs/ADR-098-IPAM-y-Aprovisionamiento-Certificado-MOD13.md) · enmienda de ADR-027
**Plan:** [2026-10-22-mod13-aprovisionamiento](../plans/2026-10-22-mod13-aprovisionamiento.md) · **Encargos:** [PROMPT-MOD13-APROVISIONAMIENTO-FASE-01-v1.1](../prompts/PROMPT-MOD13-APROVISIONAMIENTO-FASE-01-v1.1.md)
**Veredicto:**
- G0 a G6 ✅.
- G7: código, push y CI de `main` ✅. El CI `40195554094` y el E2E Web Admin Smoke `40195554080` pasaron en verde sobre `70000111`.
- Faltan el catálogo real, la regularización del caso de origen y la guarda en `tenant_iwana`.

---

## 1. Problema de origen

El 2026-10-22 se cerró como `COMPLETED / EXECUTED` la OT de instalación `OTE-20260828-001` de `tenant_iwana`, pero el suscriptor siguió en `PROSPECT` y el expediente en `LISTO_PARA_INSTALACION`. Había dos causas:
- nada consumía el cierre de la OT;
- no existía aprovisionamiento de red: ni IPAM, ni routers, ni certificación.

## 2. Qué se entregó

| Commit | Contenido |
| --- | --- |
| `30a682a3`, `3efc141f` | Definición (G0) y re-sync del contrato v1.1 |
| `4217690a` | Migraciones pública 028 (`btree_gist`) y tenant 160 a 162; contratos compartidos; permisos |
| `03825527` | Catálogo de routers, redes IPv4 y perfiles PCQ; IPAM con candado por red y prueba de 20 reservas concurrentes sin duplicados |
| `f2de5537` | Reservar, certificar, liberar y regularizar dentro de la OT; requisito `PROVISIONING` y guarda de `close()`; reenvío firmado del worker; consumidor con inbox; reconciliador; listeners de CRM e Inventario |
| `4742c33c` | Portal: Red › Routers, Redes IPv4, Bandeja y Ajustes; panel en la OT; sección de servicio técnico en la ficha del suscriptor |
| `b9a8d0ca`, `706130ef` | Correcciones de las revisiones de seguridad, frontera, contratos y UI (G5) |
| `42d4b7b5` | Migraciones 163 y 164 corregidas, arranque del API y tenant E2E |
| `594861d0` | Pruebas de extremo a extremo; G4 y G6 |
| `9ae4cc8f`, `98f636b4`, `70000111` | El spec en vivo entra en el CI; cableado dentro del proceso; líneas base de Linux; el paso de integración ya no se cuelga (`timeout-minutes`) |

Corrección relacionada de MOD11 (fuera de esta fase): `509237fb` (ADR-099). Antes de ella, `NOT_EXECUTED` exigía un CPE instalado.

## 3. Evidencia

- **E2E en vivo:** con el API real, el flujo instalar → reservar como NOC → cierre prematuro rechazado con 422 → certificar → cerrar deja en `ACTIVE` el servicio, el suscriptor y el comodato. Anular la OT libera la IP. El spec pasó dos veces seguidas en local y ahora corre en el job bloqueante «E2E portal».
- **Cobertura de `network`:** 87,05 % de sentencias y 70,44 % de ramas.
- **CI de `main`:** `40195554094` en verde (lint, typecheck, build, unitarias, integración contra Postgres, E2E portal, E2E R4.1, imágenes y citas ADR). Los dos runs anteriores fallaron por causas de MOD13 ya corregidas:
  - `40096899059`: un spec de cableado dependía de un API vivo, y 8 capturas quedaron desfasadas por el sidebar;
  - `40104246528`: el spec de cableado se colgó 6 h porque faltaban las claves JWT en el CI.

## 4. G7 en `tenant_iwana`

### 4.1 Estado verificado en solo lectura (2026-10-25)

| Dato | Valor |
| --- | --- |
| `OTE-20260828-001` | `COMPLETED / EXECUTED`, `INSTALLATION`, con técnico asignado, 1 CPE en comodato instalado y 4 evidencias. Es elegible para regularizar (R12) |
| Suscriptor del caso | `PROSPECT`, persona `NATURAL`, con contacto real y responsabilidad de IVA, pero **sin responsabilidades RUT**: está fiscalmente incompleto |
| Expediente | `LISTO_PARA_INSTALACION`; plan de interés «Plan Basico» |
| Catálogo de red | 0 routers, 0 redes, 0 perfiles PCQ; guarda apagada |
| Otras OT de instalación | 1 en `ASSIGNED`. Ninguna otra cerrada sin aprovisionar |
| Usuarios que pueden regularizar | 2 ADMIN, ambos distintos del técnico de la OT. No hay usuarios NOC |
| Sedes | 1 (oficina) |
| Planes | 8 activos con nombres repetidos: «Plan Alto» ×2, «Plan Basico» ×2, «Plan Medio» ×2 |

### 4.2 Pasos pendientes (CTO, por la UI)

| # | Paso | Resultado |
| --- | --- | --- |
| 3 | Catálogo real: router, red IPv4 y perfiles PCQ | ⏳ |
| 3-bis | Completar las responsabilidades RUT del suscriptor del caso de origen | ⏳ |
| 5 | Regularizar `OTE-20260828-001` como ADMIN, con motivo | ⏳ |
| 6 | Verificar en solo lectura: suscriptor `ACTIVE` con `activated_at`, expediente `CLIENTE_ACTIVO`, servicio `ACTIVE` con `origin = REGULARIZED` y activación comercial `DONE` | ⏳ |
| 4 | Encender la guarda en `tenant_iwana` | ⏳ |

**Alcance de la guarda.** Los otros 6 tenants `ACTIVE` son de pruebas y no tienen catálogo de red. AI-EM-ARCH recomienda encender la guarda solo en `tenant_iwana`. Encenderla en los de pruebas haría incerrables sus instalaciones y rompería suites de MOD11 que no aprovisionan. Esto acota la redacción «tenants `ACTIVE`» de D-NET-3 y debe confirmarlo el CTO.

### 4.3 Resultado

_Pendiente: se completa con la verificación del paso 6._

## 5. Deuda declarada (P3)

1. **MAC del CPE:** el API de inventario (MOD12) no permite registrarla. No afecta a colas simples ni PCQ, pero bloquea un futuro `DHCP_LEASE`.
2. **CHECK de tipos de requisito:** la migración 163 amplía `chk_execution_order_template_requirements_kind` solo en los tenants que tienen la plantilla.
3. **Throttler:** `TenantAwareThrottlerGuard` se importa desde `tasks/guards`; debería vivir en un módulo común.
4. **42P10:** el error en `permission-holders-read.adapter.ts` sigue abierto.
5. **Variables E2E:** `E2E_AUDITOR_*` y `E2E_PRIVACY_*` apuntan a un tenant en `PROVISIONING`.
6. **Datos de pruebas:** los datos sintéticos de V1-ci2 siguen en el tenant de pruebas, y el paso de limpieza del CI falla sin avisar.
7. **Spec de cableado:**
   - cierra un `compile()` fallido con partes internas de `@nestjs/testing` (una actualización de Nest puede romperlo);
   - comprueba `JWT_PRIVATE_KEY` con una condición escrita a mano.
8. **Límites de tiempo del CI:** solo el job de lint y el paso de integración del API tienen `timeout-minutes`. `plat-ops` propuso cifras para el resto (citas ADR 5 min, imágenes 15, cobertura 20, migración 089 5, integración del worker 3).
9. **Planes con nombre repetido:**
   - en `tenant_iwana` hay 3 pares de planes con el mismo nombre (dato de MOD06);
   - Red › Ajustes los lista solo por nombre, así que no se distinguen al asignar la lista PCQ.
10. **Sin rol de aprovisionamiento en `tenant_iwana`:** no hay usuarios NOC, así que hoy certifican y regularizan los ADMIN.

## 6. Efecto en otros módulos

- **CRM (MOD05):** la activación técnica lleva el expediente a `CLIENTE_ACTIVO` y el suscriptor a `ACTIVE` (enmienda de ADR-027). Si la ficha está incompleta, queda «Activación comercial pendiente» a la vista.
- **Operaciones (MOD11):** nuevo requisito `PROVISIONING` y guarda por tenant en `close()`.
- **Inventario (MOD12):** `contract_ref_id` del comodato al activarse, cuando hay contrato.
- **Worker:** reenvío firmado de los cierres, cancelaciones y anulaciones de instalaciones a `network-execution-events`.
