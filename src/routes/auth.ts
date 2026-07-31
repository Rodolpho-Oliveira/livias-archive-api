import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../lib/prisma.js'
import { signToken, hashPassword, comparePassword } from '../lib/auth.js'

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  name: z.string().optional(),
})

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
})

const publicUser = {
  select: {
    id: true,
    email: true,
    name: true,
    avatarUrl: true,
    theme: true,
    fontFamily: true,
    fontSize: true,
    focusModeFont: true,
    focusModeSize: true,
    createdAt: true,
    updatedAt: true,
  },
}

export async function authRoutes(fastify: FastifyInstance) {
  // Register
  fastify.post('/auth/register', async (request, reply) => {
    const body = registerSchema.parse(request.body)

    const existing = await prisma.user.findUnique({ where: { email: body.email } })
    if (existing) {
      return reply.status(409).send({ error: 'Email already registered' })
    }

    const user = await prisma.user.create({
      data: {
        email: body.email,
        name: body.name || body.email.split('@')[0],
        passwordHash: await hashPassword(body.password),
      },
      ...publicUser,
    })

    return reply.status(201).send({ token: signToken(user.id), user })
  })

  // Login
  fastify.post('/auth/login', async (request, reply) => {
    const body = loginSchema.parse(request.body)

    const user = await prisma.user.findUnique({ where: { email: body.email } })
    if (!user?.passwordHash) {
      return reply.status(401).send({ error: 'Invalid email or password' })
    }

    const valid = await comparePassword(body.password, user.passwordHash)
    if (!valid) {
      return reply.status(401).send({ error: 'Invalid email or password' })
    }

    const { passwordHash, ...safeUser } = user
    return { token: signToken(user.id), user: safeUser }
  })
}
