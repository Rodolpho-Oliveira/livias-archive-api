import jwt from 'jsonwebtoken'
import { hash, compare } from 'bcryptjs'

const JWT_SECRET = process.env.JWT_SECRET!

export function signToken(userId: string) {
  return jwt.sign({ sub: userId }, JWT_SECRET, { expiresIn: '7d' })
}

export function verifyToken(token: string): string {
  const payload = jwt.verify(token, JWT_SECRET) as { sub?: string }
  if (!payload.sub) {
    throw new Error('Invalid token')
  }
  return payload.sub
}

export async function hashPassword(password: string) {
  return hash(password, 10)
}

export async function comparePassword(password: string, hashValue: string) {
  return compare(password, hashValue)
}
