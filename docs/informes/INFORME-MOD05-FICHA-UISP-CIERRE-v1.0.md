# INFORME — MOD05 Ficha del suscriptor con la composición de UISP · Cierre v1.0

**Fecha:** 2026-11-10
**Spec:** [2026-11-10-mod05-ficha-suscriptor-estilo-uisp-ux](../specs/2026-11-10-mod05-ficha-suscriptor-estilo-uisp-ux.md) (G0 del usuario 2026-11-10)
**Plan:** [2026-11-10-mod05-ficha-suscriptor-estilo-uisp](../plans/2026-11-10-mod05-ficha-suscriptor-estilo-uisp.md)
**Commits (sin push):** `3fb15608` ola 1 · `9be42c87` olas 2–4 · `5ec0aa5a` correcciones de seguridad y E2E
**Estado:** G6 ✅ en pruebas unitarias e integración · **CA-7 y CA-8 sin evidencia en navegador** · G6.5 pendiente (sin push)

## 1. Qué se entregó

| Ola | Bloques | Resultado |
|---|---|---|
| 1 | W0 inventario · C densidad · D-be notas | Inventario de no regresión (11 pruebas); `PortalPanel density="dense"` + `PortalFieldList`/`PortalFieldRow`; notas cifradas (migración 180, `GET`/`POST /crm/subscribers/:id/notes`, `ListMetaSchema` completo, auditoría sin texto, guardas de titular, supresión y recifrado) |
| 2 | A · B · G | Vista general en dos columnas con tarjeta de identidad, servicios con mapa, siguiente cobro (`POST /billing/policy/preview`), visitas y tickets abiertos; «Registrar ▾»; insignias derivadas en ficha y lista |
| 3 | D-fe · F | Tarjeta Actividad (ciclo de vida, notas, tickets, visitas, cobros y pagos) con nota manual; Documentos al final de Facturación con subida de soportes del expediente |
| 4 | E | Detalle y alta de contrato en página propia, con la lógica del panel y del diálogo compartida (`layout`), y vista previa del primer cobro |
| 5 | QA · seguridad | E2E escrito (no ejecutado); `sec-eng` GO; migración 181 (notas de solo inserción, bloqueo en anonimizados, excepciones acotadas de supresión y recifrado K2) |

## 2. Evidencia

| Corrida (jest directo, sin caché) | Línea base | Final |
|---|---|---|
| Portal completo | 354 suites · 3516 passed · 1 skipped | **360 · 3610 · 1** |
| API unit completo | — | **490 · 6544/6544** |
| Shared completo | — | 33 · 494/494 |
| Integración (DB_NAME=test): migraciones 180+181, notas, participante de supresión con `apply`, `anonymize-titular`, privacidad | — | Verde (conteos por corrida en los reportes de cada ola) |
| `tsc` portal, api, shared, db | — | Sin errores |

Revisores: `boundary-reviewer` GO (3 menores) · `contract-drift-reviewer` GO condicionado → mayores cerrados · `sec-eng` GO (M-1, M-2 cerrados en 181; I-1 cerrado).

## 3. Criterios de aceptación

| CA | Estado |
|---|---|
| CA-1 inventario | ✅ verde antes y después, sin modificar |
| CA-2, CA-3, CA-5, CA-6 | ✅ unitarias; E2E escrito, no ejecutado |
| CA-4 | ✅ enmascarado y anonimizado; **sin prueba de dependencia de permiso** (el mapa depende del estado del titular, no de un permiso propio) |
| CA-7 densidad | ❌ **no ejecutado**: sin entorno |
| CA-8 WCAG | ⚠️ axe solo en jsdom (páginas de servicio); en navegador claro/oscuro **no ejecutado** |

**Corrida E2E del 2026-11-10 (actualiza la tabla):** migraciones 180 y 181 aplicadas en desarrollo (8 tenants activos); API y worker levantados por separado, sin `dev.mjs`; `portal-mod05-ficha-uisp-live.spec.ts`: 1 passed, 1 skipped, 1 failed.

| CA | Resultado en navegador |
|---|---|
| CA-2, CA-3, CA-6 | ✅ dos columnas, nota creada y visible en Actividad, «Registrar ▾», insignias |
| CA-5 | ⚠️ alta de servicio ✅ con axe sin violaciones; detalle **omitido**: el suscriptor convertido no trae contrato |
| CA-8 | ✅ axe sin violaciones serias en ficha y menú «Registrar», claro y oscuro, y en alta de servicio |
| CA-7 | ✅ tras ajustar el criterio (usuario) y compactar el encabezado: a 1440×900 Estado de cuenta y Contacto empiezan en 375 px (antes 657), Servicios en 694 y Siguiente cobro en 803; en 375 px sin desborde y orden Servicios → Actividad → Contacto. Corrida final: 2 passed, 1 skipped |

**Encabezado compacto:** título, estado, tipo de persona y acciones en una fila; datos fiscales en una línea; aviso de datos incompletos como banner con detalle plegable; `PortalAlert` gana `density="compact"`. Portal: 361 suites, 3615 passed, 1 skipped; inventario y ola 2 sin modificar.

**Antecedente (ya superado):** API, worker y portal no estaban arriba (puertos 3000–3002 y 4000 sin respuesta). Por regla del repo no se levantó el entorno. Para ejecutar: entorno arriba, `E2E_PRIVACY_1B_TENANT_SLUG` y `E2E_PRIVACY_ADMIN_PASSWORD`, y `pnpm exec playwright test --config e2e/playwright.portal.config.ts e2e/tests/portal-mod05-ficha-uisp-live.spec.ts`.

## 4. Omitido, no verificado y riesgos

- Integración de recifrado K2 (`reencrypt-aes.pii.postgres.integration.spec.ts`) no ejecutada: exige base `iwana_it_g7_*`. Su conteo esperado (22) se ajustó a mano.
- Migraciones 180 y 181 no aplicadas en la base de desarrollo.
- Documentos quedó dentro de Facturación: quien no tiene `BILLING_INVOICES_READ` no ve los soportes de CRM. Validar con `prod-ux` si va a pestaña propia.
- `ContractDetailDrawer` y `CreateContractDialog` quedan sin uso desde Servicios; no se borraron.
- Pendientes de producto: el API sigue enviando el documento completo (enmascarado solo visual, previo a esta fase); confirmar si ACCOUNTANT y AUDITOR deben leer notas; permiso propio para el mapa.
- `fe-platform` reformateó por accidente un archivo del otro agente (solo formato) y restauró dos ajenos con `checkout`.

## 4b. Decisiones del usuario aplicadas (2026-11-10)

| # | Decisión | Aplicación |
|---|---|---|
| 1 | K2 sin ejecutar: aceptado | Queda registrado en §4 |
| 2 | Documentos como pestaña propia, como en UISP | Pestaña «Documentos» tras Soporte; PDF de cobro solo con `BILLING_INVOICES_READ`; inventario y ola 2 actualizados por esta decisión |
| 3 | Número de documento visible según el rol | Permiso `crm.subscribers.document.read` (migración 182; ADMIN, SUPPORT, SALES, ACCOUNTANT por defecto, configurable); sin él, el API lo enmascara, rechaza escribirlo (403) y la auditoría marca FULL o MASKED; portal en solo lectura con «Restringido por tu rol» |
| 4 | Notas legibles por todos | `GET` de notas sin techo de roles, solo `CRM_SUBSCRIBERS_READ` |
| 5 | Mapa sin permiso propio | Sin cambio |

Conteos tras aplicarlas: API 491 suites · 6588; portal 363 · 3635 · 1 skipped; integración de la 182 y del permiso en verde. Fuera de alcance: documento en MOD08, oportunidades y adquirente de facturación, y NIT de persona jurídica.

## 5. Atajos

| `atajo:` | Motivo |
|---|---|
| `useOptionalRouter` en `ServiciosTab` | Evitar tocar specs existentes que montan la pestaña sin App Router |
| ID visible = `externalId` o 8 caracteres del id | No existe campo de ID visible |

## 6. Líneas por superficie (3 commits)

docs 444 · código 4882 · pruebas 3794.

## 7. Siguiente

1. Ejecutar el E2E y CA-7/CA-8 con el entorno arriba; luego push y G6.5.
2. Fases ya decididas: etiquetas manuales + importación desde UISP; «Cierre de venta» (contrato firmado + primer cobro).
