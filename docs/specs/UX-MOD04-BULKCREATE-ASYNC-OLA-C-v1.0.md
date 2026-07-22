# UX — Canal de entrega `bulkCreate` async (Ola C / D-3 = A)

**Versión:** 1.0  
**Fecha:** 2026-07-22  
**Autor:** AI-PROD-UX  
**Estado:** Congelada (Ola C)  
**Módulo:** Portal → Usuarios → Importación masiva  
**Decisión:** D-3 = A (BullMQ). Complementa y **sustituye** el tramo síncrono de [2026-06-13-Bulk-Import-Users-Design](./2026-06-13-Bulk-Import-Users-Design.md) §RF-BI-04/05 (procesamiento + entrega de contraseñas). Preview CSV, plantilla y validación client-side se mantienen.

**Persona:** Administrador del tenant (gestión de accesos).  
**Tarea:** Importar hasta 100 usuarios desde CSV y obtener credenciales temporales **una sola vez**, sin bloquear la UI ~30 s y sin dejar secretos en logs.

---

## 1. Flujo (aceptar → en progreso → resultado)

```text
[Preview válido] → Confirmar importación
        ↓
  Aceptado (job encolado)     ← feedback inmediato; no esperar al body con passwords
        ↓
  En progreso                 ← modal permanece; progreso indeterminado o por ítems si el API lo expone
        ↓
  ┌─────────────┬──────────────────┬────────────────┐
  │ Éxito total │ Parcial          │ Fallo total    │
  └─────────────┴──────────────────┴────────────────┘
        ↓ (si hay ≥1 creado)
  Pantalla one-time de credenciales → Cerrar / Entendido (borra secretos de UI)
```

| Paso | Qué ve el admin | Comportamiento |
| --- | --- | --- |
| **Aceptar lote** | Tras confirmar en preview: el botón pasa a “Enviando…”; al aceptar el job, estado **En progreso** sin cerrar el modal. | No re-subir el mismo lote si hay `Idempotency-Key` activa (reintento silencioso del cliente o mensaje de “esta importación ya está en curso”). Cancelar el modal **no cancela** el job (copy abajo). |
| **En progreso** | Título + descripción + indicador de carga (skeleton/barra; no spinner suelto). Opcional: “X de Y” solo si el polling/status lo aporta. | El admin puede minimizar el modal a un **banner persistente** en Usuarios (“Importación en curso”) que reabre el mismo panel al hacer clic. Al completar, el banner abre el resultado. |
| **Resultado** | Resumen numérico + lista de fallidos (fila / correo / causa). Tres variantes: éxito / parcial / fallo. | Si hay creados: transición obligatoria a **entrega one-time** antes de “listo”. Si fallo total: solo errores + “Volver a intentar” (vuelve a dropzone/preview). |

**Salidas:**

- Cerrar durante progreso → confirma: “La importación sigue en segundo plano. Podrás ver el resultado al volver.”
- Navegación fuera de Usuarios → mismo banner al regresar a la lista (mientras el job esté vivo o el resultado no se haya reclamado).
- Error de red al consultar estado → “No pudimos consultar el estado. Reintentar.” (no inventar éxito).

---

## 2. Entrega de contraseñas temporales (sin logs)

**Canal canónico:** pantalla **one-time** dentro del mismo modal (mismo patrón mental que el dialog de contraseña temporal post-alta/reset en Usuarios), ampliada a lote.

| Mecanismo | Regla UX |
| --- | --- |
| **Vista one-time** | Tabla o lista: correo + contraseña temporal + rol (sin más PII). Contraseñas en `monospace`, seleccionables; acción “Copiar” por fila y “Copiar todas” (texto plano tabulado). |
| **Descarga CSV de credenciales** | Botón primario secundario: “Descargar credenciales”. Archivo generado **solo en el cliente** a partir de la respuesta one-time ya recibida. Nombre sugerido: `credenciales-temporales-usuarios.csv`. Aviso visible: “Guárdalo en un lugar seguro. No lo subas al sistema ni lo compartas por canales inseguros.” |
| **Una sola revelación** | Tras “Entendido” / cerrar con confirmación, se **limpia el estado de secretos** en memoria UI. Reabrir el job muestra solo el resumen (creados / fallidos) **sin** contraseñas. No hay “volver a mostrar”. |
| **Qué no hacer** | No toast con passwords. No incluir passwords en el banner, en notificaciones push, en audit trail visible, ni en el CSV de **errores**. No pedir al backend un segundo fetch de passwords. |
| **Confirmación al cerrar** | Si aún no descargó ni copió: dialog “¿Ya guardaste las contraseñas temporales? No podrás verlas de nuevo.” → “Seguir aquí” / “Ya las guardé”. |

**Nota a SEC-ENG / SR-FULL (fuera de alcance UX, pero contrato de experiencia):** el body one-time viaja solo en la respuesta de “resultado reclamado”; logs de API/worker/auditoría nunca incluyen el secreto; el FE no escribe passwords en `console`, analytics ni storage persistente (solo descarga voluntaria del admin).

---

## 3. Criterios de aceptación (experiencia)

1. Tras confirmar un lote válido, el admin ve estado **en progreso** en ≤1 s de feedback percibido (job aceptado), sin pantalla bloqueada en blanco ni timeout de request larga.
2. Al terminar, el resultado distingue claramente **éxito total / parcial / fallo total** con conteos y, si aplica, lista de fallidos con causa en español.
3. Si hay ≥1 usuario creado, las contraseñas temporales solo aparecen en la **pantalla one-time** (y opcionalmente en el CSV descargado por el admin); al cerrar con confirmación dejan de ser visibles y no se recuperan desde la UI.
4. Cerrar o salir durante el progreso no pierde el job: existe vía de vuelta (banner o reapertura) al resultado; el copy aclara que cancelar la vista no cancela la importación.
5. Empty/error/éxito usan el copy de §4 (sentence case, sin enums crudos ni jerga técnica tipo “BullMQ” / “job id” al operador).
6. Flujo operable por teclado: foco atrapado en modal, anuncio de cambio de estado (`role="status"` / live region) al pasar a progreso y a resultado.

---

## 4. Copy (español, sentence case)

### En progreso
- **Título:** Importación en curso  
- **Descripción:** Estamos creando los usuarios. Puedes cerrar este panel; te avisaremos cuando termine.  
- **Banner lista:** Importación de usuarios en curso — Ver estado  
- **Cerrar durante progreso:** La importación sigue en segundo plano. Podrás ver el resultado al volver a este panel.

### Éxito total
- **Título:** Usuarios importados  
- **Descripción:** Se crearon {n} usuarios. Guarda las contraseñas temporales ahora; no podrás verlas de nuevo.  
- **CTA primario:** Descargar credenciales  
- **CTA cierre:** Entendido  

### Parcial
- **Título:** Importación parcial  
- **Descripción:** Se crearon {ok} de {total} usuarios. Revisa los que fallaron y guarda las contraseñas de los creados.  
- **Sección fallidos:** No se pudieron crear  
- **Vacío de fallidos (no aplica):** —  

### Fallo total
- **Título:** No se importaron usuarios  
- **Descripción:** Ningún usuario se creó. Revisa los errores y vuelve a intentar.  
- **CTA:** Volver a intentar  

### One-time / cierre de secretos
- **Aviso:** Estas contraseñas solo se muestran una vez. El usuario deberá cambiarlas en el próximo inicio de sesión.  
- **Confirmar cierre sin descarga:** ¿Ya guardaste las contraseñas temporales? No podrás verlas de nuevo.  
- **Copiado OK:** Contraseñas copiadas al portapapeles.  
- **Copiado error:** No se pudo copiar. Usa la descarga o selecciona el texto.

### Vacíos / errores de canal
- **Primera vez (sin archivo aún):** Arrastra un CSV o selecciona un archivo para importar hasta 100 usuarios.  
- **Sin resultados válidos en preview:** No hay filas válidas para importar. Corrige el archivo o descarga la plantilla.  
- **Error al encolar:** No pudimos iniciar la importación. Intenta de nuevo en unos minutos.  
- **Error al consultar estado:** No pudimos consultar el estado. Reintentar.  
- **Resultado ya reclamado (sin secretos):** Esta importación ya se completó. Las contraseñas temporales no están disponibles.

---

## 5. Fuera de alcance / handoffs

| Tema | Dueño |
| --- | --- |
| Tokens, densidad de tabla one-time, primitiva de banner | AI-DS-OWNER (si hace falta patrón nuevo; reutilizar Dialog + tabla existentes primero) |
| Implementación modal/poll/banner | AI-FE-PLATFORM |
| Job BullMQ, status API, Idempotency-Key, forma del payload one-time | AI-SR-FULL |
| Veredicto de exposición de secretos / retención | AI-SEC-ENG |
| Cambio de límite 100 o cancelación real de job | AI-EM-ARCH (alcance) |

**Solicitud a DS-OWNER (solo si FE no puede con primitivas actuales):** banner/inline alert persistente reutilizable para “proceso en curso” en listados — no inventar token aquí.
