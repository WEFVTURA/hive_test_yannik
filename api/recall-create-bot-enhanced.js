// Enhanced bot creation that stores URL-to-user mapping
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
  const RECALL_API_KEY = process.env.RECALL_API_KEY || '';
  
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
    const { meeting_url } = await req.json();
    
    if (!meeting_url) {
      return jres({ error: 'Meeting URL required' }, 400, cors);
    }
    
    // STEP 1: Store the meeting URL with user association IMMEDIATELY
    await fetch(`${SUPABASE_URL}/rest/v1/meeting_urls`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: SERVICE_KEY,
        Authorization: `Bearer ${SERVICE_KEY}`
      },
      body: JSON.stringify({
        user_id: userId,
        url: meeting_url,
        created_at: new Date().toISOString(),
        metadata: {
          user_email: user.email,
          source: 'meeting_intelligence'
        }
      })
    });
    
    // STEP 2: Create the bot via Recall API
    const botResp = await fetch('https://api.recall.ai/api/v1/bot/', {
      method: 'POST',
      headers: {
        'Authorization': `Token ${RECALL_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        meeting_url: meeting_url,
        bot_name: 'HIVE Assistant',
        transcription_options: {
          provider: 'default'
        }
      })
    });
    
    if (!botResp.ok) {
      const error = await botResp.text();
      return jres({ 
        error: 'Failed to create bot', 
        details: error 
      }, 500, cors);
    }
    
    const botData = await botResp.json();
    const botId = botData.id || botData.bot_id;
    
    // STEP 3: Immediately create bot-to-user mapping
    if (botId) {
      await fetch(`${SUPABASE_URL}/rest/v1/recall_bots`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: SERVICE_KEY,
          Authorization: `Bearer ${SERVICE_KEY}`,
          'Prefer': 'resolution=merge-duplicates'
        },
        body: JSON.stringify({
          bot_id: botId,
          user_id: userId,
          meeting_url: meeting_url,
          created_at: new Date().toISOString()
        })
      });
    }
    
    return jres({
      success: true,
      bot_id: botId,
      message: 'Bot created and automatically associated with your account',
      meeting_url: meeting_url
    }, 200, cors);
    
  } catch(e) {
    return jres({ 
      error: 'Failed to create bot', 
      details: e.message 
    }, 500, cors);
  }
}