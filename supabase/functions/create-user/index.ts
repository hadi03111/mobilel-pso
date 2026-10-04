import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  try {
    const url = Deno.env.get('SUPABASE_URL')!
    const anon = Deno.env.get('SUPABASE_ANON_KEY')!
    const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const authHeader = req.headers.get('Authorization') || ''
    const caller = createClient(url, anon, { global: { headers: { Authorization: authHeader } } })
    const { data: { user }, error: userError } = await caller.auth.getUser()
    if (userError || !user) throw new Error('Not authenticated')

    const admin = createClient(url, service)
    const { data: profile, error: profileError } = await admin.from('profiles').select('role,active').eq('id', user.id).single()
    if (profileError || !profile?.active || !['Developer','Admin','Manager'].includes(profile.role)) throw new Error('Not authorized to create users')

    const body = await req.json()
    const { full_name, email, password, role } = body
    const allowed = profile.role === 'Manager' ? ['Cashier','Technician'] : ['Manager','Cashier','Technician']
    if (!allowed.includes(role)) throw new Error(`You cannot create the ${role} role`)
    if (!full_name || !email || !password || password.length < 8) throw new Error('Name, email and password (8+ characters) are required')

    const { data, error } = await admin.auth.admin.createUser({
      email: String(email).trim().toLowerCase(), password, email_confirm: true,
      user_metadata: { full_name }
    })
    if (error) throw error
    const { error: updateError } = await admin.from('profiles').update({ full_name, role, active: true }).eq('id', data.user.id)
    if (updateError) throw updateError
    await admin.from('audit_log').insert({ actor_id: user.id, action: 'USER_CREATED', entity_type: 'profile', entity_id: data.user.id, metadata: { role, email } })
    return new Response(JSON.stringify({ id: data.user.id, email, full_name, role }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message || String(e) }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }
})
