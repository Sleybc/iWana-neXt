# INFORME — MOD02 · Inicio «Pulso y atención» · Fase 1

**Versión:** 1.0
**Fecha:** 2026-11-16
**Estado:** Implementado sin commit — pruebas del módulo y E2E del inicio en verde en local; G6.5 pendiente (CI)
**Definición:** [`2026-11-16-portal-dashboard-pulso-y-atencion-direccion.md`](../specs/2026-11-16-portal-dashboard-pulso-y-atencion-direccion.md) v1.1 (G0 2026-11-16; desviaciones en su §13)

## 1. Qué cambió

Solo `apps/portal/src/components/dashboard/` y la E2E del inicio. Sin backend, sin dependencias, sin tocar `portal-ui.tsx` ni `api-client.ts`.

| Pieza | Cambio |
| --- | --- |
| `dashboard-role-composition.ts` | Composición por rol con `attentionIds` y `areaIds`; métrica `P-1` (suscriptores activos); cuatro fuentes nuevas; techo de autorización ampliado; fuera los bloques plegados |
| `dashboard-attention-queue.ts` | Derivación pura de la cola: 13 filas posibles, En riesgo antes que Atención |
| `DashboardAttentionQueue.tsx` | Cola con tope de 6, «Ver los restantes», estado «Todo al día» y aviso si una fuente falló |
| `DashboardPulse.tsx` | Franja de pulso: una superficie, hasta cinco celdas con rótulo, cifra, señal, frase y mini visual |
| `DashboardAreaCards.tsx` | Seis cards (Mesa de ayuda, Programación, Oportunidades, Suscriptores, Aprovisionamiento, Inventario) con estado y una visual cada una |
| `dashboard-visuals.tsx` | Barra apilada, leyenda y barras horizontales en CSS, sin librería |
| `DashboardClient.tsx` | Nueva disposición (pulso → áreas + atención → detalle + historial); retiro de Foco de hoy, plegados, B2 adaptativo y de los bloques que pasaron a las cards |
| `dashboard-today-focus.ts` (+ spec) | Eliminados |

Fuentes nuevas, todas ya publicadas: `crm/subscribers/queue-counts`, `crm/billing-cycles/cutoff-agenda`, `network/provisioning/inbox` (las tres colas) e `inventory/replenishment/suggestions`. De las dos paginadas solo se lee `meta.total` con `limit=1`.

## 2. Evidencia

| Gate | Comando | Resultado |
| --- | --- | --- |
| Unitarias del módulo | `npx jest src/components/dashboard` (apps/portal) | 8 suites, 141 pruebas, 0 fallos |
| Suite completa del portal | `npx jest` (apps/portal) | 418 suites: 415 pasan, 3 fallan; 4.405 pruebas: 4.399 pasan, 5 fallan, 1 omitida. Ningún fallo es del inicio: `jest-context-mocks-stable.structure.spec.ts` (archivo sin versionar de otra sesión) señala `SubscriberEquipmentTab.spec.tsx`; `ExecutionOrderContractStep.console.spec.tsx` y `BillingPolicySettingsClient.spec.tsx` pasan aisladas (8/8) |
| Tipos | `npx tsc --noEmit -p .` (apps/portal) | 0 errores |
| Lint | `npx eslint src/components/dashboard --ext .ts,.tsx` | Sin hallazgos |
| Identidad | `node .agents/skills/iwana-identity-ui-review/scripts/audit-ui.mjs apps/portal/src/components/dashboard` | Sin hallazgos |
| Navegador | `http://localhost:3002/dashboard`, sesión de administración, 1440 y 768 px | Sobre la primera composición: las 13 lecturas respondieron 200, sin errores de consola ni desbordamiento. La recomposición posterior (pulso de 5 celdas, 6 áreas) **no se vio en el portal real**: los servidores de desarrollo dejaron de responder; se verificó con la E2E |
| E2E del inicio | `pnpm --filter @iwana/portal build` y `pnpm exec playwright test --config e2e/playwright.portal.config.ts portal-dashboard-empresa --retries=0` | 27 pruebas, 27 pasan (incluye axe en claro y oscuro y viewports 375, 768 y 1280). Capturas en `test-results/evidencia/informes/evidencias/portal-dashboard-recomposicion/` |

Conteo de casos frente a HEAD:

| Spec | HEAD | Ahora | Motivo |
| --- | --- | --- | --- |
| `DashboardClient.spec.tsx` | 45 | 34 | 24 casos describían bloques retirados o la retícula anterior; 13 nuevos cubren pulso, cola, áreas, fuentes nuevas y permisos |
| `dashboard-role-composition.spec.ts` | 25 | 26 | Fuera las 3 de bloques plegados; 4 nuevas de fuentes por rol |
| `dashboard-attention-queue.spec.ts` | — | 9 | Nuevo |
| `dashboard-today-focus.spec.ts` | 9 | — | El módulo se eliminó |

Los casos retirados no son fixtures ajustados: prueban comportamiento que la dirección aprobada elimina. Revisión de `test-change-reviewer` pendiente.

## 3. Pendiente antes de publicar

1. Publicar y registrar el G6.5 con el CI de `main`.
2. Visto bueno de AI-SEC-ENG al techo de autorización: cada rol pide más fuentes que antes, todas dentro del `@Roles` de su endpoint.
3. Revisión de `test-change-reviewer` sobre los specs modificados.
4. Commit con índice temporal: el árbol tiene cambios de otras sesiones.

## 4. Atajos y riesgos

- Programación no nombra técnicos hasta que el contrato publique el nombre visible (N6).
- La celda de pulso y las visuales son patrones de pantalla (`DashboardPulse.tsx`, `dashboard-visuals.tsx`); su promoción a `portal-ui` queda propuesta a DS-OWNER.
- Una fuente sin permiso se reconoce por el mensaje de negocio del 403; si ese texto cambia, la fila vuelve a contarse como fallo. Lo cubre una prueba.
- «Hoy en agenda» y el selector de periodo no se entregan en esta fase.
- En la E2E se cambió una aserción del viewport de 375 px: exigía que «Casos abiertos» quedara debajo de «Visitas de hoy»; ahora exige que no haya solape en ningún ancho, sin fijar el orden.
