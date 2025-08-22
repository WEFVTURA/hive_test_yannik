export const config = { runtime: 'edge' };

export default async function handler(req){
  const cors = {
    'Access-Control-Allow-Origin': req.headers.get('Origin') || '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400'
  };
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (req.method !== 'GET') return new Response('Method Not Allowed', { status: 405, headers: cors });

  const SUPABASE_URL = process.env.SUPABASE_URL || '';
  const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SERVICE_KEY || '';
  if (!SUPABASE_URL || !SERVICE_KEY){ return new Response(JSON.stringify({ error:'server_env_missing' }), { status:500, headers:{...cors,'Content-Type':'application/json'} }); }

  // Auth: resolve user
  let user = null;
  try{
    const authz = req.headers.get('authorization') || '';
    const token = authz.startsWith('Bearer ') ? authz.slice(7).trim() : '';
    if (token){
      const r = await fetch(`${SUPABASE_URL}/auth/v1/user`, { headers:{ apikey: SERVICE_KEY, Authorization:`Bearer ${token}` } });
      if (r.ok) user = await r.json();
    }
  }catch{}
  if (!user) return new Response(JSON.stringify({ error:'not_authenticated' }), { status:401, headers:{...cors,'Content-Type':'application/json'} });

  const url = new URL(req.url);
  const type = (url.searchParams.get('type')||'mine').toLowerCase();

  try{
    if (type === 'mine'){
      const r = await fetch(`${SUPABASE_URL}/rest/v1/spaces?select=*&owner_id=eq.${user.id}`, { headers:{ apikey: SERVICE_KEY, Authorization:`Bearer ${SERVICE_KEY}` } });
      const data = await r.json();
      return new Response(JSON.stringify({ spaces: data||[] }), { headers:{...cors,'Content-Type':'application/json'} });
    }
    if (type === 'shared'){
      // Get shares by email -> fetch spaces by ids
      const sharesResp = await fetch(`${SUPABASE_URL}/rest/v1/space_shares?select=space_id,role&email=eq.${encodeURIComponent(user.email||'')}`, { headers:{ apikey: SERVICE_KEY, Authorization:`Bearer ${SERVICE_KEY}` } });
      const shares = await sharesResp.json();
      const ids = Array.from(new Set((shares||[]).map(s=>s.space_id))).filter(Boolean);
      if (ids.length === 0) return new Response(JSON.stringify({ spaces: [] }), { headers:{...cors,'Content-Type':'application/json'} });
      const inList = ids.map(id=>`id.eq.${id}`).join(',');
      const spacesResp = await fetch(`${SUPABASE_URL}/rest/v1/spaces?select=*&or=(${inList})`, { headers:{ apikey: SERVICE_KEY, Authorization:`Bearer ${SERVICE_KEY}` } });
      const spaces = await spacesResp.json();
      return new Response(JSON.stringify({ spaces: spaces||[] }), { headers:{...cors,'Content-Type':'application/json'} });
    }
    if (type === 'public'){
      const r = await fetch(`${SUPABASE_URL}/rest/v1/spaces?select=*&visibility=eq.public`, { headers:{ apikey: SERVICE_KEY, Authorization:`Bearer ${SERVICE_KEY}` } });
      const data = await r.json();
      return new Response(JSON.stringify({ spaces: data||[] }), { headers:{...cors,'Content-Type':'application/json'} });
    }
    return new Response(JSON.stringify({ error:'bad_type' }), { status:400, headers:{...cors,'Content-Type':'application/json'} });
  }catch(e){
    return new Response(JSON.stringify({ error:'list_failed', detail:String(e) }), { status:500, headers:{...cors,'Content-Type':'application/json'} });
  }
}


