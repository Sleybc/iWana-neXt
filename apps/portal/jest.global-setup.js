/**
 * Zona horaria fija para toda la suite del portal.
 *
 * `inventory-labels.spec.ts` documenta por qué `formatInventoryDate` no sirve
 * para columnas `date`: sin `timeZone: 'UTC'` explícito, América/Bogotá (UTC-5)
 * retrocede la medianoche UTC al día anterior. Esa aserción fija el literal
 * `'8/09/2026'`, que solo es cierto en una zona detrás de UTC: en local pasaba
 * y en el runner de CI —que corre en UTC— fallaba, dejando el gate en rojo.
 *
 * Se fija aquí y no en el test porque el desfase de zona horaria es un defecto
 * recurrente de este módulo y la suite entera debe ser determinista respecto a
 * fechas, no solo ese caso. `globalSetup` se ejecuta en el proceso principal
 * antes de arrancar los workers, que heredan el entorno.
 */
module.exports = () => {
  process.env.TZ = 'America/Bogota';
};
