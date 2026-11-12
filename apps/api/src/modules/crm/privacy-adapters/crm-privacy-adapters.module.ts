import { AssurancePrivacyModule } from '../../assurance/privacy/assurance-privacy.module';
import { NetworkPrivacyModule } from '../../network/privacy/network-privacy.module';
import { InventoryPrivacyModule } from '../../inventory/privacy/inventory-privacy.module';
import { BillingPrivacyModule } from '../../billing/privacy/billing-privacy.module';
import { MigrationPrivacyModule } from '../../migration/privacy/migration-privacy.module';
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Contract } from '../contracts/entities/contract.entity';
import { Subscriber } from '../subscribers/entities/subscriber.entity';
import { CrmContractImpersonationAdapter } from './crm-contract-impersonation.adapter';
import { CrmContractStandingReadAdapter } from './crm-contract-standing-read.adapter';
import { IContractImpersonationPort } from '../../privacy/ports/contract-impersonation.port';
import { IContractStandingReadPort } from '../../privacy/requests/ports/contract-standing-read.port';
import { AuditModule } from '../../audit/audit.module';
import { PartiesPrivacyModule } from '../../parties/privacy/parties-privacy.module';
import { UsersPrivacyModule } from '../../users/privacy/users-privacy.module';
import { MediaPrivacyModule } from '../../media/privacy/media-privacy.module';
import { MediaModule } from '../../media/media.module';
import { IPersonalDataErasurePort } from '../../privacy/ports/personal-data-erasure.port';
import { CrmTitularErasureParticipant } from './titular-erasure/crm-titular-erasure.participant';
import { CrmPersonalDataErasureAdapter } from './crm-personal-data-erasure.adapter';
import { WfmPrivacyModule } from '../../wfm/privacy/wfm-privacy.module';
import { TasksPrivacyModule } from '../../tasks/privacy/tasks-privacy.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Contract, Subscriber]),
    AuditModule,
    PartiesPrivacyModule,
    UsersPrivacyModule,
    AssurancePrivacyModule,
    WfmPrivacyModule,
    TasksPrivacyModule,
    NetworkPrivacyModule,
    MediaPrivacyModule,
    // STORAGE_PORT: la supresión retira los archivos de `subscriber_documents` (ADR-110 D13).
    MediaModule,
    InventoryPrivacyModule,
    BillingPrivacyModule,
    MigrationPrivacyModule,
  ],
  providers: [
    CrmContractImpersonationAdapter,
    CrmContractStandingReadAdapter,
    CrmTitularErasureParticipant,
    CrmPersonalDataErasureAdapter,
    { provide: IContractImpersonationPort, useExisting: CrmContractImpersonationAdapter },
    { provide: IContractStandingReadPort, useExisting: CrmContractStandingReadAdapter },
    { provide: IPersonalDataErasurePort, useExisting: CrmPersonalDataErasureAdapter },
  ],
  exports: [
    IContractImpersonationPort,
    IContractStandingReadPort,
    IPersonalDataErasurePort,
    CrmPersonalDataErasureAdapter,
    CrmTitularErasureParticipant,
  ],
})
export class CrmPrivacyAdaptersModule {}
