# INFORME — MOD11 ↔ MOD12: reverso de consumo · U2 prod-UX

**Dictamen:** **GO de copy.** Se ratifica el ajuste de R3 y se completa el mensaje de `REVERSAL_LOAN_MISMATCH`. El rechazo permite pedir un nuevo reverso después de resolver la causa; el texto no debe afirmar que la línea queda bloqueada permanentemente. Para el préstamo se usa lenguaje de producto, sin mostrar el enum ni depender de que la persona conozca la palabra «comodato».

## Tabla final de copy

| Elemento | Texto visible |
| --- | --- |
| Diálogo — título | Revertir consumo |
| Diálogo — explicación | Se revertirá todo este consumo. Si se trata de un equipo instalado en el cliente, volverá a la custodia móvil del técnico y se cerrará el comodato asociado (préstamo del equipo al cliente). Si es un consumo por cantidad, las unidades volverán a la custodia de origen. El movimiento original permanecerá en el historial y se registrará el movimiento contrario. |
| Campo de motivo — etiqueta | Motivo del reverso (obligatorio) |
| Campo de motivo — ayuda | Explica por qué solicitas este reverso. No incluyas datos personales. |
| Campo de motivo — validación | Escribe un motivo para continuar. |
| Diálogo — confirmar | Confirmar reverso |
| Diálogo — cancelar | Cancelar |
| Estado — pendiente | **Reverso pendiente.** Estamos verificando el inventario. No vuelvas a enviar la solicitud; el estado se actualizará cuando recibamos una respuesta. |
| Estado — confirmado | **Reverso aplicado.** El movimiento contrario quedó registrado en el inventario. |
| Estado — rechazado | **No se pudo revertir.** Revisa el motivo y sigue la acción indicada. |
| Motivo — el equipo cambió de ubicación | **Qué pasó:** El equipo ya no está en la ubicación donde quedó tras el consumo. **Qué hacer:** Verifica su ubicación actual y el movimiento más reciente en el inventario antes de corregir la orden. Cuando resuelvas la causa, puedes solicitar un nuevo reverso. |
| Motivo — la custodia ya no está activa | **Qué pasó:** La custodia del técnico ya no está activa. **Qué hacer:** Revisa el estado de la custodia y coordina su regularización antes de corregir la orden. Cuando resuelvas la causa, puedes solicitar un nuevo reverso. |
| Motivo — no se encontró el movimiento original | **Qué pasó:** No encontramos el movimiento de inventario necesario para aplicar el reverso. **Qué hacer:** Revisa el historial de inventario. Si el movimiento no aparece, solicita una revisión antes de corregir la orden. Cuando resuelvas la causa, puedes solicitar un nuevo reverso. |
| Motivo — el préstamo del equipo al cliente no está abierto como se esperaba | **Qué pasó:** El préstamo del equipo al cliente no está abierto como se esperaba. **Qué hacer:** Revisa el estado del préstamo en el inventario antes de corregir la orden. |
| Marca posterior al cierre | **Corrección posterior al cierre.** El reverso se registró después del cierre. El resultado y el cierre de la orden se conservan. |
| Requisito que vuelve a pendiente | **Material pendiente.** El consumo que cumplía este requisito se revirtió. En una orden abierta, registra el material necesario para volver a cumplirlo. Si la orden ya está cerrada, el resultado y el cierre se conservan. |

## Decisiones de U2

- **(a) Ratificado:** en los tres motivos existentes, sustituir «Esta línea no admite otra solicitud de reverso» por «Cuando resuelvas la causa, puedes solicitar un nuevo reverso». Es consistente con R3: el rechazo se conserva como historial y permite una solicitud nueva una vez resuelto el motivo.
- **(b) Corregido y ratificado:** para `REVERSAL_LOAN_MISMATCH`, usar «préstamo del equipo al cliente» en el mensaje visible. El identificador técnico solo delimita este dictamen; no forma parte del copy ni debe renderizarse en la consola.

## Lecturas realizadas

- `AGENTS.md`.
- `docs/informes/INFORME-MOD11-MOD12-REVERSO-G1-PROD-UX-v1.0.md`.
- `docs/specs/2026-10-09-mod11-mod12-reverso-consumo-ot-design.md` v1.1 completa, con atención a R3, R7 y §9, fila U1.
- `docs/prompts/PROMPT-MOD11-MOD12-REVERSO-IMPL-v1.0.md`, §U2.
- `.agents/skills/system-vocabulary-review/SKILL.md`.

No se modificaron código ni la spec.
