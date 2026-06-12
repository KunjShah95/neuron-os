import { z } from "zod"

export const SpawnAgentSchema = z.object({
  name: z
    .string()
    .min(1, "Name is required")
    .max(64, "Name too long")
    .regex(/^[a-zA-Z0-9_-]+$/, "Name must be alphanumeric with -_"),
  type: z.string().max(32, "Type too long").optional(),
  script: z.string().max(256, "Script path too long").optional(),
})

export const TaskGoalSchema = z.object({
  goal: z.string().min(1, "Goal is required").max(4000, "Goal too long"),
})

export const MemoryContentSchema = z.object({
  content: z.string().min(1, "Content is required").max(50000, "Content too long"),
})

export const MemoryQuerySchema = z.object({
  query: z.string().min(1, "Query is required").max(1000, "Query too long"),
})

export const SaveSkillSchema = z.object({
  name: z
    .string()
    .min(1, "Name is required")
    .max(64, "Name too long")
    .regex(/^[a-zA-Z0-9_-]+$/, "Name must be alphanumeric with -_"),
  description: z.string().min(1, "Description is required").max(200, "Description too long"),
  tags: z.array(z.string()).max(10, "Too many tags").default([]),
  type: z.string().min(1, "Widget type is required"),
  widgetJson: z.record(z.string(), z.unknown()),
})
