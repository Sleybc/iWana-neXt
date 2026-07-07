const CODE_PREFIX_REGEX = /^[A-Z0-9]{2,3}$/;

const CATEGORY_NAME_STOPWORDS = new Set([
  'A',
  'AL',
  'CON',
  'DE',
  'DEL',
  'E',
  'EL',
  'EN',
  'LA',
  'LAS',
  'LO',
  'LOS',
  'PARA',
  'POR',
  'UN',
  'UNA',
  'UNAS',
  'UNOS',
  'Y',
]);

export function sanitizeAlnumUpper(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
}

export function tokenizeCategoryName(name: string): string[] {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .split(/[^A-Z0-9]+/)
    .map((token) => token.replace(/[^A-Z0-9]/g, ''))
    .filter((token) => token.length > 0 && !CATEGORY_NAME_STOPWORDS.has(token));
}

export function deriveCategoryCode(name: string): string {
  return sanitizeAlnumUpper(name).slice(0, 80);
}

function buildPrefixFromTokens(tokens: string[]): string {
  if (tokens.length === 0) {
    return '';
  }

  if (tokens.length === 1) {
    const token = tokens[0] ?? '';
    if (token.length >= 2) {
      return token.slice(0, Math.min(3, token.length));
    }

    return (token + 'CAT').slice(0, 3);
  }

  const anchorToken = tokens[0] ?? '';
  const secondToken = tokens[1] ?? '';
  const anchor = anchorToken.slice(0, 1);
  const distinctive =
    tokens.length === 2
      ? secondToken.slice(0, 2)
      : tokens
          .slice(1)
          .map((token) => token[0] ?? '')
          .join('')
          .slice(0, 2);

  return (anchor + distinctive).slice(0, 3);
}

export function deriveLegibleCategoryPrefix(name: string): string {
  return buildPrefixFromTokens(tokenizeCategoryName(name));
}

export function deriveCategoryCodePrefix(code: string): string {
  const sanitized = sanitizeAlnumUpper(code).slice(0, 3);
  return sanitized.length >= 2 ? sanitized : (sanitized + 'CAT').slice(0, 3);
}

export function buildLegiblePrefixVariants(name: string): string[] {
  const tokens = tokenizeCategoryName(name);
  const variants: string[] = [];
  const seen = new Set<string>();

  function addCandidate(prefix: string) {
    const normalized = sanitizeAlnumUpper(prefix).slice(0, 3);
    if (!isValidCategoryCodePrefix(normalized) || seen.has(normalized)) {
      return;
    }

    seen.add(normalized);
    variants.push(normalized);
  }

  addCandidate(buildPrefixFromTokens(tokens));

  if (tokens.length >= 2) {
    const anchor = tokens[0] ?? '';
    const distinctiveToken = tokens[1] ?? '';

    if (anchor.length > 0 && distinctiveToken.length > 0) {
      for (let anchorLen = 1; anchorLen <= Math.min(2, anchor.length); anchorLen += 1) {
        for (
          let distinctiveLen = 2;
          distinctiveLen <= Math.min(2, distinctiveToken.length);
          distinctiveLen += 1
        ) {
          addCandidate(anchor.slice(0, anchorLen) + distinctiveToken.slice(0, distinctiveLen));
        }
      }
    }

    if (tokens.length >= 3 && anchor.length > 0) {
      const initials = tokens
        .slice(1)
        .map((token) => token[0] ?? '')
        .join('');

      for (let anchorLen = 1; anchorLen <= Math.min(2, anchor.length); anchorLen += 1) {
        addCandidate(anchor.slice(0, anchorLen) + initials);
      }
    }
  }

  return variants;
}

export function ensureUniqueCategoryCodePrefix(
  basePrefix: string,
  takenPrefixes: ReadonlySet<string>,
  name?: string,
): string {
  const normalizedBase = deriveCategoryCodePrefix(basePrefix);
  const candidates = name
    ? [
        normalizedBase,
        ...buildLegiblePrefixVariants(name).filter((value) => value !== normalizedBase),
      ]
    : [normalizedBase];

  for (const candidate of candidates) {
    if (!takenPrefixes.has(candidate)) {
      return candidate;
    }
  }

  const normalized = candidates[0] ?? deriveCategoryCodePrefix(basePrefix);

  if (!takenPrefixes.has(normalized)) {
    return normalized;
  }

  for (let suffix = 2; suffix <= 999; suffix += 1) {
    const suffixText = String(suffix);
    const truncated = normalized.slice(0, Math.max(1, 3 - suffixText.length));
    const candidate = `${truncated}${suffixText}`;

    if (isValidCategoryCodePrefix(candidate) && !takenPrefixes.has(candidate)) {
      return candidate;
    }
  }

  return normalized;
}

export function suggestCategoryCodePrefix(
  name: string,
  takenPrefixes: ReadonlySet<string>,
): string {
  return ensureUniqueCategoryCodePrefix(deriveLegibleCategoryPrefix(name), takenPrefixes, name);
}

export function buildTakenCodePrefixSet(
  categories: ReadonlyArray<{ codePrefix: string; id?: string }>,
  excludeCategoryId?: string,
): Set<string> {
  const taken = new Set<string>();

  for (const category of categories) {
    if (excludeCategoryId && category.id === excludeCategoryId) {
      continue;
    }

    taken.add(category.codePrefix.toUpperCase());
  }

  return taken;
}

export function suggestNextCategorySortOrder(
  categories: ReadonlyArray<{ sortOrder: number }>,
): number {
  if (categories.length === 0) {
    return 0;
  }

  return Math.max(...categories.map((category) => category.sortOrder)) + 1;
}

export function isValidCategoryCodePrefix(value: string): boolean {
  return CODE_PREFIX_REGEX.test(value);
}

export function resolveCategoryCreateValues(
  name: string,
  codePrefixInput: string,
  takenPrefixes: ReadonlySet<string> = new Set(),
  autoSuggestOnly = false,
): { code: string; codePrefix: string } {
  const code = deriveCategoryCode(name);

  if (autoSuggestOnly) {
    return {
      code,
      codePrefix: suggestCategoryCodePrefix(name, takenPrefixes),
    };
  }

  const sanitizedPrefix = sanitizeAlnumUpper(codePrefixInput).slice(0, 3);
  const codePrefix =
    sanitizedPrefix.length >= 2 ? sanitizedPrefix : suggestCategoryCodePrefix(name, takenPrefixes);

  return { code, codePrefix };
}

export function resolveCategorySortOrder(
  sortOrderInput: string,
  categories: ReadonlyArray<{ sortOrder: number }>,
  autoSuggestOnly: boolean,
): number {
  if (autoSuggestOnly) {
    return suggestNextCategorySortOrder(categories);
  }

  const parsed = Number.parseInt(sortOrderInput || '0', 10);
  return Number.isNaN(parsed) || parsed < 0 ? suggestNextCategorySortOrder(categories) : parsed;
}
