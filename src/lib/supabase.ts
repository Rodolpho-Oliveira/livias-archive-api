import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

export const supabase = createClient(supabaseUrl, supabaseServiceKey)

export async function verifyToken(token: string) {
  const { data, error } = await supabase.auth.getUser(token)
  if (error || !data.user) {
    throw new Error('Invalid token')
  }
  return data.user
}
