import 'dotenv/config'
import Fastify from 'fastify'
import cors from '@fastify/cors'
import multipart from '@fastify/multipart'
import authPlugin from './plugins/auth.js'
import { bookRoutes } from './routes/books.js'
import { chapterRoutes } from './routes/chapters.js'
import { userRoutes } from './routes/user.js'
import { exportRoutes } from './routes/export.js'
import { uploadRoutes } from './routes/upload.js'

const app = Fastify({
  logger: true,
})

// CORS
app.register(cors, {
  origin: [
    'http://localhost:3000',
    'http://localhost:8081',
    process.env.WEB_URL || '',
  ].filter(Boolean),
  credentials: true,
})

// Multipart (file uploads)
app.register(multipart, { limits: { fileSize: 5 * 1024 * 1024 } })

// Health check (before auth)
app.get('/health', async () => {
  return { status: 'ok', name: "Livia's Archive API" }
})

// Auth plugin
app.register(authPlugin)

// Routes
app.register(bookRoutes, { prefix: '/api' })
app.register(chapterRoutes, { prefix: '/api' })
app.register(userRoutes, { prefix: '/api' })
app.register(exportRoutes, { prefix: '/api' })
app.register(uploadRoutes, { prefix: '/api' })

const port = Number(process.env.PORT) || 3333

app.listen({ port, host: '0.0.0.0' }, (err) => {
  if (err) {
    app.log.error(err)
    process.exit(1)
  }
  console.log(`🐰 Livia's Archive API running on port ${port}`)
})

export default app
