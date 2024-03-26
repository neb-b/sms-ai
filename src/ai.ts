import OpenAI from 'openai'

export const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
})

export class ai {
  static async complete(message: string) {
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
            `,
          },
          {
            role: 'user',
            content: message,
          },
        ],
        tools: [
          {
            type: 'function',
            function: {
              function: create_event,
              parse: JSON.parse, // Assuming a simple response parsing; adjust as necessary.
              parameters: {
                type: 'object',
                properties: {
                  name: { type: 'string' },
                  timeFromNowInSeconds: { type: 'number' },
                  reminders: { type: 'array', items: { type: 'number' } },
                },
              },
            },
          },
          // Other functions or tools as needed
        ],
      })
      .on('message', (message) => console.log(message))

    const finalContent = await runner.finalContent()
    return finalContent
  }
}

function create_event({ name, timeFromNowInSeconds, reminders }) {
  console.log('CREATE_EVENT', name, timeFromNowInSeconds, reminders)

  const eventTime = new Date(Date.now() + timeFromNowInSeconds * 1000)
  const eventTimeString = eventTime.toLocaleString()
  // This function would create an event and schedule reminders based on your specifications.
  // For demonstration, it returns a simplified response.
  return `Event "${name}" created for ${eventTimeString} with reminders set at [${reminders.join(
    ', '
  )}] seconds before the event.`
}
