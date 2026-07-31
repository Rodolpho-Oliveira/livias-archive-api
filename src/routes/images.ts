import { FastifyInstance } from 'fastify'
import { prisma } from '../lib/prisma.js'

export async function imageRoutes(fastify: FastifyInstance) {
  // Serve stored image
  fastify.get('/images/:id', async (request, reply) => {
    const { id } = request.params as { id: string }

    const image = await prisma.image.findFirst({
      where: { id, userId: request.userId },
    })

    if (!image) {
      return reply.status(404).send({ error: 'Image not found' })
    }

    reply.header('Content-Type', image.mimeType)
    reply.header('Cache-Control', 'public, max-age=31536000, immutable')
    return reply.send(image.data)
  })
}
