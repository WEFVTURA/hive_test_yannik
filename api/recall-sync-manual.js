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
  
  // Get environment variables
  const RECALL_KEY = process.env.RECALL_API_KEY || process.env.RECALL_KEY || '';
  const SUPABASE_URL = process.env.SUPABASE_URL || '';
  const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SERVICE_KEY || '';
  
  if (!RECALL_KEY || !SUPABASE_URL || !SERVICE_KEY){
    return jres({ error: 'Missing configuration' }, 500, cors);
  }
  
  // Determine region
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
  
  // Fetch all Recall transcripts
  const allTranscripts = [];
  const errors = [];
  const debugInfo = {
    region: region,
    base: base,
    attempts: []
  };
  
  try {
    // Try multiple endpoints
    const endpoints = [
      `${base}/api/v1/bot/`,
      `${base}/api/v1/transcript/`,
      `${base}/api/v1/transcripts/`,
      `${base}/api/v2/bot/`
    ];
    
    for (const endpoint of endpoints) {
      try {
        let url = `${endpoint}?limit=100`;
        let page = 0;
        
        while (url && page < 10) { // Max 10 pages to prevent infinite loop
          page++;
          
          const response = await fetch(url, {
            headers: {
              'Authorization': `Token ${RECALL_KEY}`,
              'Accept': 'application/json'
            }
          });
          
          debugInfo.attempts.push({
            url: url,
            status: response.status,
            statusText: response.statusText
          });
          
          if (!response.ok) {
            errors.push(`${endpoint}: ${response.status} ${response.statusText}`);
            break;
          }
          
          const data = await response.json();
          const items = Array.isArray(data) ? data : (data.results || data.data || []);
          
          // Add ALL items first to see what we're getting
          debugInfo.attempts[debugInfo.attempts.length - 1].itemCount = items.length;
          debugInfo.attempts[debugInfo.attempts.length - 1].sampleItem = items.length > 0 ? JSON.stringify(items[0]).slice(0, 200) : 'no items';
          
          // Filter for completed bots/transcripts
          const completed = items.filter(item => {
            const status = item?.status?.code || item?.status || item?.state || '';
            const statusStr = String(status).toLowerCase();
            // Also check for 'done' status which Recall uses
            return statusStr === 'done' || statusStr === 'completed' || statusStr === 'finished' || status === 'done';
          });
          
          debugInfo.attempts[debugInfo.attempts.length - 1].completedCount = completed.length;
          allTranscripts.push(...completed);
          
          // Check for pagination
          url = data?.next || data?.links?.next || null;
          if (url && url.startsWith('/')) {
            url = `${base}${url}`;
          }
        }
        
        if (allTranscripts.length > 0) break; // Stop if we found transcripts
      } catch(e) {
        errors.push(`${endpoint}: ${e.message}`);
      }
    }
  } catch(e) {
    return jres({ error: 'Failed to fetch from Recall', details: e.message, errors }, 500, cors);
  }
  
  // Process and save transcripts
  let imported = 0;
  let skipped = 0;
  let failed = 0;
  const processedTitles = [];
  
  for (const item of allTranscripts) {
    try {
      // Extract ID and title
      const id = item?.id || item?.transcript_id || '';
      const botId = item?.bot_id || item?.id || '';
      let title = item?.meeting_title || item?.meeting_url || '';
      
      if (!title) {
        title = `Recall Meeting ${new Date(item?.created_at || Date.now()).toLocaleDateString()}`;
      }
      
      // Clean up title
      title = title.replace(/https?:\/\/[^\s]+/g, '').trim();
      if (title.length > 100) {
        title = title.substring(0, 100) + '...';
      }
      
      // Get transcript text
      let text = '';
      
      // Try to get transcript directly
      if (item?.transcript_text) {
        text = item.transcript_text;
      } else if (item?.data?.transcript_text) {
        text = item.data.transcript_text;
      } else if (item?.data?.download_url) {
        // Fetch from download URL
        try {
          const dlResponse = await fetch(item.data.download_url);
          const dlData = await dlResponse.json();
          text = dlData?.transcript || dlData?.text || JSON.stringify(dlData);
        } catch(e) {
          errors.push(`Failed to download transcript: ${e.message}`);
        }
      } else if (botId) {
        // Try to fetch transcript by bot ID
        try {
          const transcriptUrl = `${base}/api/v1/bot/${botId}/transcript/`;
          const tResponse = await fetch(transcriptUrl, {
            headers: {
              'Authorization': `Token ${RECALL_KEY}`,
              'Accept': 'application/json'
            }
          });
          
          if (tResponse.ok) {
            const tData = await tResponse.json();
            text = tData?.text || tData?.transcript || JSON.stringify(tData);
          }
        } catch(e) {
          errors.push(`Failed to fetch transcript for bot ${botId}: ${e.message}`);
        }
      }
      
      if (!text) {
        skipped++;
        continue;
      }
      
      // Check for duplicates
      const checkDupe = await fetch(
        `${SUPABASE_URL}/rest/v1/notes?select=id&space_id=eq.${spaceId}&title=ilike.${encodeURIComponent(title)}`,
        { headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` } }
      );
      const existing = await checkDupe.json().catch(() => []);
      
      if (existing.length > 0) {
        skipped++;
        processedTitles.push(`[SKIP] ${title}`);
        continue;
      }
      
      // Save to database
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
          content: text,
          metadata: {
            source: 'recall',
            bot_id: botId,
            transcript_id: id,
            synced_at: new Date().toISOString()
          }
        })
      });
      
      if (saveResponse.ok) {
        imported++;
        processedTitles.push(`[NEW] ${title}`);
      } else {
        failed++;
        const error = await saveResponse.text();
        errors.push(`Failed to save "${title}": ${error}`);
      }
      
    } catch(e) {
      failed++;
      errors.push(`Processing error: ${e.message}`);
    }
  }
  
  return jres({
    success: true,
    summary: {
      total_found: allTranscripts.length,
      imported: imported,
      skipped: skipped,
      failed: failed,
      space_id: spaceId
    },
    processed: processedTitles.slice(0, 10), // Show first 10
    errors: errors.slice(0, 5), // Show first 5 errors
    debug: debugInfo,
    timestamp: new Date().toISOString()
  }, 200, cors);
}