import { z } from 'zod'
export const aiResponse = z.object({error:z.string().optional(),reply:z.string().optional()})
export const accountResponse = z.object({error:z.string().optional(),ok:z.boolean().optional(),user_id:z.string().optional()})
export const accountCreatedResponse = accountResponse.extend({ok:z.literal(true),user_id:z.string().uuid()})
