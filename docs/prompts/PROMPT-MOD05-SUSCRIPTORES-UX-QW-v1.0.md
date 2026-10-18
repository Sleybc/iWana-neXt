# PROMPT — MOD05 · CRM / Suscriptores · Quick wins de UX (búsqueda exacta, tabs, encabezado, estados y carga)

**Versión:** 1.0 · **Fecha:** 2026-10-18 · **Emisor:** AI-EM-ARCH · **Estado:** Contrato congelado, condicionado a G0 (D-UX1..3 del [plan](../plans/2026-10-18-mod05-suscriptores-ux-quick-wins.md) §1)
**Contrato:** [spec 2026-10-18-mod05-suscriptores-ux-rediseno-spec.md](../specs/2026-10-18-mod05-suscriptores-ux-rediseno-spec.md) v1.0, §3 (reglas R1.x-R6.x) y §5 (CA1-CA9)
**Base:** `main` en `d9018071`. Se trabaja en `main`, sin ramas. **Ningún agente commitea**: el commit lo hace AI-EM-ARCH en G6.
**Plantilla base:** [TEMPLATE-PROMPT-EJECUCION-FASE-MODULO.md](TEMPLATE-PROMPT-EJECUCION-FASE-MODULO.md).

## 0. Reglas comunes a todos los bloques

1. Lee `AGENTS.md`, la spec completa y tu § de este prompt antes de tocar código.
2. Lee los `SKILL.md` de tu fila en la matriz del plan §3 (`.agents/skills/<nombre>/SKILL.md`) como documentación, no como tool.
3. Solo frontend. **Prohibido** modificar `packages/shared`, `apps/api`, `packages/ui` o `apps/portal/src/lib/api-client.ts`. Si lo necesitas, emite `[BLOQUEO]` y para.
4. Solo editas los archivos de tu lista (§2). Si un test fuera de tu lista se rompe por tu cambio, no lo edites: repórtalo con el nombre del test y el motivo.
5. Componentes de `@iwana/ui` y primitivas de `@/components/shared/portal-ui`. Nada de colores Tailwind fijos para estados, ni `<input>`/`<button>` crudos, ni `animate-spin` a mano.
6. Textos en español de Colombia, en el vocabulario del sistema (`system-vocabulary-review`).
7. Nunca PII en la URL, en `console.*` ni en mensajes de error genéricos.
8. TDD: el test de componente de cada regla se escribe primero y se ve fallar.
9. Evidencia de cierre: `pnpm --filter @iwana/portal exec jest <tus specs>` con el conteo real de suites y tests, más `pnpm --filter @iwana/portal typecheck`. Un «verde» sin conteo no cuenta.

## 1. Hechos de partida

Los de la spec §0 (H1-H15). Los más relevantes por bloque:
- **F1:** la cédula está cifrada; solo el lookup exacto la encuentra. `subscribersApi.search(params)` ya existe en `api-client.ts:6486` y devuelve `{ data: SubscriberListItem[] }` sin paginación.
- **F2:** `activeSubscriberTab` en `SubscriberDetailClient.tsx:78`; stubs en L352 y L395; `console.error` en L262. Patrón de tabs de referencia: `components/operations/OperationsModuleTabs.tsx`.
- **F3:** `Button` acepta `loading` (`packages/ui/src/components/Button.tsx:65`). Spinners en spec H14.

## 2. Propiedad de archivos (disjunta)

Todas las rutas bajo `apps/portal/src/components/crm/subscribers/`.

| Bloque | Edita | Lee sin editar |
| --- | --- | --- |
| F1 | `SubscribersListClient.tsx`, `SubscribersListClient.spec.tsx`, nuevo `subscribers-search-mode.portal.spec.tsx` (si prefieres separar) | `subscriber-ui.ts`, `@/lib/use-table-query-state` |
| F2 | `SubscriberDetailClient.tsx`, `SubscriberTabsContainer.tsx`, `SubscriberHeader.tsx`, `SubscriberDetailClient.mod05-deuda.portal.spec.tsx`, `subscriber-contact-pending.portal.spec.tsx` (solo aserciones del encabezado), nuevo `subscriber-ficha-ux-qw.portal.spec.tsx` | `subscriber-ui.ts`, `SubscriberStatusTransitionDialog.tsx` |
| F3 | `SubscriberStatusTransitionDialog.tsx`, `ContractCard.tsx`, `ContractCard.spec.tsx`, `ContractDetailDrawer.tsx`, `ConvertExpedienteToContractDialog.tsx`, `CreateContractDialog.tsx`, `TaxProfileBlock.tsx`, `subscriber-ui.ts`, `subscriber-ui.spec.ts`, `crm-contract-dialogs.portal.spec.tsx`, `mod05-deuda-fiscal-ui.portal.spec.tsx`, nuevo `subscriber-status-dialog-ux-qw.portal.spec.tsx` | — |

---

## F1 — Lista: búsqueda con modo explícito (QW1) · `fe-platform`

**Reglas:** spec R1.1-R1.7.

1. Agrega el selector de modo (`Texto`, `Documento`, `Teléfono`, `Correo`) antes del input, con etiqueta visible «Buscar por» y semántica de grupo de opción única navegable con flechas.
2. `Texto` mantiene el flujo actual sin cambios de comportamiento.
3. Los modos exactos envían al presionar Enter o el botón «Buscar», sin debounce, mediante `subscribersApi.search`. En `Documento`, un valor con forma de NIT (dígitos con o sin `-DV`) se envía como `nit`; cualquier otro, como `documentNumber`.
4. En modo exacto: ocultar filtros, orden y paginador; mostrar «Coincidencia exacta · N resultado(s)»; estado vacío propio con la acción «Buscar como texto».
5. El modo va en la URL (`mode`); el valor exacto **no**. Al cambiar de modo se limpian el valor y los resultados.
6. Errores con `PortalAlert` y el mensaje de `ApiError`.

**Tests mínimos:** CA1 (con `subscribersApi.search` simulado y la carga útil esperada por modo), CA2 (la URL nunca contiene el valor), NIT vs. documento, estado vacío y error.
**Cierras cuando:** tests verdes con conteo real y typecheck verde. Reporta capturas o descripción del estado vacío y del modo exacto.

---

## F2 — Ficha: tabs, encabezado y facturación (QW2, QW3, QW5 R5.1-R5.3) · `fe-platform`

**Reglas:** spec R2.1-R2.5, R3.1-R3.3, R5.1-R5.3.

1. Tab activa en `?tab=` con `router.replace(..., { scroll: false })`; slug desconocido, `financiero` o `seguimiento` → `vista-general`.
2. Quita las tabs stub y el componente `StubCard` si queda sin uso.
3. Reescribe `SubscriberTabsContainer` con `portalModuleTabsShellClassName` y `portalModuleTabsTrackClassName`; el panel fuera de la card de tabs; ARIA completo (`aria-controls`, `role="tabpanel"`, `aria-labelledby`, roving tabindex, flechas, `Home`, `End`).
4. Cambiar de tab no debe perder lo que se estaba editando (mantener los paneles montados u ocultos con `hidden`, o elevar el estado).
5. Facturación: `Input` y `Button` del DS, error en `PortalAlert` con el mensaje de `ApiError`, sin `console.error`, `Button loading` y anuncio de éxito en `aria-live="polite"`.
6. Encabezado: «Volver» como `Link`; sin «Suscriptor de la empresa»; Tipo y Segmento como texto secundario (`Persona natural · Residencial`); badges solo de estado, anonimizado y contacto pendiente. No cambies el contenido de `VatTreatmentBanner` ni de `FiscalDataIncompleteAlert`.
7. La vista con `privacyRestricted` debe seguir mostrando solo encabezado y alerta.

**Tests mínimos:** CA3, CA4 (incluye `axe` si el repo ya lo usa en specs del portal; si no, aserciones de roles y atributos), CA5, encabezado sin relleno ni badges de Tipo/Segmento, vista restringida intacta.
**Cierras cuando:** tests verdes con conteo real y typecheck verde.

---

## F3 — Diálogo de estado, paleta de contratos y carga (QW4, QW5 R5.4-R5.5, QW6) · `fe-platform`

**Reglas:** spec R4.1-R4.4, R5.4-R5.5, R6.1-R6.2.

1. Diálogo de estado: «Razón» solo para `SUSPENDED` y `CANCELLED`, con `required`, `aria-required` y marca visible; al cambiar a un destino que no la pide, se limpia. Error genérico con el mensaje de `ApiError` si existe. «Confirmar» con `Button loading`. No agregues catálogo de motivos ni previsualización (R4.4).
2. Agrega `CONTRACT_STATUS_META` en `subscriber-ui.ts` con el mapeo de R5.4 y úsalo en `ContractCard` con `Badge`. Elimina `STATUS_COLORS`. Si `ContractDetailDrawer` o `ServiciosTab` pintan estados de contrato con colores fijos, repórtalo; corrige solo `ContractDetailDrawer` (está en tu lista).
3. Reemplaza los 8 spinners de la spec H14 por `Button loading` (dentro de botón) o skeleton (carga de bloque).
4. Corre `node .agents/skills/iwana-identity-ui-review/scripts/audit-ui.mjs apps/portal/src/components/crm/subscribers` y reporta la salida.

**Tests mínimos:** CA6, CA7, `subscriber-ui.spec.ts` cubre las cinco entradas de `CONTRACT_STATUS_META`, los botones con carga exponen `aria-busy`.
**Cierras cuando:** tests verdes con conteo real, typecheck verde y `audit-ui.mjs` con P3 0 en tus archivos.

---

## V1 — Verificación funcional y de accesibilidad · `sr-qa`

1. Corre todas las specs de `components/crm/subscribers` sin caché y reporta conteo real.
2. Traza CA1-CA7 a un test concreto (archivo y nombre); marca los huecos.
3. Navegador contra `localhost:3002` con datos del seed del tenant de desarrollo: búsqueda por cédula, recarga de la ficha en una tab, teclado en las tabs, error de facturación (forzado), diálogo de suspender. Revisa también a 375 px que nada desborde más que antes.
4. Reporta veredicto GO/NO-GO con hallazgos por severidad.

## V2 — Veredicto de identidad · `ds-owner`

1. `audit-ui.mjs` sobre la carpeta: P0-P3 en 0 (CA8).
2. Revisa contra las recetas §3, §4 y §6 y la escala de badges de R5.4; confirma que no se introdujeron tokens ni variantes nuevas.
3. Veredicto GO/NO-GO del carril rápido.

## V3 — Revisión de privacidad · `sec-eng`

Diff de los archivos tocados: sin PII en URL (CA2), logs ni `console.*`; el modo exacto no reintenta ni hace consultas en cada tecla; los mensajes de error no exponen datos de otro titular. Veredicto GO/NO-GO.

## V4 — Gates · `gate-verifier`

Gates Before Merge de `AGENTS.md` sobre `@iwana/portal`: `test`, `lint` y `typecheck` con `--force` o sin caché, con conteo real de suites y tests y `Cached: 0`. Entrega comandos y salidas.

## 3. Formato de reporte (todos)

- Entregables con ruta.
- Evidencia: comando exacto y conteo real.
- Reglas y CA cubiertos, por identificador.
- `[BLOQUEO]` si los hay, y deuda nueva por severidad P0-P3.
