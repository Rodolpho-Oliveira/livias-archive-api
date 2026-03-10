import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../lib/prisma.js'

const updateSettingsSchema = z.object({
  name: z.string().optional(),
  theme: z.enum(['light', 'dark']).optional(),
  fontFamily: z.string().optional(),
  fontSize: z.number().min(10).max(32).optional(),
  focusModeFont: z.string().optional(),
  focusModeSize: z.number().min(10).max(40).optional(),
})

export async function userRoutes(fastify: FastifyInstance) {
  // Get current user profile + settings
  fastify.get('/me', async (request) => {
    const user = await prisma.user.findUnique({
      where: { id: request.userId },
    })
    return user
  })

  // Update settings
  fastify.put('/me/settings', async (request) => {
    const body = updateSettingsSchema.parse(request.body)

    const user = await prisma.user.update({
      where: { id: request.userId },
      data: body,
    })

    return user
  })
}
