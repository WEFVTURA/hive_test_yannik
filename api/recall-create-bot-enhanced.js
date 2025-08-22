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
  const RECALL_REGION = (process.env.RECALL_REGION || 'us').toLowerCase();
  const RECALL_BASE_URL = (process.env.RECALL_BASE_URL || '').trim();
  const regionBases = {
    us: 'https://us-west-2.recall.ai',
    eu: 'https://eu-west-1.recall.ai',
    jp: 'https://ap-northeast-1.recall.ai',
    payg: 'https://api.recall.ai'
  };
  const RECALL_BASE = (RECALL_BASE_URL || regionBases[RECALL_REGION] || regionBases.us).replace(/\/$/, '');
  
  // Quick env validation with actionable messages
  if (!SUPABASE_URL || !SERVICE_KEY) {
    return jres({ error: 'Server misconfiguration', details: 'Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY' }, 500, cors);
  }
  if (!RECALL_API_KEY) {
    return jres({ error: 'Bot provider not configured', details: 'Missing RECALL_API_KEY on server' }, 500, cors);
  }
  
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

    // Relaxed validation: only require http(s); do not block unfamiliar domains
    const urlStr = String(meeting_url || '').trim();
    const validUrl = /^(https?:\/\/).+$/i.test(urlStr);
    const looksLikeKnown = /(zoom\.us\/|meet\.google\.com\/|teams\.microsoft\.com\/|teams\.live\.com\/)/i.test(urlStr);
    if (!validUrl) {
      return jres({ error: 'Invalid meeting link', details: 'URL must start with http(s)://' }, 400, cors);
    }
    
    // STEP 1: Store the meeting URL with user association IMMEDIATELY
    await fetch(`${SUPABASE_URL}/rest/v1/meeting_urls`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: SERVICE_KEY,
        Authorization: `Bearer ${SERVICE_KEY}`,
        'Prefer': 'resolution=merge-duplicates'
      },
      body: JSON.stringify({
        user_id: userId,
        url: urlStr,
        created_at: new Date().toISOString(),
        metadata: {
          user_email: user.email,
          source: 'meeting_intelligence',
          status: 'requested',
          url_validation: { valid_scheme: true, looks_like_known: looksLikeKnown }
        }
      })
    });
    
    // STEP 2: Create the bot via Recall API (direct join)
    const botResp = await fetch(`${RECALL_BASE}/api/v1/bot/`, {
      method: 'POST',
      headers: {
        'Authorization': `Token ${RECALL_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        meeting_url: urlStr,
        bot_name: 'HIVE Assistant',
        // Use modern recording configuration to enable transcripts
        recording_config: { transcript: {} }
      })
    });
    
    if (!botResp.ok) {
      const status = botResp.status;
      let errorText = '';
      try { errorText = await botResp.text(); } catch {}

      // Mark failure on meeting_urls metadata
      try {
        await fetch(`${SUPABASE_URL}/rest/v1/meeting_urls`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, 'Prefer': 'resolution=merge-duplicates' },
          body: JSON.stringify({
            user_id: userId,
            url: urlStr,
            metadata: { status: 'failed', provider_error: String(errorText).slice(0, 500), http_status: status }
          })
        });
      } catch {}

      return jres({ 
        error: 'Failed to create bot', 
        http_status: status,
        details: errorText || 'Provider rejected the request. Check meeting link, account limits, and API key.'
      }, 502, cors);
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
          meeting_url: urlStr,
          created_at: new Date().toISOString()
        })
      });

      // Update meeting_urls with success status
      try {
        await fetch(`${SUPABASE_URL}/rest/v1/meeting_urls`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, 'Prefer': 'resolution=merge-duplicates' },
          body: JSON.stringify({ user_id: userId, url: urlStr, metadata: { status: 'launched', bot_id: botId } })
        });
      } catch {}
    }
    
    return jres({
      success: true,
      bot_id: botId,
      message: 'Bot created and automatically associated with your account',
      meeting_url: urlStr
    }, 200, cors);
    
  } catch(e) {
    return jres({ 
      error: 'Failed to create bot', 
      details: e.message 
    }, 500, cors);
  }
}