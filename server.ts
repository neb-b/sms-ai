import Fastify from 'fastify'
import { ai } from './src/ai'
import path from 'path'
import fs from 'fs'

const fastify = Fastify({
  logger: true,
})

// Serve HTML page at root
fastify.get('/', async function handler(request, reply) {
  const html = fs.readFileSync(path.join(__dirname, 'public', 'index.html'))
  reply.type('text/html').send(html)
})

// Accept POST request at '/ai'
fastify.post('/ai', async function handler(request, reply) {
  try {
    const { message } = request.body as { message: string }
    const response = await ai.complete(message)

    return {
      completion: response,
    }
  } catch (e) {
    return {
      error: e.message,
    }
  }
})

// Run the server!
try {
  await fastify.listen({ port: 1337 })
} catch (err) {
  fastify.log.error(err)
  process.exit(1)
}
