import { z } from "zod";

export const COMPANY_TYPES = [
  "Private",
  "Public",
  "LLP",
  "JV",
  "NGO/NPO",
  "LLC",
  "Partnership",
  "Govt Organisation",
] as const;
export type CompanyType = (typeof COMPANY_TYPES)[number];

export interface Company {
  id: string;
  sourceIndex: number;
  name: string;
  description: string | null;
  companyType: CompanyType | null;
  location: string | null;
  employeeBand: string | null;
  rating: number | null;
  tags: string[];
  qualityFlags: string[];
  source: {
    companyType: string | null;
    location: string | null;
    oldTime: string | null;
    employees: string | null;
    reviews: string | null;
  };
}

// Only reliable, observed fields. No inferred CIN, registered state, revenue,
// incorporation year or headcount bounds for undocumented numeric bands.
export const QUERYABLE_FIELDS = {
  companyType: { type: "categorical", operators: ["eq", "in"], values: COMPANY_TYPES },
  location: { type: "categorical", operators: ["eq", "in"] },
  employeeBand: { type: "categorical", operators: ["eq", "in"] },
  rating: { type: "number", operators: ["eq", "gte", "lte", "between"] },
  name: { type: "text", operators: ["contains"] },
  description: { type: "text", operators: ["contains"] },
  tags: { type: "stringArray", operators: ["contains", "in"] },
} as const;

export const EMBEDDING_MODEL = "voyage-4-lite";
export const EMBEDDING_DIMENSIONS = 256;
export const VECTOR_INDEX_NAME = "company_embedding_v1";

export interface CompanyDocument extends Company {
  embedding: number[];
  embeddingModel: typeof EMBEDDING_MODEL;
  embeddingTextHash: string;
}

export type QueryableField = keyof typeof QUERYABLE_FIELDS;
export type Criterion = {
  field: QueryableField;
  op: "eq" | "in" | "gte" | "lte" | "between" | "contains";
  value: string | string[] | number | { min: number; max: number };
  weight: number;
  required: boolean;
};
export type SearchFilters = {
  companyType?: string[];
  location?: string[];
  employeeBand?: string[];
  rating?: { min?: number; max?: number };
  name?: string;
  description?: string;
  tags?: string[];
};
const text = z.string().trim().min(1).max(500);
const values = z.array(text).min(1).max(20);
export const companyIdSchema = z
  .string()
  .regex(/^indian-csv:\d+$/)
  .max(80);
const range = z
  .strictObject({ min: z.number().finite().optional(), max: z.number().finite().optional() })
  .refine(
    (value) =>
      (value.min !== undefined || value.max !== undefined) &&
      !(value.min !== undefined && value.max !== undefined && value.min > value.max),
    "Range must have bounds in ascending order",
  );
const filterShape: Record<string, z.ZodType> = {};
const criterionVariants: z.ZodType[] = [];
for (const [field, definition] of Object.entries(QUERYABLE_FIELDS)) {
  filterShape[field] = (
    definition.type === "number" ? range : definition.type === "text" ? text : values
  ).optional();
  for (const op of definition.operators) {
    const value =
      op === "between"
        ? z
            .strictObject({ min: z.number().finite(), max: z.number().finite() })
            .refine((v) => v.min <= v.max, "Invalid range")
        : op === "in"
          ? values
          : definition.type === "number"
            ? z.number().finite()
            : text;
    criterionVariants.push(
      z.strictObject({
        field: z.literal(field),
        op: z.literal(op),
        value,
        weight: z.number().finite().positive().max(100).default(1),
        required: z.boolean().default(false),
      }),
    );
  }
}
export const searchFiltersSchema = z.strictObject(filterShape) as z.ZodType<SearchFilters>;
export const criterionSchema = z.union(criterionVariants) as z.ZodType<Criterion>;
export const searchInputSchema = z.strictObject({
  filters: searchFiltersSchema.optional().default({}),
  semanticQuery: z.string().trim().min(1).max(2000).optional(),
  limit: z.number().int().optional().default(50),
});
export const scoreInputSchema = z.strictObject({
  companyIds: z.array(companyIdSchema).min(1).max(100),
  criteria: z.array(criterionSchema).min(1).max(20),
  topN: z.number().int().min(1).max(100).optional().default(10),
});
export const detailsInputSchema = z.strictObject({ companyId: companyIdSchema });
export type SearchInput = z.infer<typeof searchInputSchema>;
export type ScoreInput = z.infer<typeof scoreInputSchema>;

const nullableText = z.string().nullable();
export const companySchema = z.strictObject({
  id: companyIdSchema,
  sourceIndex: z.number().int().nonnegative(),
  name: z.string(),
  description: nullableText,
  companyType: z.enum(COMPANY_TYPES).nullable(),
  location: nullableText,
  employeeBand: nullableText,
  rating: z.number().finite().nullable(),
  tags: z.array(z.string()),
  qualityFlags: z.array(z.string()),
  source: z.strictObject({
    companyType: nullableText,
    location: nullableText,
    oldTime: nullableText,
    employees: nullableText,
    reviews: nullableText,
  }),
});
export const companySummarySchema = companySchema.pick({
  id: true,
  name: true,
  companyType: true,
  location: true,
  employeeBand: true,
  rating: true,
});
export const searchOutputSchema = z.strictObject({
  total: z.number().int().nonnegative(),
  returned: z.number().int().min(0).max(100),
  companies: z
    .array(companySummarySchema.extend({ semanticScore: z.number().finite().optional() }))
    .max(100),
  appliedFilters: searchFiltersSchema,
  unrecognized: z.array(
    z.strictObject({ field: z.string(), value: z.string(), didYouMean: z.array(z.string()) }),
  ),
  relaxationHints: z.array(
    z.strictObject({ removed: z.string(), wouldReturn: z.number().int().nonnegative() }),
  ),
});
const breakdownSchema = z.strictObject({
  criterion: criterionSchema,
  actual: z.union([z.string(), z.number(), z.array(z.string()), z.null()]),
  status: z.enum(["match", "partial", "miss", "unknown"]),
  fraction: z.number().min(0).max(1),
  contribution: z.number().min(0).max(100),
});
export const scoreOutputSchema = z.strictObject({
  evaluated: z.number().int().nonnegative(),
  eligible: z.number().int().nonnegative(),
  returned: z.number().int().min(0).max(100),
  companies: z
    .array(
      companySummarySchema.extend({
        score: z.number().min(0).max(100),
        breakdown: z.array(breakdownSchema),
      }),
    )
    .max(100),
  excludedCompanyIds: z.array(companyIdSchema),
  missingCompanyIds: z.array(companyIdSchema),
});
export const detailsOutputSchema = z.union([
  z.strictObject({ status: z.literal("found"), company: companySchema }),
  z.strictObject({ status: z.literal("not_found"), companyId: companyIdSchema }),
]);
