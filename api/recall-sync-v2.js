export const config = { runtime: 'edge' };

async function jres(data, status=200, cors){ 
  return new Response(JSON.stringify(data), { 
    status, 
    headers:{ ...(cors||{}), 'Content-Type':'application/json' } 
  }); 
}

export default async function handler(req){
  const cors = {
    'Access-Control-Allow-Origin': req.headers.get('Origin') || '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400'
  };
  
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  
  // Temporary allowlist gate until per-user scoping is implemented
  const SUPABASE_URL = process.env.SUPABASE_URL || '';
  const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SERVICE_KEY || '';
  const ALLOWED_EMAILS = ['ggg@fvtura.com'];
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
  const email = (user?.email||'').toLowerCase();
  if (!email || !ALLOWED_EMAILS.includes(email)){
    return jres({ error:'Forbidden', message:'Access denied' }, 403, cors);
  }

  // Get environment variables
  const RECALL_KEY = process.env.RECALL_API_KEY || process.env.RECALL_KEY || process.env.RECALL || '';
  // SUPABASE_URL and SERVICE_KEY already declared above
  
  if (!RECALL_KEY || !SUPABASE_URL || !SERVICE_KEY){
    return jres({ 
      error: 'Missing configuration',
      has_recall: Boolean(RECALL_KEY),
      has_supabase_url: Boolean(SUPABASE_URL),
      has_service_key: Boolean(SERVICE_KEY)
    }, 500, cors);
  }
  
  // Determine region and base URL
  const region = (process.env.RECALL_REGION || 'us').trim().toLowerCase();
  const regionBases = {
    'us': 'https://us-west-2.recall.ai',
    'eu': 'https://eu-west-1.recall.ai', 
    'jp': 'https://ap-northeast-1.recall.ai',
    'payg': 'https://api.recall.ai'
  };
  const base = regionBases[region] || regionBases.us;
  
  // Get or create Meetings space
  let spaceId = '';
  try {
    const q = await fetch(`${SUPABASE_URL}/rest/v1/spaces?select=id,name&name=ilike.meetings`, {
      headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` }
    });
    const spaces = await q.json().catch(() => []);
    
    if (spaces.length > 0) {
      spaceId = spaces[0].id;
    } else {
      // Create Meetings space
      const r = await fetch(`${SUPABASE_URL}/rest/v1/spaces`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: SERVICE_KEY,
          Authorization: `Bearer ${SERVICE_KEY}`
        },
        body: JSON.stringify({ name: 'Meetings', visibility: 'private' })
      });
      const created = await r.json().catch(() => ({}));
      spaceId = created?.[0]?.id || created?.id || '';
    }
  } catch(e) {
    return jres({ error: 'Failed to access Meetings space', details: e.message }, 500, cors);
  }
  
  const debugInfo = {
    region: region,
    base: base,
    bots_found: 0,
    transcripts_fetched: 0,
    errors: []
  };
  
  let imported = 0;
  let skipped = 0;
  let failed = 0;
  const processedTitles = [];
  
  try {
    // Step 1: List all bots (with pagination)
    const allBots = [];
    let nextUrl = `${base}/api/v1/bot/?limit=100`;
    let pageCount = 0;
    
    while (nextUrl && pageCount < 10) { // Max 10 pages to prevent infinite loop
      pageCount++;
      
      const botsResponse = await fetch(nextUrl, {
        headers: {
          'Authorization': `Token ${RECALL_KEY}`,
          'Accept': 'application/json'
        }
      });
      
      if (!botsResponse.ok) {
        debugInfo.errors.push(`Failed to list bots on page ${pageCount}: ${botsResponse.status} ${botsResponse.statusText}`);
        break;
      }
      
      const botsData = await botsResponse.json();
      
      // Debug first page structure
      if (pageCount === 1) {
        debugInfo.raw_response_keys = Object.keys(botsData);
        debugInfo.is_array = Array.isArray(botsData);
        debugInfo.has_results = 'results' in botsData;
        debugInfo.has_next = 'next' in botsData;
      }
      
      const pageBots = Array.isArray(botsData) ? botsData : (botsData.results || []);
      allBots.push(...pageBots);
      
      // Check for next page
      nextUrl = botsData.next || null;
      if (nextUrl && !nextUrl.startsWith('http')) {
        nextUrl = `${base}${nextUrl}`;
      }
    }
    
    const bots = allBots;
    debugInfo.bots_found = bots.length;
    debugInfo.pages_fetched = pageCount;
    
    // Step 2: For each bot, check if it's completed and get its transcript
    for (const bot of bots) {
      try {
        const botId = bot.id;
        const status = bot.status?.code || bot.status || '';
        
        // Track bot statuses for debugging
        if (!debugInfo.bot_statuses) {
          debugInfo.bot_statuses = {};
        }
        debugInfo.bot_statuses[status] = (debugInfo.bot_statuses[status] || 0) + 1;
        
        // Only process completed bots - check multiple status formats
        const isCompleted = status === 'done' || 
                          status === 'completed' || 
                          status === 'finished' ||
                          status === 'complete';
        
        if (!isCompleted) {
          continue;
        }
        
        // Get bot details with transcript
        const transcriptUrl = `${base}/api/v1/bot/${botId}/`;
        const transcriptResponse = await fetch(transcriptUrl, {
          headers: {
            'Authorization': `Token ${RECALL_KEY}`,
            'Accept': 'application/json'
          }
        });
        
        if (!transcriptResponse.ok) {
          debugInfo.errors.push(`Failed to get bot ${botId}: ${transcriptResponse.status}`);
          continue;
        }
        
        const botDetails = await transcriptResponse.json();
        debugInfo.transcripts_fetched++;
        
        // Extract transcript text - it might be in different fields
        let text = '';
        let title = botDetails.meeting_url || botDetails.meeting_title || '';
        
        // Try to get transcript text from various possible locations
        if (botDetails.transcript) {
          if (typeof botDetails.transcript === 'string') {
            text = botDetails.transcript;
          } else if (botDetails.transcript.text) {
            text = botDetails.transcript.text;
          } else if (botDetails.transcript.transcript_text) {
            text = botDetails.transcript.transcript_text;
          }
        }
        
        // If no transcript in bot details, try the transcript endpoint
        if (!text && botDetails.transcript_id) {
          const transcriptTextUrl = `${base}/api/v1/transcript/${botDetails.transcript_id}/`;
          const textResponse = await fetch(transcriptTextUrl, {
            headers: {
              'Authorization': `Token ${RECALL_KEY}`,
              'Accept': 'application/json'
            }
          });
          
          if (textResponse.ok) {
            const transcriptData = await textResponse.json();
            text = transcriptData.text || transcriptData.transcript || transcriptData.transcript_text || '';
          }
        }
        
        if (!text) {
          debugInfo.errors.push(`No transcript text for bot ${botId}`);
          skipped++;
          continue;
        }
        
        // Clean up title
        if (!title) {
          title = `Recall Meeting ${new Date(botDetails.created_at || Date.now()).toLocaleDateString()}`;
        }
        title = title.replace(/https?:\/\/[^\s]+/g, '').trim();
        if (title.length > 100) {
          title = title.substring(0, 100) + '...';
        }
        
        // Check for duplicates - look for exact title match
        const fullTitle = `[Recall] ${title}`;
        const checkDupe = await fetch(
          `${SUPABASE_URL}/rest/v1/notes?select=id,title&space_id=eq.${spaceId}&title=eq.${encodeURIComponent(fullTitle)}`,
          { headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` } }
        );
        const existing = await checkDupe.json().catch(() => []);
        
        if (existing.length > 0) {
          skipped++;
          processedTitles.push(`[SKIP] ${title} (already exists)`);
          debugInfo.errors.push(`Skipped duplicate: ${fullTitle}`);
          continue;
        }
        
        // Save to database (without metadata field which doesn't exist in the table)
        const saveResponse = await fetch(`${SUPABASE_URL}/rest/v1/notes`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            apikey: SERVICE_KEY,
            Authorization: `Bearer ${SERVICE_KEY}`
          },
          body: JSON.stringify({
            space_id: spaceId,
            title: `[Recall] ${title}`,
            content: text
            // Removed metadata field - table doesn't have this column
          })
        });
        
        if (saveResponse.ok) {
          imported++;
          processedTitles.push(`[NEW] ${title}`);
        } else {
          failed++;
          const error = await saveResponse.text();
          debugInfo.errors.push(`Failed to save "${title}": ${error}`);
        }
        
      } catch(e) {
        failed++;
        debugInfo.errors.push(`Processing error: ${e.message}`);
      }
    }
    
  } catch(e) {
    return jres({ 
      error: 'Sync failed', 
      details: e.message,
      debug: debugInfo
    }, 500, cors);
  }
  
  return jres({
    success: true,
    summary: {
      bots_found: debugInfo.bots_found,
      transcripts_fetched: debugInfo.transcripts_fetched,
      imported: imported,
      skipped: skipped,
      failed: failed,
      space_id: spaceId
    },
    processed: processedTitles.slice(0, 10),
    errors: debugInfo.errors.slice(0, 5),
    debug: debugInfo,  // Include full debug info
    region: region,
    timestamp: new Date().toISOString()
  }, 200, cors);
}