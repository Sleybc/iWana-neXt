import { render, screen, within } from '@testing-library/react';
import { LegalTextContent } from './LegalTextContent';

describe('LegalTextContent', () => {
  it('conserva el texto simple sin interpretar marcado', () => {
    render(<LegalTextContent content={'# Título\nSegunda línea'} format="PLAIN" />);
    expect(screen.getByText(/# Título/)).toHaveClass('whitespace-pre-wrap');
    expect(screen.queryByRole('heading')).not.toBeInTheDocument();
  });

  it('CA-LT-07: omite HTML e imágenes y rechaza enlaces inseguros', () => {
    const alert = jest.spyOn(window, 'alert').mockImplementation(() => undefined);
    const { container } = render(
      <LegalTextContent
        content={
          '<script>alert(1)</script>\n<img src=x onerror=alert(1)>\n[x](javascript:alert(1))\n\n[Seguro](https://example.org)'
        }
        format="MARKDOWN"
      />,
    );
    expect(container.querySelector('script, img')).toBeNull();
    expect(container.querySelector('a[href^="javascript:"]')).toBeNull();
    expect(screen.getByRole('link', { name: 'Seguro' })).toHaveAttribute(
      'rel',
      'noopener noreferrer',
    );
    expect(container.querySelector('[onerror]')).toBeNull();
    expect(alert).not.toHaveBeenCalled();
    alert.mockRestore();
  });

  it('CA-LT-08: representa la tabla del anexo como tabla semántica con encabezados', () => {
    const content = `| Tercero | Qué recibe | Para qué | Calidad |
| --- | --- | --- | --- |
| Banco Davivienda (portal de pagos PSE y tarjeta de crédito) | Número de identificación del titular, factura, valor y los datos que el cliente escribe en el portal. | Recaudar el pago del servicio. | Responsable de sus propios datos. Iwana S.A.S. no ve ni guarda datos bancarios. |
| WhatsApp (Meta Platforms) | Número de teléfono y mensajes que el titular escribe. | Atender solicitudes y dar soporte. | Proveedor de la plataforma de mensajería; sus servidores están fuera de Colombia. |
| Hostinger (alojamiento del sitio iwana.co) | Dirección IP, fecha y hora, página visitada y navegador. | Servir el sitio web y protegerlo. | Encargado; servidores en Estados Unidos. |
| Ookla (medidor de velocidad) | Dirección IP y datos de la medición, solo si el visitante inicia el test. | Medir la velocidad de la conexión. | Responsable de sus propios datos. |
| Google Maps (enlaces «Cómo llegar») | Dirección IP, solo si el visitante abre el enlace. | Mostrar la ruta a la sede. | Responsable de sus propios datos. |
| Proveedores de servicios contables, de facturación electrónica y de nómina | Los datos de la base de datos que corresponda. | Llevar la contabilidad, facturar y pagar la nómina. | Encargados. |
| Autoridades | Lo que pidan en ejercicio de sus funciones. | Cumplir la ley y las órdenes judiciales. | Según la ley. |`;

    render(<LegalTextContent content={content} format="MARKDOWN" />);

    const table = screen.getByRole('table');
    expect(
      within(table)
        .getAllByRole('columnheader')
        .map((header) => header.textContent),
    ).toEqual(['Tercero', 'Qué recibe', 'Para qué', 'Calidad']);
    expect(within(table).getAllByRole('row')).toHaveLength(8);
    expect(within(table).getByRole('cell', { name: /Banco Davivienda/ })).toBeInTheDocument();
  });

  it('conserva el texto de enlaces relativos sin convertirlos en navegación', () => {
    render(
      <LegalTextContent
        content={'[Ruta interna](/dashboard/privacy)\n\n[Sin destino]()'}
        format="MARKDOWN"
      />,
    );

    expect(screen.getByText('Ruta interna')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Ruta interna' })).not.toBeInTheDocument();
    expect(screen.getByText('Sin destino')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Sin destino' })).not.toBeInTheDocument();
  });
});
