import { createClient } from '@supabase/supabase-js'

const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_API_KEY)

export const getUser = async (phoneNumber: string) => {
  const { data, error } = await db.from('user').select('*').eq('phone_number', phoneNumber)

  if (error) {
    throw error
  }

  const user = data[0]
  return user
}

export const createMessages = async (messages: { role: string; content: string; user_id: number }[]) => {
  const { data, error } = await db.from('message').insert(messages)

  if (error) {
    throw error
  }

  return data
}

export const getMessages = async (userId: number) => {
  const { data, error } = await db.from('message').select('*').eq('user_id', userId).limit(20)

  if (error) {
    throw error
  }

  return data
}

export const createEvent = async (event: { name: string; date: string; user_id: number }) => {
  const { data, error } = await db
    .from('event')
    .insert({
      ...event,
      type: 'one-time',
    })
    .select()

  if (error) {
    throw error
  }

  return data?.[0]
}

export const createReminder = async (reminder: { event_id: number; user_id: number; date: string }) => {
  const { data, error } = await db.from('reminder').insert(reminder).select()

  if (error) {
    throw error
  }

  return data
}
