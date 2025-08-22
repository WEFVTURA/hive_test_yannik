export const config = { runtime: 'edge' };

function jres(obj, status, cors){ 
  return new Response(JSON.stringify(obj), { 
    status, 
    headers:{ ...(cors||{}), 'Content-Type':'application/json' } 
  }); 
}

export default async function handler(req){
  const cors = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };
  
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (req.method !== 'POST') return jres({ error:'Method not allowed' }, 405, cors);
  
  const SUPABASE_URL = process.env.SUPABASE_URL || '';
  const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SERVICE_KEY || '';
  
  // Authenticate user
  async function getToken(){
    const authz = req.headers.get('authorization') || req.headers.get('Authorization') || '';
    if (authz.startsWith('Bearer ')) return authz.slice(7).trim();
    const cookie = req.headers.get('cookie') || req.headers.get('Cookie') || '';
    const m = cookie.match(/(?:^|;\s*)sb_access_token=([^;]+)/);
    return m ? decodeURIComponent(m[1]) : '';
  }
  
  async function getUser(){
    try{
      const token = await getToken(); 
      if (!token) return null;
      const r = await fetch(`${SUPABASE_URL}/auth/v1/user`, { 
        headers:{ apikey: SERVICE_KEY, Authorization:`Bearer ${token}` } 
      });
      if (!r.ok) return null; 
      return await r.json();
    }catch{ 
      return null; 
    }
  }
  
  const user = await getUser();
  const userId = user?.id || '';
  
  if (!userId) {
    return jres({ error:'Authentication required' }, 401, cors);
  }
  
  try {
    const { bot_id, recording_id } = await req.json();
    
    if (!bot_id && !recording_id) {
      return jres({ error: 'bot_id or recording_id required' }, 400, cors);
    }
    
    // Use bot_id or recording_id as the mapping key
    const mapId = bot_id || recording_id;
    
    // Upsert mapping to recall_bots table
    const mapResp = await fetch(`${SUPABASE_URL}/rest/v1/recall_bots`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: SERVICE_KEY,
        Authorization: `Bearer ${SERVICE_KEY}`,
        'Prefer': 'resolution=merge-duplicates,return=representation'
      },
      body: JSON.stringify({
        bot_id: mapId,
        user_id: userId,
        created_at: new Date().toISOString()
      })
    });
    
    if (!mapResp.ok) {
      const error = await mapResp.text();
      return jres({ 
        error: 'Failed to create mapping', 
        details: error 
      }, 500, cors);
    }
    
    const result = await mapResp.json();
    
    return jres({
      success: true,
      message: `Bot ${mapId} claimed for user ${user.email}`,
      mapping: result?.[0] || result
    }, 200, cors);
    
  } catch(e) {
    return jres({ 
      error: 'Failed to claim bot', 
      details: e.message 
    }, 500, cors);
  }
}