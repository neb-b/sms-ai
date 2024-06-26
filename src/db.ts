import { createClient } from '@supabase/supabase-js'

const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_API_KEY)

export const getUserById = async (userId: number) => {
  const { data, error } = await db.from('user').select('*').eq('id', userId).limit(1)

  if (error) {
    throw error
  }

  const user = data[0]
  return user
}

export const getUserByPhone = async (phoneNumber: string) => {
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
  const { data, error } = await db
    .from('message')
    .select('*')
    .eq('user_id', userId)
    .limit(20)
    .order('created_at', { ascending: false })

  if (error) {
    throw error
  }

  return data
}

export const getEvent = async (eventId: number) => {
  const { data, error } = await db.from('event').select('*').eq('id', eventId).limit(1)

  if (error) {
    throw error
  }

  return data?.[0]
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

export const searchForEvents = async (search: { start: string; end: string; user_id: number }) => {
  console.log('SEARCH', search)
  const { data, error } = await db
    .from('event')
    .select('*')
    .gte('date', search.start)
    .lte('date', search.end)
    .eq('user_id', search.user_id)

  if (error) {
    throw error
  }

  return data
}

export const createReminder = async (reminder: { event_id: number; user_id: number; date: string }) => {
  const { data, error } = await db.from('reminder').insert(reminder).select()

  if (error) {
    throw error
  }

  return data
}

export const updateReminder = async (reminder: { id: number; reminder_sent: boolean }) => {
  const { data, error } = await db.from('reminder').update(reminder).eq('id', reminder.id).select()

  if (error) {
    throw error
  }

  return data
}

export const getActiveReminders = async () => {
  // get all remidners where has_sent is false and date is less than now
  const { data, error } = await db
    .from('reminder')
    .select('*')
    .lte('date', new Date().toISOString())
    .eq('reminder_sent', false)

  if (error) {
    throw error
  }

  return data
}
