import { FastifyInstance } from 'fastify'
import { z } from 'zod'

const generateSchema = z.object({
  prompt: z.string().min(1).max(4000),
  chapterTitle: z.string().max(200).optional(),
  bookTitle: z.string().max(200).optional(),
})

export async function aiRoutes(fastify: FastifyInstance) {
  // Gera texto com IA (DeepSeek via OpenRouter, modelos gratuitos)
  fastify.post('/ai/generate', async (request, reply) => {
    const { prompt, chapterTitle, bookTitle } = generateSchema.parse(request.body)

    const apiKey = process.env.OPENROUTER_API_KEY
    if (!apiKey) {
      return reply.status(503).send({
        error: 'IA não configurada no servidor. Adicione OPENROUTER_API_KEY no .env.',
      })
    }

    const model = process.env.AI_MODEL || 'deepseek/deepseek-chat:free'

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
        if (res.status === 429) {
          return reply.status(429).send({
            error: 'Limite gratuito da IA atingido. Aguarde um pouco e tente de novo (50 pedidos/dia).',
          })
        }
        const msg = data?.error?.message || `Erro do provedor de IA (${res.status})`
        return reply.status(502).send({ error: `Falha na geração: ${msg}` })
      }

      const text = data?.choices?.[0]?.message?.content
      if (!text) {
        return reply.status(502).send({ error: 'A IA não retornou nenhum texto. Tente de novo.' })
      }

      return { text: text.trim() }
    } catch (err) {
      fastify.log.error(err)
      return reply.status(502).send({ error: 'Não foi possível contatar o serviço de IA.' })
    }
  })
}
