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

// ── APNs JWT (ES256) ──────────────────────────────────────────────────────────

async function buildAPNsJWT(pem: string, keyId: string, teamId: string): Promise<string> {
  const base64 = pem
    .replace(/-----BEGIN PRIVATE KEY-----/g, '')
    .replace(/-----END PRIVATE KEY-----/g, '')
    .replace(/\s+/g, '')
  const der = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0))

  const key = await crypto.subtle.importKey(
    'pkcs8',
    der.buffer,
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign'],
  )

  const b64url = (s: string | Uint8Array) => {
    const str = typeof s === 'string' ? btoa(s) : btoa(String.fromCharCode(...s))
    return str.replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')
  }

  const hdr = b64url(JSON.stringify({ alg: 'ES256', kid: keyId }))
  const pay = b64url(JSON.stringify({ iss: teamId, iat: Math.floor(Date.now() / 1000) }))
  const msg = `${hdr}.${pay}`

  const sig = new Uint8Array(
    await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, new TextEncoder().encode(msg)),
  )

  return `${msg}.${b64url(sig)}`
}

// Detect native APNs device token (hex string) vs Expo token
function isAPNsToken(token: string): boolean {
  return !token.startsWith('ExponentPushToken[')
}

// ── Main handler ──────────────────────────────────────────────────────────────

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

    if (playerIds?.length) {
      const { data: players, error } = await supabase
        .from('players')
        .select('user_id')
        .in('id', playerIds)
        .not('user_id', 'is', null)
      if (error) throw error
      userIds.push(...(players ?? []).map((p: { user_id: string }) => p.user_id))
    }

    const uniqueIds = [...new Set(userIds)]
    if (!uniqueIds.length) return json({ sent: 0, reason: 'no_linked_accounts' })

    const { data: rows, error: tErr } = await supabase
      .from('push_tokens')
      .select('token, platform')
      .in('user_id', uniqueIds)
    if (tErr) throw tErr

    const tokens = (rows ?? []) as { token: string; platform: string }[]
    if (!tokens.length) return json({ sent: 0, reason: 'no_push_tokens' })

    const apnsKey  = Deno.env.get('APNS_PRIVATE_KEY')
    const apnsKid  = Deno.env.get('APNS_KEY_ID')
    const apnsTeam = Deno.env.get('APNS_TEAM_ID')
    const apnsBid  = Deno.env.get('APNS_BUNDLE_ID') ?? 'com.futsalhub.app'

    const apnsTokens = tokens.filter((t) => t.platform === 'ios' && isAPNsToken(t.token))
    const expoTokens = tokens.filter((t) => !isAPNsToken(t.token) || t.platform !== 'ios')

    const results: unknown[] = []

    // ── iOS : APNs direct ─────────────────────────────────────────────────────
    if (apnsTokens.length > 0 && apnsKey && apnsKid && apnsTeam) {
      try {
        const jwt = await buildAPNsJWT(apnsKey, apnsKid, apnsTeam)
        const apnsResults = await Promise.all(
          apnsTokens.map(async ({ token }) => {
            const r = await fetch(`https://api.push.apple.com/3/device/${token}`, {
              method: 'POST',
              headers: {
                authorization: `bearer ${jwt}`,
                'apns-topic': apnsBid,
                'apns-push-type': 'alert',
                'apns-priority': '10',
                'content-type': 'application/json',
              },
              body: JSON.stringify({
                aps: { alert: { title, body }, sound: 'default' },
                ...(data ?? {}),
              }),
            })
            if (r.status === 200) return { apns: 'ok' }
            const err = await r.json().catch(() => ({}))
            console.error('APNs error for token', token.slice(0, 8), r.status, err)
            return { apns: r.status, error: err }
          }),
        )
        results.push(...apnsResults)
      } catch (e) {
        console.error('APNs fatal:', e)
        results.push({ apns: 'fatal', error: String(e) })
      }
    }

    // ── Android / anciens tokens Expo ─────────────────────────────────────────
    if (expoTokens.length > 0) {
      const messages = expoTokens.map(({ token }) => ({
        to: token, title, body, data: data ?? {}, sound: 'default',
      }))
      const chunks: typeof messages[] = []
      for (let i = 0; i < messages.length; i += 100) chunks.push(messages.slice(i, i + 100))
      const expoResults = await Promise.all(
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
      results.push(...expoResults)
    }

    return json({ sent: tokens.length, results })
  } catch (err) {
    console.error('send-push-notification error:', err)
    return json({ error: String(err) }, 500)
  }
})
