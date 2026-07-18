import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import JSZip from 'jszip';
import { DataSource } from 'typeorm';
import { InventoryItem, TenantContext, runInTenantSchema } from '@iwana/db';
import { RfqService } from './rfq.service';
import { buildRfqPdfDocument } from './rfq-pdf.layout';
import { SupplierPartyPort } from '../ports/supplier-party.port';
import { TenantContactPort } from '../ports/tenant-contact.port';

type RfqDetail = Awaited<ReturnType<RfqService['getById']>>;
type RfqInvitation = RfqDetail['invitations'][number];
type TenantContactInfo = Awaited<ReturnType<TenantContactPort['getContactInfo']>>;

function slugifySupplierName(name: string): string {
  const slug = name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  return slug || 'proveedor';
}

@Injectable()
export class RfqPdfService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly rfqService: RfqService,
    private readonly supplierPartyPort: SupplierPartyPort,
    private readonly tenantContactPort: TenantContactPort,
  ) {}

  async renderForInvitation(
    rfqId: string,
    invitationId: string,
  ): Promise<{ buffer: Buffer; filename: string }> {
    const detail = await this.rfqService.getById(rfqId);
    const invitation = detail.invitations.find((entry) => entry.id === invitationId);

    if (!invitation) {
      throw new NotFoundException('Invitación de cotización no encontrada.');
    }

    const { tenantId } = TenantContext.getOrThrow();
    const [itemLabels, contact] = await Promise.all([
      this.loadItemLabels(detail.lines),
      this.tenantContactPort.getContactInfo(tenantId),
    ]);

    const { buffer, filename } = await this.buildInvitationPdf(
      detail,
      invitation,
      itemLabels,
      contact,
    );

    return { buffer, filename };
  }

  async renderAllInvitationsZip(rfqId: string): Promise<{ buffer: Buffer; filename: string }> {
    const detail = await this.rfqService.getById(rfqId);

    if (detail.invitations.length === 0) {
      throw new NotFoundException('No hay proveedores invitados para generar PDFs.');
    }

    const { tenantId } = TenantContext.getOrThrow();
    const [itemLabels, contact] = await Promise.all([
      this.loadItemLabels(detail.lines),
      this.tenantContactPort.getContactInfo(tenantId),
    ]);

    const documents = await Promise.all(
      detail.invitations.map((invitation) =>
        this.buildInvitationPdf(detail, invitation, itemLabels, contact),
      ),
    );

    const zip = new JSZip();
    const usedNames = new Set<string>();
    for (const document of documents) {
      let entryName = document.filename;
      let attempt = 2;
      while (usedNames.has(entryName)) {
        entryName = document.filename.replace(/\.pdf$/i, `-${attempt}.pdf`);
        attempt += 1;
      }
      usedNames.add(entryName);
      zip.file(entryName, document.buffer);
    }

    const buffer = await zip.generateAsync({ type: 'nodebuffer' });

    return {
      buffer,
      filename: `${detail.rfq.rfqNumber}-cotizaciones.zip`,
    };
  }

  /** Genera el PDF personalizado (dirigido a un proveedor) de una invitación de RFQ. */
  private async buildInvitationPdf(
    detail: RfqDetail,
    invitation: RfqInvitation,
    itemLabels: Map<string, string>,
    contact: TenantContactInfo,
  ): Promise<{ buffer: Buffer; filename: string; supplierName: string }> {
    const supplierSummary = await this.supplierPartyPort.getSupplierSummary(invitation.partyRefId);
    const supplierName = supplierSummary?.displayName?.trim() || 'Proveedor invitado';

    const buffer = await buildRfqPdfDocument({
      rfqNumber: detail.rfq.rfqNumber,
      requestNumber: detail.request.requestNumber,
      requestTitle: detail.request.title,
      currency: detail.rfq.currency,
      responseDeadline: detail.rfq.responseDeadline,
      status: detail.rfq.status,
      notes: detail.rfq.notes,
      supplierNames: [supplierName],
      directedToName: supplierName,
      contact,
      lines: detail.lines,
      itemLabels,
    });

    return {
      buffer,
      filename: `${detail.rfq.rfqNumber}-${slugifySupplierName(supplierName)}.pdf`,
      supplierName,
    };
  }

  private async loadItemLabels(
    lines: Array<{ inventoryItemId: string | null }>,
  ): Promise<Map<string, string>> {
    const { tenantId, schemaName } = TenantContext.getOrThrow();

    return runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      const itemIds = lines
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
  }
}
