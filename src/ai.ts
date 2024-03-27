import OpenAI from 'openai'
import { createEvent, createReminder } from './db'

export const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
})

export class ai {
  static async complete({
    user_id,
    messages = [],
    message,
  }: {
    user_id: number
    messages: { role: 'system' | 'user'; content: string }[]
    message: string
  }): Promise<string> {
    const runner = openai.beta.chat.completions
      .runTools({
        model: 'gpt-3.5-turbo',
        messages: [
          {
            role: 'system',
            content: `
              You are an SMS based AI assistant.
              All messages should be short and to the point.
              You can create events for the user.
              Another service will run a job that ensures the user is reminded of these events properly.
              this users "user_id" is "${user_id}"
            `,
          },
          ...messages,
          {
            role: 'user',
            content: message,
          },
        ],
        tools: [
          {
            type: 'function',
            // @ts-expect-error
            function: {
              function: create_event,
              parse: JSON.parse,
              parameters: {
                type: 'object',
                properties: {
                  name: { type: 'string' },
                  timeFromNowInSeconds: { type: 'number' },
                  user_id: { type: 'number' },
                },
              },
            },
          },
        ],
      })
      .on('message', (message) => console.log(message))

    const finalContent = await runner.finalContent()
    return finalContent
  }
}

async function create_event({
  name,
  timeFromNowInSeconds,
  user_id,
}: {
  name: string
  timeFromNowInSeconds: number
  user_id: number
}) {
  console.log('CREATE_EVENT CALL', name, timeFromNowInSeconds, user_id)
  const eventTime = new Date(Date.now() + timeFromNowInSeconds * 1000)
  const eventTimeString = eventTime.toISOString()

  try {
    const event = await createEvent({
      name,
      date: eventTimeString,
      user_id,
    })

    const reminderDate = getReminderDate(eventTime)

    await createReminder({
      event_id: event.id,
      user_id: user_id,
      date: reminderDate,
    })
  } catch (e) {
    console.log('ERROR: ', e)
    return e.message
  }
}

const getReminderDate = (eventTime: Date) => {
  // If event is more than 72 hours away, remind 24 hours before
  // If event is less than 72 hours away, remind 1 hour before

  const now = new Date()
  const timeDifference = eventTime.getTime() - now.getTime()
  const hoursDifference = timeDifference / 1000 / 60 / 60

  if (hoursDifference > 72) {
    return new Date(eventTime.getTime() - 24 * 60 * 60 * 1000).toISOString()
  }

  return new Date(eventTime.getTime() - 60 * 60 * 1000).toISOString()
}
