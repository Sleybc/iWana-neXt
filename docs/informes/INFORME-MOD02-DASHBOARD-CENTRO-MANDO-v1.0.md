# INFORME-MOD02-DASHBOARD-CENTRO-MANDO-v1.0

## Informe vivo — centro de mando del inicio (`/dashboard` · B1b)

**Versión:** 1.1  
**Estado:** Completado (fase 1 + retiro Accesos rápidos)  
**Fecha:** 2026-09-04  
**Modo activo:** ejecutor  
**Módulo:** MOD02 Dashboard Empresa  
**Autor:** AI-FE-PLATFORM (implementación) · dirección UX/DS de la spec hermana

**Contratos**

- UX: [`docs/specs/2026-09-04-portal-dashboard-centro-mando-ux-spec.md`](../specs/2026-09-04-portal-dashboard-centro-mando-ux-spec.md) v1.1
- DS: [`docs/specs/2026-09-04-portal-dashboard-centro-mando-ds-contrato.md`](../specs/2026-09-04-portal-dashboard-centro-mando-ds-contrato.md) v1.0
- HLD: [`docs/hlds/HLD-MOD02-DASHBOARD-EMPRESA-v2.0.md`](../hlds/HLD-MOD02-DASHBOARD-EMPRESA-v2.0.md) **v2.0.3** (B1b en §2.1; CA-V2-01 versionado; sin endpoints nuevos)
- Spec congelada de recomposición: **no parcheada en silencio**; adenda explícita 2026-09-04 al final. I-1…I-7 y B0 intactos

---

## 1. Resumen

El inicio deja de ser solo consola de atención y pasa a **centro de mando**: se conservan los indicadores I-1…I-7 y se añade la banda **B1b · Salud de la operación**, un chip por módulo autorizado con estado (Al día / Atención / En riesgo / Sin dato) y como máximo una cifra de señal.

No hay mosaico de KPIs. No hay endpoints nuevos. Operaciones se muestra como navegación honesta (Sin dato). El técnico no pide el resumen de campo.

---

## 2. Entrega fase 1

| Pieza | Ruta |
| --- | --- |
| Primitive | `PortalModuleHealthChip` en `apps/portal/src/components/shared/portal-ui.tsx` |
| Composición | `moduleHealthIds` en `dashboard-role-composition.ts` |
| Derivación | `dashboard-module-health.ts` |
| Pintado | `DashboardClient.tsx` banda B1b |
| Receta DS | `component-recipes.md` §14 |

**Matriz administradora (7 chips):** Programación, Mesa de ayuda, Comercial, Oportunidades, Inventario, Configuración, Operaciones.

**Fuera de fase 1:** resumen de órdenes de trabajo, suscriptores, agenda acotada al ejecutor, gráficas, dashboard componible.

---

## 3. Vocabulario

Rótulos alineados al menú: Programación, Mesa de ayuda, Comercial, Oportunidades, Inventario, Configuración, Operaciones. Sin WFM, NOC, OT ni enums en UI.

---

## 4. Verificación

Jest (2026-09-04):

```
PASS dashboard-role-composition.spec.ts
PASS DashboardClient.spec.tsx
PASS TenantSummaryCard.spec.tsx
PASS dashboard-module-health.spec.ts
Test Suites: 4 passed · Tests: 113 passed
```

`audit-ui` sobre DashboardClient, TenantSummaryCard y composición: **P0/P1 = 0**.

Criterios CA-CM-01…09 y CA-DS-CM-01…05 cubiertos por las suites anteriores (primitive distinta de KPI, lima solo en Al día, error ≠ 0, matriz ADMIN, técnico sin fan-out WFM, vista base sin banda, foco en class-token, sin panel Accesos rápidos).

---

## 5. Riesgos residuales

- Operaciones y suscriptores siguen sin contrato: el chip de Operaciones no informa volumen de trabajo.
- Técnico/contratista solo navegan a la agenda; ampliar el guard del resumen de campo es decisión de seguridad (HLD-DE-06).

---

## 6. Delta — retiro de Accesos rápidos (2026-09-04)

El panel duplicaba el menú y B1b. Se eliminó de la composición de los 12 roles (`QuickActionsPanel` fuera del árbol). B3 ofrece **«Ver mi perfil»**. Si B2 no tiene apoyo, el dominante ocupa el ancho (sin columna vacía).

La vista base no pide ficha operativa: B3 ya no espera `tenant-me`/`summary` en idle (esqueleto infinito). Espera branding y pinta la identidad + perfil.

**CA-V2-01:** identidad B3 + al menos un destino útil (B1b, bloque, historial o perfil). Vista base (talento humano, suscriptor, aliado, inversionista): B0 + B3 con perfil. Auditor: historial + perfil. Técnico: B1b Programación + perfil.
