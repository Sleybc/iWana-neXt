import { Module } from '@nestjs/common';
import { TenantModule } from '../tenant/tenant.module';
import { UsersModule } from '../users/users.module';
import { SearchController } from './search.controller';
import { SearchIndexerService } from './search-indexer.service';
import { SearchNavigationCatalogService } from './search-navigation-catalog.service';
import { SearchService } from './search.service';
import { SearchTypesenseClient } from './typesense/typesense.client';

@Module({
  imports: [TenantModule, UsersModule],
  controllers: [SearchController],
  providers: [
    SearchNavigationCatalogService,
    SearchTypesenseClient,
    SearchIndexerService,
    SearchService,
  ],
  exports: [SearchIndexerService, SearchService],
})
export class SearchModule {}
