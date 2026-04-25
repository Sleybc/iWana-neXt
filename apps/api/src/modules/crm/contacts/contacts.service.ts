import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { TenantContext, runInTenantSchema } from '@iwana/db';
import * as crypto from 'crypto';
import { ConfigService } from '@nestjs/config';
import { SubscriberContact } from './entities/subscriber-contact.entity';
import { CreateContactDto } from './dto/create-contact.dto';
import { UpdateContactDto } from './dto/update-contact.dto';

@Injectable()
export class ContactsService {
  private readonly encryptionKey: Buffer;

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly configService: ConfigService,
  ) {
    const keyHex = this.configService.getOrThrow<string>('MFA_ENCRYPTION_KEY');
    this.encryptionKey = Buffer.from(keyHex, 'hex');
  }

  async create(subscriberId: string, dto: CreateContactDto): Promise<SubscriberContact> {
    const { schemaName, tenantId } = TenantContext.getOrThrow();

    return runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      const entity = qr.manager.create(SubscriberContact, {
        tenantId,
        subscriberId,
        fullName: dto.fullName.trim(),
        emailEncrypted: this.encryptValue(dto.email.toLowerCase().trim()),
        phoneEncrypted: this.encryptValue(dto.phone.trim()),
        role: dto.role?.trim() ?? null,
        isPrimary: dto.isPrimary ?? false,
      });

      return qr.manager.save(SubscriberContact, entity);
    });
  }

  async findBySubscriber(subscriberId: string): Promise<SubscriberContact[]> {
    const { schemaName } = TenantContext.getOrThrow();
    return runInTenantSchema(this.dataSource, schemaName, async (qr) =>
      qr.manager.find(SubscriberContact, {
        where: { subscriberId },
        order: { createdAt: 'DESC' },
      }),
    );
  }

  async update(id: string, dto: UpdateContactDto): Promise<SubscriberContact> {
    const { schemaName } = TenantContext.getOrThrow();
    return runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      const entity = await qr.manager.findOne(SubscriberContact, { where: { id } });
      if (!entity) {
        throw new NotFoundException(`Contacto ${id} no encontrado.`);
      }

      if (dto.fullName !== undefined) entity.fullName = dto.fullName.trim();
      if (dto.email !== undefined)
        entity.emailEncrypted = this.encryptValue(dto.email.toLowerCase().trim());
      if (dto.phone !== undefined) entity.phoneEncrypted = this.encryptValue(dto.phone.trim());
      if (dto.role !== undefined) entity.role = dto.role?.trim() ?? null;
      if (dto.isPrimary !== undefined) entity.isPrimary = dto.isPrimary;

      return qr.manager.save(SubscriberContact, entity);
    });
  }

  async remove(id: string): Promise<void> {
    const { schemaName } = TenantContext.getOrThrow();
    await runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      await qr.manager.softDelete(SubscriberContact, { id });
    });
  }

  private encryptValue(plaintext: string): string {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', this.encryptionKey, iv);
    const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const authTag = cipher.getAuthTag();
    return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`;
  }
}
