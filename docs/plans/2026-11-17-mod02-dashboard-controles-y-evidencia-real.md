# Controles, actividad y disponibilidad del inicio

- [x] Incorporar el periodo en la URL y actualizar Tendencia con la resolución real de cada serie. Los indicadores «del mes» y «de hoy», la cola y la agenda conservan sus ventanas operativas.
- [x] Actualizar con el mismo conjunto de fuentes del perfil, conservar la lectura permitida mientras responde y evitar doble envío. Liberar la petición compartida de actividad después de cada lectura.
- [x] Reutilizar el minigráfico de los indicadores para el neto mensual de altas y retiros. Mantener la serie de 12 meses y las cifras de origen.
- [x] Enlazar el historial a una página de lectura paginada para Administradora mediante el API existente. Renderizar solo la proyección de actividad del inicio.
- [x] Añadir la tarjeta Red con el estado «Sin medición» y el enlace a Routers.
- [ ] Incorporar el historial de disponibilidad de Red cuando exista una fuente que mida conectividad. El catálogo registra el estado administrativo de los routers.
- [x] Comparar el panel de agenda con las respuestas del API local conectado a PostgreSQL y probar los escenarios del dashboard en Chrome. [Resultados](../informes/INFORME-MOD02-DASHBOARD-PULSO-ATENCION-FASE-02-v1.0.md#8-controles-y-comprobación-contra-postgresql)

La petición del usuario levanta U-B0bis para perfiles con Tendencia. Las series actuales de suscriptores y facturación son mensuales. Los casos tienen resolución diaria y un máximo de 31 días.

Línea base local con la ola anterior aplicada en el árbol `b04c8f7e`: 246 pruebas en 13 suites de Jest, sin omitidas. Incluye dashboard, cliente de series y campana de notificaciones.
