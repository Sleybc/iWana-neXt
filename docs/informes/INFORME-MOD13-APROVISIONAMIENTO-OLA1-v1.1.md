# INFORME-MOD13 — Aprovisionamiento · Ola 1 y Ola 1-bis

**Versión:** 1.1  
**Estado:** Ola 1-bis ejecutada · siguiente: Ola 2 (B1b)  
**Fecha:** 2026-10-22  
**Emisor:** AI-EM-ARCH  
**Fuentes:** [PRD-MOD13 v1.1](../prds/PRD-MOD13-RED-APROVISIONAMIENTO-FASE-01-v1.1.md) · [HLD-MOD13 v1.1](../hlds/HLD-MOD13-RED-APROVISIONAMIENTO-FASE-01-v1.1.md) · [ADR-098](../adrs/ADR-098-IPAM-y-Aprovisionamiento-Certificado-MOD13.md) · [plan](../plans/2026-10-22-mod13-aprovisionamiento.md) · [prompt v1.1](../prompts/PROMPT-MOD13-APROVISIONAMIENTO-FASE-01-v1.1.md)

## Resultado por bloque

| Bloque               | Resultado                                                                                                                                  | Entregable o evidencia                                                                                |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------- |
| S0 · sec-eng         | Cerrado en diseño: HLD v1.1 resuelve los 4 P1 y trata los 3 P2; queda una verificación de configuración/runtime para V2. G5 sigue abierto. | [Revisión de seguridad](INFORME-MOD13-REVISION-SEGURIDAD-DISENO-v1.0.md), sección «Verificación v1.1» |
| D1 · data-eng        | Cerrado: extensión pública 028 y migraciones tenant 160–162 con entidades.                                                                 | Evidencia original de Ola 1 y detalle abajo                                                           |
| D1-bis · data-eng    | Cerrado: ajustes de 161/162 según HLD v1.1 §3.2 y §12; sin cambiar el contrato.                                                            | Migraciones e integraciones 161/162                                                                   |
| B1a-bis · sr-backend | Cerrado: cuerpos, tipos y listas de códigos de HLD §4.4 publicados en `@iwana/shared`.                                                     | `packages/shared/src/contracts/network/`                                                              |
| P0-bis · prod-ux     | Cerrado: spec UX completada contra HLD v1.1, sin campos añadidos.                                                                          | [Spec UX](../specs/2026-10-22-mod13-aprovisionamiento-ux.md)                                          |

## D1 · datos y migraciones

Q1 se resolvió con la opción autorizada por el usuario: migración pública 028 habilita `btree_gist` y conserva la extensión en `down`, siguiendo el precedente público 018. La migración tenant 160 mantiene la restricción `EXCLUDE` del HLD. Las pruebas de Ola 1 reportaron 4/4 suites y tests de integración para 028 y 160–162; la migración pública se aplicó y revirtió conservando la extensión compartida.

En Ola 1-bis, 161 añade `execution_order_number`, actor/fecha de regularización y actor de liberación, amplía la restricción de regularización y cambia el error libre de la bandeja por `last_error_code`. Las entidades reflejan las columnas. 162 incorpora `network.provisioning.regularize` a las plantillas de permisos especificadas en HLD §12.

Las pruebas usan schemas fixture efímeros en PostgreSQL local (`dbiw`), con el fixture en estado `PROVISIONING`; no se ejecutó ninguna migración sobre un tenant `ACTIVE`. Al finalizar se verificó la limpieza del fixture. Conteo de ida y vuelta: **3 migraciones tenant aplicadas y revertidas** (160, 161 y 162).

Verificación fresca de esta entrega:

```text
@iwana/db test:integration — 160, 161 y 162
3 suites, 3 tests: passed

@iwana/db Jest — tenant/migration-order.spec.ts
1 suite, 6 tests: passed

@iwana/db typecheck, build y ESLint de las rutas afectadas
Passed
```

## B1a-bis · contrato compartido

Se publicaron los tipos de respuesta y referencias de actor, los cuerpos de entrada estrictos con sus tipos inferidos, y las listas `NETWORK_ERROR_CODES` y `NETWORK_INBOX_ERROR_CODES` requeridas por HLD §4.4. Las validaciones mantienen los límites fijados por el HLD, incluido CIDR `/16`–`/30`; no se modificó PRD, HLD ni otro contrato fuente.

```text
@iwana/shared Jest — src/contracts/network/network.contracts.spec.ts
1 suite, 9 tests: passed

@iwana/shared lint, typecheck y build
Passed
```

## P0-bis · experiencia

La spec define catálogo de routers y redes, bandeja con las tres colas contractuales, panel de OT, proyección restringida para técnico, ficha del suscriptor, regularización, cierre y mensajes de error. Vincula permisos, estados, accesibilidad y criterios CA-NET-12/13/14 y RF-NET-14. No expone al técnico campos ajenos a `TechnicianProvisioningViewDto` ni inventa filtros o campos de respuesta.

## S0-bis · revisión de seguridad

La revisión documental de solo lectura confirma que HLD v1.1 resuelve en diseño los cuatro hallazgos P1. Dos de los tres P2 tienen controles definidos en el HLD; el pipeline de seguridad permanece pendiente de evidencia V2 sobre TLS, JWT, tenant, RBAC/ABAC, validación runtime y límites efectivos. No quedan bloqueos de diseño dentro del alcance revisado, pero **G5 no está cerrado** hasta verificar la implementación.

## Estado y siguiente paso

La Ola 1-bis queda cerrada y habilita la Ola 2, bloque B1b. No se encendió `enforceProvisioningOnInstallClose`, no se regularizó una OT y no se hizo commit; esas acciones pertenecen a gates posteriores. Se preservaron los cambios preexistentes ajenos a MOD13.
