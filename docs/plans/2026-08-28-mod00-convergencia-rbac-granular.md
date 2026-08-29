# Plan de ejecucion — MOD00 Convergencia RBAC Granular (Catalogo V2)

**Version:** 1.0
**Fecha:** 2026-08-28
**Estado:** Aprobado para ejecucion
**Autor:** AI-EM-ARCH (orquestador)
**ADR gobernante:** docs/adrs/ADR-083-Convergencia-RBAC-Granular-Modulos-Operativos.md (aprobado por el CTO el 2026-08-28)
**PRD:** docs/prds/PRD-MOD00-CONFIGURACION-CONTROL-PLANE-v1.0.md (v1.7, addendum §4.3.4)
**HLD:** docs/hlds/HLD-MOD00-CONFIGURACION-CONTROL-PLANE-v1.0.md (v1.7, addendum §6.6 y firmas §6.6.1)
**G1:** firmado 2026-08-28 — AI-SR-FULL GO CON CONDICIONES; AI-PROD-UX GO CON CONDICIONES

---

## 1. Contratos congelados (protocolo §3bis — citando ruta y version)

| Contrato | Fuente congelada |
| --- | --- |
| Catalogo V2 (12 claves nuevas/promovidas + deprecacion `crm.customers.*`) | PRD-MOD00 v1.7 §4.3.4, tabla "Matriz V2" |
| Matriz de compatibilidad V2 por categoria base | PRD-MOD00 v1.7 §4.3.4 (misma tabla; columnas de categorias) |
| Plantillas estandar "Acceso estandar {Categoria}" (9 categorias; SUBSCRIBER/PARTNER/INVESTOR sin plantilla) | PRD-MOD00 v1.7 §4.3.4, tabla de plantillas |
| Cableado por controller (lectura/escritura/excepciones) | HLD-MOD00 v1.7 §6.6, tabla de cableado + reglas 1-3 |
| Cache de permisos efectivos (`access:perms:{tenantId}:{userId}`, TTL ≤60 s, fan-out, degrade a BD) | HLD-MOD00 v1.7 §6.6 "Cache" + condiciones G1 SR-FULL (§6.6.1) |
| Mapeo menu -> permiso para nav (contrato nuevo de Fase 3) | Este plan, §3 Fase 3 |
| Contratos de API access-control existentes (8 endpoints) | Sin cambios de ruta ni payload salvo catalogo V2 en `GET /access-control/permissions` |

Un cambio de cualquiera de estos contratos es el unico evento que fuerza re-sync de tracks y se coordina via AI-EM-ARCH.

## 2. Mapeo menu -> permiso (congelado para Fase 3)

| Item del Sidebar | Permiso requerido |
| --- | --- |
| Inicio | (sin gate) |
| Oportunidades (`/dashboard/crm/expedientes`) | `crm.expedientes.read` |
| Suscriptores (`/dashboard/crm/subscribers`) | `crm.subscribers.read` |
| Programación | `wfm.schedule.read` |
| Mesa de ayuda | `assurance.tickets.read` |
| Operaciones | `operations.execution_orders.read` OR `operations.tasks.read` OR `operations.execution_orders.execute` |
| Inventario | `inventory.stock.read` |
| Comercial | `commercial.catalog.read` |
| Configuración | `settings.read` |
| Usuarios | `users.read` |

## 3. Fases

### Fase 1 — Catalogo V2, corte y cache (AI-SR-FULL)

Prompt: `docs/prompts/PROMPT-MOD00-ACCESO-CONVERGENCIA-FASE-01-v1.0.md`

1. Enum V2 (`@iwana/shared`): +8 claves, `@deprecated` en `CRM_CUSTOMERS_*`, version `MOD00_ACCESS_V2`.
2. Constantes: catalogo V2 (promociones con descripcion visible sin "en fase futura"), matriz V2, canon de plantillas estandar de 9 categorias — absorbiendo las 3 condiciones G1 SR-FULL: (a) `ensureSystemRoleTemplatesSeeded` no renombra/sobrescribe estandares V2; (b) deprecacion canonica expresible en seed + `listPermissions` a V2; (c) invalidacion de cache completa.
3. Migracion tenant numerada consecutiva: up = catálogo V2 + plantillas estandar + asignacion a usuarios activos no-ADMIN sin perfiles (`INSERT...SELECT` set-based); down = reversa exacta (solo lo creado por esta migracion).
4. Cache Redis en `EffectivePermissionsService` + puerto de invalidacion exportado por `AccessControlModule` consumido por Users en cambio de `role`/`status`.
5. Tests: invariantes V2 extendidos, migracion up/down/idempotencia, cache (abanico, role/status, degrade Redis), tenant nuevo provisionado.

Gate de salida: tests verdes, typecheck/lint, migracion up+down verificada en tenant de desarrollo, auditoria en mutaciones.

### Fase 2 — Cableado doble guard (AI-SR-FULL; review AI-SEC-ENG obligatoria)

Prompt: `docs/prompts/PROMPT-MOD00-ACCESO-CONVERGENCIA-FASE-02-v1.0.md`

1. `PermissionsGuard + @Permissions` segun tabla de cableado HLD §6.6: crm (subscribers, expedientes + 8 subrecursos), assurance, inventory, purchasing, commercial (6 controllers).
2. Ampliaciones `@Roles` de lectura: `TECHNICIAN`/`AUDITOR` segun matriz V2; excepciones D7 intactas (subscriber-tax, 2 endpoints expedientes TECHNICIAN, media).
3. Tests HTTP rol×permiso por modulo (incluidas las 3 ampliaciones deliberadas) + invariante "todo handler con `@Permissions` declara tambien `@Roles`".
4. **Review AI-SEC-ENG** antes del gate de salida (superficie de autorizacion; ampliaciones de `@Roles`).

Gate de salida: matriz HTTP 200/403 verdes, review SEC-ENG sin bloqueantes, OpenAPI coherente.

### Fase 3 — Frontend por permisos efectivos (AI-FE-PLATFORM; contrato AI-DS-OWNER)

Precondicion dura: spec UX de AI-PROD-UX congelada en `docs/specs/` (solicitada el 2026-08-28). Contenido minimo fijado por G1 (HLD §6.6.1).

1. Contexto `usePermissions()` en el layout del dashboard; nav por permisos (mapeo §2); estados carga/error sin bloquear navegacion.
2. Gates de pagina en las 6 superficies (3 estados: autorizado/restringido/error) con deep-links.
3. Access: una seccion de 9 sugeridos + extension de `SYSTEM_TEMPLATE_PROFILE_NAMES`; Users: panel de accesos efectivos en side peek + advertencia de cambio de categoria.
4. Regeneracion de snapshots E2E de access; axe 0 violaciones.

**Condicion de despliegue (G1, bloqueante):** el gating de nav se activa por tenant solo despues de que la migracion de Fase 1 haya corrido en ese tenant.

### Fase 4 — Verificacion y cierre (AI-SR-QA)

1. E2E piloto: tecnico con perfil "Ver Suscriptores" ve menu y consulta; sin permiso, no.
2. Regresion de acceso por categoria antes/despues del corte (via tests de seed/migracion de Fase 1).
3. Cobertura ≥80% en access-control; E2E de las 6 superficies gateadas; axe.
4. Informe de fase con evidencia de gates G6/G6.5/G7 por separado.

## 4. Riesgos y mitigaciones

| Riesgo | Mitigacion |
| --- | --- |
| Seed deshace el corte (colision plantillas) | Condicion G1 SR-FULL (1) en prompt Fase 1; test de idempotencia post-`listProfiles()` |
| `crm.customers.*` reactivada por seed | Condicion G1 SR-FULL (2); invariante de claves deprecadas ausentes |
| Nav vacia para no-ADMIN si FE se activa antes del corte | Condicion G1 PROD-UX: despliegue FE tras migracion por tenant |
| Cache stale tras cambio de rol | Puerto de invalidacion Users→AccessControl + TTL ≤60 s + test dedicado |
| Tenants dormidos sin cortar | Migracion corre por cadena de migraciones al tocar el tenant; seed autocurativo cubre catalogo |
| Drift `@Roles` vs matriz | Invariante "handler con `@Permissions` declara `@Roles`" + matriz congelada en PRD |

## 5. Criterios de cierre del modulo

- Nadie pierde acceso vigente el dia del corte (evidencia de tests de migracion).
- El caso piloto tecnico→Suscriptores funciona end-to-end y sin permiso no funciona.
- Los 6 grupos de controllers cableados responden 200/403 segun matriz V2.
- Review AI-SEC-ENG y spec UX congelada registradas; G6, G6.5 y G7 firmados por separado en el informe de fase.
