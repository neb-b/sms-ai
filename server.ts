import Fastify from 'fastify'
import { ai } from './src/ai'
import path from 'path'
import fs from 'fs'
import formbody from '@fastify/formbody'
import fastifyCron from 'fastify-cron'
import { getUserByPhone, getMessages, createMessages } from './src/db'
import { sendSMS, type TwilioMessage } from './src/twilio'
import { Cron } from './src/cron'

new Cron()

const fastify = Fastify({
  logger: true,
})

fastify.register(formbody)

fastify.get('/', async function handler(request, reply) {
  const html = fs.readFileSync(path.join(__dirname, 'public', 'index.html'))
  reply.type('text/html').send(html)
})

fastify.post('/sms', async function handler(request, reply) {
  try {
    const { From, Body } = request.body as TwilioMessage

    const isValidNumber = /^\+1\d{10}$/.test(From)
    if (!isValidNumber) {
      throw Error('Invalid number')
    }

    console.log('incoming: ', {
      From,
      Body,
    })

    const numberLessCountryCode = From.slice(2)
    const user = await getUserByPhone(numberLessCountryCode)
    if (!user) {
      throw Error('User not found')
    }

    const previousMessagesFromUser = await getMessages(user.id)
    if (previousMessagesFromUser.length === 0) {
      // Send a welcome message and ensure they opt-in
      const optInMessage = {
        role: 'system',
        content: 'Welcome to the SMS AI assistant. Please reply with "Start" to opt-in.',
        user_id: user.id,
      }

      await createMessages([optInMessage])
      await sendSMS({
        body: optInMessage.content,
        to: From,
      })

      return { content: optInMessage.content }
    }

    if (previousMessagesFromUser.length === 1) {
      // Ensure they opted in
      const [firstMessage] = previousMessagesFromUser
      if (!firstMessage.content.toLowerCase().includes('start')) {
        // TODO: allow them to retry opt-in
        throw Error('User did not opt-in')
      }

      const welcomeMessage = {
        role: 'system',
        content: `Welcome to the SMS AI assistant. You are now opted-in. I will remember any events or dates you send and remind you when they get close.`,
        user_id: user.id,
      }

      await createMessages([welcomeMessage])
      await sendSMS({
        body: welcomeMessage.content,
        to: From,
      })
      return {
        content: welcomeMessage.content,
      }
    }

    const systemMessageBody = await ai.complete({
      messages: previousMessagesFromUser.map((message) => {
        return {
          role: message.role,
          content: message.content,
        }
      }),
      message: Body,
      userId: user.id,
    })

    await sendSMS({
      body: systemMessageBody,
      to: From,
    })
    return {
      content: systemMessageBody,
    }
  } catch (e) {
    console.log('ERROR: ', e)
    return {
      error: e.message,
    }
  }
})

fastify.register(fastifyCron, {
  jobs: [
    {
      // Only these two properties are required,
      // the rest is from the node-cron API:
      // https://github.com/kelektiv/node-cron#api
      cronTime: '*/5 * * * *',

      // Note: the callbacks (onTick & onComplete) take the server
      // as an argument, as opposed to nothing in the node-cron API:
      onTick: async (server) => {
        console.log('TICKCICKCICK', server)
      },
    },
  ],
})

try {
  const port = Number(process.env.PORT) || 1337
  await fastify.listen({
    port,
    ...(process.env.NODE_ENV === 'production' ? { host: '0.0.0.0' } : {}),
  })
} catch (err) {
  fastify.log.error(err)
  process.exit(1)
}
