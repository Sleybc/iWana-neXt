# Guion de verificación con lector de pantalla — MOD11 consola de OT (Ola 2b)

**Versión:** 1.0 · **Fecha:** 2026-10-06 · **Emitido por:** AI-EM-ARCH
**Cierra:** `[BLOQUEO-R5-LECTOR]` de `docs/informes/INFORME-MOD11-CONSOLA-OT-OLA2B-R5-SR-QA-v1.1.md`
**Decisión que lo origina:** el CTO eligió la verificación manual (opción 1) el 2026-10-06. Está registrada en el plan `docs/plans/2026-09-14-mod11-consola-ot-remediacion.md` v1.2.
**Ejecutor:** una persona, no un agente. **Duración estimada:** 15 minutos.

## 0. Preparación (antes de empezar el reloj)

- **Lector y navegador:** NVDA (versión estable vigente) con Chrome o Firefox. Voz a velocidad normal; desactiva la lectura automática de cambios de formato.
- **Entorno:** el stack local que deja listo R5 v1.2 (api, worker, portal y Postgres). Inicia sesión con el **usuario técnico de prueba** del seed. Para el paso 5 necesitas también el **usuario supervisor de prueba**. No uses las OT reales.
- **Datos:** la OT de prueba de R5 en `ASSIGNED`, con la plantilla `INSTALACION_ESTANDAR` v2 y al menos un equipo CPE en la custodia del técnico. Una segunda OT de prueba en `BLOCKED`.
- **Atajos de NVDA que vas a usar:**

| Atajo | Qué hace |
| --- | --- |
| `Tab` / `Mayús+Tab` | Navegar por controles |
| `H` | Siguiente encabezado |
| `D` | Siguiente punto de referencia |
| `NVDA+F7` | Lista de elementos |
| `NVDA+Espacio` | Alternar entre modo foco y modo exploración |
| `Insert+↓` | Leer desde el cursor |

> **Cómo anotar.** En cada paso, marca **OK**, **Falla** o **Dudoso**, y transcribe **lo que NVDA dijo**, no lo que esperabas oír. Una sola **Falla** en un paso marcado ★ impide cerrar el bloqueo.

## 1. Pre-inicio: el checklist en lectura (3 min)

1. Abre `/dashboard/operations/execution-orders` y abre la OT de prueba desde la bandeja con el teclado.
   - **Esperado:** el panel lateral recibe el foco y NVDA anuncia el número de la OT.
2. ★ Con `D` o `NVDA+F7`, localiza la región **«Requisitos»**.
   - **Esperado:** NVDA anuncia la región y su lista de **5** requisitos.
   - **Esperado:** en cada ítem se oyen tres cosas: la **etiqueta**, si es **Obligatorio u Opcional** y el **estado en texto** («Pendiente» con su razón, o «Sin registrar» en el de bitácora). El estado **no** debe depender del color.
3. ★ Recorre los controles con `Tab`.
   - **Esperado:** **no** hay controles de captura (adjuntar, registrar o firmar). El único control de acción es **«Iniciar ejecución»**.
4. ★ Pulsa **«Iniciar ejecución»**.
   - **Esperado:** NVDA anuncia el resultado sin que muevas el foco a mano.

## 2. Firma del cliente (4 min)

5. ★ En el requisito **«Acta de conformidad firmada por el cliente»**, activa **«Capturar firma del cliente»**.
   - **Esperado:** el foco pasa al encabezado o al primer control de la superficie.
   - **Esperado:** NVDA lee las instrucciones («Pide al cliente que firme el acta de conformidad.» y «Dibuja la firma dentro del recuadro…») y el estado **«Todavía no hay firma dibujada.»**
6. Con `Tab`, recorre la superficie.
   - **Esperado:** el **«Área de firma»** se anuncia con su nombre, y **«Limpiar»**, **«Guardar firma»** y **«Cancelar»** tienen foco visible y se activan con `Enter` o `Espacio`.
7. ★ Sin dibujar nada, activa **«Guardar firma»**.
   - **Esperado:** se anuncia **«Dibuja la firma antes de guardarla.»**
8. Dibuja la firma con el ratón (el trazo está exceptuado del teclado por WCAG 2.1.1) y vuelve al teclado.
   - **Esperado:** se anuncia **«Firma dibujada. Puedes guardarla o limpiarla.»**
9. ★ Activa **«Guardar firma»**.
   - **Esperado:** se anuncia el estado de análisis y después **«Firma guardada»**, con `role="status"` y sin mover el foco a otra parte.
   - **Esperado:** el requisito pasa a **«Cumplido»** y NVDA lo lee al volver a él.
10. Abre otra vez la captura y pulsa **«Cancelar»**.
    - **Esperado:** el foco **regresa al botón que la abrió**.

## 3. Equipo instalado y custodia (4 min)

11. ★ En **«Equipos instalados en el sitio del cliente»**, activa **«Registrar equipo instalado»**.
    - **Esperado:** se anuncia la carga de la custodia, y después el selector **«Selecciona un equipo de tu custodia»** con sus opciones legibles.
12. Completa el formulario (`Ítem`, `Cantidad` y `Destino`) solo con el teclado y envíalo.
    - **Esperado:** los errores de validación se anuncian junto a su campo, y el éxito se anuncia.
13. ★ Con `Insert+↓` bajo ese requisito, escucha el historial.
    - **Esperado:** el consumo aparece **bajo ese requisito** y no en una lista global.
    - **Esperado:** si existe el grupo **«Consumos sin requisito asociado»**, se lee una sola vez y al final.
14. Si aparece **«Cargar más»**, actívalo.
    - **Esperado:** se deshabilita mientras carga y se anuncia el nuevo conteo.

## 4. OT bloqueada (2 min)

15. ★ Abre la OT de prueba en `BLOCKED`.
    - **Esperado:** se anuncia **«Orden bloqueada»** con su descripción. **No** se menciona ningún motivo ni la frase «motivo no disponible».
16. ★ Recorre con `Tab`.
    - **Esperado:** no hay controles de captura editables.
    - **Esperado:** si aparece **«Desbloqueo no disponible»**, se lee como aviso y **no** como un botón activable.

## 5. Cierre y supervisión (2 min)

17. Inicia sesión como el **supervisor de prueba** y abre la OT de la sección 1.
    - **Esperado:** el checklist se lee en **modo lectura**.
    - **Esperado:** **no** se anuncia «No puedes iniciar esta orden» ni ningún texto dirigido al técnico (CA-04).
18. Pulsa `Escape` con el panel abierto.
    - **Esperado:** el panel se cierra y el foco vuelve a la fila de la bandeja que lo abrió.

## 6. Registro de resultados

| Paso | ★ | Resultado (OK / Falla / Dudoso) | Lo que dijo NVDA |
| --- | --- | --- | --- |
| 1 | | | |
| 2 | ★ | | |
| 3 | ★ | | |
| 4 | ★ | | |
| 5 | ★ | | |
| 6 | | | |
| 7 | ★ | | |
| 8 | | | |
| 9 | ★ | | |
| 10 | | | |
| 11 | ★ | | |
| 12 | | | |
| 13 | ★ | | |
| 14 | | | |
| 15 | ★ | | |
| 16 | ★ | | |
| 17 | | | |
| 18 | | | |

**Datos de la corrida:**

- Ejecutor:
- Fecha:
- Versión de NVDA:
- Navegador y versión:
- SHA de `main`:

**Cómo se cierra.** Si no hay ninguna Falla en los pasos ★, el bloqueo se cierra. Cada Falla o paso Dudoso se convierte en hallazgo con su paso y su transcripción. AI-EM-ARCH lo asigna al dueño del archivo según el informe B0 §5. Las Fallas fuera de ★ entran como deuda, con su severidad.
