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
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };
  
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  
  const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || process.env.REACT_APP_SUPABASE_URL || '';
  const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || process.env.SERVICE_KEY || '';
  
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
  
  const RECALL_KEY = process.env.RECALL_API_KEY || process.env.RECALL_KEY || process.env.RECALL || '';
  const region = (process.env.RECALL_REGION || 'us').trim().toLowerCase();
  
  if (!RECALL_KEY) {
    return jres({ error: 'No Recall API key configured' }, 500, cors);
  }
  
  const regionBases = {
    'us': 'https://us-west-2.recall.ai',
    'eu': 'https://eu-west-1.recall.ai', 
    'jp': 'https://ap-northeast-1.recall.ai',
    'payg': 'https://api.recall.ai'
  };
  const base = regionBases[region] || regionBases.us;
  
  const results = {
    transcripts: [],
    total: 0,
    debug: {
      base: base,
      endpoint: '/api/v1/transcript/',
      attempts: []
    }
  };
  
  try {
    const user = await getUser();
    const userId = user?.id || '';
    if (!userId) return jres({ error:'Forbidden' }, 401, cors);

    //-- Backfill logic start --//
    try {
      await backfillUserTranscripts(user);
    } catch(e) {
      console.error('Backfill failed:', e.message);
    }
    //-- Backfill logic end --//

    const ownedBotsResp = await fetch(`${SUPABASE_URL}/rest/v1/recall_bots?select=bot_id,meeting_url&user_id=eq.${userId}`, { 
      headers:{ apikey: SERVICE_KEY, Authorization:`Bearer ${SERVICE_KEY}` } 
    });
    if (!ownedBotsResp.ok) throw new Error('failed_to_fetch_owned_bots');
    const ownedBots = await ownedBotsResp.json().catch(()=>[]);
    
    // Get meeting URLs the user participated in
    const meetingUrls = [...new Set((ownedBots||[]).map(b => b.meeting_url).filter(Boolean))];
    
    let participantBots = [];
    if (meetingUrls.length > 0) {
      // Build a filter like meeting_url=in.("url1","url2")
      const urlFilter = `meeting_url=in.(${meetingUrls.map(u => `"${u}"`).join(',')})`;
      const participantBotsResp = await fetch(`${SUPABASE_URL}/rest/v1/recall_bots?select=bot_id&${urlFilter}`, { 
        headers:{ apikey: SERVICE_KEY, Authorization:`Bearer ${SERVICE_KEY}` } 
      });
      if (participantBotsResp.ok) {
        participantBots = await participantBotsResp.json().catch(()=>[]);
      }
    }

    // Combine owned and participant bot IDs
    const ownedBotIds = (ownedBots||[]).map(r => r.bot_id);
    const participantBotIds = (participantBots||[]).map(r => r.bot_id);
    const allowedIds = new Set([...ownedBotIds, ...participantBotIds]);

    // If a user has no bots at all, return empty list.
    if (allowedIds.size === 0) {
      return jres({ success: true, transcripts: [], total: 0, debug: results.debug }, 200, cors);
    }
    
    // Use the exact endpoint from Recall documentation
    let url = `${base}/api/v1/transcript/?status_code=done&limit=100`;
    let pageCount = 0;
    
    while (url && pageCount < 10) { // Max 10 pages
      pageCount++;
      
      const response = await fetch(url, {
        headers: {
          'Accept': 'application/json',
          'Authorization': `Token ${RECALL_KEY}`
        }
      });
      
      results.debug.attempts.push({
        page: pageCount,
        url: url,
        status: response.status,
        statusText: response.statusText
      });
      
      if (!response.ok) {
        const errorText = await response.text().catch(() => '');
        results.debug.error = `Failed: ${response.status} - ${errorText.substring(0, 200)}`;
        break;
      }
      
      const data = await response.json();
      
      // Handle pagination response structure
      const items = data.results || data.data || (Array.isArray(data) ? data : []);
      
      for (const transcript of items) {
        // Skip transcripts not belonging to this user (no bot_id or not in allowed set)
        const tBotId = transcript.bot_id || transcript.recording_id || transcript.id || null;
        if (!tBotId || !allowedIds.has(tBotId)) continue;
        
        // Fetch the actual transcript content
        let transcriptText = '';
        let botInfo = {};
        
        // If we have a recording_id, try to get more info
        if (transcript.recording_id) {
          try {
            // Try to get recording details
            const recordingUrl = `${base}/api/v2/recordings/${transcript.recording_id}/`;
            const recResp = await fetch(recordingUrl, {
              headers: {
                'Accept': 'application/json',
                'Authorization': `Token ${RECALL_KEY}`
              }
            });
            
            if (recResp.ok) {
              const recData = await recResp.json();
              botInfo = {
                bot_id: recData.bot_id,
                meeting_url: recData.meeting_url,
                participants: recData.participants
              };
            }
          } catch(e) {
            // Ignore errors fetching additional info
          }
        }
        
        // Get transcript text from download URL if provided
        if (transcript.data?.download_url) {
          try {
            // Fetch the transcript from the download URL
            const downloadResp = await fetch(transcript.data.download_url);
            if (downloadResp.ok) {
              const downloadData = await downloadResp.json();
              
              // Store raw JSON to preserve speaker names
              if (Array.isArray(downloadData) || (downloadData && typeof downloadData === 'object')) {
                transcriptText = JSON.stringify(downloadData);
              } else {
                transcriptText = downloadData;
              }
            }
          } catch(e) {
            results.debug.transcript_fetch_error = `Download failed: ${e.message}`;
          }
        }
        // Fallback to transcript_url if no download_url
        else if (transcript.transcript_url) {
          try {
            const tResp = await fetch(transcript.transcript_url, {
              headers: {
                'Accept': 'application/json',
                'Authorization': `Token ${RECALL_KEY}`
              }
            });
            
            if (tResp.ok) {
              const tData = await tResp.json();
              
              if (Array.isArray(tData)) {
                transcriptText = tData.map(seg => {
                  const speaker = seg.speaker || seg.speaker_name || `Speaker ${seg.speaker_id || 'Unknown'}`;
                  const text = seg.text || (seg.words ? seg.words.map(w => w.text || w.word || w).join(' ') : '');
                  return `${speaker}: ${text}`;
                }).join('\n\n');
              } else if (typeof tData === 'string') {
                transcriptText = tData;
              } else if (tData.text) {
                transcriptText = tData.text;
              } else if (tData.transcript) {
                transcriptText = tData.transcript;
              }
            }
          } catch(e) {
            results.debug.transcript_fetch_error = e.message;
          }
        }
        
        // Or try direct transcript endpoint
        if (!transcriptText && transcript.id) {
          try {
            const directUrl = `${base}/api/v1/transcript/${transcript.id}/`;
            const directResp = await fetch(directUrl, {
              headers: {
                'Accept': 'application/json',
                'Authorization': `Token ${RECALL_KEY}`
              }
            });
            
            if (directResp.ok) {
              const directData = await directResp.json();
              
              if (directData.transcript) {
                if (Array.isArray(directData.transcript)) {
                  transcriptText = directData.transcript.map(seg => 
                    `${seg.speaker || 'Unknown'}: ${seg.text || ''}`
                  ).join('\n\n');
                } else if (typeof directData.transcript === 'string') {
                  transcriptText = directData.transcript;
                }
              }
            }
          } catch(e) {
            // Ignore
          }
        }
        
        results.transcripts.push({
          id: transcript.id,
          recording_id: transcript.recording_id,
          status: transcript.status_code || transcript.status,
          created_at: transcript.created_at,
          updated_at: transcript.updated_at,
          transcript_url: transcript.transcript_url,
          has_transcript: Boolean(transcriptText),
          transcript_length: transcriptText.length,
          transcript_preview: transcriptText.substring(0, 500),
          full_transcript: transcriptText,
          bot_id: botInfo.bot_id || transcript.bot_id,
          meeting_url: botInfo.meeting_url || '',
          title: `Transcript ${new Date(transcript.created_at).toLocaleString()}`
        });
      }
      
      // Check for next page
      url = data.next || null;
      if (url && !url.startsWith('http')) {
        url = `${base}${url}`;
      }
    }
    
    results.total = results.transcripts.length;
    
  } catch(e) {
    return jres({ 
      error: 'Failed to fetch transcripts', 
      details: e.message,
      debug: results.debug
    }, 500, cors);
  }
  
  return jres({
    success: true,
    transcripts: results.transcripts,
    total: results.total,
    debug: results.debug
  }, 200, cors);
}

async function backfillUserTranscripts(user){
  const SUPABASE_URL = process.env.SUPABASE_URL || '';
  const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SERVICE_KEY || '';
  const RECALL_KEY = process.env.RECALL_API_KEY || process.env.RECALL_KEY || process.env.RECALL || '';
  const userId = user?.id || '';
  const userEmail = user?.email || '';

  if (!userId || !userEmail) return;

  const allBotsResp = await fetch(`${SUPABASE_URL}/rest/v1/recall_bots?select=bot_id`, { 
      headers:{ apikey: SERVICE_KEY, Authorization:`Bearer ${SERVICE_KEY}` } 
  });
  const allBotsData = await allBotsResp.json();
  const mappedBotIds = new Set(allBotsData.map(b => b.bot_id));

  const region = (process.env.RECALL_REGION || 'us').trim().toLowerCase();
  const regionBases = {
    'us': 'https://us-west-2.recall.ai',
    'eu': 'https://eu-west-1.recall.ai', 
    'jp': 'https://ap-northeast-1.recall.ai',
    'payg': 'https://api.recall.ai'
  };
  const base = regionBases[region] || regionBases.us;
  let nextUrl = `${base}/api/v1/transcript/?limit=100`;
  
  let candidates = [];
  let guard = 0;
  while (nextUrl && guard < 20){
    guard++;
    const resp = await fetch(nextUrl, { headers: { Authorization:`Token ${RECALL_KEY}`, Accept:'application/json' } });
    if(!resp.ok) break;
    const data = await resp.json();
    const chunk = Array.isArray(data?.results) ? data.results : [];
    if (chunk.length) candidates.push(...chunk);
    nextUrl = data?.next || '';
    if (nextUrl && nextUrl.startsWith('/')) nextUrl = `${base}${nextUrl}`;
  }

  const unmappedCandidates = candidates.filter(c => !mappedBotIds.has(c.bot_id || c.recording_id || c.id));

  const userBots = [];
  for (const transcript of unmappedCandidates) {
    if (transcript.recording_id) {
      const recordingUrl = `https://api.recall.ai/api/v2/recordings/${transcript.recording_id}/`;
      const recResp = await fetch(recordingUrl, {
        headers: { 'Accept': 'application/json', 'Authorization': `Token ${RECALL_KEY}` }
      });
      if (recResp.ok) {
        const recData = await recResp.json();
        const participants = recData.participants || [];
        if (participants.some(p => p.email && p.email.toLowerCase() === userEmail.toLowerCase())) {
          userBots.push(transcript);
        }
      }
    }
  }
  
  for(const bot of userBots){
      const mapId = bot.bot_id || bot.recording_id || bot.id;
      await fetch(`${SUPABASE_URL}/rest/v1/recall_bots`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: SERVICE_KEY,
          Authorization: `Bearer ${SERVICE_KEY}`,
          'Prefer': 'resolution=merge-duplicates'
        },
        body: JSON.stringify({ bot_id: mapId, user_id: userId })
      });
  }
}