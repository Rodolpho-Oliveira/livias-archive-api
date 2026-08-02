import { FastifyInstance } from 'fastify'
import { z } from 'zod'

const generateSchema = z.object({
  prompt: z.string().min(1).max(4000),
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

export async function aiRoutes(fastify: FastifyInstance) {
  // Gera texto com IA (via OpenRouter, modelos gratuitos)
  fastify.post('/ai/generate', async (request, reply) => {
    const { prompt, chapterTitle, bookTitle } = generateSchema.parse(request.body)

    const apiKey = process.env.OPENROUTER_API_KEY
    if (!apiKey) {
      return reply.status(503).send({
        error: 'IA não configurada no servidor. Adicione OPENROUTER_API_KEY no .env.',
      })
    }

    const configured = (process.env.AI_MODELS || process.env.AI_MODEL || '')
      .split(',')
      .map((m) => m.trim())
      .filter(Boolean)

    const models = [...configured, ...FALLBACK_MODELS].filter(
      (m, i, arr) => arr.indexOf(m) === i
    )

    const contextParts = []
    if (bookTitle) contextParts.push(`Livro: "${bookTitle}"`)
    if (chapterTitle) contextParts.push(`Capítulo: "${chapterTitle}"`)
    const context = contextParts.length > 0 ? `\n\nContexto:\n${contextParts.join('\n')}` : ''

    const system = [
      'Você é uma escritora assistente criativa do app "Livia\'s Archive", um aplicativo de escrita de livros.',
      'Você escreve em português brasileiro, com tom envolvente e narrativo.',
      'Responda APENAS com o texto da história solicitado, sem explicações, sem avisos de segurança e sem introduções do tipo "Aqui está".',
      'Se o pedido não fizer sentido para uma história, devolva um texto curto e gentil explicando.',
    ].join(' ')

    const user = `${prompt}${context}`

    let lastError = ''

    for (const model of models) {
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
            temperature: 0.8,
            max_tokens: 2000,
          }),
        })

        const data = await res.json().catch(() => ({})) as any

        if (!res.ok) {
          const msg = data?.error?.message || `Erro do provedor de IA (${res.status})`
          lastError = msg
          fastify.log.warn(`[AI] Modelo ${model} indisponível: ${msg}`)
          continue
        }

        const text = data?.choices?.[0]?.message?.content
        if (!text) {
          lastError = 'A IA não retornou nenhum texto.'
          continue
        }

        return { text: text.trim() }
      } catch (err) {
        lastError = 'Não foi possível contatar o serviço de IA.'
        fastify.log.error(err)
      }
    }

    const isRateLimit = /429|rate|limit|too many/i.test(lastError)
    const error = isRateLimit
      ? 'Limite gratuito da IA atingido. Aguarde um pouco e tente de novo (50 pedidos/dia).'
      : `Falha na geração: nenhum modelo gratuito disponível no momento. ${lastError}`.trim()

    return reply.status(isRateLimit ? 429 : 502).send({ error })
  })
}
