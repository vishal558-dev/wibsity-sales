import { z } from "zod";

export const generationFormSchema = z.object({
  industry: z.string().trim().min(1, "Industry is required"),
  location: z.string().trim().min(1, "Location is required"),
  requestedCount: z.coerce
    .number()
    .int("Must be a whole number")
    .min(1, "Must generate at least 1 lead")
    .max(100, "Max 100 leads per job"),
  minRating: z.coerce.number().min(0, "Must be at least 0").max(5, "Must be at most 5").optional(),
  websiteRequired: z.coerce.boolean(),
  phoneRequired: z.coerce.boolean(),
});

export type GenerationFormInput = z.infer<typeof generationFormSchema>;

export const rawBusinessSchema = z.object({
  external_id: z.string().nullable(),
  name: z.string().min(1),
  website: z.string().nullable(),
  phone: z.string().nullable(),
  email: z.string().nullable(),
  industry: z.string(),
  city: z.string().nullable(),
  state: z.string().nullable(),
  country: z.string(),
  rating: z.number().nullable(),
  review_count: z.number().nullable(),
  source_url: z.string().nullable(),
});
