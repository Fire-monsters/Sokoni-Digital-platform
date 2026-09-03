import { z } from "zod";

export const ADMIN_DEFAULT_PAGE = 1;
export const ADMIN_DEFAULT_PAGE_SIZE = 25;
export const ADMIN_MAX_PAGE_SIZE = 100;
export const ADMIN_MAX_SEARCH_LENGTH = 100;

const optionalBoolean = z
  .enum(["true", "false"])
  .transform((value) => value === "true")
  .optional();

const optionalDate = z.iso
  .datetime({ offset: true })
  .transform((value) => new Date(value))
  .optional();

const adminQueryShape = {
  page: z.coerce.number().int().min(1).default(ADMIN_DEFAULT_PAGE),
  pageSize: z.coerce
    .number()
    .int()
    .min(1)
    .max(ADMIN_MAX_PAGE_SIZE)
    .default(ADMIN_DEFAULT_PAGE_SIZE),
  q: z.string().trim().min(1).max(ADMIN_MAX_SEARCH_LENGTH).optional(),
  from: optionalDate,
  to: optionalDate,
};

export type AdminSortOrder = "asc" | "desc";

export interface AdminPagination {
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
}

export interface AdminPage<T> {
  data: T[];
  pagination: AdminPagination;
}

export type AdminCollectionQuery<
  SortFields extends readonly string[],
  Filters extends z.ZodRawShape,
> = z.output<z.ZodObject<Filters>> & {
  page: number;
  pageSize: number;
  q?: string;
  from?: Date;
  to?: Date;
  sortBy: SortFields[number];
  sortOrder: AdminSortOrder;
};

export function createAdminCollectionQuerySchema<
  const SortFields extends readonly [string, ...string[]],
  Filters extends z.ZodRawShape = Record<never, never>,
>(options: {
  sortFields: SortFields;
  defaultSortBy: SortFields[number];
  filters?: Filters;
}): z.ZodType<AdminCollectionQuery<SortFields, Filters>> {
  return z
    .object({
      ...adminQueryShape,
      ...options.filters,
      sortBy: z.enum(options.sortFields).default(options.defaultSortBy),
      sortOrder: z.enum(["asc", "desc"]).default("desc"),
    })
    .strict()
    .refine((query) => !query.from || !query.to || query.from <= query.to, {
      message: "The from date must be before or equal to the to date.",
      path: ["from"],
    }) as unknown as z.ZodType<AdminCollectionQuery<SortFields, Filters>>;
}

export function createAdminPagination(
  page: number,
  pageSize: number,
  totalItems: number,
): AdminPagination {
  if (!Number.isInteger(totalItems) || totalItems < 0) {
    throw new RangeError("totalItems must be a non-negative integer.");
  }

  return {
    page,
    pageSize,
    totalItems,
    totalPages: Math.ceil(totalItems / pageSize),
  };
}

export function adminPageOffset(page: number, pageSize: number): number {
  return (page - 1) * pageSize;
}

export function resolveAdminSortColumn<Key extends string>(
  sortBy: Key,
  allowedColumns: Readonly<Record<Key, string>>,
): string {
  return allowedColumns[sortBy];
}

export { optionalBoolean as adminOptionalBoolean };
