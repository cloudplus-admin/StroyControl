import { z } from 'zod';

export const createFeedEventSchema = z.object({
  authorId: z.string().uuid(),
  body: z.string().min(1).max(4000),
  mentionedUserIds: z.array(z.string().uuid()).default([]),
  parentEventId: z.string().uuid().optional(),
});

export const reactionSchema = z.object({
  userId: z.string().uuid(),
  emoji: z.string().min(1).max(16),
});

export const searchQuerySchema = z.object({
  q: z.string().min(1).max(200),
});
