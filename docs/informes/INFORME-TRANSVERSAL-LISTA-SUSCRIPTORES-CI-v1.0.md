# INFORME — Transversal · Rojo del CI tras 7bebb5eb y alcance de la lista de suscriptores

**Versión:** 1.0
**Fecha:** 2026-11-21
**Estado:** Cuatro commits publicados por orden del usuario · G6.5 ✅ 2026-11-21: CI 44916953268 sobre `09776c75` (success, seis jobs). Intento 1: 17 min 50 s; cinco jobs en verde y el de unitarias en rojo por el p95 intermitente. Intento 2, solo ese job: 21 min 47 s, en verde. E2E Web Admin Smoke 44916953349 (success).
**Fuente:** encargo «fallo intermitente de `portal-billing-flow.spec.ts` (MOD14)» · [spec v1.1](../specs/2026-11-21-transversal-importacion-estado-del-suscriptor-v1.1.md) (G0 2026-11-21) · [spec v1.0](../specs/2026-11-21-transversal-importacion-estado-del-suscriptor.md) (sustituida)

## 1. Diagnóstico del encargo

| Pregunta | Resultado |
|---|---|
| Hipótesis «`.first()` sobre "Titular Sintético" paga a un titular de otra spec» | **Descartada.** Cada spec crea su propio tenant (`srqa-bf-…`, `srqa-mod05-cf-…`) y el buscador consulta solo el tenant de la sesión |
| Causa de las 4 pruebas encadenadas de los runs 42398209146 y 42477293930 | `getByRole('button', { name: 'Registrar pago' })` resolvía dos botones (cabecera y estado vacío) si la lista ya había cargado, y el modo estricto de Playwright fallaba. Ya corregido en `b6b2c759` (2026-11-08). No se repitió en 100 runs de `main` |
| Rojo vigente al iniciar (run 44830528685, `7bebb5eb`) | No era intermitente: 21 pruebas en rojo fijo. `7bebb5eb` limitó la lista, las búsquedas y los conteos a suscriptores con `activated_at` |

## 2. Qué cambió

| Commit | Cambio |
|---|---|
| `b84a0112` | El buscador de facturación vuelve a encontrar al titular con un servicio activado (parámetro `billable`, retirado después en `e7e173e4`) |
| `eaebf6e2` | Siete specs E2E leen el prospecto convertido de `GET /crm/expedientes/:id/bootstrap` en vez de buscarlo por correo. CA-LO-07 enfoca «Agenda de corte», porque «Más filtros» solo existe en móvil desde `7bebb5eb` |
| `e7e173e4` | Spec v1.1. `LISTED_SUBSCRIBER_SCOPE_SQL` es el único alcance de lista, búsqueda libre, búsqueda exacta y conteos de colas: primera activación **o** un contrato `ACTIVE`, `SUSPENDED` o `TERMINATED`. El prospecto sin servicio sigue fuera. Se retira `billable` |
| `09776c75` | El fixture del informe de teléfonos crea sus suscriptores `ACTIVE` con `activated_at`. El CLI no cambia: mide las acciones de la lista |

## 3. Decisiones y desviaciones

| # | Tema | Resolución |
|---|---|---|
| D1 | Importados UISP fuera de la lista | La v1.0 (G0) los pasaba a `ACTIVE`. Al implementarla apareció el bloqueo (H7 en la v1.0, H6 en la v1.1): `ck_subscribers_fiscal_complete_when_active` exige `vat_responsibility`, y UISP no lo trae. El código se revirtió y la v1.0 quedó sustituida |
| D2 | Responsabilidad de IVA por estrato | Descartada. El estrato da `vat_treatment` (exento o excluido del servicio), no la responsabilidad del RUT. Rellenarla sería inventar un dato fiscal sin dictamen del contador |
| D3 | Alcance elegido | Opción 1 del usuario: la lista incluye a quien tiene servicio activado. El importado aparece como «Prospecto» hasta completar sus datos fiscales |
| V1 | Aserciones del complemento UISP | Excepción a CA-5 aprobada por el usuario («Sí, ajústalas»). Antes de promover y tras revertir, la prueba espera la lista vacía y que la ficha responda 200. La comprobación de que no hay duplicado tras promover no cambia. `test-change-reviewer`: justificado |
| V2 | Fixture del informe de teléfonos | `ACTIVE` sin `activated_at` no lo produce el alta real. Se corrige el fixture, no el CLI |

## 4. Evidencia

| Criterio | Resultado | Evidencia |
|---|---|---|
| `portal-billing-flow` | PASS | R4.1 aislado: antes 3/8 (rojo desde la línea 614); después 8/8 |
| CA-1 (v1.1) | PASS | `subscribers.service.spec.ts`: las tres consultas usan el alcance; 561/561 en 32 suites |
| CA-2 y CA-5 V1 `ux-qw` | PASS | R4.1 local: el prospecto sin servicio queda fuera de la búsqueda |
| CA-3 y CA-5 UISP | PASS | R4.1 local: `portal-importacion-uisp-live` 3/3 y `portal-importacion-uisp-usuarios-live` en verde |
| CA-4 | PASS | `billable` retirado del controlador, el servicio y el api-client; portal 286/286 en 28 suites; `billing-flow` en verde |
| Informe de teléfonos | PASS | Integración contra Postgres real (`DB_NAME=test`): 1 fallo sin el ajuste, 1/1 con él |
| CI de `main` | PASS | R4.1 en verde en 44916471346 (`e7e173e4`) y en 44916953268 (`09776c75`). Seis jobs en verde en el intento 2 de 44916953268 |

**Evolución del E2E R4.1 en el CI:** 21 rojos (`7bebb5eb`) → 16 (`b84a0112`) → 3 (`eaebf6e2`) → 0 (`e7e173e4`).

## 5. Pendiente

1. **Prospecto con servicio y filtro de estado (D2 de la v1.1):** el filtro de la lista no ofrece «Prospecto». Si se necesita, va en un cambio aparte.
2. **Datos reales:** a un suscriptor `ACTIVE` sin `activated_at` y sin ningún contrato activado lo deja fuera la lista. La migración 015 no rellenó la columna. Antes de la beta, contarlos con una consulta de solo lectura por tenant.
3. **Hueco de cobertura (`test-change-reviewer`):** tras revertir un lote UISP, un suscriptor residual sin contratos ya no se vería en la lista. Falta una lectura que no pase por el alcance, por ejemplo un conteo por `document_number_hmac`.
4. **E2E en local:** en este equipo, la suite completa da falsos rojos por tiempo de espera, y `privacy-live`, `ficha-uisp` y `equipos` no pasan del login del portal. El CI es la referencia.
5. **p95 de N1 del resumen de facturación:** intermitente (529 ms en el run de `eaebf6e2`); pasó al relanzar.
