# LAUNCH — `@iwana/ui` · Cara cursiva local de Exo 2 (P2 del veredicto de ds-owner)

**Origen:** `docs/informes/INFORME-DS-OWNER-FUENTES-LOCALES-v1.0.md`: GO para `@theme inline` y los pesos 100–800; **NO GO** para la cursiva. Registrado en el plan `docs/plans/2026-10-09-mod11-mod12-reverso-consumo-ot.md`, fila del 2026-10-10.
**G2:** la decisión de diseño ya la tomó `ds-owner` (restaurar la cara auténtica). Este bloque solo la ejecuta.

| # | Subagente | Encargo | Skills a leer antes de escribir |
| --- | --- | --- | --- |
| 1 | `fe-platform` | Autoalojar Exo 2 Italic, declararla en los dos `localFont` y verificar visualmente | `frontend-dev-guidelines`, `iwana-identity-ui-review`, `playwright-skill` |

**Paralelo:** no aplica. **Siguiente:** `ds-owner` cierra el P2 a partir de las capturas, sin una ola nueva.

---

### Bloque copiar-pegar — `fe-platform` (Exo 2 Italic)

> Actúa como `fe-platform`. Lee `AGENTS.md`, el informe `INFORME-DS-OWNER-FUENTES-LOCALES-v1.0.md` (hallazgo P2 y «Por verificar») y los `SKILL.md` de la tabla.
> Añade a `packages/ui/src/styles/fonts/` la variante **Exo 2 Italic** (subconjunto latin, woff2), tomada de la fuente oficial OFL e incluida en `exo2-OFL.txt`. Antes de declarar el rango, confirma en sus metadatos qué pesos trae. Declara en `apps/portal/src/app/layout.tsx` y en `apps/web/src/app/layout.tsx` un `localFont` con `src` múltiple: una entrada `style: 'normal'` y otra `style: 'italic'`. No vuelvas a cargar nada de Google Fonts ni cambies los tokens.
> Comprueba visualmente, con Playwright y en local, que la cursiva es la auténtica. Usa el usuario sintético del seed del proyecto, sin credenciales reales. Captura una pantalla del portal (detalle del suscriptor o panel de recomendación de visita) y otra de web (resumen de auditoría o creación de tenant).
> Gates: typecheck del portal y de web, build de Next de las dos aplicaciones y `audit-ui.mjs`. Entrega `docs/informes/INFORME-FE-PLATFORM-EXO2-ITALIC-v1.0.md` con las capturas. Sin commit.
