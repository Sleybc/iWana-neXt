# INFORME — Deuda E2E portal cross-módulo (H6-R2 Paso 3)

| Campo | Valor |
| --- | --- |
| Versión | 1.0 |
| Fecha | 2026-07-21 |
| Agente | AI-SR-QA |
| Prompt | `docs/prompts/PROMPT-MOD12-CIERRE-MODULO-FASE-H6-R2-v1.0.md` Paso 3 |
| Alcance CA-H6-07 (enmienda) | Suite propia MOD12 = `portal-inventory-scm` (fuera de esta deuda abierta) |
| Estado | ✅ Tabla fallo-a-fallo con ID, causa, módulo y responsable |

---

## 1. Evidencia de corrida

| Ítem | Valor |
| --- | --- |
| `PLAYWRIGHT_BROWSERS_PATH` | `%USERPROFILE%\AppData\Local\ms-playwright` (canónico) |
| Chromium | `chromium-1208` — `chrome-win64\chrome.exe` existe (`True`) |
| Comando | `npx playwright test --config e2e/playwright.portal.config.ts --grep-invert "portal-inventory-scm"` |
| Ventana | 2026-07-21 ~16:13 → 16:25 (-05:00) |
| Resultado | **77 passed / 30 failed / 0 skipped** |
| Duración | **12.3 min** |
| Exit code | `1` |
| Log | `e2e/h6-r2-portal-deuda.log` (+ captura agente) |

**Inventory-scm (CA-H6-07):** no incluido en esta corrida. Evidencia verde reproducible: `INFORME-MOD12-CIERRE-MODULO-FASE-H6-R2-PLATOPS-v1.0.md` — **41 passed / 0 failed / exit 0 / 56.3s**. No entra como deuda abierta.

**Baseline histórico (~29):** la estimación H6 §2.4 coincidía en orden de magnitud; la corrida R2 real sobre el resto de la suite portal produce **30** fallos atribuibles.

---

## 2. Tabla de deuda (un ID por fallo)

| ID deuda | Spec | Test name | Error observable (resumen) | Causa raíz | Módulo dueño | Responsable (rol/equipo) | Severidad |
| --- | --- | --- | --- | --- | --- | --- | --- |
| DEUDA-E2E-PORTAL-001 | `portal-assurance.spec.ts` | support can create, comment, escalate to field service and resolve a ticket | Timeout 120s; `page.goto` → `net::ERR_ABORTED` (frame detached) tras navegar a mesa de ayuda | Hipótesis verificable: hang/abort de compilación o navegación en `/dashboard/assurance` (config portal ya documenta inestabilidad de esa ruta en Windows). Pendiente triaje dueño si es producto vs arnés webServer | MOD10 Service Assurance | AI-FE-PLATFORM (UI assurance); escalar AI-PLAT-OPS si es hang de `next dev` | Alta |
| DEUDA-E2E-PORTAL-002 | `portal-commercial-catalog-products-services.spec.ts` | permite navegar productos/servicios y crear servicio con precio vigente | Strict mode: `getByRole('heading', { name: 'Comercial' })` → 2 nodos (`h1` Comercial + `h2` Resumen comercial) | Locator substring sin `exact: true`; coexisten título de módulo y subtítulo «Resumen comercial» | MOD06 Comercial | AI-FE-PLATFORM (copy/estructura headings); AI-SR-QA (arnés: `exact: true`) | Media |
| DEUDA-E2E-PORTAL-003 | `portal-commercial-ui-evidence.spec.ts` | captura desktop y mobile del módulo comercial compacto | Mismo strict mode `heading` «Comercial» ×2 | Misma causa que 002 | MOD06 Comercial | AI-FE-PLATFORM; AI-SR-QA (arnés) | Media |
| DEUDA-E2E-PORTAL-004 | `portal-settings-access-governance.spec.ts` | muestra plantillas, roles y evidencia auditada sin asignacion de usuarios | Timeout 10s: `getByText('Historial de cambios')` no encontrado | Copy/UI de gobernanza de acceso ya no expone ese literal (o bloque audit no monta). Hipótesis: drift de vocabulario vs spec | MOD00 Configuración / Access | AI-FE-PLATFORM (settings access); AI-SR-FULL si el endpoint de evidencia auditada no responde al mock | Media |
| DEUDA-E2E-PORTAL-005 | `portal-settings-access-governance.spec.ts` | visibiliza el bloqueo por falta de permiso granular | Strict mode: `getByRole('button', { name: 'Guardar' })` → «Guardar política» + «Guardar» | Dos CTAs Guardar* en la misma vista; el arnés no acota al botón del perfil | MOD00 Configuración / Access | AI-FE-PLATFORM (etiquetado CTA); AI-SR-QA (locator `exact` / name completo) | Media |
| DEUDA-E2E-PORTAL-006 | `portal-settings-access-governance.spec.ts` | visibiliza el anti-lockout cuando el ultimo camino ADMIN perderia manage | Mismo strict mode `button` «Guardar» ×2 | Misma causa que 005 | MOD00 Configuración / Access | AI-FE-PLATFORM; AI-SR-QA (arnés) | Media |
| DEUDA-E2E-PORTAL-007 | `portal-settings-empresa.spec.ts` | ADMIN puede editar perfil, settings y política MFA sin llamar endpoints de plataforma | Timeout 30s en `#timezone-listbox` option `America/Guayaquil (Ecuador)` | Listbox de timezone no abre / opción ausente del catálogo mock o label cambió | MOD03 Configuración empresa (+ MFA en Access/MOD00) | AI-FE-PLATFORM (perfil/timezone UI); AI-SR-QA si el mock de timezones está incompleto | Alta |
| DEUDA-E2E-PORTAL-008 | `portal-settings-empresa.spec.ts` | ADMIN puede guardar la politica MFA global desde Access | Timeout 30s: `getByLabel('Activar MFA obligatorio')` no aparece | Control MFA global no visible en Access (ruta/copy/permiso) o label renombrado | MOD00 Usuarios y acceso (política MFA) | AI-FE-PLATFORM (Access MFA); AI-SR-FULL si el summary MFA no llega al cliente | Alta |
| DEUDA-E2E-PORTAL-009 | `portal-settings-empresa.spec.ts` | ADMIN puede guardar sello y desactivar nombre en sidebar | Timeout 30s: texto `o pega una URL HTTPS directamente` no encontrado | Copy de branding cambió o flujo URL HTTPS se retiró de Identidad visual | MOD03 Branding empresarial | AI-FE-PLATFORM (marca/sello) | Media |
| DEUDA-E2E-PORTAL-010 | `portal-settings-empresa.spec.ts` | NOC ve la pantalla en modo solo lectura y no consume summary de ADMIN | Timeout: `getByText('Modo solo lectura')` no encontrado | Banner/copy de solo lectura ausente o renombrado para NOC | MOD03 / MOD00 Settings | AI-FE-PLATFORM | Media |
| DEUDA-E2E-PORTAL-011 | `portal-settings-empresa.spec.ts` | Las tarjetas disponibles abren rutas dueñas con información existente | Strict mode: `heading` «Perfil empresarial» → `h1` «Perfil empresarial y organización» + `h2` «Perfil empresarial» | Substring match sin `exact`; título federado solapa sección | MOD00 Shell federado / Organización | AI-FE-PLATFORM; AI-SR-QA (arnés `exact`) | Media |
| DEUDA-E2E-PORTAL-012 | `portal-settings-federated-shell.spec.ts` | ADMIN ve el shell federado, distingue estados reales y abre rutas disponibles | Timeout: en panel «Secciones de configuración» no hay texto exacto `Billing` | Índice federado ya no lista Billing como «Próximamente» (o copy distinto). Hipótesis: catálogo de secciones desactualizado vs spec | MOD00 Control plane federado | AI-FE-PLATFORM (índice settings); AI-PROD-UX si se retiró a propósito el placeholder Billing | Media |
| DEUDA-E2E-PORTAL-013 | `portal-settings-organization-access.spec.ts` | admin navega desde settings, crea sede con servicios y crea perfil de acceso | Timeout 30s: `getByRole('button', { name: 'Crear sede' })` | CTA de alta de sede no visible (permiso, ruta Organización o rename) | MOD00 Organización / Sedes | AI-FE-PLATFORM (sedes); AI-SR-FULL si API organization sites no mockeada | Alta |
| DEUDA-E2E-PORTAL-014 | `portal-settings-wfm-organization-sites.spec.ts` | ADMIN navega a operación de campo y ve sedes empresariales como unica referencia visible | Timeout 30s: `getByRole('link', { name: 'Operación de campo' })` | Enlace del índice settings ausente o copy distinto (p. ej. WFM / Programación) | MOD00 federado ↔ MOD09 WFM (superficie Operación de campo) | AI-FE-PLATFORM (nav settings); dueño de dominio WFM coordinado | Alta |
| DEUDA-E2E-PORTAL-015 | `portal-tax-simulator.spec.ts` | simulador tributario muestra resultado para segmento RESIDENTIAL | Timeout: `getByText(/tax-def-iva-19/i)` no encontrado tras Resultado/Regla ganadora | UI ya no expone ID técnico de definición; o mock no incluye `tax-def-iva-19`. Hipótesis: vocabulario visible vs assert de ID interno | MOD07 Taxation (+ simulador MOD06) | AI-FE-PLATFORM (simulador); AI-SR-FULL (payload reglas); AI-SR-QA si el assert debe usar etiqueta amigable | Media |
| DEUDA-E2E-PORTAL-016 | `portal-users.spec.ts` | caso 5 — botón "Nuevo usuario" abre el modal de creación | Timeout: `dialog.getByLabel('Categoría base *')` no encontrado | Modal abre pero label del campo cambió (sin `*` / rename) o el control ya no es labelable así | MOD04 Usuarios internos | AI-FE-PLATFORM (form alta usuario); AI-SR-QA (locator) | Media |
| DEUDA-E2E-PORTAL-017 | `portal-users.spec.ts` | regresion ownership — /dashboard/users expone tabla editable; la asignacion de roles no reside en settings/access | Mismo timeout `Categoría base *` en dialog | Misma causa que 016 | MOD04 Usuarios internos | AI-FE-PLATFORM; AI-SR-QA | Media |
| DEUDA-E2E-PORTAL-018 | `portal-wfm-scheduling.spec.ts` | admin crea, reagenda y completa un evento con orden de trabajo desde Programacion | Timeout: `getByText('Pulso ejecutivo de programación')` no encontrado | Copy del resumen ejecutivo de Programación cambió o bloque retirado | MOD09 Programación WFM | AI-FE-PLATFORM (scheduling UI) | Alta |
| DEUDA-E2E-PORTAL-019 | `portal-wfm-scheduling.spec.ts` | admin agenda instalación desde CRM vía recomendaciones (recommendation-first) | Strict mode: `getByText('Empresa Demo SAS')` → 8 nodos | Texto de fixture repetido en banner, tabla y detalle; arnés no acota al nodo de interés | MOD09 WFM | AI-SR-QA (locator acotado); AI-FE-PLATFORM si hay duplicación excesiva de copy | Media |
| DEUDA-E2E-PORTAL-020 | `portal-wfm-scheduling.spec.ts` | admin confirma una visita pendiente desde la bandeja WFM | Timeout: `getByRole('cell', { name: /Instalación GPON barrio norte/i })` | Fila de bandeja no renderiza esa celda (datos mock / columnas distintas / copy título) | MOD09 WFM | AI-FE-PLATFORM; AI-SR-FULL si mock de pending visits no alimenta la grilla | Alta |
| DEUDA-E2E-PORTAL-021 | `portal-wfm-scheduling.spec.ts` | admin abre el formulario manual y valida campos obligatorios | Mismo timeout `cell` Instalación GPON barrio norte | Misma causa que 020 | MOD09 WFM | AI-FE-PLATFORM; AI-SR-FULL (mock bandeja) | Alta |
| DEUDA-E2E-PORTAL-022 | `portal-wfm-scheduling.spec.ts` | admin agenda manualmente sin pasar por recomendaciones | Timeout 30s: botón `/Abrir despacho para Instalación GPON barrio norte/i` | CTA de despacho ausente o rename; depende de fila visible en bandeja | MOD09 WFM | AI-FE-PLATFORM | Alta |
| DEUDA-E2E-PORTAL-023 | `portal-wfm-scheduling.spec.ts` | admin conserva la bandeja pura al cerrar el detalle de una solicitud | Timeout 30s: mismo botón Abrir despacho | Misma causa que 022 | MOD09 WFM | AI-FE-PLATFORM | Alta |
| DEUDA-E2E-PORTAL-024 | `portal-wfm-scheduling.spec.ts` | technician solo visualiza trabajos asignados en su agenda | Strict mode: `heading` «Agenda» → `h1` Agenda + `h2` Control de agenda | Substring match sin `exact` | MOD09 WFM | AI-FE-PLATFORM; AI-SR-QA (`exact: true`) | Media |
| DEUDA-E2E-PORTAL-025 | `portal-wfm-scheduling.spec.ts` | admin conserva una agenda operativa usable en viewport movil | Timeout: `getByRole('button', { name: 'Agendar tarea' })` no encontrado | CTA móvil renombrado/oculto en viewport estrecho | MOD09 WFM | AI-FE-PLATFORM (responsive agenda) | Media |
| DEUDA-E2E-PORTAL-026 | `portal-wfm-scheduling.spec.ts` | admin visualiza resumen operativo y abre detalle desde la jornada | Timeout: `getByText('Decisiones pendientes')` no encontrado | Copy del KPI/resumen operativo cambió | MOD09 WFM | AI-FE-PLATFORM | Media |
| DEUDA-E2E-PORTAL-027 | `portal-wfm-scheduling.spec.ts` | admin consulta agenda por rango diario, semanal y mensual | Timeout 30s: `getByRole('button', { name: 'Lista' })` | Toggle de vista Lista ausente o rename en toolbar de agenda | MOD09 WFM | AI-FE-PLATFORM | Alta |
| DEUDA-E2E-PORTAL-028 | `portal-wfm-scheduling.spec.ts` | admin puede abrir detalle desde teclado en vista lista | Timeout 30s: botón `Lista` | Misma causa que 027 | MOD09 WFM | AI-FE-PLATFORM | Alta |
| DEUDA-E2E-PORTAL-029 | `portal-wfm-scheduling.spec.ts` | admin cierra drawer con Escape y regresa foco a la lista | Timeout 30s: botón `Lista` | Misma causa que 027 | MOD09 WFM | AI-FE-PLATFORM | Alta |
| DEUDA-E2E-PORTAL-030 | `portal-wfm-scheduling.spec.ts` | admin arrastra pendiente a la grilla, ajusta borrador y confirma agenda | Timeout 30s en `dragTo`: card draggable resuelve pero no alcanza drop `Crear evento para Luisa Campos a las 09:00` | Drag&drop no completa hit-target (slot horario / pointer events / overlay). Hipótesis: target de drop no interactuable o layout cambió | MOD09 WFM | AI-FE-PLATFORM (DnD agenda); AI-SR-QA si el harness de drag debe usar steps/force | Alta |

---

## 3. Resumen por módulo dueño

| Módulo dueño | IDs | Conteo | Responsable primario |
| --- | --- | --- | --- |
| MOD09 Programación WFM | 018–030 (+014 nav compartida) | 13 (+1 nav) | AI-FE-PLATFORM |
| MOD00 Configuración / Access / Organización | 004–006, 008, 011–014 | 8 | AI-FE-PLATFORM |
| MOD03 Empresa / Branding | 007, 009, 010 | 3 | AI-FE-PLATFORM |
| MOD06 Comercial | 002, 003 | 2 | AI-FE-PLATFORM |
| MOD04 Usuarios | 016, 017 | 2 | AI-FE-PLATFORM |
| MOD10 Assurance | 001 | 1 | AI-FE-PLATFORM (+ PlatOps si hang) |
| MOD07 Taxation | 015 | 1 | AI-FE-PLATFORM / AI-SR-FULL |

**Fuera de deuda abierta (MOD12):** `portal-inventory-scm` — 41/41 en R2 PlatOps.

---

## 4. Severidad agregada

| Severidad | IDs | Conteo |
| --- | --- | --- |
| Alta | 001, 007, 008, 013, 014, 018, 020–023, 027–030 | 15 |
| Media | 002–006, 009–012, 015–017, 019, 024–026 | 15 |
| Baja | — | 0 |

Ningún fallo se clasifica como «ajeno» sin dueño. Ninguna fila es solo una sigla MOD* sin test.

---

## 5. Límites de esta entrega

- No se implementaron fixes de producto ni de arnés fuera de MOD12.
- No se reabrió G7 ni se firmó cierre.
- Causas raíz son hipótesis verificables desde el reporter Playwright (locator / timeout / strict mode / copy / mock); donde hace falta inspección de UI >2 min se indica y se mantiene asignación de módulo/responsable.
- Chromium: **sin BLOQUEO** — launch y suite ejecutaron sobre path canónico.

---

## 6. Handoff

| Destinatario | Acción |
| --- | --- |
| AI-EM-ARCH | Consumir esta tabla para CA-H6-07 enmienda (deuda con dueño) en re-G7 |
| Dueños por módulo (§3) | Triaje y remediación fuera del carril MOD12 |
| AI-PLAT-OPS | Solo si 001 confirma hang de `next dev` / webServer |

**No G7.**
