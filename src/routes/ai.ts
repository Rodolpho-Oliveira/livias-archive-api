import { FastifyInstance } from 'fastify'
import { z } from 'zod'

const suggestSchema = z.object({
  text: z.string().min(1).max(20000),
  chapterTitle: z.string().max(200).optional(),
  bookTitle: z.string().max(200).optional(),
})

const searchSchema = z.object({
  query: z.string().min(1).max(500),
  chapterTitle: z.string().max(200).optional(),
  bookTitle: z.string().max(200).optional(),
})

// Lista de modelos gratuitos (OpenRouter). Os modelos grátis rotacionam com
// frequência; o código tenta cada um em ordem até um responder.
const FALLBACK_MODELS = [
  'openai/gpt-oss-20b:free',
  'google/gemma-4-31b-it:free',
  'inclusionai/ling-3.0-flash:free',
  'nvidia/nemotron-3-super-120b-a12b:free',
  'deepseek/deepseek-chat:free',
]

function getModels(): string[] {
  const configured = (process.env.AI_MODELS || process.env.AI_MODEL || '')
    .split(',')
    .map((m) => m.trim())
    .filter(Boolean)
  return [...configured, ...FALLBACK_MODELS].filter((m, i, arr) => arr.indexOf(m) === i)
}

async function callModel(
  apiKey: string,
  model: string,
  system: string,
  user: string
): Promise<{ ok: true; text: string } | { ok: false; error: string }> {
  try {
    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
        temperature: 0.7,
        max_tokens: 2000,
      }),
    })

    const data = await res.json().catch(() => ({})) as any

    if (!res.ok) {
      return { ok: false, error: data?.error?.message || `Erro do provedor de IA (${res.status})` }
    }

    const text = data?.choices?.[0]?.message?.content
    if (!text) return { ok: false, error: 'A IA não retornou conteúdo.' }
    return { ok: true, text: text.trim() }
  } catch {
    return { ok: false, error: 'Não foi possível contatar o serviço de IA.' }
  }
}

async function generateWithFallback(
  fastify: FastifyInstance,
  apiKey: string,
  system: string,
  user: string
): Promise<{ text: string } | { error: string; rateLimit: boolean }> {
  let lastError = ''
  for (const model of getModels()) {
    const result = await callModel(apiKey, model, system, user)
    if (result.ok) return { text: result.text }
    lastError = result.error
    fastify.log.warn(`[AI] Modelo ${model} indisponível: ${result.error}`)
  }
  return {
    error: lastError || 'Nenhum modelo gratuito disponível no momento.',
    rateLimit: /429|rate|limit|too many/i.test(lastError),
  }
}

function extractJSON(raw: string): any {
  const cleaned = raw.replace(/```(?:json)?/gi, '').trim()
  const start = cleaned.indexOf('{')
  const end = cleaned.lastIndexOf('}')
  if (start === -1 || end === -1) return null
  try {
    return JSON.parse(cleaned.slice(start, end + 1))
  } catch {
    return null
  }
}

function buildContext(bookTitle?: string, chapterTitle?: string): string {
  const parts = []
  if (bookTitle) parts.push(`Livro: "${bookTitle}"`)
  if (chapterTitle) parts.push(`Capítulo: "${chapterTitle}"`)
  return parts.length > 0 ? `\n\nContexto:\n${parts.join('\n')}` : ''
}

export async function aiRoutes(fastify: FastifyInstance) {
  const apiKey = process.env.OPENROUTER_API_KEY

  // Sugestões pontuais de melhoria do texto
  fastify.post('/ai/suggest', async (request, reply) => {
    const { text, chapterTitle, bookTitle } = suggestSchema.parse(request.body)

    if (!apiKey) {
      return reply.status(503).send({
        error: 'IA não configurada no servidor. Adicione OPENROUTER_API_KEY no .env.',
      })
    }

    const system = [
      'Você é uma revisora de texto do app "Livia\'s Archive", um aplicativo de escrita de livros.',
      'O usuário vai te enviar um trecho do livro dele em português.',
      'Analise e identifique APENAS partes pontuais que podem melhorar: erros de português, concordância, clareza, repetições, frases confusas, escolha de palavras, ritmo.',
      'NÃO reescreva o texto inteiro. Apenas trechos curtos e específicos (de uma palavra até uma ou duas frases).',
      'Devolva EXCLUSIVAMENTE um JSON válido neste formato, sem markdown e sem texto extra:',
      '{"suggestions":[{"original":"trecho exato do texto original","suggestion":"trecho corrigido/melhorado","reason":"explicação curta em português"}]}',
      'Regras: "original" deve ser um fragmento EXATO copiado do texto enviado. Máximo de 8 sugestões.',
    ].join(' ')

    const result = await generateWithFallback(fastify, apiKey, system, text + buildContext(bookTitle, chapterTitle))

    if (!('text' in result)) {
      const error = result.rateLimit
        ? 'Limite gratuito da IA atingido. Aguarde um pouco e tente de novo (50 pedidos/dia).'
        : `Falha na análise: ${result.error}`
      return reply.status(result.rateLimit ? 429 : 502).send({ error })
    }

    const raw = extractJSON(result.text)
    const list = Array.isArray(raw?.suggestions) ? raw.suggestions : []
    const suggestions = list
      .filter((s: any) => s && typeof s.original === 'string' && typeof s.suggestion === 'string')
      .map((s: any) => ({
        original: (s.original as string).trim(),
        suggestion: (s.suggestion as string).trim(),
        reason: ((s.reason as string) || '').toString().trim(),
      }))
      .filter((s: any) => s.original && s.suggestion && s.original !== s.suggestion)
      .slice(0, 8)

    if (suggestions.length === 0) {
      return reply.status(502).send({ error: 'A IA não encontrou melhorias claras. Tente de novo.' })
    }

    return { suggestions }
  })

  // Pesquisa de assunto
  fastify.post('/ai/search', async (request, reply) => {
    const { query, chapterTitle, bookTitle } = searchSchema.parse(request.body)

    if (!apiKey) {
      return reply.status(503).send({
        error: 'IA não configurada no servidor. Adicione OPENROUTER_API_KEY no .env.',
      })
    }

    const system = [
      'Você é uma assistente de pesquisa do app "Livia\'s Archive", um aplicativo de escrita de livros.',
      'Responda de forma clara e objetiva em português brasileiro, com informações úteis para quem escreve.',
      'Seja concisa (máximo ~300 palavras). Use apenas texto corrido com quebras de linha, sem markdown.',
    ].join(' ')

    const result = await generateWithFallback(fastify, apiKey, system, `Pesquisa: ${query}` + buildContext(bookTitle, chapterTitle))

    if (!('text' in result)) {
      const error = result.rateLimit
        ? 'Limite gratuito da IA atingido. Aguarde um pouco e tente de novo (50 pedidos/dia).'
        : `Falha na pesquisa: ${result.error}`
      return reply.status(result.rateLimit ? 429 : 502).send({ error })
    }

    return { text: result.text }
  })
}
