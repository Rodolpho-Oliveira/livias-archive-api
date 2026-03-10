import { FastifyInstance } from 'fastify'
import { supabase } from '../lib/supabase.js'
import { randomUUID } from 'crypto'

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

    const ext = data.filename.split('.').pop() || 'jpg'
    const fileName = `${request.userId}/${randomUUID()}.${ext}`

    console.log(`Uploading file ${fileName} (${buffer.length} bytes, type ${data.mimetype})`)
    const { error } = await supabase.storage
      .from('images')
      .upload(fileName, buffer, {
        contentType: data.mimetype,
        upsert: false,
      })

    if (error) {
      console.error('Storage upload error:', error)
      return reply.status(500).send({ error: 'Failed to upload image' })
    }

    const { data: urlData } = supabase.storage
      .from('images')
      .getPublicUrl(fileName)

    return { url: urlData.publicUrl }
  })
}
