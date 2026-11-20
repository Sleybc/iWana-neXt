# INFORME — MOD10 Mesa de ayuda · Lateral del ticket en un solo panel

**Versión:** 1.0
**Fecha:** 2026-11-20
**Estado:** Olas 1–3 ejecutadas; **punto de control con el usuario pendiente**; sin commit ni push; E2E sin correr (falta la ventana del puerto 3002)
**Fuente:** [spec](../specs/2026-11-20-mod10-detalle-ticket-lateral-un-panel-ux.md) v1.0 (G0 2026-11-20) · [plan](../plans/2026-11-20-mod10-detalle-ticket-lateral-un-panel.md) · [lanzador](../prompts/PROMPT-MOD10-LATERAL-TICKET-UN-PANEL-LAUNCH-v1.0.md)

## 1. Qué cambió

- `AssuranceTicketDetail.tsx`:
  - El lateral queda en un solo `PortalPanel` denso con cuatro secciones: Estado y asignación, Visita y orden de trabajo, Datos del caso y Fechas.
  - El selector de estado entra al panel.
  - Responsable y área comparten un solo guardado.
  - «Actualizado» se retira (D1).
  - Los adjuntos pasan al hilo y solo se muestran si hay alguno (D2).
  - «Relacionado con» se oculta si no tiene valor o si es el titular de la ficha.
- `SubscriberSupportTab.tsx`: pasa `contextSubscriberId` al detalle para cumplir CA-5.
- Sin cambios de API ni de contrato.

## 2. Decisiones y desviaciones

| # | Tema | Resolución |
|---|---|---|
| D3 | Pieza nueva o composición | Composición con `PortalPanel`, `PortalFieldList` y `PortalFieldRow`; sin token nuevo (dictamen `ds-owner`) |
| V1 | Apilado de responsable y área | Umbral `@[29rem]` en vez de `@[18rem]`: «Monitoreo operativo» no cabe en dos columnas. En el riel y a 375 px se apilan; en la ficha van en fila |
| V2 | Rótulo del estado | «Nuevo estado» (no «Estado»), para que coincidan el texto visible y el nombre accesible que usa la E2E |
| V3 | «Datos del caso» interno | Es `group` y no región: la región externa ya se llama así |
| V4 | Fechas | Línea `flex-wrap`. Cada par etiqueta-valor no se parte (`whitespace-nowrap`), así que en 320 px cada par ocupa su renglón. Texto vacío acortado: «Sin respuesta» (pedido del usuario, 2026-11-20) |
| V5 | «Relacionado con» vacío | Se oculta cuando no hay parte relacionada (spec §0) |

## 3. Evidencia

| CA | Resultado | Evidencia |
|---|---|---|
| CA-1 | PASS | `AssuranceTicketDetail.inventory.spec.tsx`, nuevo, cubre los tres contenedores |
| CA-2 | PASS | Mesa de ayuda a 1440×900, ticket sintético con visita y orden: **1203 → 689 px**. Sin visita ni orden: 658 px. Margen de 11 px |
| CA-3 | PASS | Estado, responsable y área quedan dentro de los 900 px en los tres contenedores |
| CA-4 | PASS | `test-change-reviewer`: ningún ajuste toca expectativas que protegen reglas |
| CA-5 | PASS parcial | Unitarias en los tres contenedores. En el navegador no se vieron los casos «relacionado = titular» ni «relacionado con valor»: faltan datos de prueba |
| CA-6 | PASS parcial | Con cero adjuntos no hay bloque (navegador). El caso con adjuntos solo está cubierto por unitarias |
| CA-7 | PASS parcial | La tabulación sigue el orden visual a 1440 y 375 px. axe no corrió en el navegador porque la CSP (`connect-src 'self'`) lo bloquea; jest-axe pasa sin medir contraste |
| CA-8 | PASS | A 375 px, `scrollWidth = clientWidth` en los tres contenedores |

- **Conteos jest** (`--no-cache --ci`):
  - `components/assurance` + `crm/subscribers`: línea base 79/1235. Tras W0, 80/1247. Al cierre, **80/1256**, todo verde.
  - Suite completa del portal: 455/455 suites, 5154 tests en verde y 1 omitido. En una segunda corrida, `RadioCardGroup.contract.spec` falló una vez por timeout bajo carga; aislado pasa.
- **Gates:** `tsc`, `eslint` y `audit-ui.mjs` sin hallazgos.
- **Datos:** se usaron los tickets sintéticos del tenant de pruebas. No se sembró ni se retiró nada.

## 4. Pendiente

1. **Punto de control:** que el usuario vea el lateral en su portal con un ticket real.
2. **E2E** (ventana del 3002 dada por el usuario, `--workers=1`, reutilizando su servidor): **16/17 pasan**.
   - Pasan `portal-assurance` (incluida la aserción :752-753 actualizada), `portal-assurance-adjuntos` y `portal-mod05-pestana-soporte`.
   - Falla `portal-importacion-uisp-live.spec.ts:736` (adjuntos importados), antes de llegar al lateral:
     - 1.ª corrida: la promoción del lote no terminó en 120 s (:784).
     - 2.ª y 3.ª: quedan mapeos pendientes (CICLO, ETIQUETA, METODO_PAGO, PLAN) (:775).
     - Es la etapa de importación y del worker, ajena a este cambio. La aserción del lateral (:859, `ticket-attachments-section` con «Adjuntos (3)») no llegó a ejecutarse. El mismo selector pasa en `portal-assurance-adjuntos`.
     - Clasificación de `e2e-triage`: **flaky, ajena al lateral**.
       - Corridas 2 y 3: error de método. Ese caso depende de que antes corra el primero del mismo archivo, así que no debe correrse solo.
       - Corrida 1: carrera latente en `requestPromotion` (`migration-promotion.service.ts:259-290`), que encola el trabajo antes del commit y por eso devuelve `OMITIDO` sin reintentar.
       - Con el archivo completo y el árbol actual: **3/3 pasan**, incluidas la :736 y su aserción del lateral (:859).
     - Deuda derivada: arreglar la carrera (`sr-backend`) y documentar la dependencia serial del test (`sr-qa`).
     - Los tenants de prueba residuales los barre la purga R7.
3. **G6.5:** solo tras un push autorizado y con CI de `main` en verde.

## 5. Deudas

- Los adjuntos quedan sobre las pestañas del hilo, así que también se ven en Historial y en Todo.
- En la ficha, «Solicitante» repite al titular; queda fuera de la spec.
- A 375 px, el campo de comentario queda angosto.
- axe en el navegador sigue bloqueado por la CSP.
