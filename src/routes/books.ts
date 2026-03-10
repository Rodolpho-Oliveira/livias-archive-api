import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../lib/prisma.js'

const createBookSchema = z.object({
  title: z.string().min(1),
  synopsis: z.string().optional(),
  genre: z.string().optional(),
  coverColor: z.string().optional(),
})

const updateBookSchema = z.object({
  title: z.string().min(1).optional(),
  synopsis: z.string().optional(),
  genre: z.string().optional(),
  coverUrl: z.string().optional(),
  coverColor: z.string().optional(),
  status: z.enum(['DRAFT', 'IN_PROGRESS', 'COMPLETED']).optional(),
})

export async function bookRoutes(fastify: FastifyInstance) {
  // List all books
  fastify.get('/books', async (request) => {
    const books = await prisma.book.findMany({
      where: { userId: request.userId },
      include: {
        chapters: {
          select: { id: true, title: true, status: true, order: true, wordCount: true },
          orderBy: { order: 'asc' },
        },
      },
      orderBy: { updatedAt: 'desc' },
    })

    return books.map(book => ({
      ...book,
      totalWords: book.chapters.reduce((sum, ch) => sum + ch.wordCount, 0),
      chapterCount: book.chapters.length,
    }))
  })

  // Get single book
  fastify.get('/books/:id', async (request, reply) => {
    const { id } = request.params as { id: string }

    const book = await prisma.book.findFirst({
      where: { id, userId: request.userId },
      include: {
        chapters: {
          orderBy: { order: 'asc' },
        },
      },
    })

    if (!book) {
      return reply.status(404).send({ error: 'Book not found' })
    }

    return {
      ...book,
      totalWords: book.chapters.reduce((sum, ch) => sum + ch.wordCount, 0),
    }
  })

  // Create book
  fastify.post('/books', async (request, reply) => {
    const body = createBookSchema.parse(request.body)

    const book = await prisma.book.create({
      data: {
        ...body,
        userId: request.userId,
        chapters: {
          create: {
            title: 'Capítulo 1',
            order: 0,
            content: {
              type: 'doc',
              content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Era uma vez...' }] }],
            },
          },
        },
      },
      include: { chapters: true },
    })

    return reply.status(201).send(book)
  })

  // Update book
  fastify.put('/books/:id', async (request, reply) => {
    const { id } = request.params as { id: string }
    const body = updateBookSchema.parse(request.body)

    const existing = await prisma.book.findFirst({
      where: { id, userId: request.userId },
    })

    if (!existing) {
      return reply.status(404).send({ error: 'Book not found' })
    }

    const book = await prisma.book.update({
      where: { id },
      data: body,
    })

    return book
  })

  // Delete book
  fastify.delete('/books/:id', async (request, reply) => {
    const { id } = request.params as { id: string }

    const existing = await prisma.book.findFirst({
      where: { id, userId: request.userId },
    })

    if (!existing) {
      return reply.status(404).send({ error: 'Book not found' })
    }

    await prisma.book.delete({ where: { id } })

    return reply.status(204).send()
  })
}
