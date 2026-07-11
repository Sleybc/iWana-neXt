import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import PDFDocument from 'pdfkit';
import { DataSource } from 'typeorm';
import { InventoryItem, TenantContext, runInTenantSchema } from '@iwana/db';
import { RfqService } from './rfq.service';
import { SupplierPartyPort } from '../ports/supplier-party.port';

@Injectable()
export class RfqPdfService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly rfqService: RfqService,
    private readonly supplierPartyPort: SupplierPartyPort,
  ) {}

  async render(rfqId: string): Promise<Buffer> {
    const detail = await this.rfqService.getById(rfqId);
    const { tenantId, schemaName } = TenantContext.getOrThrow();

    const itemLabels = await runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      const itemIds = detail.lines
        .map((line) => line.inventoryItemId)
        .filter((value): value is string => Boolean(value));

      if (itemIds.length === 0) {
        return new Map<string, string>();
      }

      const items = await qr.manager.find(InventoryItem, {
        where: itemIds.map((id) => ({ id, tenantId })),
      });

      return new Map(items.map((item) => [item.id, `${item.sku} · ${item.name}`]));
    });

    const supplierNames = await Promise.all(
      detail.invitations.map(async (invitation) => {
        const summary = await this.supplierPartyPort.getSupplierSummary(invitation.partyRefId);
        return summary?.displayName ?? 'Proveedor invitado';
      }),
    );

    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ margin: 48, size: 'A4' });
      const chunks: Buffer[] = [];

      doc.on('data', (chunk: Buffer) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      doc.fontSize(18).text('Solicitud de cotización', { align: 'left' });
      doc.moveDown(0.5);
      doc.fontSize(11).fillColor('#333333');
      doc.text(`Número: ${detail.rfq.rfqNumber}`);
      doc.text(`Solicitud: ${detail.request.requestNumber} — ${detail.request.title}`);
      doc.text(`Moneda: ${detail.rfq.currency}`);
      doc.text(
        `Fecha límite: ${
          detail.rfq.responseDeadline
            ? new Date(`${detail.rfq.responseDeadline}T00:00:00`).toLocaleDateString('es-CO')
            : 'Sin fecha límite'
        }`,
      );
      doc.text(`Estado: ${detail.rfq.status}`);

      if (detail.rfq.notes?.trim()) {
        doc.moveDown(0.5);
        doc.text(`Notas: ${detail.rfq.notes.trim()}`);
      }

      doc.moveDown();
      doc.fontSize(13).fillColor('#111111').text('Proveedores invitados');
      doc.moveDown(0.3);
      doc.fontSize(10).fillColor('#333333');
      if (supplierNames.length === 0) {
        doc.text('Sin proveedores invitados.');
      } else {
        supplierNames.forEach((name, index) => {
          doc.text(`${index + 1}. ${name}`);
        });
      }

      doc.moveDown();
      doc.fontSize(13).fillColor('#111111').text('Líneas solicitadas');
      doc.moveDown(0.3);
      doc.fontSize(10).fillColor('#333333');

      for (const line of detail.lines) {
        const label =
          line.freeTextDescription?.trim() ??
          (line.inventoryItemId ? itemLabels.get(line.inventoryItemId) : null) ??
          'Línea de solicitud';
        doc.text(`• ${label} — ${line.quantityRequested} ${line.unitOfMeasure}`);
      }

      doc.end();
    });
  }

  async renderOrThrow(rfqId: string): Promise<{ buffer: Buffer; filename: string }> {
    try {
      const detail = await this.rfqService.getById(rfqId);
      const buffer = await this.render(rfqId);
      return {
        buffer,
        filename: `${detail.rfq.rfqNumber}.pdf`,
      };
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }

      throw error;
    }
  }
}
