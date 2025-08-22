// Track which user is joining which meeting URL
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
    const { url } = await req.json();
    
    if (!url) {
      return jres({ error: 'Meeting URL required' }, 400, cors);
    }
    
    // Store the meeting URL with user association
    const storeResp = await fetch(`${SUPABASE_URL}/rest/v1/meeting_urls`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: SERVICE_KEY,
        Authorization: `Bearer ${SERVICE_KEY}`,
        'Prefer': 'return=representation'
      },
      body: JSON.stringify({
        user_id: userId,
        url: url,
        created_at: new Date().toISOString(),
        metadata: {
          user_email: user.email,
          tracked_by: 'manual'
        }
      })
    });
    
    if (!storeResp.ok) {
      const error = await storeResp.text();
      return jres({ 
        error: 'Failed to track meeting URL', 
        details: error 
      }, 500, cors);
    }
    
    return jres({
      success: true,
      message: `Meeting URL tracked for ${user.email}`,
      url: url
    }, 200, cors);
    
  } catch(e) {
    return jres({ 
      error: 'Failed to track URL', 
      details: e.message 
    }, 500, cors);
  }
}