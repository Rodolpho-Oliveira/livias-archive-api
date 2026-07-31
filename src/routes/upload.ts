import { FastifyInstance } from 'fastify'
import { prisma } from '../lib/prisma.js'

export async function uploadRoutes(fastify: FastifyInstance) {
  // Upload image
  fastify.post('/upload/image', async (request, reply) => {
    const data = await request.file()
    if (!data) {
      return reply.status(400).send({ error: 'No file uploaded' })
    }

    const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml']
    if (!allowedTypes.includes(data.mimetype)) {
      return reply.status(400).send({ error: 'Invalid file type. Use JPEG, PNG, GIF, WebP or SVG.' })
    }

    // Read file buffer
    const chunks: Buffer[] = []
    for await (const chunk of data.file) {
      chunks.push(chunk)
    }
    const buffer = Buffer.concat(chunks)

    // Max 5MB
    if (buffer.length > 5 * 1024 * 1024) {
      return reply.status(400).send({ error: 'File too large. Max 5MB.' })
    }

    const image = await prisma.image.create({
      data: {
        name: data.filename,
        mimeType: data.mimetype,
        size: buffer.length,
        data: buffer,
        userId: request.userId,
      },
      select: { id: true },
    })

    return { url: `/api/images/${image.id}` }
  })
}
