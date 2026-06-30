import { ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { runInTenantSchema, TenantContext } from '@iwana/db';
import { PartyRoleStatus } from '@iwana/shared';
import { PartyRole } from '../entities/party-role.entity';
import { AssignRoleDto } from '../dto/assign-role.dto';

@Injectable()
export class PartyRoleService {
  private readonly logger = new Logger(PartyRoleService.name);

  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async assign(partyId: string, dto: AssignRoleDto): Promise<PartyRole> {
    const { schemaName } = TenantContext.getOrThrow();

    return runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      // Buscar si ya existe ese rol para el party
      const existing = await qr.manager.findOne(PartyRole, {
        where: { partyId, role: dto.role },
      });

      if (existing) {
        if (existing.status === PartyRoleStatus.ACTIVE) {
          throw new ConflictException(`El party ya tiene el rol ${dto.role} activo`);
        }

        // Reactivar rol inactivo en vez de duplicar
        existing.status = PartyRoleStatus.ACTIVE;
        existing.validFrom = dto.validFrom ? new Date(dto.validFrom) : new Date();
        existing.validTo = dto.validTo ? new Date(dto.validTo) : null;
        await qr.manager.save(PartyRole, existing);
        this.logger.log(`[PartyRoleService] Rol ${dto.role} reactivado para party=${partyId}`);
        return existing;
      }

      const role = qr.manager.create(PartyRole, {
        partyId,
        role: dto.role,
        status: PartyRoleStatus.ACTIVE,
        validFrom: dto.validFrom ? new Date(dto.validFrom) : new Date(),
        validTo: dto.validTo ? new Date(dto.validTo) : null,
      });

      await qr.manager.save(PartyRole, role);
      this.logger.log(`[PartyRoleService] Rol ${dto.role} asignado a party=${partyId}`);
      return role;
    });
  }

  async deactivate(partyId: string, roleId: string): Promise<PartyRole> {
    const { schemaName } = TenantContext.getOrThrow();

    return runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      const role = await qr.manager.findOne(PartyRole, {
        where: { id: roleId, partyId },
      });

      if (!role) {
        throw new NotFoundException(`Rol ${roleId} no encontrado para party ${partyId}`);
      }

      role.status = PartyRoleStatus.INACTIVE;
      role.validTo = new Date();
      await qr.manager.save(PartyRole, role);
      this.logger.log(`[PartyRoleService] Rol ${roleId} desactivado para party=${partyId}`);
      return role;
    });
  }
}
