# Review UI — Fuentes locales (portal, web y `@iwana/ui`)

- **Fecha:** 2026-10-10
- **Rol:** ds-owner
- **Commit revisado:** `ca1c116f4a450101076ba72ba819bb9112b6ce47`
- **Alcance:** diff de los dos `layout.tsx`, `packages/ui/src/styles/globals.css`, `packages/ui/src/tokens/typography.ts` y fuentes locales; contraste con el informe G6.5 y el manual de identidad.

## Resumen ejecutivo

El cambio a fuentes locales conserva correctamente los tokens Tailwind y el rango de pesos indicado por el manual. Sin embargo, cada aplicación declara una sola cara local de Exo 2 con estilo normal, mientras seis componentes conservan siete usos de `italic`; se pierde la cara cursiva auténtica que antes cargaba Google Fonts. La revisión visual de esos componentes queda pendiente: pude abrir ambos inicios de sesión, pero las pantallas con los usos de cursiva requieren una sesión autenticada.

**Modo:** código; inspección visual pendiente  
**Script:** no ejecutado (alcance de fuentes y layouts, sin cambios de pantallas)  
**Puntaje:** 97/100 (P0: 0, P1: 0, P2: 1, P3: 0)

## Hallazgos críticos (P0)

Ninguno.

## Hallazgos

### [P2][Tipografía] La carga local no declara una cara cursiva de Exo 2

- **Evidencia:** En [layout del portal](../../apps/portal/src/app/layout.tsx:11) y [layout de web](../../apps/web/src/app/layout.tsx:10), `localFont` carga únicamente `exo2-latin.woff2`, declara `weight: '100 800'` y no especifica `style`. La API de Next.js asigna `normal` cuando `style` se omite y permite declarar archivos y pesos separados para `italic` ([referencia oficial de `next/font`](https://nextjs.org/docs/app/api-reference/components/font)). El directorio `packages/ui/src/styles/fonts/` contiene una sola fuente Exo 2 y no una variante cursiva. Antes de `ca1c116f`, el import de Google Fonts en el CSS global incluía `ital,wght@...;1,100;1,400`.
- **Usos afectados:** portal: [SubscriberDetailClient.tsx](../../apps/portal/src/components/crm/subscribers/SubscriberDetailClient.tsx:190) y `:290`, [TaxProfileBlock.tsx](../../apps/portal/src/components/crm/subscribers/TaxProfileBlock.tsx:341), [VisitRequestRecommendationPanel.tsx](../../apps/portal/src/components/scheduling/VisitRequestRecommendationPanel.tsx:1011); web: [AuditExpandedDetails.tsx](../../apps/web/src/components/audit/AuditExpandedDetails.tsx:140), [AuditSummary.tsx](../../apps/web/src/components/audit/AuditSummary.tsx:172), [TenantCreateSummary.tsx](../../apps/web/src/components/tenants/TenantCreateSummary.tsx:133). Estas clases siguen solicitando cursiva. Sin una cara Exo 2 cursiva declarada, el navegador puede sintetizar la inclinación; eso no reproduce los glifos diseñados para Exo 2 Italic y puede variar entre motores.
- **Impacto:** textos secundarios, explicaciones y etiquetas pierden fidelidad tipográfica en ambas aplicaciones; no bloquea el contenido ni la lectura.
- **Recomendación para fe-platform:** añadir y autoalojar la variante Exo 2 Italic con su licencia OFL, y declarar sus caras en ambos `localFont` (por ejemplo, `src` con entradas `style: 'normal'` y `style: 'italic'`, con los pesos que realmente soporte cada archivo). Mantener las clases `italic` existentes y capturar una pantalla del portal y otra de web después de la corrección.
- **Esfuerzo:** M.

## Revisión de los puntos solicitados

| Punto                                                                  | Dictamen  | Evidencia y motivo                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| ---------------------------------------------------------------------- | --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| (a) `--font-sans`, `--font-display` y `--font-mono` en `@theme inline` | **GO**    | `globals.css:192-194` enlaza los tokens Tailwind a las variables emitidas por `next/font`. Esta forma evita que la referencia a una variable definida en el árbol del layout se resuelva fuera del ámbito donde está disponible. Tailwind documenta este comportamiento para `@theme inline` ([Theme variables — Referencing other variables](https://tailwindcss.com/docs/theme#referencing-other-variables)). El `body` también aplica `var(--font-exo-2)` directamente en `globals.css:201`.                                                                            |
| (b) Exo 2 Italic                                                       | **NO GO** | Las llamadas locales de ambos layouts solo registran la fuente normal; siete clases `italic` repartidas en los seis componentes citados siguen vigentes. La corrección propuesta arriba restaura la cara local sin volver a depender de Google Fonts en runtime.                                                                                                                                                                                                                                                                                                           |
| (c) pesos `100–800`                                                    | **GO**    | Los dos layouts declaran `100 800` (`apps/portal/src/app/layout.tsx:13`, `apps/web/src/app/layout.tsx:12`). El manual de implementación §2.2 enumera Thin 100, Light 300, Regular 400, Medium 500, Semibold 600, Bold 700 y ExtraBold 800 (`docs/identity/Manual_Implementacion_Identidad_Iwana.md:154-161`), así que los extremos coinciden con el rango normativo. El commit amplía además la carga de portal hasta 800, que antes terminaba en 700. El dictamen confirma el rango declarado; no es una inspección independiente de los ejes internos del binario WOFF2. |

`packages/ui/src/tokens/typography.ts` solo cambia el comentario que describe el autoalojamiento; el objeto de tokens permanece igual. La búsqueda del repositorio no encontró consumidores de `iwanaTypography`, por lo que no se atribuye a este commit una regresión en ese archivo.

## Validación visual

Arranqué directamente los dos servidores Next, sin ejecutar el launcher: web en `http://127.0.0.1:3001` y portal en `http://localhost:3002`. Pude ver sus páginas de inicio de sesión. No pude abrir las pantallas de los componentes citados, porque requieren una sesión autenticada; no envié credenciales. Por eso esta inspección no confirma cómo se renderiza visualmente la cursiva en esos componentes y no guardé capturas de ellos.

No ejecuté `pnpm dev`: el launcher existente `scripts/dev.mjs` incluye infraestructura de desarrollo y ejecuta el one-shot `minio-init`, que crea el bucket configurado. La validación pendiente debe abrir, con una sesión autenticada disponible, una pantalla del portal que muestre el detalle del suscriptor o el panel de recomendación y una pantalla web que muestre el resumen de auditoría o el formulario de creación de tenant.

## Quick wins

- Añadir la cara Exo 2 Italic local y declararla en ambos layouts.
- Repetir la inspección visual con una sesión activa y guardar una captura por aplicación.

## Mejoras estratégicas

Ninguna adicional. El mapeo Tailwind de variables locales y el rango de pesos siguen el patrón y los valores existentes.

## Por verificar

- Inspección visual real del portal y de web una vez disponible una sesión local activa.
- Confirmar contra los metadatos del archivo cursivo elegido qué pesos italic contiene antes de declarar su rango.

## Veredicto

**Aprobada con cambios:** el mapeo Tailwind y los pesos están alineados, pero no se cierra la migración de fuentes hasta recuperar Exo 2 Italic en local y validar ambas pantallas visualmente.
