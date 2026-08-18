import { z } from 'zod';

export const createObjectSchema = z.object({
  name: z.string().min(1).max(200),
  nameUz: z.string().min(1).max(200).optional(),
  address: z.string().max(300).optional(),
  addressUz: z.string().max(300).optional(),
  latitude: z.number().finite().min(-90).max(90).optional(),
  longitude: z.number().finite().min(-180).max(180).optional(),
  templateCode: z.enum(['high_rise', 'typical_house', 'renovation']).optional(),
});

export const updateObjectSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  nameUz: z.string().min(1).max(200).optional(),
  address: z.string().max(300).optional(),
  addressUz: z.string().max(300).optional(),
  latitude: z.number().finite().min(-90).max(90).nullable().optional(),
  longitude: z.number().finite().min(-180).max(180).nullable().optional(),
  status: z.enum(['active', 'on_hold', 'completed']).optional(),
});

export const createStageSchema = z.object({
  name: z.string().min(1).max(200),
  nameUz: z.string().min(1).max(200).optional(),
  sortOrder: z.number().int().min(0).default(0),
});

export const createSectionSchema = z.object({
  name: z.string().min(1).max(200),
  nameUz: z.string().min(1).max(200).optional(),
  sortOrder: z.number().int().min(0).default(0),
});

const isoDate = z.coerce.date();

export const createTaskSchema = z.object({
  title: z.string().min(1).max(300),
  titleUz: z.string().min(1).max(300).optional(),
  description: z.string().max(2000).optional(),
  descriptionUz: z.string().max(2000).optional(),
  assigneeId: z.string().uuid().nullable().optional(),
  parentTaskId: z.string().uuid().optional(),
  priority: z.enum(['low', 'normal', 'high']).default('normal'),
  plannedStart: isoDate.optional(),
  plannedEnd: isoDate.optional(),
  baselineStart: isoDate.optional(),
  baselineEnd: isoDate.optional(),
  dependsOn: z.array(z.string().uuid()).default([]),
  slaHours: z.number().int().positive().optional(),
});
