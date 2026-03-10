import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import fp from 'fastify-plugin'
import { verifyToken } from '../lib/supabase.js'
import { prisma } from '../lib/prisma.js'

declare module 'fastify' {
  interface FastifyRequest {
    userId: string
  }
}

async function authPlugin(fastify: FastifyInstance) {
  fastify.decorateRequest('userId', '')

  fastify.addHook('onRequest', async (request: FastifyRequest, reply: FastifyReply) => {
    // Skip auth for health check
    if (request.url === '/health') return

    const authHeader = request.headers.authorization
    if (!authHeader?.startsWith('Bearer ')) {
      return reply.status(401).send({ error: 'Missing authorization token' })
    }

    const token = authHeader.replace('Bearer ', '')

    try {
      const user = await verifyToken(token)
      
      // Upsert user in our database
      await prisma.user.upsert({
        where: { id: user.id },
        update: { email: user.email! },
        create: {
          id: user.id,
          email: user.email!,
          name: user.user_metadata?.full_name || user.email!.split('@')[0],
        },
      })

      request.userId = user.id
    } catch {
      return reply.status(401).send({ error: 'Invalid token' })
    }
  })
}

export default fp(authPlugin)
