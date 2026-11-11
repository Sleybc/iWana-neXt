/**
 * Copia del contrato firmado al titular (cierre de venta, bloque G; spec §5 G, CA-9).
 *
 * El PDF va adjunto; el cuerpo no repite datos del titular ni del contrato (nombre,
 * documento, dirección): solo la fecha de la firma. El `to` lo pone el llamador en memoria.
 *
 * Función pura.
 */
interface ContractSignedCopyParams {
  /** Fecha civil de la firma (AAAA-MM-DD) en la zona del operador. */
  signedOn: string;
}

function formatCivilDate(value: string): string {
  const [year, month, day] = value.split('-');
  return year && month && day ? `${day}/${month}/${year}` : value;
}

export const CONTRACT_SIGNED_COPY_FILENAME = 'contrato-firmado.pdf';

export function contractSignedCopyTemplate(params: ContractSignedCopyParams): {
  subject: string;
  html: string;
  text: string;
} {
  const date = formatCivilDate(params.signedOn);
  return {
    subject: 'Copia de tu contrato de servicio firmado',
    html: `<p>Adjuntamos la copia del contrato de servicio que firmaste el ${date}.</p>
<p>Guárdala para tus registros. Si tienes preguntas sobre tu servicio, comunícate con tu proveedor.</p>`,
    text: `Adjuntamos la copia del contrato de servicio que firmaste el ${date}.\n\nGuárdala para tus registros. Si tienes preguntas sobre tu servicio, comunícate con tu proveedor.`,
  };
}
