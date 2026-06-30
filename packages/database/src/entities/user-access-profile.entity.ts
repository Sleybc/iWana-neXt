import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

@Index('uq_user_access_profiles_active', ['tenantId', 'userId', 'profileId'], {
  unique: true,
  where: '"is_active" = true',
})
@Index('idx_user_access_profiles_tenant_user_active', ['tenantId', 'userId', 'isActive'])
@Entity({ name: 'user_access_profiles' })
export class UserAccessProfile {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  @Column({ name: 'profile_id', type: 'uuid' })
  profileId: string;

  @Column({ name: 'valid_from', type: 'date', default: () => 'CURRENT_DATE' })
  validFrom: string;

  @Column({ name: 'valid_to', type: 'date', nullable: true })
  validTo: string | null;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean;
}
