# ADR-101: Protección en IPAM de las IP locales de infraestructura declaradas por el tenant (enmienda de ADR-098 D3)

**Versión:** 1.1
**Estado:** Aprobado
**Fecha:** 2026-10-26
**Autor:** AI-EM-ARCH
**Modo activo:** Architect + EM
**Aprobado por:** CTO, 2026-10-26 (aprobación humana explícita durante la ejecución de MOD13).
**Módulos:** MOD13 Red y Aprovisionamiento (dueño del IPAM y de las direcciones locales). Sin impacto en MOD05, MOD11 ni MOD12 más allá de consumir la misma regla de reserva.
**Relacionado:** [ADR-098](ADR-098-IPAM-y-Aprovisionamiento-Certificado-MOD13.md) (Aprobado; se enmienda su D3) · [ADR-044](ADR-044-Separacion-OrganizationSite-NmsNode.md) (Aprobado) · [HLD addendum de interfaces IPv4](../hlds/HLD-MOD13-INTERFACES-IPV4-ADDENDUM-v1.0.md) (D-8) · [análisis de opción B](../informes/INFORME-MOD13-ROUTERS-ANALISIS-v1.0.md)

---

## Contexto

ADR-098 D3 establece que la IP la asigna MOD13 y que la unicidad la garantiza la base de datos. D3 cubre las IP asignadas a servicios (`ip_assignments`). No cubre la IP física o virtual que el operador declara en una interfaz del router.

Con la opción B, el operador registra interfaces y direcciones locales del equipo. Si el IPAM puede asignar esa misma IP a un servicio, el sistema crea un doble uso. Hoy el IPAM protege red, difusión, gateway y exclusiones manuales (`ipam.service.ts:139–142`, `:195–198`, `:228–231`), pero no las IP locales.

Un dato registrado en una interfaz no es una exclusión del operador. Las exclusiones se mezclan con la reserva automática, así que tratar la IP local como exclusión la haría invisible y la perdería al editar la lista.

## Decisión aprobada

Enmendar ADR-098 D3 con este texto (se añade; no se reemplaza lo vigente):

> **D3 (enmienda).** Las direcciones IPv4 locales declaradas por el tenant en interfaces de router son no asignables a servicios. La protección se hace por dirección host (/32) para cada pool del tenant que contenga ese host, incluso si la dirección pertenece a otro router o a una interfaz inactiva. La protección no se materializa en `excluded_ips`. Reserva automática, validación de reserva manual y ocupación usan la misma definición deduplicada. Registrar o editar una dirección local cuyo host tenga una asignación `RESERVED` o `ACTIVE` se rechaza completo y no libera ni reasigna el servicio.

## Alternativas consideradas

| Alternativa                                             | Resultado                                                                                                                                                                                                           |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **A. Enmendar D3 (recomendada).**                       | Protege el host de cada dirección local. Mantiene la separación entre infraestructura y exclusiones del operador. Requiere cambiar tres rutas IPAM y una invariante cruzada entre tablas (modelo §5.4).             |
| **B. Tratar la IP local como exclusión manual.**        | Descartada. Mezcla dos fuentes de verdad. Una edición masiva de exclusiones podría liberar la IP en silencio. Además, la distinción de la UX (protección automática frente a exclusión del operador) desaparecería. |
| **C. No proteger y bloquear la captura de IP locales.** | Descartada. Contradice el encargo aprobado (reglas 6 y 10), que exige protección antes de habilitar la captura, y deja la opción B sin valor para la reserva de servicios.                                          |

## Consecuencias

- **Positivas:** cierra el doble uso entre infraestructura y servicios; la protección es explícita y auditable; el cambio respeta ADR-044 (sin nodo técnico en Organización) y ADR-098 D1 (MOD13 como dueño del IPAM).
- **Costos:** la ocupación de los pools cambia (las IP locales dejan de contar como libres). La UI debe mostrar esa diferencia. Hay que probar las tres rutas IPAM y las carreras de locks (modelo §7).
- **Riesgos:** un rollback a una API anterior que no consulta las direcciones locales puede volver a asignarlas aunque la conciliación I-1 esté vacía. Tras capturar direcciones, se conserva el backend protector; si una reversión lo exige, una pausa externa debe bloquear y comprobar todas las rutas de reserva, replay y regularización antes de volver a habilitarlas. I-1 en cero es una comprobación necesaria, no suficiente por sí sola.
- **Dependencias:** esta enmienda debe estar aprobada antes de congelar el código de error `IP_PROTECTED_BY_INFRASTRUCTURE` (DC-15) y antes de habilitar la captura de direcciones en la UI.

## Aprobación

La enmienda cambia una regla de asignación de IP aprobada en ADR-098. El CTO aprobó la opción A el 2026-10-26. La aprobación habilita su incorporación en PRD/HLD y contratos; no sustituye G1–G4, la revisión SEC-ENG ni la evidencia de rollout/rollback.

**Cambio v1.0 → v1.1:** aprobación humana de opción A y endurecimiento del criterio de rollback: conservar el backend protector o suspender todas las rutas de reserva hasta reconciliar la protección; I-1 en cero no basta por sí solo.
