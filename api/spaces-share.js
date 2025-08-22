export const config = { runtime: 'edge' };

export default async function handler(req){
  const cors = {
    'Access-Control-Allow-Origin': req.headers.get('Origin') || '*',
    'Access-Control-Allow-Methods': 'POST, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400'
  };
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (req.method !== 'POST' && req.method !== 'DELETE') return new Response('Method Not Allowed', { status: 405, headers: cors });

  const SUPABASE_URL = process.env.SUPABASE_URL || '';
  const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SERVICE_KEY || '';
  if (!SUPABASE_URL || !SERVICE_KEY){ return new Response(JSON.stringify({ error:'server_env_missing' }), { status:500, headers:{...cors,'Content-Type':'application/json'} }); }

  // Auth: resolve user
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
    const body = await req.json();
    const space_id = body?.space_id || '';
    const email = (body?.email||'').trim();
    const role = (body?.role||'viewer').toLowerCase(); // viewer|editor
    if (!space_id) return new Response(JSON.stringify({ error:'space_id_required' }), { status:400, headers:{...cors,'Content-Type':'application/json'} });

    // Ensure caller owns the space before modifying shares
    const spaceResp = await fetch(`${SUPABASE_URL}/rest/v1/spaces?select=owner_id&id=eq.${space_id}&limit=1`, { headers:{ apikey: SERVICE_KEY, Authorization:`Bearer ${SERVICE_KEY}` } });
    const spaceRows = await spaceResp.json();
    const ownerId = spaceRows?.[0]?.owner_id || '';
    if (!ownerId || ownerId !== me.id){ return new Response(JSON.stringify({ error:'forbidden' }), { status:403, headers:{...cors,'Content-Type':'application/json'} }); }

    if (req.method === 'POST'){
      // Upsert share
      const r = await fetch(`${SUPABASE_URL}/rest/v1/space_shares`, { method:'POST', headers:{ 'Content-Type':'application/json', apikey: SERVICE_KEY, Authorization:`Bearer ${SERVICE_KEY}`, 'Prefer':'resolution=merge-duplicates' }, body: JSON.stringify({ space_id, email, role }) });
      if (!r.ok){ const t = await r.text(); return new Response(JSON.stringify({ error:'share_failed', detail:t }), { status:500, headers:{...cors,'Content-Type':'application/json'} }); }
      return new Response(JSON.stringify({ ok:true }), { headers:{...cors,'Content-Type':'application/json'} });
    } else {
      // DELETE
      const r = await fetch(`${SUPABASE_URL}/rest/v1/space_shares?space_id=eq.${space_id}&email=eq.${encodeURIComponent(email)}`, { method:'DELETE', headers:{ apikey: SERVICE_KEY, Authorization:`Bearer ${SERVICE_KEY}` } });
      if (!r.ok){ const t = await r.text(); return new Response(JSON.stringify({ error:'unshare_failed', detail:t }), { status:500, headers:{...cors,'Content-Type':'application/json'} }); }
      return new Response(JSON.stringify({ ok:true }), { headers:{...cors,'Content-Type':'application/json'} });
    }
  }catch(e){
    return new Response(JSON.stringify({ error:'bad_request', detail:String(e) }), { status:400, headers:{...cors,'Content-Type':'application/json'} });
  }
}


