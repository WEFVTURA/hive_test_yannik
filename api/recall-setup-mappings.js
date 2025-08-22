// This endpoint helps users set up bot mappings for their existing bots
// It requires the user to provide their Recall bot IDs to claim them

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
    const { bot_ids } = await req.json();
    
    if (!bot_ids || !Array.isArray(bot_ids)) {
      return jres({ 
        error: 'Please provide bot_ids array',
        example: { bot_ids: ['bot-id-1', 'bot-id-2'] }
      }, 400, cors);
    }
    
    const results = {
      created: [],
      failed: [],
      total: bot_ids.length
    };
    
    // Create mappings for each bot
    for (const botId of bot_ids) {
      try {
        const mapResp = await fetch(`${SUPABASE_URL}/rest/v1/recall_bots`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            apikey: SERVICE_KEY,
            Authorization: `Bearer ${SERVICE_KEY}`,
            'Prefer': 'resolution=merge-duplicates,return=representation'
          },
          body: JSON.stringify({
            bot_id: botId,
            user_id: userId,
            created_at: new Date().toISOString()
          })
        });
        
        if (mapResp.ok) {
          results.created.push(botId);
        } else {
          results.failed.push({ bot_id: botId, error: await mapResp.text() });
        }
      } catch(e) {
        results.failed.push({ bot_id: botId, error: e.message });
      }
    }
    
    return jres({
      success: true,
      message: `Mapped ${results.created.length} bots to user ${user.email}`,
      results: results
    }, 200, cors);
    
  } catch(e) {
    return jres({ 
      error: 'Failed to create mappings', 
      details: e.message 
    }, 500, cors);
  }
}