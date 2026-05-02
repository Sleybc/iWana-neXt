import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import type { Job } from 'bullmq';
import {
  SEARCH_INDEX_JOB_NAVIGATION_REBUILD,
  SEARCH_INDEX_JOB_REBUILD,
  SEARCH_INDEX_JOB_TENANT_UPSERT,
  SEARCH_INDEX_JOB_USER_DELETE,
  SEARCH_INDEX_JOB_USER_UPSERT,
  SEARCH_INDEX_QUEUE,
} from '@iwana/shared';
import { SearchIndexWorkerService } from '../search/search-index.worker.service';

@Processor(SEARCH_INDEX_QUEUE)
export class SearchIndexProcessor extends WorkerHost {
  private readonly logger = new Logger(SearchIndexProcessor.name);

  constructor(private readonly searchIndexWorkerService: SearchIndexWorkerService) {
    super();
  }

  async process(job: Job): Promise<void> {
    switch (job.name) {
      case SEARCH_INDEX_JOB_REBUILD:
        await this.searchIndexWorkerService.rebuildAll(Boolean(job.data?.force));
        return;
      case SEARCH_INDEX_JOB_TENANT_UPSERT:
        await this.searchIndexWorkerService.upsertTenant(String(job.data?.tenantId ?? ''));
        return;
      case SEARCH_INDEX_JOB_USER_UPSERT:
        await this.searchIndexWorkerService.upsertUser(
          String(job.data?.tenantId ?? ''),
          String(job.data?.userId ?? ''),
        );
        return;
      case SEARCH_INDEX_JOB_USER_DELETE:
        await this.searchIndexWorkerService.deleteUser(String(job.data?.userId ?? ''));
        return;
      case SEARCH_INDEX_JOB_NAVIGATION_REBUILD:
        await this.searchIndexWorkerService.rebuildNavigation();
        return;
      default:
        this.logger.warn(`Job de búsqueda no soportado: ${job.name}`);
    }
  }
}
