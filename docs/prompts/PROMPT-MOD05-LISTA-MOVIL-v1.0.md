# PROMPT — MOD05 · Lista móvil de Suscriptores en tarjetas (E3) con llamar y WhatsApp

**Versión:** 1.0 · **Fecha:** 2026-10-21 · **Emisor:** AI-EM-ARCH · **Estado:** Contrato congelado; G0 aprobado por el CTO el 2026-10-21 (D-E3-1 768 px, D-E3-2 teléfonos de la proyección vigente, D-E3-3 ocultar con aviso los no normalizables, D-E3-4 WhatsApp sin texto, D-E3-5 sin registrar el contacto y D-E3-6 normalizar solo al mostrar; [PRD Fase 08](../prds/PRD-MOD05-CRM-SUBSCRIBERS-FASE-08-v1.0.md) §9.1)
**Plan:** [2026-10-21-mod05-lista-movil.md](../plans/2026-10-21-mod05-lista-movil.md)
**Base:** `main` en `5e55f841`. Se trabaja en `main`, sin ramas. **Ningún agente commitea**: lo hace AI-EM-ARCH en G7.

## 0. Reglas comunes

1. Lee `AGENTS.md`, el PRD Fase 08 completo, el plan y tu § antes de tocar código.
2. Lee los `SKILL.md` de tu fila en el plan §3 como documentación, no como tool.
3. Solo editas los archivos de tu fila en §2. Si necesitas otro, emite `[BLOQUEO]` y para.
4. **Sin cambios de API, de proyección ni del mapa de campos por rol.** Si un dato no llega, no se pide aparte: `[BLOQUEO]`.
5. El número de teléfono nunca aparece como texto en la tarjeta, ni en la URL, logs o métricas.
6. TDD; evidencia con comando exacto y conteo real, sin caché.
7. Antes de congelar una aserción de prueba, verifica que el producto actual la puede cumplir o que tu bloque la implementa.
8. Cualquier foco diferido usa el hook de `@iwana/ui` (`useDeferredInitialFocus`) o se cancela en el cleanup.

## 1. Hechos de partida

H1-H6 del PRD §1. Anclas: `apps/portal/src/components/crm/subscribers/SubscribersListClient.tsx:820-853`; `apps/api/src/modules/crm/subscribers/subscriber-projection.ts:5-60`; `packages/shared/src/constants/profile-phone.ts`; `SubscriberPeek.tsx`, `SubscriberQueueChips.tsx` y `SubscriberMoreFilters.tsx` (Fase 06).

## 2. Propiedad de archivos

| Bloque | Edita | Crea |
| --- | --- | --- |
| P0 | — | `docs/specs/2026-10-21-mod05-lista-movil-ux-spec.md` |
| B0 | `packages/shared/src/constants/profile-phone.ts` (o un módulo hermano exportado desde `@iwana/shared`) y su spec | — |
| F1 | `SubscribersListClient.tsx` y su spec, `SubscriberPeek.tsx` y su spec, `subscriber-ui.ts` | `SubscriberMobileCard.tsx`, `SubscriberContactActions.tsx` y sus specs; E2E `e2e/tests/portal-mod05-lista-movil.spec.ts` |
| F2 | `SubscriberQueueChips.tsx`, `SubscriberMoreFilters.tsx` y sus specs | — |

Todas las rutas de F1 y F2 bajo `apps/portal/src/components/crm/subscribers/` salvo el E2E.

---

## P0 — Spec UX móvil · `prod-ux`

Tarjeta (RF-MV-02, RF-MV-04, RF-MV-05), acciones de contacto con sus estados (con teléfono, sin teléfono por rol o privacidad, teléfono sin formato válido) (RF-MV-06 a RF-MV-09), vista lateral a pantalla completa (RF-MV-03), chips en una fila desplazable, «Más filtros» como panel inferior con el orden integrado y modos de búsqueda a 375 px (RF-MV-12 a RF-MV-15). Textos definitivos.
**Cierras cuando:** cada RF de §5 tiene su estado y texto (S2).

## B0 — `toDialablePhone` · `sr-backend`

RF-MV-10 con CA-MV-04: función pura exportada desde `@iwana/shared` que reutiliza `getCountryPhonePrefix` y el patrón E.164 canónico. **Publícala primero (S1)** y avisa.
**Cierras cuando:** las pruebas de CA-MV-04 pasan con conteo real y typecheck de `@iwana/shared` verde.

## F1 — Tarjetas, acciones y vista lateral · `fe-platform` (tras S1 y S2)

RF-MV-01 a RF-MV-11 y RF-MV-14 a RF-MV-15. Un solo estado y una sola consulta para tabla y tarjetas (RNF-MV-03); el cambio de layout no repite la petición (RNF-MV-05). `SubscriberContactActions` se usa en la tarjeta y en la vista lateral, con nombre accesible y sin número visible; `tel:` y `https://wa.me/` con `rel="noopener noreferrer"` para el externo.
**Tests:** CA-MV-01, CA-MV-02 (por rol), CA-MV-03, CA-MV-05 y CA-MV-06 en specs de componente; CA-MV-08 en el E2E con viewport 375 px (sintético).
**Cierras cuando:** tests verdes con conteo real, typecheck verde y `audit-ui.mjs` sin hallazgos.

## F2 — Chips y «Más filtros» en móvil · `fe-platform` (tras S2)

RF-MV-12 y RF-MV-13 según la spec P0. El panel inferior respeta las capas Z (ADR-075) y devuelve el foco al disparador al cerrarse.
**Tests:** CA-MV-07 en specs de componente; los tests existentes de ambos componentes siguen verdes.
**Cierras cuando:** tests verdes con conteo real y typecheck verde.

---

## V1 — `sr-qa`
Traza CA-MV-01 a CA-MV-08. E2E del portal completo (0 fallos, 0 cuarentenas), con el móvil también en el contenedor oficial de Playwright. Mide en el tenant de desarrollo qué porcentaje de teléfonos de suscriptores normaliza `toDialablePhone` (solo el porcentaje y el total, sin números). Veredicto GO/NO-GO.

## V2 — `sec-eng`
Sin número visible, sin PII en URL ni logs, enlaces externos seguros, sin texto predefinido hacia WhatsApp, y los roles sin teléfono en la proyección no ven acciones. Veredicto GO/NO-GO.

## V3 — `ds-owner`
Identidad a 375 y 768 px en claro y oscuro contra la spec P0; objetivos táctiles; `audit-ui.mjs` en 0.

## V4 — `gate-verifier`
Gates Before Merge en local, sin caché, sobre `@iwana/shared` y `@iwana/portal`; E2E del portal en verde. El CI de `main` se verifica en G7, después del push.

## 3. Formato de reporte

Entregables con ruta; comando y conteo real; RF y CA cubiertos por identificador; `[BLOQUEO]` si los hay; deuda nueva por severidad P0-P3.
