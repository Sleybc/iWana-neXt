# PROMPT — MOD00 Acceso Convergencia Fase 02 — Cableado doble guard en modulos operativos

**Version:** 1.0
**Fecha:** 2026-08-28
**Agente destinatario:** AI-SR-FULL (review obligatoria: AI-SEC-ENG antes del gate de salida)
**Autor del prompt:** AI-EM-ARCH (orquestador)
**Modo:** Ejecucion por fase
**Precondicion:** Fase 1 cerrada (catalogo V2, corte, cache en produccion de codigo y verificados)

---

## 1. Entradas normativas (obligatorias)

- docs/adrs/ADR-083-Convergencia-RBAC-Granular-Modulos-Operativos.md (Aprobado) — D2 (doble guard y regla de ampliacion de lectura), D3 (ampliaciones deliberadas), D7 (excepciones)
- docs/prds/PRD-MOD00-CONFIGURACION-CONTROL-PLANE-v1.0.md — §4.3.4 (matriz V2)
- docs/hlds/HLD-MOD00-CONFIGURACION-CONTROL-PLANE-v1.0.md — §6.6 tabla de cableado y reglas 1-3; §6.6.1
- docs/plans/2026-08-28-mod00-convergencia-rbac-granular.md (contratos congelados)

## 2. Contratos congelados

- Tabla de cableado por controller (lectura/escritura/excepciones): HLD §6.6.
- Matriz V2: PRD §4.3.4. Regla de ampliacion: solo `@Roles` de LECTURA, siempre acompanada de `@Permissions` con clave ASSIGNABLE.
- Excepciones intocables (D7): `subscriber-tax.controller` y los 2 endpoints de expedientes con `TECHNICIAN` en `@Roles` permanecen `@Roles`-only; modulo media fuera de alcance; `billing.*` permanece RESERVED.

## 3. Alcance exacto (Fase 2)

### 3.1 Cableado (guards en clase + `@Permissions` por handler)

Patron productivo de referencia: `users.controller.ts` (`@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)`; `AccessControlModule` ya exporta `PermissionsGuard`; importarlo en crm/assurance/inventory/commercial no crea ciclos).

| Controller | Lectura | Escritura | Ampliacion `@Roles` de GET |
| --- | --- | --- | --- |
| `crm/subscribers/subscribers.controller.ts` | `crm.subscribers.read` | `crm.subscribers.manage` | + `TECHNICIAN`, + `AUDITOR` |
| `crm/expedientes` y `opportunities`, `prospects`, `potentials`, `quotes`, `contacts`, `contracts`, `reviews`, `habeas-data` | `crm.expedientes.read` | `crm.expedientes.manage` | + `AUDITOR` |
| `assurance/assurance.controller.ts` | `assurance.tickets.read` | `assurance.tickets.manage` | + `AUDITOR` |
| `inventory/inventory.controller.ts` | `inventory.stock.read` | `inventory.stock.manage` | + `TECHNICIAN`, + `AUDITOR` |
| `inventory/purchasing.controller.ts` | `inventory.purchasing.read` | `inventory.purchasing.manage` | + `AUDITOR` |
| `commercial/controllers/*` (catalog, bundle, promotion, compatibility, picker-search, dashboard) | `commercial.catalog.read` | `commercial.catalog.manage` | + `AUDITOR` |

Reglas:
1. `@Roles` de escritura NO se amplia en esta fase. Los subconjuntos actuales de commercial (offers sin NOC, prices sin SUPPORT/NOC, compat sin ACCOUNTANT/NOC, writes solo ADMIN/ACCOUNTANT segun constante) se conservan via `@Roles` — el permiso no amplia lo que `@Roles` restringe.
2. Cada handler con `@Permissions` declara tambien `@Roles` (techo estructural).
3. Sin cambios de payload ni de rutas: solo autorizacion.

### 3.2 Tests (obligatorios)

- HTTP por controller: matriz rol×permiso (200 con permiso+rol valido; 403 si falta permiso aunque el rol pase; 403 si el rol no pasa aunque haya permiso), cubriendo las 3 ampliaciones deliberadas (`TECHNICIAN`→subscribers.read, `TECHNICIAN`→inventory.stock.read, `AUDITOR`→todos los `*.read`).
- Negativos D7: subscriber-tax y expedientes-TECHNICIAN siguen sin `@Permissions`; `billing.*` no aparece en ninguna validacion.
- Invariante nuevo: todo handler con `@Permissions` declara `@Roles` (extender el spec de invariantes existente).
- Aislamiento tenant intacto en los endpoints cableados.

### 3.3 Review de seguridad (bloqueante para el gate)

AI-SEC-ENG revisa: ampliaciones de `@Roles` de lectura (superficie expuesta a TECHNICIAN/AUDITOR sobre datos con PII — Suscriptores), interaccion cache+guards, y ausencia de bypass (frontend no autoriza). Sin bloqueantes SEC-ENG no hay gate de salida.

## 4. Restricciones

- Sin cambios frontend (Fase 3). Sin tocar el canon de plantillas/migracion de Fase 1.
- Sin `any`, sin logs con PII, imports sin ciclos (AccessControlModule no importa internals de los modulos consumidores).
- OpenAPI: sin endpoints nuevos; verificar que las anotaciones de seguridad reflejan el doble guard si el pipeline de spec las expone.

## 5. Entregables

1. Codigo de cableado por controller + tests HTTP en verde.
2. `pnpm typecheck` + `pnpm lint` limpios.
3. Informe breve de revision AI-SEC-ENG (hallazgos y veredicto) registrado en `docs/informes/` o como seccion del informe de fase.
4. Resumen de cambios por archivo y desviaciones propuestas.

## 6. Stop / Go

- **STOP y escala** si: algun endpoint requiere ampliacion de `@Roles` de escritura para funcionar; aparece dependencia oculta entre guards; o el invariante nuevo destapa handlers preexistentes con `@Permissions` sin `@Roles` fuera del alcance.
- **GO a Fase 3** cuando: tests verdes, SEC-ENG sin bloqueantes, y el orquestador valida el resumen. Fase 3 requiere ademas la spec UX de AI-PROD-UX congelada y la condicion de despliegue (nav gating solo tras la migracion de Fase 1 por tenant).
