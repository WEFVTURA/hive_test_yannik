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
    'Access-Control-Max-Age': '86400'
  };
  
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (req.method !== 'POST') return jres({ error:'Method not allowed' }, 405, cors);
  
  // Get authentication
  const SUPABASE_URL = process.env.SUPABASE_URL || '';
  const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SERVICE_KEY || '';
  
  async function getToken(){
    const authz = req.headers.get('authorization') || req.headers.get('Authorization') || '';
    if (authz.startsWith('Bearer ')) return authz.slice(7).trim();
    const cookie = req.headers.get('cookie') || req.headers.get('Cookie') || '';
    const m = cookie.match(/(?:^|;\s*)sb_access_token=([^;]+)/);
    return m ? decodeURIComponent(m[1]) : '';
  }
  
  async function getUser(){
    try{
      const token = await getToken(); if (!token) return null;
      const r = await fetch(`${SUPABASE_URL}/auth/v1/user`, { headers:{ apikey: SERVICE_KEY, Authorization:`Bearer ${token}` } });
      if (!r.ok) return null; return await r.json();
    }catch{ return null; }
  }
  
  const user = await getUser();
  const userId = user?.id || '';
  
  // Require authentication
  if (!userId){
    return jres({ error:'Forbidden', message:'Authentication required' }, 401, cors);
  }
  
  try {
    const { title, content, source = 'manual' } = await req.json();
    
    if (!title || !content) {
      return jres({ error: 'Missing title or content' }, 400, cors);
    }
    
    // SUPABASE_URL and SERVICE_KEY declared above
    
    if (!SUPABASE_URL || !SERVICE_KEY) {
      return jres({ error: 'Missing configuration' }, 500, cors);
    }
    
    // Get or create user's personal Meetings space
    let spaceId = '';
    const spacesResp = await fetch(`${SUPABASE_URL}/rest/v1/spaces?select=id,name&name=eq.Meetings&owner_id=eq.${userId}`, {
      headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` }
    });
    
    if (!spacesResp.ok) {
      const errorText = await spacesResp.text();
      return jres({ 
        error: 'Failed to fetch spaces', 
        details: errorText,
        status: spacesResp.status 
      }, 500, cors);
    }
    
    const spaces = await spacesResp.json();
    
    if (spaces.length > 0) {
      spaceId = spaces[0].id;
    } else {
      // Create user's personal Meetings space
      const createResp = await fetch(`${SUPABASE_URL}/rest/v1/spaces`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: SERVICE_KEY,
          Authorization: `Bearer ${SERVICE_KEY}`,
          'Prefer': 'return=representation'
        },
        body: JSON.stringify({ 
          name: 'Meetings', 
          visibility: 'private',
          owner_id: userId  // Set owner to current user
        })
      });
      
      if (!createResp.ok) {
        const errorText = await createResp.text();
        return jres({ 
          error: 'Failed to create Meetings space', 
          details: errorText,
          status: createResp.status 
        }, 500, cors);
      }
      
      const created = await createResp.json();
      spaceId = created?.[0]?.id || created?.id || '';
    }
    
    if (!spaceId) {
      return jres({ error: 'Failed to access Meetings space' }, 500, cors);
    }
    
    // Save the transcript with proper owner_id
    const saveResp = await fetch(`${SUPABASE_URL}/rest/v1/notes`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: SERVICE_KEY,
        Authorization: `Bearer ${SERVICE_KEY}`,
        'Prefer': 'return=representation'
      },
      body: JSON.stringify({
        space_id: spaceId,
        owner_id: userId,  // Always set owner_id to current user
        title: `[Meeting] ${title}`,  // Use generic [Meeting] prefix
        content: content
      })
    });
    
    if (!saveResp.ok) {
      const error = await saveResp.text();
      return jres({ error: 'Failed to save transcript', details: error }, 500, cors);
    }
    
    const saved = await saveResp.json();
    
    return jres({
      success: true,
      note_id: saved[0]?.id || saved?.id,
      space_id: spaceId,
      message: 'Transcript imported successfully'
    }, 200, cors);
    
  } catch(e) {
    return jres({ error: 'Import failed', details: e.message }, 500, cors);
  }
}