'use client';

import { useEffect, useState } from 'react';
import { ApiError, globalSearchApi, type GlobalSearchResponse } from '@/lib/api-client';

interface UseGlobalSearchResult {
  results: GlobalSearchResponse | null;
  isLoading: boolean;
  error: string | null;
}

export function useGlobalSearch(query: string, enabled: boolean): UseGlobalSearchResult {
  const [results, setResults] = useState<GlobalSearchResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const normalizedQuery = query.trim();

    if (!enabled || normalizedQuery.length < 2) {
      setResults(null);
      setIsLoading(false);
      setError(null);
      return;
    }

    const controller = new AbortController();
    const timeoutId = window.setTimeout(async () => {
      try {
        setIsLoading(true);
        setError(null);
        const nextResults = await globalSearchApi.search(normalizedQuery, 5, {
          signal: controller.signal,
        });

        if (!controller.signal.aborted) {
          setResults(nextResults);
        }
      } catch (fetchError) {
        if (controller.signal.aborted) {
          return;
        }

        if (fetchError instanceof ApiError) {
          setError(fetchError.message);
        } else if (fetchError instanceof Error) {
          setError(fetchError.message);
        } else {
          setError('No fue posible consultar la búsqueda global del portal.');
        }
      } finally {
        if (!controller.signal.aborted) {
          setIsLoading(false);
        }
      }
    }, 180);

    return () => {
      controller.abort();
      window.clearTimeout(timeoutId);
    };
  }, [enabled, query]);

  return { results, isLoading, error };
}
