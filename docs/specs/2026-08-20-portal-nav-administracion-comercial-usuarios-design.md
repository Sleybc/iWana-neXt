# Spec UX — Navegación: Comercial en Administración y label Usuarios

| Campo | Valor |
| --- | --- |
| **Versión** | 1.0 |
| **Estado** | Aprobado |
| **Fecha** | 2026-08-20 |
| **Autor** | AI-PROD-UX (sesión portal) |
| **Módulo** | Shell portal (`apps/portal`) · MOD02 nav · MOD04 Users · MOD06 Comercial |
| **Identidad** | [Firma iWana](./2026-07-12-firma-iwana-diseno-visual-design.md) |
| **Vocabulario** | Label corto **Usuarios**; ítem **Comercial** sin cambio de nombre |
| **Antecedente nav** | [2026-08-04-portal-dashboard-recomposicion-ux-spec.md](./2026-08-04-portal-dashboard-recomposicion-ux-spec.md) UX-NAV-01 |

## 1. Problema

Comercial vive en el grupo **Menú**, al mismo nivel que operación diaria (Oportunidades, Programación, Inventario). El negocio lo trata como administración de oferta (catálogo y precios), no como trabajo del día. El grupo **Administración** ya existe y solo tiene Configuración y Usuarios y accesos.

El label **Usuarios y accesos** es largo y redundante: la pantalla ya cubre cuentas y perfiles. El operador pidió **Usuarios**.

## 2. Decisión

Mover el ítem **Comercial** al grupo **Administración**, al mismo nivel que Configuración y Usuarios. El enlace sigue diciendo **Comercial**. Renombrar el ítem de cuentas a **Usuarios** en todas las superficies de navegación que hoy dicen «Usuarios y accesos».

Orden canónico de Administración:

1. Configuración
2. Usuarios
3. Comercial

## 3. Arquitectura de información

### 3.1 Menú (sin Comercial)

```text
Menú
  Inicio
  Oportunidades
  Suscriptores
  Programación
  Mesa de ayuda
  Operaciones
  Inventario
```

Roles, `href` e iconos de estos ítems no cambian.

### 3.2 Administración

```text
Administración
  Configuración     → /dashboard/settings
  Usuarios          → /dashboard/users
  Comercial         → /dashboard/commercial
```

Iconos actuales se conservan (`Settings`, `Users`, `HandCoins`).

### 3.3 Superficies que deben usar el mismo label

Regla UX-NAV-01: menú lateral, atajos de búsqueda global y accesos rápidos del inicio usan las mismas etiquetas.

| Superficie | Hoy | Después |
| --- | --- | --- |
| Sidebar | Usuarios y accesos | Usuarios |
| `GlobalSearchOverlay` quick links | Usuarios y accesos | Usuarios |
| `QuickActionsPanel` | Usuarios y accesos | Usuarios |
| Título de página `/dashboard/users` | Usuarios | Sin cambio (ya coincide) |
| Título de página `/dashboard/commercial` | Comercial | Comercial |

Comercial no se mueve de sitio en accesos rápidos ni en búsqueda: solo deja el grupo Menú del sidebar. El atajo del inicio puede seguir listando Comercial; no hace falta un subgrupo «Administración» en el inicio.

## 4. Fuera de alcance

- Cambiar rutas (`/dashboard/commercial`, `/dashboard/users`, `/dashboard/settings`).
- Renombrar el módulo backend, el bounded context o el ADR de ownership.
- Cambiar el hub de Configuración: la tarjeta **Perfiles y autenticación** (registry MOD00) no es el ítem del sidebar.
- Reordenar accesos rápidos del inicio ni agruparlos como Administración.
- Mover Reglas (ya federadas en Configuración).
- Cambiar copy interno de docs históricos (PRD/ADR) salvo una nota corta en el informe de ejecución si se genera.

## 5. Criterios de aceptación

1. En el sidebar, Comercial no aparece bajo Menú.
2. En Administración el orden visible es Configuración, Usuarios, Comercial.
3. No existe el texto de nav **Usuarios y accesos** ni **Usuarios y acceso** en sidebar, búsqueda global ni accesos rápidos.
4. El enlace Usuarios apunta a `/dashboard/users`; Comercial a `/dashboard/commercial`.
5. El H1 de Comercial sigue siendo **Comercial**.
6. Tests Jest de `Sidebar`, `QuickActionsPanel` y búsqueda, más E2E de dashboard que aserten el label del nav, esperan **Usuarios**.

## 6. Vocabulario

| Visible | No usar en nav |
| --- | --- |
| Usuarios | Usuarios y accesos, Usuarios y acceso, Access, MOD04 |
| Comercial | Administración (como nombre del ítem), Catálogo (como nombre del ítem del sidebar) |
| Configuración | Settings |

El heading de grupo **Administración** no cambia.

## 7. Archivos previstos

- `apps/portal/src/components/layout/Sidebar.tsx` + `Sidebar.spec.tsx`
- `apps/portal/src/components/search/GlobalSearchOverlay.tsx` (+ spec si existe aserción de label)
- `apps/portal/src/components/dashboard/QuickActionsPanel.tsx` + spec
- E2E portal que fijen el label del ítem Users en el shell (no mocks de secciones de Settings)
