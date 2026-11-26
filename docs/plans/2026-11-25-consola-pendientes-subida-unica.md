# Plan — Pendientes de la consola tras la subida única (2026-11-25)

**Estado:** aprobado por el CTO el 2026-11-25 para ejecución.
**Base:** `origin/main` = `710df62d` (CI 45729592032 verde, E2E Web Admin Smoke 45729591998 verde).
**Origen:** hallazgos aceptados para después en la revisión de la subida única
(UX P1, test-change, sec-eng, contract) y casos que la sesión de pruebas no pudo verificar.

## Reglas de ejecución

- Solo `pnpm`. Gates y pruebas en serie, con pocos workers (`--maxWorkers=2`, Playwright `--workers=1`).
- Sin ramas ni worktrees; se trabaja en `main` del checkout compartido.
- **Sin commits ni push**: este plan no los autoriza. Al terminar se informa al coordinador,
  que pide la autorización al CTO.
- No tocar la LAN (10.0.0.254), contenedores `*_prod`, la base ni el Redis de desarrollo,
  ni leer `.env` reales. PostgreSQL y Redis de prueba solo en contenedores desechables.
- Nunca publicar `apps/*/next-env.d.ts`. Cero PII o secretos en código, fixtures y logs.
- Copy visible en español y sin términos técnicos (`system-vocabulary-review`).
- Cada corrección lleva prueba que falle sin ella y pase con ella.

## Fuera de alcance (decisión del CTO o NO-GO vigente)

- ADR-114: «Equipo» vs «Visibilidad para soporte». Decide el CTO.
- Despliegue/exposición de la LAN: CA-11, `stable.env`, cuentas, dos admins con código,
  recuperación y aviso de sesión vencida en consola. Siguen en NO-GO y tienen su propio plan
  (`docs/plans/2026-11-24-piloto-lan-a-entorno-estable.md`).

## Tareas

### T1 — Pulso: la cifra llega al lector de pantalla
- Dónde: `packages/ui/src/components/PulseStrip.tsx`, `apps/web/src/components/tenants/TenantDirectoryPulse.tsx`.
- Problema: la cifra visible queda oculta para el lector de pantalla y el nombre accesible no la incluye.
- Hecho cuando: el nombre accesible de cada celda dice etiqueta y cifra; `ds-owner` da veredicto
  sobre el contrato de PulseStrip (carril rápido) antes de cambiar la API; pruebas en `@iwana/ui` y web.

### T2 — Tabs con activación manual
- Dónde: `packages/ui/src/components/Tabs.tsx` y consumidores: consola (`settings/page.tsx`,
  `audit-logs/page.tsx`, `TenantCreateForm`, `TenantSettingsForm`) y portal
  (`AssuranceTicketDetail`, `OrganizationSettingsClient`, `AssetsWorkspace`, `InventoryClient`,
  `StockWorkspace`, `DashboardTrend`).
- Problema: las flechas activan la pestaña y, en consola, escriben la URL en cada pulsación.
- Hecho cuando: `ds-owner` fija el contrato (recomendado: flechas/Inicio/Fin mueven el foco,
  Enter/Espacio activan, patrón WAI-ARIA de activación manual, opción `activationMode` si algún
  consumidor necesita la automática); pruebas de teclado en `Tabs.spec.tsx`; E2E de consola y portal
  que usen pestañas siguen verdes.

### T3 — Aviso de cambios sin guardar en Identidad
- Dónde: `apps/web/src/components/settings/PlatformBrandingSettings.tsx`.
- Problema: al salir de la pestaña o de la página con el borrador de imagen o de textos sin guardar,
  se pierde sin avisar.
- Hecho cuando: cambiar de pestaña o navegar con cambios pendientes pide confirmación con
  `Dialog` de `@iwana/ui` (y `beforeunload` para cerrar o recargar); sin cambios no pregunta;
  prueba unitaria y E2E.
- Ajuste en ejecución (AI-PROD-UX, 2026-11-25): la pestaña Identidad usa `forceMount` y ya conserva
  el borrador al cambiar de pestaña, así que ahí no se pregunta; la pestaña muestra un punto ámbar
  y «(cambios sin guardar)». Preguntan los enlaces internos y Atrás («¿Salir sin guardar?»).
  Las imágenes se suben al elegirlas: el borrador de imagen es la dirección de «Opciones avanzadas».

### T4 — Anuncio de resultados de búsqueda
- Dónde: `apps/web/src/app/(protected)/platform-users/page.tsx` y la búsqueda de Empresas.
- Hecho cuando: una región `role="status"` anuncia el número de resultados o el vacío tras cada
  búsqueda, sin anunciar en cada tecla; pruebas.

### T5 — Foco al reintentar
- Dónde: los «Reintentar» de la consola (platform-users, tenants, audit-logs, settings).
- Hecho cuando: tras reintentar, el foco va al encabezado de la región de resultados (o al
  aviso de error si vuelve a fallar), no se pierde en `body`; pruebas.

### T6 — Contrato y cobertura de `POST /platform-users/search`
- Dónde: `apps/api/src/modules/platform-users/`.
- Hecho cuando: spec propia del endpoint (validación del DTO, permisos, paginación, sin PII
  en logs) y cobertura de ramas del controlador ≥ 80 %; `contract-drift-reviewer` sin hallazgos
  si toca `packages/shared`.

### T7 — Verificar lo que no se verificó
- Borrador de imagen y mensaje de éxito de Mi cuenta: añadir `/platform/branding` y
  `/platform-users/me` a la API simulada de E2E de consola y cubrirlos con E2E (`role="status"`
  visible tras guardar; el borrador se descarta y se restablece).
- `e2e/tests/web-tenant-create-happy-path.spec.ts`: ejecutar contra API real con PostgreSQL y
  Redis desechables; informar conteo literal. Si no es posible en local, decirlo con la causa.

## Cierre del plan

1. Revisores: `test-change-reviewer` (specs modificadas), `boundary-reviewer` y `sec-eng` si T6
   toca API, `ds-owner` en T1/T2, auditoría UX de T3–T5.
2. `gate-verifier` sobre el árbol final, en serie y sin caché: tests de `@iwana/ui`, web, portal
   y api; typecheck, lint y build; E2E de consola y portal con red simulada.
3. Informe al coordinador: archivos tocados, conteos literales, lo no verificado y huella del árbol
   (`git diff HEAD` sin `next-env.d.ts` más no rastreados, `sha256sum`). Sin commit ni push.
