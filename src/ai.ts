import OpenAI from 'openai'
import { createEvent, createReminder } from './db'

export const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
})

export class ai {
  static async complete(
    messages: { role: 'system' | 'user'; content: string }[] = [],
    message: string
  ): Promise<string> {
    const runner = openai.beta.chat.completions.runTools({
      model: 'gpt-3.5-turbo',
      messages: [
        {
          role: 'system',
          content: `
              You are an SMS based AI assistant.
              All messages should be short and to the point.
              You can create events for the user.
              Another service will run a job that ensures the user is reminded of these events properly.
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
              },
            },
          },
        },
        // Other functions or tools as needed
      ],
    })
    // .on('message', (message) => console.log(message))

    const finalContent = await runner.finalContent()
    return finalContent
  }
}

function create_event({  name, timeFromNowInSeconds }) {
  const eventTime = new Date(Date.now() + timeFromNowInSeconds * 1000)
  const eventTimeString = eventTime.toLocaleString()

  createEvent({
    name,
    date: eventTimeString,
    how do i get user_id here
    user_id
  })

  // This function would create an event and schedule reminders based on your specifications.
  // For demonstration, it returns a simplified response.
  return `Event "${name}" created for ${eventTimeString}.`
}
