import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../lib/prisma.js'

const createChapterSchema = z.object({
  title: z.string().min(1),
  bookId: z.string().uuid(),
})

const updateChapterSchema = z.object({
  title: z.string().min(1).optional(),
  content: z.any().optional(),
  notes: z.string().optional(),
  status: z.enum(['DRAFT', 'REVISION', 'COMPLETED']).optional(),
  wordCount: z.number().optional(),
  charCount: z.number().optional(),
})

const reorderSchema = z.object({
  chapters: z.array(z.object({
    id: z.string().uuid(),
    order: z.number(),
  })),
})

export async function chapterRoutes(fastify: FastifyInstance) {
  // List chapters for a book
  fastify.get('/books/:bookId/chapters', async (request, reply) => {
    const { bookId } = request.params as { bookId: string }

    // Verify book belongs to user
    const book = await prisma.book.findFirst({
      where: { id: bookId, userId: request.userId },
    })
    if (!book) return reply.status(404).send({ error: 'Book not found' })

    return prisma.chapter.findMany({
      where: { bookId },
      orderBy: { order: 'asc' },
    })
  })

  // Get single chapter
  fastify.get('/chapters/:id', async (request, reply) => {
    const { id } = request.params as { id: string }

    const chapter = await prisma.chapter.findFirst({
      where: { id, book: { userId: request.userId } },
      include: {
        versions: {
          orderBy: { createdAt: 'desc' },
          take: 3,
        },
      },
    })

    if (!chapter) return reply.status(404).send({ error: 'Chapter not found' })

    return chapter
  })

  // Create chapter
  fastify.post('/chapters', async (request, reply) => {
    const body = createChapterSchema.parse(request.body)

    // Verify book belongs to user
    const book = await prisma.book.findFirst({
      where: { id: body.bookId, userId: request.userId },
    })
    if (!book) return reply.status(404).send({ error: 'Book not found' })

    // Get max order
    const maxOrder = await prisma.chapter.findFirst({
      where: { bookId: body.bookId },
      orderBy: { order: 'desc' },
      select: { order: true },
    })

    const chapter = await prisma.chapter.create({
      data: {
        title: body.title,
        bookId: body.bookId,
        order: (maxOrder?.order ?? -1) + 1,
        content: {
          type: 'doc',
          content: [{ type: 'paragraph' }],
        },
      },
    })

    return reply.status(201).send(chapter)
  })

  // Update chapter (autosave)
  fastify.put('/chapters/:id', async (request, reply) => {
    const { id } = request.params as { id: string }
    const body = updateChapterSchema.parse(request.body)

    const existing = await prisma.chapter.findFirst({
      where: { id, book: { userId: request.userId } },
    })
    if (!existing) return reply.status(404).send({ error: 'Chapter not found' })

    const chapter = await prisma.chapter.update({
      where: { id },
      data: body,
    })

    return chapter
  })

  // Save version snapshot
  fastify.post('/chapters/:id/versions', async (request, reply) => {
    const { id } = request.params as { id: string }
    const { label } = (request.body as { label?: string }) || {}

    const chapter = await prisma.chapter.findFirst({
      where: { id, book: { userId: request.userId } },
    })
    if (!chapter) return reply.status(404).send({ error: 'Chapter not found' })
    if (!chapter.content) return reply.status(400).send({ error: 'No content to save' })

    // Count existing versions across all chapters of this book
    const bookId = chapter.bookId
    const totalVersions = await prisma.chapterVersion.count({
      where: { chapter: { bookId } },
    })

    // If at limit (3 per book), delete the oldest one
    if (totalVersions >= 3) {
      const oldest = await prisma.chapterVersion.findFirst({
        where: { chapter: { bookId } },
        orderBy: { createdAt: 'asc' },
      })
      if (oldest) {
        await prisma.chapterVersion.delete({ where: { id: oldest.id } })
      }
    }

    const version = await prisma.chapterVersion.create({
      data: {
        chapterId: id,
        content: chapter.content as any,
        wordCount: chapter.wordCount,
        label,
      },
    })

    return reply.status(201).send(version)
  })

  // Restore version
  fastify.post('/chapters/:id/versions/:versionId/restore', async (request, reply) => {
    const { id, versionId } = request.params as { id: string; versionId: string }

    const chapter = await prisma.chapter.findFirst({
      where: { id, book: { userId: request.userId } },
    })
    if (!chapter) return reply.status(404).send({ error: 'Chapter not found' })

    const version = await prisma.chapterVersion.findFirst({
      where: { id: versionId, chapterId: id },
    })
    if (!version) return reply.status(404).send({ error: 'Version not found' })

    const updated = await prisma.chapter.update({
      where: { id },
      data: {
        content: version.content as any,
        wordCount: version.wordCount,
      },
    })

    return updated
  })

  // Reorder chapters
  fastify.put('/books/:bookId/chapters/reorder', async (request, reply) => {
    const { bookId } = request.params as { bookId: string }
    const body = reorderSchema.parse(request.body)

    const book = await prisma.book.findFirst({
      where: { id: bookId, userId: request.userId },
    })
    if (!book) return reply.status(404).send({ error: 'Book not found' })

    await prisma.$transaction(
      body.chapters.map(({ id, order }) =>
        prisma.chapter.update({
          where: { id },
          data: { order },
        })
      )
    )

    return { success: true }
  })

  // Delete chapter
  fastify.delete('/chapters/:id', async (request, reply) => {
    const { id } = request.params as { id: string }

    const existing = await prisma.chapter.findFirst({
      where: { id, book: { userId: request.userId } },
    })
    if (!existing) return reply.status(404).send({ error: 'Chapter not found' })

    await prisma.chapter.delete({ where: { id } })

    return reply.status(204).send()
  })
}
