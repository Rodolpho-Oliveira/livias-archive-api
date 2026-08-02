import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import fp from 'fastify-plugin'
import { verifyToken } from '../lib/auth.js'

declare module 'fastify' {
  interface FastifyRequest {
    userId: string
  }
}

async function authPlugin(fastify: FastifyInstance) {
  fastify.decorateRequest('userId', '')

  fastify.addHook('onRequest', async (request: FastifyRequest, reply: FastifyReply) => {
    // Skip auth for health check, auth routes, and image serving
    // (image URLs are embedded in the rich editor HTML, which cannot send
    // Authorization headers; images are protected by unguessable UUIDs)
    if (request.url === '/health') return
    if (request.url.startsWith('/api/auth')) return
    if (request.url.startsWith('/api/images/')) return

    const authHeader = request.headers.authorization
    if (!authHeader?.startsWith('Bearer ')) {
      return reply.status(401).send({ error: 'Missing authorization token' })
    }

    const token = authHeader.replace('Bearer ', '')

    try {
      request.userId = verifyToken(token)
    } catch {
      return reply.status(401).send({ error: 'Invalid token' })
    }
  })
}

export default fp(authPlugin)
