# ADR-045: Consolidacion de la politica MFA global en Access y deprecacion de la ruta Seguridad independiente

**Version:** 1.1  
**Estado:** Aprobado  
**Fecha:** 2026-05-27  
**Modo activo:** Architect  
**Autor:** AI-EM-ARCH  
**Modulo:** MOD00 Configuracion Control Plane / MOD04 Usuarios Internos  
**ADR relacionado:** docs/adrs/ADR-040-Configuracion-Control-Plane-Organizacion-Acceso.md  
**PRD relacionado:** docs/prds/PRD-MOD00-CONFIGURACION-CONTROL-PLANE-v1.0.md  
**HLD relacionado:** docs/hlds/HLD-MOD00-CONFIGURACION-CONTROL-PLANE-v1.0.md  
**Informe relacionado:** docs/informes/INFORME-MOD00-CONFIGURACION-CONTROL-PLANE-v1.0.md

---

## Contexto

La auditoria funcional y tecnica del portal detecto una deriva entre la gobernanza documental aprobada y la experiencia real del producto en torno a la seguridad operativa del tenant.

Hallazgos verificados:

1. La ruta independiente `/dashboard/settings/security` solo expone una politica global: `settings.features.mfa_required_all`.
2. La misma politica global ya aparece duplicada en `/dashboard/profile` mediante `MfaRequiredToggle`, a pesar de que `Mi perfil` deberia concentrarse en seguridad personal del usuario autenticado.
3. `/dashboard/users` ya es la superficie operativa para cuentas internas, estado, MFA por usuario, reinicio de contraseña y asignacion de roles de empresa.
4. La documentacion vigente de MOD00 ya consolidaba en `/dashboard/settings/access` el gobierno de roles de empresa, permisos y acceso modular, dejando `/dashboard/users` como owner operativo de cuentas.
5. La existencia de una ruta `Seguridad` separada no agrega hoy un segundo o tercer bloque funcional que justifique su presencia como modulo propio dentro del control plane.

El problema no es que la seguridad deje de existir como dominio. El problema es que la experiencia actual reparte una unica politica global entre dos pantallas y deja una tercera ruta independiente con muy poco peso funcional.

---

## Decision

Se aprueba consolidar la politica MFA global del tenant dentro de `/dashboard/settings/access` y deprecar la ruta independiente `/dashboard/settings/security`.

### D1. Ownership visible aprobado para la propuesta

- `/dashboard/users` conserva ownership de cuentas internas, estado, MFA por usuario, reinicio de contraseña y asignacion de roles de empresa.
- `/dashboard/profile` conserva solo informacion y seguridad personal del usuario autenticado.
- `/dashboard/settings/access` pasa a ser la superficie visible de gobierno de acceso del tenant: roles de empresa, permisos, plantillas iniciales y politicas globales de autenticacion.
- Auth/Tenant backend sigue siendo owner del valor persistido `TenantSelfSettings.features.mfa_required_all`.

### D2. Ruta de Seguridad independiente

La ruta `/dashboard/settings/security` queda aprobada para deprecacion controlada.

Direccion preferida de transicion:

1. mantener una redireccion temporal hacia `/dashboard/settings/access#politicas-de-autenticacion`;
2. retirar la seccion independiente del registry de settings en la misma ejecucion o en el siguiente hardening corto;
3. eliminar la implementacion legacy cuando los E2E, specs y handoff ya consuman la nueva ubicacion.

### D3. Politica MFA global

La politica `mfa_required_all` se interpreta como **politica global de autenticacion del tenant**, no como preferencia de un usuario administrador ni como operacion por cuenta individual.

Por tanto:

- no debe vivir en `Mi perfil`;
- no debe competir con la gestion de usuarios por cuenta en `/dashboard/users`;
- debe exponerse en una subseccion explicita dentro de Access, por ejemplo `Politicas de autenticacion`.

---

## Justificacion

1. **Coherencia de boundary:** Access ya es el espacio de gobierno de quien puede entrar, con que alcance y bajo que reglas. La politica MFA global pertenece a ese marco conceptual.
2. **Menos duplicacion:** se elimina la doble presencia de `mfa_required_all` entre `Settings/Security` y `Mi perfil`.
3. **Mejor arquitectura de informacion:** la seguridad personal del usuario se separa de la seguridad global del tenant.
4. **Menor ruido de navegacion:** una ruta independiente para una sola tarjeta no se sostiene como modulo propio en esta fase.
5. **Compatibilidad con MOD00:** la decision no cambia stack, tenancy, contratos persistidos ni modelo de autorizacion; refina la geografia del control plane.

---

## Alternativas consideradas

### A1. Mantener `/dashboard/settings/security` como ruta independiente

Descartada como direccion preferida. Mantiene duplicacion con `Mi perfil` y conserva una seccion de baja densidad funcional.

### A2. Mover la politica global a `/dashboard/users`

Descartada como ubicacion canonica final. Aunque Users concentra operaciones por cuenta, la politica MFA global no pertenece al CRUD operativo de usuarios sino al gobierno de acceso del tenant.

### A3. Mantener la politica global dentro de `/dashboard/profile`

Descartada. `Mi perfil` no debe gobernar politicas globales de la empresa.

---

## Consecuencias

### Positivas

- Clarifica el mapa final del portal:
  - Mi perfil = seguridad personal.
  - Users = cuentas internas y operaciones por usuario.
  - Access = gobierno de acceso y politicas globales.
- Reduce duplicacion de componentes, copy y E2E.
- Fortalece la trazabilidad entre UX, ownership funcional y boundary documental.

### Costos y tradeoffs

- Requiere actualizar metadata del shell federado y el registry de settings.
- Requiere mover o extraer la UI actual de `SecuritySettingsCard`.
- Requiere ajustar pruebas E2E y unitarias que hoy esperan la ruta `/dashboard/settings/security`.
- Requiere limpiar el duplicate toggle en `ProfileClient`.

### Riesgos aceptados

- Durante la transicion puede coexistir una redireccion legacy con la nueva subseccion en Access.
- El backend seguira exponiendo `mfa_required_all` desde `tenantSelfApi.getSettings()` sin cambio de contrato, por lo que la disciplina principal es de UX, shell y ownership visible.

---

## Artefactos impactados

- docs/plans/2026-05-27-mod00-consolidacion-politica-mfa-en-access.md
- docs/informes/INFORME-MOD00-CONFIGURACION-CONTROL-PLANE-v1.0.md
- docs/hlds/HLD-MOD04-USUARIOS-INTERNOS-v1.1.md
- docs/prds/PRD-MOD00-CONFIGURACION-CONTROL-PLANE-v1.0.md
- docs/hlds/HLD-MOD00-CONFIGURACION-CONTROL-PLANE-v1.0.md
- docs/specs/2026-05-25-mod00-roles-de-empresa-design.md

---

## Requiere CTO

**No.**

Motivo: la decision ya fue aprobada para ejecucion y su implementacion quedo validada en portal, backend, pruebas focalizadas e informe vivo.

---

## Estado de implementacion

La decision ya fue ejecutada con estos resultados observables:

1. `/dashboard/settings/access` concentra la subseccion visible `Politicas de autenticacion` para administrar `mfa_required_all`.
2. `/dashboard/profile` deja de exponer la politica MFA global del tenant.
3. `/dashboard/settings/security` redirige a `/dashboard/settings/access#politicas-de-autenticacion`.
4. `SettingsSectionKey.SECURITY` deja de publicarse desde el registry de settings federados.
5. La UI legacy asociada a Security independiente fue retirada del portal.

---

## Referencias

- docs/adrs/ADR-040-Configuracion-Control-Plane-Organizacion-Acceso.md
- docs/prds/PRD-MOD00-CONFIGURACION-CONTROL-PLANE-v1.0.md
- docs/hlds/HLD-MOD00-CONFIGURACION-CONTROL-PLANE-v1.0.md
- docs/hlds/HLD-MOD04-USUARIOS-INTERNOS-v1.1.md
- docs/specs/2026-05-25-mod00-roles-de-empresa-design.md
- docs/informes/INFORME-MOD00-CONFIGURACION-CONTROL-PLANE-v1.0.md
