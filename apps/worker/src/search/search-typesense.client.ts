import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

interface TypesenseFieldSchema {
  name: string;
  type: string;
  optional?: boolean;
  facet?: boolean;
  sort?: boolean;
}

interface TypesenseCollectionSchema {
  name: string;
  fields: TypesenseFieldSchema[];
  default_sorting_field?: string;
  token_separators?: string[];
  symbols_to_index?: string[];
}

export const SEARCH_COLLECTIONS = {
  tenants: 'search_tenants',
  users: 'search_users',
  navigationModules: 'search_navigation_modules',
} as const;

export const SEARCH_COLLECTION_SCHEMAS: TypesenseCollectionSchema[] = [
  {
    name: SEARCH_COLLECTIONS.tenants,
    default_sorting_field: 'updatedAt',
    fields: [
      { name: 'id', type: 'string' },
      { name: 'type', type: 'string' },
      { name: 'name', type: 'string' },
      { name: 'slug', type: 'string' },
      { name: 'legalName', type: 'string', optional: true },
      { name: 'status', type: 'string', facet: true },
      { name: 'route', type: 'string' },
      { name: 'updatedAt', type: 'int64', sort: true },
    ],
    token_separators: ['-', '_'],
    symbols_to_index: ['-'],
  },
  {
    name: SEARCH_COLLECTIONS.users,
    default_sorting_field: 'updatedAt',
    fields: [
      { name: 'id', type: 'string' },
      { name: 'type', type: 'string' },
      { name: 'tenantId', type: 'string' },
      { name: 'tenantSlug', type: 'string' },
      { name: 'tenantName', type: 'string' },
      { name: 'email', type: 'string' },
      { name: 'firstName', type: 'string', optional: true },
      { name: 'lastName', type: 'string', optional: true },
      { name: 'jobTitle', type: 'string', optional: true },
      { name: 'role', type: 'string', facet: true },
      { name: 'status', type: 'string', facet: true },
      { name: 'route', type: 'string' },
      { name: 'updatedAt', type: 'int64', sort: true },
    ],
    token_separators: ['-', '_'],
    symbols_to_index: ['@', '-', '_'],
  },
  {
    name: SEARCH_COLLECTIONS.navigationModules,
    default_sorting_field: 'order',
    fields: [
      { name: 'id', type: 'string' },
      { name: 'type', type: 'string' },
      { name: 'title', type: 'string' },
      { name: 'keywords', type: 'string[]' },
      { name: 'description', type: 'string' },
      { name: 'route', type: 'string' },
      { name: 'order', type: 'int32', sort: true },
    ],
    token_separators: ['-', '_'],
  },
];

class TypesenseHttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'TypesenseHttpError';
  }
}

@Injectable()
export class SearchTypesenseClient {
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly timeoutMs: number;

  constructor(private readonly configService: ConfigService) {
    const protocol = this.configService.get<string>('TYPESENSE_PROTOCOL', 'http');
    const host = this.configService.get<string>('TYPESENSE_HOST', 'localhost');
    const port = this.configService.get<number>('TYPESENSE_PORT', 8108);

    this.baseUrl = `${protocol}://${host}:${port}`;
    this.apiKey = this.configService.get<string>(
      'TYPESENSE_API_KEY',
      'CHANGE_ME_TYPESENSE_DEV_KEY',
    );
    this.timeoutMs = this.configService.get<number>('TYPESENSE_TIMEOUT_MS', 3000);
  }

  async ensureCollection(schema: TypesenseCollectionSchema): Promise<void> {
    try {
      await this.requestJson(`/collections/${encodeURIComponent(schema.name)}`, { method: 'GET' });
    } catch (error) {
      if (!(error instanceof TypesenseHttpError) || error.status !== 404) {
        throw error;
      }

      await this.requestJson('/collections', {
        method: 'POST',
        body: JSON.stringify(schema),
      });
    }
  }

  async deleteCollectionIfExists(name: string): Promise<void> {
    try {
      await this.requestJson(`/collections/${encodeURIComponent(name)}`, { method: 'DELETE' });
    } catch (error) {
      if (error instanceof TypesenseHttpError && error.status === 404) {
        return;
      }

      throw error;
    }
  }

  async importDocuments(collection: string, documents: unknown[]): Promise<void> {
    if (documents.length === 0) {
      return;
    }

    const payload = documents.map((document) => JSON.stringify(document)).join('\n');
    await this.requestText(
      `/collections/${encodeURIComponent(collection)}/documents/import?action=upsert`,
      {
        method: 'POST',
        body: payload,
        headers: { 'Content-Type': 'text/plain' },
      },
    );
  }

  async deleteDocument(collection: string, documentId: string): Promise<void> {
    try {
      await this.requestJson(
        `/collections/${encodeURIComponent(collection)}/documents/${encodeURIComponent(documentId)}`,
        { method: 'DELETE' },
      );
    } catch (error) {
      if (error instanceof TypesenseHttpError && error.status === 404) {
        return;
      }

      throw error;
    }
  }

  private async requestJson(
    path: string,
    options: { method: string; body?: string; headers?: Record<string, string> },
  ) {
    const response = await this.request(path, options);
    return response.json();
  }

  private async requestText(
    path: string,
    options: { method: string; body?: string; headers?: Record<string, string> },
  ) {
    const response = await this.request(path, options);
    return response.text();
  }

  private async request(
    path: string,
    options: { method: string; body?: string; headers?: Record<string, string> },
  ): Promise<Response> {
    const controller = new AbortController();
    const timeout = globalThis.setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await fetch(`${this.baseUrl}${path}`, {
        method: options.method,
        signal: controller.signal,
        ...(options.body ? { body: options.body } : {}),
        headers: {
          'X-TYPESENSE-API-KEY': this.apiKey,
          ...(options.body ? { 'Content-Type': 'application/json' } : {}),
          ...options.headers,
        },
      });

      if (!response.ok) {
        throw new TypesenseHttpError(response.status, await response.text());
      }

      return response;
    } finally {
      globalThis.clearTimeout(timeout);
    }
  }
}
