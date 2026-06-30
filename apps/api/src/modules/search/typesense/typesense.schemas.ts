export interface TypesenseFieldSchema {
  name: string;
  type: string;
  optional?: boolean;
  facet?: boolean;
  sort?: boolean;
}

export interface TypesenseCollectionSchema {
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

export interface SearchTenantDocument {
  id: string;
  type: 'tenant';
  name: string;
  slug: string;
  legalName?: string;
  status: string;
  route: string;
  updatedAt: number;
}

export interface SearchUserDocument {
  id: string;
  type: 'user';
  tenantId: string;
  tenantSlug: string;
  tenantName: string;
  email: string;
  firstName?: string;
  lastName?: string;
  jobTitle?: string;
  role: string;
  status: string;
  route: string;
  updatedAt: number;
}

export interface SearchNavigationDocument {
  id: string;
  type: 'module';
  title: string;
  keywords: string[];
  description: string;
  route: string;
  order: number;
}

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
