import { serve } from 'https://deno.land/std@0.208.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { persistSession: false } },
    )

    const { playerIds, userIds: directUserIds, title, body, data } = await req.json() as {
      playerIds?: string[]
      userIds?: string[]
      title: string
      body: string
      data?: Record<string, string>
    }

    if (!playerIds?.length && !directUserIds?.length) return json({ sent: 0 })

    const userIds: string[] = [...(directUserIds ?? [])]

    // Résoudre player_id → user_id pour les playerIds passés
    if (playerIds?.length) {
      const { data: players, error: pErr } = await supabase
        .from('players')
        .select('user_id')
        .in('id', playerIds)
        .not('user_id', 'is', null)

      if (pErr) throw pErr
      userIds.push(...(players ?? []).map((p: { user_id: string }) => p.user_id))
    }

    const uniqueUserIds = [...new Set(userIds)]
    if (!uniqueUserIds.length) return json({ sent: 0, reason: 'no_linked_accounts' })

    // 2. Récupérer les tokens Expo enregistrés
    const { data: tokenRows, error: tErr } = await supabase
      .from('push_tokens')
      .select('token')
      .in('user_id', uniqueUserIds)

    if (tErr) throw tErr

    const tokens = (tokenRows ?? []).map((r: { token: string }) => r.token)
    if (!tokens.length) return json({ sent: 0, reason: 'no_push_tokens' })

    // 3. Envoyer via l'API Expo (batch max 100 messages)
    const messages = tokens.map((token: string) => ({
      to: token,
      title,
      body,
      data: data ?? {},
      sound: 'default',
    }))

    // Expo accepte 100 messages par requête maximum
    const chunks: typeof messages[] = []
    for (let i = 0; i < messages.length; i += 100) {
      chunks.push(messages.slice(i, i + 100))
    }

    const results = await Promise.all(
      chunks.map((chunk) =>
        fetch('https://exp.host/--/api/v2/push/send', {
          method: 'POST',
          headers: {
            Accept: 'application/json',
            'Accept-Encoding': 'gzip, deflate',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(chunk),
        }).then((r) => r.json()),
      ),
    )

    return json({ sent: tokens.length, results })
  } catch (err) {
    console.error('send-push-notification error:', err)
    return json({ error: String(err) }, 500)
  }
})
