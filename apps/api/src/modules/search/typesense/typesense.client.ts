import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TypesenseCollectionSchema } from './typesense.schemas';

interface TypesenseImportLineResult {
  success: boolean;
  error?: string;
}

export interface TypesenseSearchHighlight {
  field?: string;
  snippet?: string;
  snippets?: string[];
}

export interface TypesenseSearchHit<TDocument> {
  document: TDocument;
  highlight?: string | Record<string, string | TypesenseSearchHighlight>;
  highlights?: TypesenseSearchHighlight[];
  text_match?: number;
}

export interface TypesenseSearchResponse<TDocument> {
  found?: number;
  search_time_ms?: number;
  hits?: Array<TypesenseSearchHit<TDocument>>;
}

export class TypesenseHttpError extends Error {
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

  async healthCheck(): Promise<boolean> {
    try {
      await this.requestJson<{ ok: boolean }>('/health', { method: 'GET' });
      return true;
    } catch {
      return false;
    }
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

  async importDocuments(collection: string, documents: unknown[], action: 'upsert' = 'upsert') {
    if (documents.length === 0) {
      return;
    }

    const payload = documents.map((document) => JSON.stringify(document)).join('\n');
    const responseText = await this.requestText(
      `/collections/${encodeURIComponent(collection)}/documents/import?action=${action}`,
      {
        method: 'POST',
        body: payload,
        headers: { 'Content-Type': 'text/plain' },
      },
    );

    const failures = responseText
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
      .map((line) => JSON.parse(line) as TypesenseImportLineResult)
      .filter((line) => !line.success);

    if (failures.length > 0) {
      throw new Error(`Typesense rechazó ${failures.length} documentos durante import.`);
    }
  }

  async searchDocuments<TDocument>(
    collection: string,
    params: Record<string, string | number | boolean | string[] | undefined>,
  ): Promise<TypesenseSearchResponse<TDocument>> {
    const searchParams = new URLSearchParams();

    for (const [key, value] of Object.entries(params)) {
      if (value === undefined) {
        continue;
      }

      searchParams.set(key, Array.isArray(value) ? value.join(',') : String(value));
    }

    return this.requestJson<TypesenseSearchResponse<TDocument>>(
      `/collections/${encodeURIComponent(collection)}/documents/search?${searchParams.toString()}`,
      { method: 'GET' },
    );
  }

  private async requestJson<T>(
    path: string,
    options: { method: string; body?: string; headers?: Record<string, string> },
  ): Promise<T> {
    const response = await this.request(path, options);
    return (await response.json()) as T;
  }

  private async requestText(
    path: string,
    options: { method: string; body?: string; headers?: Record<string, string> },
  ): Promise<string> {
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
        const message = await response.text();
        throw new TypesenseHttpError(response.status, message || 'Error de Typesense.');
      }

      return response;
    } finally {
      globalThis.clearTimeout(timeout);
    }
  }
}
