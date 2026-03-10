import { FastifyInstance } from 'fastify'
import { prisma } from '../lib/prisma.js'

// Simple JSON to HTML converter for TipTap content
function tiptapToHtml(content: any): string {
  if (!content || !content.content) return ''
  
  return content.content.map((node: any): string => {
    switch (node.type) {
      case 'paragraph':
        const pText = node.content ? node.content.map(inlineToHtml).join('') : ''
        const align = node.attrs?.textAlign ? ` style="text-align: ${node.attrs.textAlign}"` : ''
        return `<p${align}>${pText}</p>`
      case 'heading': {
        const level = node.attrs?.level || 1
        const hText = node.content ? node.content.map(inlineToHtml).join('') : ''
        return `<h${level}>${hText}</h${level}>`
      }
      case 'bulletList':
        return `<ul>${node.content ? node.content.map(tiptapToHtml).join('') : ''}</ul>`
      case 'orderedList':
        return `<ol>${node.content ? node.content.map(tiptapToHtml).join('') : ''}</ol>`
      case 'listItem':
        return `<li>${node.content ? node.content.map(tiptapToHtml).join('') : ''}</li>`
      case 'blockquote':
        return `<blockquote>${node.content ? node.content.map(tiptapToHtml).join('') : ''}</blockquote>`
      case 'horizontalRule':
        return '<hr />'
      default:
        return node.content ? node.content.map(inlineToHtml).join('') : ''
    }
  }).join('\n')
}

function inlineToHtml(node: any): string {
  if (node.type === 'text') {
    let text = node.text || ''
    if (node.marks) {
      for (const mark of node.marks) {
        switch (mark.type) {
          case 'bold': text = `<strong>${text}</strong>`; break
          case 'italic': text = `<em>${text}</em>`; break
          case 'underline': text = `<u>${text}</u>`; break
          case 'strike': text = `<s>${text}</s>`; break
          case 'highlight': text = `<mark>${text}</mark>`; break
        }
      }
    }
    return text
  }
  return ''
}

export async function exportRoutes(fastify: FastifyInstance) {
  // Export book as HTML (client can convert to PDF)
  fastify.get('/books/:id/export/html', async (request, reply) => {
    const { id } = request.params as { id: string }

    const book = await prisma.book.findFirst({
      where: { id, userId: request.userId },
      include: {
        chapters: { orderBy: { order: 'asc' } },
      },
    })

    if (!book) return reply.status(404).send({ error: 'Book not found' })

    let html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <title>${book.title}</title>
  <style>
    body { font-family: Georgia, serif; max-width: 700px; margin: 0 auto; padding: 40px 20px; color: #333; line-height: 1.8; }
    h1 { text-align: center; font-size: 2.5em; margin-bottom: 0.5em; color: #6B4E4E; }
    .synopsis { text-align: center; color: #888; font-style: italic; margin-bottom: 3em; }
    .genre { text-align: center; color: #D46A9E; margin-bottom: 2em; }
    .chapter-title { font-size: 1.5em; margin-top: 3em; padding-bottom: 0.5em; border-bottom: 2px solid #FFE4EC; color: #6B4E4E; }
    blockquote { border-left: 3px solid #F4A7BB; padding-left: 1em; color: #666; font-style: italic; }
    hr { border: none; border-top: 1px solid #FFE4EC; margin: 2em 0; }
    p { margin-bottom: 1em; }
  </style>
</head>
<body>
  <h1>${book.title}</h1>
  ${book.genre ? `<p class="genre">${book.genre}</p>` : ''}
  ${book.synopsis ? `<p class="synopsis">${book.synopsis}</p>` : ''}
`

    for (const chapter of book.chapters) {
      html += `  <h2 class="chapter-title">${chapter.title}</h2>\n`
      html += `  ${tiptapToHtml(chapter.content)}\n`
    }

    html += `</body>\n</html>`

    reply.header('Content-Type', 'text/html')
    reply.header('Content-Disposition', `attachment; filename="${book.title}.html"`)
    return html
  })

  // Export single chapter as HTML
  fastify.get('/chapters/:id/export/html', async (request, reply) => {
    const { id } = request.params as { id: string }

    const chapter = await prisma.chapter.findFirst({
      where: { id, book: { userId: request.userId } },
      include: { book: { select: { title: true } } },
    })

    if (!chapter) return reply.status(404).send({ error: 'Chapter not found' })

    const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <title>${chapter.title} - ${chapter.book.title}</title>
  <style>
    body { font-family: Georgia, serif; max-width: 700px; margin: 0 auto; padding: 40px 20px; color: #333; line-height: 1.8; }
    h1 { color: #6B4E4E; }
    blockquote { border-left: 3px solid #F4A7BB; padding-left: 1em; color: #666; font-style: italic; }
  </style>
</head>
<body>
  <h1>${chapter.title}</h1>
  ${tiptapToHtml(chapter.content)}
</body>
</html>`

    reply.header('Content-Type', 'text/html')
    reply.header('Content-Disposition', `attachment; filename="${chapter.title}.html"`)
    return html
  })

  // Export book as EPUB-like JSON (chapters structured for client-side EPUB generation)
  fastify.get('/books/:id/export/data', async (request, reply) => {
    const { id } = request.params as { id: string }

    const book = await prisma.book.findFirst({
      where: { id, userId: request.userId },
      include: {
        chapters: { orderBy: { order: 'asc' } },
      },
    })

    if (!book) return reply.status(404).send({ error: 'Book not found' })

    return {
      title: book.title,
      genre: book.genre,
      synopsis: book.synopsis,
      chapters: book.chapters.map(ch => ({
        title: ch.title,
        html: tiptapToHtml(ch.content),
        wordCount: ch.wordCount,
      })),
    }
  })
}
