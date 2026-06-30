import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '@iwana/shared';
import { PartyService } from './services/party.service';
import { PartyRoleService } from './services/party-role.service';
import { PartyContactService } from './services/party-contact.service';
import { CreatePartyDto } from './dto/create-party.dto';
import { UpdatePartyDto } from './dto/update-party.dto';
import { ListPartiesDto } from './dto/list-parties.dto';
import { AssignRoleDto } from './dto/assign-role.dto';
import { UpsertContactDto } from './dto/upsert-contact.dto';
import { Party } from './entities/party.entity';
import { PartyRole } from './entities/party-role.entity';
import { PartyContact } from './entities/party-contact.entity';

/**
 * Controlador de gestión de parties (terceros) — MOD08.
 *
 * Todos los endpoints requieren JWT válido y tenant resuelto por TenantMiddleware.
 * Los servicios usan TenantContext internamente — el controller no lo pasa.
 *
 * Accesos:
 * - GET, POST, PATCH, DELETE parties: ADMIN
 * - Gestión de roles y contactos: ADMIN
 *
 * Ref: HLD-MOD08-PARTIES-v1.0 §5
 */
@ApiTags('Parties')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('parties')
export class PartiesController {
  constructor(
    private readonly partyService: PartyService,
    private readonly partyRoleService: PartyRoleService,
    private readonly partyContactService: PartyContactService,
  ) {}

  /**
   * Lista parties con filtros y paginación.
   */
  @Get()
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Listar parties con filtros opcionales' })
  @ApiResponse({ status: 200, description: 'Listado paginado de parties.' })
  @ApiResponse({ status: 401, description: 'Token inválido o expirado.' })
  @ApiResponse({ status: 403, description: 'Sin permisos suficientes.' })
  async findAll(@Query() dto: ListPartiesDto) {
    return this.partyService.findAll(dto);
  }

  /**
   * Crea un nuevo party con validación de unicidad (documentType, documentNumber).
   */
  @Post()
  @Roles(UserRole.ADMIN)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Crear party con validación de unicidad de documento' })
  @ApiResponse({ status: 201, description: 'Party creado exitosamente.' })
  @ApiResponse({ status: 400, description: 'Datos inválidos.' })
  @ApiResponse({ status: 401, description: 'Token inválido o expirado.' })
  @ApiResponse({ status: 403, description: 'Sin permisos suficientes.' })
  @ApiResponse({ status: 409, description: 'Ya existe un party activo con ese documento.' })
  async create(@Body() dto: CreatePartyDto): Promise<{ data: Party }> {
    const data = await this.partyService.create(dto);
    return { data };
  }

  /**
   * Obtiene un party por ID con relaciones (contacts, roles).
   */
  @Get(':id')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Obtener party por ID con relaciones' })
  @ApiResponse({ status: 200, description: 'Party encontrado.' })
  @ApiResponse({ status: 401, description: 'Token inválido o expirado.' })
  @ApiResponse({ status: 403, description: 'Sin permisos suficientes.' })
  @ApiResponse({ status: 404, description: 'Party no encontrado.' })
  async findOne(@Param('id', ParseUUIDPipe) id: string): Promise<{ data: Party }> {
    const data = await this.partyService.findOne(id);
    return { data };
  }

  /**
   * Actualiza un party existente.
   * No permite cambiar documento si tiene roles activos.
   */
  @Patch(':id')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Actualizar party (protege documento si hay roles activos)' })
  @ApiResponse({ status: 200, description: 'Party actualizado exitosamente.' })
  @ApiResponse({ status: 400, description: 'Datos inválidos.' })
  @ApiResponse({ status: 401, description: 'Token inválido o expirado.' })
  @ApiResponse({ status: 403, description: 'Sin permisos o cambio de documento bloqueado.' })
  @ApiResponse({ status: 404, description: 'Party no encontrado.' })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdatePartyDto,
  ): Promise<{ data: Party }> {
    const data = await this.partyService.update(id, dto);
    return { data };
  }

  /**
   * Soft delete de un party (marca deletedAt e inactiva).
   */
  @Delete(':id')
  @Roles(UserRole.ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Soft delete de party' })
  @ApiResponse({ status: 204, description: 'Party eliminado exitosamente.' })
  @ApiResponse({ status: 401, description: 'Token inválido o expirado.' })
  @ApiResponse({ status: 403, description: 'Sin permisos suficientes.' })
  @ApiResponse({ status: 404, description: 'Party no encontrado.' })
  async softDelete(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    await this.partyService.softDelete(id);
  }

  /**
   * Asigna un rol a un party con fechas de vigencia.
   * Idempotente: reactiva roles inactivos en vez de duplicar.
   */
  @Post(':id/roles')
  @Roles(UserRole.ADMIN)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Asignar rol a party (idempotente)' })
  @ApiResponse({ status: 201, description: 'Rol asignado o reactivado exitosamente.' })
  @ApiResponse({ status: 400, description: 'Datos inválidos.' })
  @ApiResponse({ status: 401, description: 'Token inválido o expirado.' })
  @ApiResponse({ status: 403, description: 'Sin permisos suficientes.' })
  @ApiResponse({ status: 409, description: 'El party ya tiene el rol activo.' })
  async assignRole(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AssignRoleDto,
  ): Promise<{ data: PartyRole }> {
    const data = await this.partyRoleService.assign(id, dto);
    return { data };
  }

  /**
   * Desactiva un rol de un party (marca validTo = now).
   */
  @Patch(':id/roles/:roleId')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Desactivar rol de party' })
  @ApiResponse({ status: 200, description: 'Rol desactivado exitosamente.' })
  @ApiResponse({ status: 401, description: 'Token inválido o expirado.' })
  @ApiResponse({ status: 403, description: 'Sin permisos suficientes.' })
  @ApiResponse({ status: 404, description: 'Rol no encontrado.' })
  async deactivateRole(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('roleId', ParseUUIDPipe) roleId: string,
  ): Promise<{ data: PartyRole }> {
    const data = await this.partyRoleService.deactivate(id, roleId);
    return { data };
  }

  /**
   * Crea o actualiza un contacto de un party (upsert por type).
   * Si isPrimary=true, limpia isPrimary de otros contactos del mismo tipo.
   */
  @Post(':id/contacts')
  @Roles(UserRole.ADMIN)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Upsert contacto de party por tipo' })
  @ApiResponse({ status: 201, description: 'Contacto creado o actualizado exitosamente.' })
  @ApiResponse({ status: 400, description: 'Datos inválidos.' })
  @ApiResponse({ status: 401, description: 'Token inválido o expirado.' })
  @ApiResponse({ status: 403, description: 'Sin permisos suficientes.' })
  async upsertContact(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpsertContactDto,
  ): Promise<{ data: PartyContact }> {
    const data = await this.partyContactService.upsert(id, dto);
    return { data };
  }

  /**
   * Lista contactos de un party.
   */
  @Get(':id/contacts')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Listar contactos de party' })
  @ApiResponse({ status: 200, description: 'Listado de contactos.' })
  @ApiResponse({ status: 401, description: 'Token inválido o expirado.' })
  @ApiResponse({ status: 403, description: 'Sin permisos suficientes.' })
  async listContacts(@Param('id', ParseUUIDPipe) id: string): Promise<{ data: PartyContact[] }> {
    const data = await this.partyContactService.list(id);
    return { data };
  }

  /**
   * Elimina (hard delete) un contacto de un party.
   */
  @Delete(':id/contacts/:contactId')
  @Roles(UserRole.ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Eliminar contacto de party' })
  @ApiResponse({ status: 204, description: 'Contacto eliminado exitosamente.' })
  @ApiResponse({ status: 401, description: 'Token inválido o expirado.' })
  @ApiResponse({ status: 403, description: 'Sin permisos suficientes.' })
  @ApiResponse({ status: 404, description: 'Contacto no encontrado.' })
  async deleteContact(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('contactId', ParseUUIDPipe) contactId: string,
  ): Promise<void> {
    await this.partyContactService.delete(id, contactId);
  }
}
