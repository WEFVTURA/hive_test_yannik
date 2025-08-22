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
  
  async function tryCreateRecallBot(meetingUrl){
    const bases = [RECALL_BASE];
    if (!RECALL_BASE_URL) bases.push('https://api.recall.ai'); // fallback to PAYG host
    const headerVariants = [
      { Authorization: `Token ${RECALL_API_KEY}`, 'Content-Type': 'application/json' },
      { 'X-Api-Key': RECALL_API_KEY, 'Content-Type': 'application/json' }
    ];
    const attempts = [];
    for (const base of bases){
      for (const headers of headerVariants){
        const url = `${base}/api/v1/bot/`;
        try{
          const resp = await fetch(url, { method:'POST', headers, body: JSON.stringify({ meeting_url: meetingUrl, bot_name: 'HIVE Assistant', recording_config: { transcript: {} } }) });
          const text = await resp.text().catch(()=> '');
          attempts.push({ url, headers: Object.keys(headers), status: resp.status, body: text.slice(0, 500) });
          if (resp.ok){
            try{ return { ok:true, data: JSON.parse(text), attempts }; }catch{ return { ok:true, data: {}, attempts }; }
          }
        }catch(e){
          attempts.push({ url, headers: Object.keys(headers), error: String(e) });
        }
      }
    }
    return { ok:false, attempts };
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
    
    // STEP 2: Create the bot via Recall API (direct join) with robust retries
    const attempt = await tryCreateRecallBot(urlStr);
    if (!attempt.ok) {
      const status = 502;
      const errorText = JSON.stringify({ attempts: attempt.attempts });

      // Mark failure on meeting_urls metadata
      try {
        await fetch(`${SUPABASE_URL}/rest/v1/meeting_urls`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, 'Prefer': 'resolution=merge-duplicates' },
          body: JSON.stringify({
            user_id: userId,
            url: urlStr,
            metadata: { status: 'failed', provider_error: String(errorText).slice(0, 500), http_status: status, attempts: attempt.attempts }
          })
        });
      } catch {}

      return jres({ 
        error: 'Failed to create bot', 
        http_status: status,
        details: 'Provider rejected the request. See attempts for diagnostics.',
        attempts: attempt.attempts
      }, 502, cors);
    }
    
    const botData = attempt.data || {};
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