export const config = { runtime: 'edge' };

export default async function handler(req){
  const cors = {
    'Access-Control-Allow-Origin': req.headers.get('Origin') || '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400'
  };
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (req.method !== 'POST') return new Response('Method Not Allowed', { status: 405, headers: cors });

  const SUPABASE_URL = process.env.SUPABASE_URL || '';
  const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SERVICE_KEY || '';
  if (!SUPABASE_URL || !SERVICE_KEY){ return new Response(JSON.stringify({ error:'server_env_missing' }), { status:500, headers:{...cors,'Content-Type':'application/json'} }); }

  // Auth: resolve caller
  let me = null;
  try{
    const authz = req.headers.get('authorization') || '';
    const token = authz.startsWith('Bearer ') ? authz.slice(7).trim() : '';
    if (token){
      const r = await fetch(`${SUPABASE_URL}/auth/v1/user`, { headers:{ apikey: SERVICE_KEY, Authorization:`Bearer ${token}` } });
      if (r.ok) me = await r.json();
    }
  }catch{}
  if (!me) return new Response(JSON.stringify({ error:'not_authenticated' }), { status:401, headers:{...cors,'Content-Type':'application/json'} });

  try{
    const { id, fields } = await req.json();
    if (!id || !fields || typeof fields !== 'object') return new Response(JSON.stringify({ error:'bad_request' }), { status:400, headers:{...cors,'Content-Type':'application/json'} });

    // Verify ownership
    const s = await fetch(`${SUPABASE_URL}/rest/v1/spaces?select=owner_id&id=eq.${id}&limit=1`, { headers:{ apikey: SERVICE_KEY, Authorization:`Bearer ${SERVICE_KEY}` } });
    const rows = await s.json();
    const ownerId = rows?.[0]?.owner_id || '';
    if (!ownerId || ownerId !== me.id) return new Response(JSON.stringify({ error:'forbidden' }), { status:403, headers:{...cors,'Content-Type':'application/json'} });

    // Perform update with service role
    const resp = await fetch(`${SUPABASE_URL}/rest/v1/spaces?id=eq.${id}`, { method:'PATCH', headers:{ 'Content-Type':'application/json', apikey: SERVICE_KEY, Authorization:`Bearer ${SERVICE_KEY}`, Prefer:'return=representation' }, body: JSON.stringify(fields) });
    const txt = await resp.text();
    if (!resp.ok){ return new Response(JSON.stringify({ error:'update_failed', detail: txt }), { status:resp.status, headers:{...cors,'Content-Type':'application/json'} }); }
    return new Response(txt || '[]', { status:200, headers:{...cors,'Content-Type':'application/json'} });
  }catch(e){
    return new Response(JSON.stringify({ error:'bad_request', detail:String(e) }), { status:400, headers:{...cors,'Content-Type':'application/json'} });
  }
}


