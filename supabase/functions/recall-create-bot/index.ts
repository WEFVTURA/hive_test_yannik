import 'jsr:@supabase/functions-js/edge-runtime.d.ts';

type BotCreateReq = { meeting_url?: string };

function cors(req: Request){
  const origin = req.headers.get('origin') || '*';
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Credentials': 'true',
    'Vary': 'Origin'
  } as Record<string,string>;
}

async function fetchJson(url: string, init: RequestInit){
  const r = await fetch(url, init);
  const j = await r.json().catch(()=>({}));
  if (!r.ok) throw new Error((j as any)?.error || JSON.stringify(j));
  return j as any;
}

Deno.serve(async (req: Request) => {
  const corsHeaders = cors(req);
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== 'POST') return new Response('Method Not Allowed', { status: 405, headers: corsHeaders });

  // Auth: require a logged-in user
  const auth = req.headers.get('authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
  const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
  const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
  const RECALL_KEY = Deno.env.get('RECALL_API_KEY') || '';
  const REGION = (Deno.env.get('RECALL_REGION') || 'us').toLowerCase();
  const baseMap: Record<string,string> = { us:'https://us-west-2.recall.ai', eu:'https://eu-west-1.recall.ai', jp:'https://ap-northeast-1.recall.ai', payg:'https://api.recall.ai' };
  const BASE = baseMap[REGION] || baseMap.us;

  if (!token) return new Response(JSON.stringify({ error:'not_authenticated' }), { status:401, headers:{...corsHeaders, 'Content-Type':'application/json'} });
  if (!SUPABASE_URL || !SERVICE_KEY || !RECALL_KEY) return new Response(JSON.stringify({ error:'missing_env' }), { status:500, headers:{...corsHeaders, 'Content-Type':'application/json'} });

  let body: BotCreateReq = {};
  try { body = await req.json(); } catch { return new Response(JSON.stringify({ error:'bad_json' }), { status:400, headers:{...corsHeaders,'Content-Type':'application/json'} }); }
  const meetingUrl = (body.meeting_url||'').trim();
  if (!meetingUrl) return new Response(JSON.stringify({ error:'meeting_url_required' }), { status:400, headers:{...corsHeaders,'Content-Type':'application/json'} });

  // Get user
  let user: any = null;
  try{
    const r = await fetch(`${SUPABASE_URL}/auth/v1/user`, { headers:{ apikey: SERVICE_KEY, Authorization:`Bearer ${token}` } });
    user = await r.json().catch(()=>null);
  }catch{}
  const userId = user?.id || '';
  if (!userId) return new Response(JSON.stringify({ error:'user_not_found' }), { status:401, headers:{...corsHeaders,'Content-Type':'application/json'} });

  // Create bot at Recall
  let bot: any = {};
  try{
    bot = await fetchJson(`${BASE}/api/v1/bot/`, {
      method:'POST',
      headers:{ 'Authorization': `Token ${RECALL_KEY}`, 'Content-Type':'application/json' },
      body: JSON.stringify({ meeting_url: meetingUrl })
    });
  }catch(e){
    return new Response(JSON.stringify({ error:'recall_create_failed', detail: String(e) }), { status:502, headers:{...corsHeaders,'Content-Type':'application/json'} });
  }
  const botId = bot?.id || '';
  if (!botId) return new Response(JSON.stringify({ error:'bot_id_missing', bot }), { status:502, headers:{...corsHeaders,'Content-Type':'application/json'} });

  // Persist mapping bot_id → user_id
  try{
    await fetchJson(`${SUPABASE_URL}/rest/v1/recall_bots`, {
      method:'POST',
      headers:{ 'Content-Type':'application/json', apikey: SERVICE_KEY, Authorization:`Bearer ${SERVICE_KEY}` },
      body: JSON.stringify({ bot_id: botId, user_id: userId, meeting_url: meetingUrl, status: bot?.status?.code || bot?.status || '' })
    });
  }catch(e){
    // Non-fatal but important; surface the error
    return new Response(JSON.stringify({ error:'mapping_persist_failed', detail:String(e), bot_id: botId }), { status:500, headers:{...corsHeaders,'Content-Type':'application/json'} });
  }

  return new Response(JSON.stringify({ ok:true, bot_id: botId, status: bot?.status?.code || bot?.status || '', meeting_url: meetingUrl }), { headers:{...corsHeaders,'Content-Type':'application/json'} });
});


