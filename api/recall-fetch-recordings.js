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
    return jres({ error: 'Forbidden', message:'Access denied' }, 403, cors);
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
    recordings: [],
    bots: [],
    transcripts: [],
    debug: {
      base: base,
      attempts: []
    }
  };
  
  try {
    // Method 1: Try to fetch recordings directly
    const recordingsUrl = `${base}/api/v2/recordings/?limit=50`;
    const recordingsResp = await fetch(recordingsUrl, {
      headers: {
        'Authorization': `Token ${RECALL_KEY}`,
        'Accept': 'application/json'
      }
    });
    
    results.debug.attempts.push({
      method: 'recordings',
      url: recordingsUrl,
      status: recordingsResp.status
    });
    
    if (recordingsResp.ok) {
      const recordingsData = await recordingsResp.json();
      const recordings = recordingsData.results || recordingsData.data || recordingsData;
      
      if (Array.isArray(recordings)) {
        for (const recording of recordings) {
          // Get transcript for this recording
          let transcriptText = '';
          
          if (recording.transcript_url) {
            try {
              const tResp = await fetch(recording.transcript_url, {
                headers: {
                  'Authorization': `Token ${RECALL_KEY}`,
                  'Accept': 'application/json'
                }
              });
              
              if (tResp.ok) {
                const tData = await tResp.json();
                if (Array.isArray(tData)) {
                  transcriptText = tData.map(seg => 
                    `${seg.speaker || 'Speaker'}: ${seg.text || seg.words?.map(w => w.text).join(' ') || ''}`
                  ).join('\n\n');
                } else if (typeof tData === 'string') {
                  transcriptText = tData;
                } else if (tData.text) {
                  transcriptText = tData.text;
                }
              }
            } catch(e) {
              results.debug.attempts.push({
                error: `Failed to fetch transcript: ${e.message}`
              });
            }
          }
          
          results.recordings.push({
            id: recording.id,
            bot_id: recording.bot_id,
            status: recording.status,
            created_at: recording.created_at,
            transcript_url: recording.transcript_url,
            has_transcript: Boolean(transcriptText),
            transcript_preview: transcriptText.substring(0, 500),
            full_transcript: transcriptText
          });
        }
      }
    }
    
    // Method 2: Get bots and their recordings
    const botsUrl = `${base}/api/v1/bot/?limit=50`;
    const botsResp = await fetch(botsUrl, {
      headers: {
        'Authorization': `Token ${RECALL_KEY}`,
        'Accept': 'application/json'
      }
    });
    
    results.debug.attempts.push({
      method: 'bots',
      url: botsUrl,
      status: botsResp.status
    });
    
    if (botsResp.ok) {
      const botsData = await botsResp.json();
      const bots = botsData.results || botsData.data || botsData;
      
      if (Array.isArray(bots)) {
        for (const bot of bots.slice(0, 20)) { // Limit to 20 to avoid timeout
          try {
            // Get bot details with recording info
            const botDetailUrl = `${base}/api/v1/bot/${bot.id}/`;
            const botDetailResp = await fetch(botDetailUrl, {
              headers: {
                'Authorization': `Token ${RECALL_KEY}`,
                'Accept': 'application/json'
              }
            });
            
            if (botDetailResp.ok) {
              const botDetail = await botDetailResp.json();
              
              // Check for recording ID
              if (botDetail.recording_id) {
                // Fetch recording details
                const recordingUrl = `${base}/api/v2/recordings/${botDetail.recording_id}/`;
                const recResp = await fetch(recordingUrl, {
                  headers: {
                    'Authorization': `Token ${RECALL_KEY}`,
                    'Accept': 'application/json'
                  }
                });
                
                if (recResp.ok) {
                  const recData = await recResp.json();
                  
                  // Get transcript
                  let transcriptText = '';
                  if (recData.transcript) {
                    if (Array.isArray(recData.transcript)) {
                      transcriptText = recData.transcript.map(seg => 
                        `${seg.speaker || 'Speaker'}: ${seg.text || ''}`
                      ).join('\n\n');
                    } else if (typeof recData.transcript === 'string') {
                      transcriptText = recData.transcript;
                    }
                  } else if (recData.transcript_url) {
                    try {
                      const tResp = await fetch(recData.transcript_url, {
                        headers: {
                          'Authorization': `Token ${RECALL_KEY}`,
                          'Accept': 'application/json'
                        }
                      });
                      
                      if (tResp.ok) {
                        const tData = await tResp.json();
                        if (Array.isArray(tData)) {
                          transcriptText = tData.map(seg => 
                            `${seg.speaker || 'Speaker'}: ${seg.text || ''}`
                          ).join('\n\n');
                        }
                      }
                    } catch(e) {}
                  }
                  
                  results.transcripts.push({
                    id: bot.id,
                    recording_id: botDetail.recording_id,
                    title: botDetail.meeting_metadata?.title || bot.meeting_url || `Meeting ${new Date(bot.created_at).toLocaleDateString()}`,
                    status: bot.status?.code || bot.status,
                    created_at: bot.created_at,
                    meeting_url: bot.meeting_url,
                    has_transcript: Boolean(transcriptText),
                    transcript_length: transcriptText.length,
                    transcript_preview: transcriptText.substring(0, 500),
                    full_transcript: transcriptText
                  });
                }
              }
              
              results.bots.push({
                id: bot.id,
                status: bot.status?.code || bot.status,
                recording_id: botDetail.recording_id,
                has_recording: Boolean(botDetail.recording_id),
                meeting_url: bot.meeting_url
              });
            }
          } catch(e) {
            results.debug.attempts.push({
              error: `Bot ${bot.id}: ${e.message}`
            });
          }
        }
      }
    }
    
  } catch(e) {
    return jres({ 
      error: 'Failed to fetch recordings', 
      details: e.message,
      debug: results.debug
    }, 500, cors);
  }
  
  // Combine and deduplicate transcripts
  const allTranscripts = [...results.recordings, ...results.transcripts];
  const uniqueTranscripts = Array.from(
    new Map(allTranscripts.map(t => [t.id || t.recording_id, t])).values()
  );
  
  return jres({
    success: true,
    transcripts: uniqueTranscripts,
    bot_count: results.bots.length,
    recording_count: results.recordings.length,
    debug: results.debug
  }, 200, cors);
}