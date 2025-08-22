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
    return jres({ error:'Forbidden', message:'Access denied' }, 403, cors);
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
    bots: [],
    transcripts_found: 0,
    debug: {
      base: base,
      endpoint: '/api/v1/bot/',
      attempts: []
    }
  };
  
  try {
    // First, list all bots
    let url = `${base}/api/v1/bot/?limit=50`;
    let pageCount = 0;
    const allBots = [];
    
    while (url && pageCount < 5) { // Limit pages to avoid timeout
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
        status: response.status
      });
      
      if (!response.ok) {
        const errorText = await response.text().catch(() => '');
        results.debug.error = `Failed to list bots: ${response.status} - ${errorText.substring(0, 200)}`;
        break;
      }
      
      const data = await response.json();
      const bots = data.results || data.data || (Array.isArray(data) ? data : []);
      allBots.push(...bots);
      
      // Check for next page
      url = data.next || null;
      if (url && !url.startsWith('http')) {
        url = `${base}${url}`;
      }
    }
    
    // Now fetch details for each bot including transcript
    for (const [idx, bot] of allBots.slice(0, 30).entries()) { // Limit to 30 to avoid timeout
      try {
        // Get full bot details
        const botUrl = `${base}/api/v1/bot/${bot.id}/`;
        const botResp = await fetch(botUrl, {
          headers: {
            'Accept': 'application/json',
            'Authorization': `Token ${RECALL_KEY}`
          }
        });
        
        if (!botResp.ok) {
          results.debug.bot_errors = results.debug.bot_errors || [];
          results.debug.bot_errors.push(`Bot ${bot.id}: ${botResp.status}`);
          continue;
        }
        
        const botData = await botResp.json();
        
        // Add raw bot data to debug
        if (idx === 0) {
          results.debug.sample_bot_data = {
            keys: Object.keys(botData),
            has_transcript: 'transcript' in botData,
            has_transcript_url: 'transcript_url' in botData,
            has_recording_id: 'recording_id' in botData,
            status: botData.status,
            raw_data: JSON.stringify(botData).substring(0, 1000)
          };
        }
        
        // Extract transcript if available
        let transcriptText = '';
        let transcriptStructure = null;
        
        // Check various possible transcript locations
        if (botData.transcript) {
          transcriptStructure = {
            type: typeof botData.transcript,
            isArray: Array.isArray(botData.transcript),
            keys: typeof botData.transcript === 'object' && !Array.isArray(botData.transcript) ? 
                  Object.keys(botData.transcript).slice(0, 10) : null,
            length: Array.isArray(botData.transcript) ? botData.transcript.length : 
                   typeof botData.transcript === 'string' ? botData.transcript.length : null
          };
          
          if (Array.isArray(botData.transcript)) {
            // Format as speaker segments
            transcriptText = botData.transcript.map((seg, idx) => {
              // Log segment structure for debugging
              if (idx === 0) {
                transcriptStructure.sampleSegment = {
                  keys: Object.keys(seg),
                  hasWords: 'words' in seg,
                  hasText: 'text' in seg,
                  hasSpeaker: 'speaker' in seg,
                  hasSpeakerId: 'speaker_id' in seg
                };
              }
              
              const speaker = seg.speaker || seg.speaker_name || 
                            (seg.speaker_id !== undefined ? `Speaker ${seg.speaker_id}` : 'Unknown');
              
              let text = '';
              if (seg.text) {
                text = seg.text;
              } else if (seg.words && Array.isArray(seg.words)) {
                text = seg.words.map(w => w.text || w.word || w).join(' ');
              }
              
              return text ? `${speaker}: ${text}` : '';
            }).filter(line => line).join('\n\n');
          } else if (typeof botData.transcript === 'string') {
            transcriptText = botData.transcript;
          } else if (botData.transcript.text) {
            transcriptText = botData.transcript.text;
          } else if (botData.transcript.segments) {
            transcriptText = botData.transcript.segments.map(seg => 
              `${seg.speaker || 'Unknown'}: ${seg.text || ''}`
            ).join('\n\n');
          }
        }
        
        // If no transcript in main data, try to get transcript via API
        if (!transcriptText) {
          try {
            // Try the transcript list endpoint for this bot
            const transcriptListUrl = `${base}/api/v1/transcript/?bot_id=${bot.id}`;
            const tListResp = await fetch(transcriptListUrl, {
              headers: {
                'Accept': 'application/json',
                'Authorization': `Token ${RECALL_KEY}`
              }
            });
            
            if (tListResp.ok) {
              const tListData = await tListResp.json();
              const transcripts = tListData.results || [];
              
              if (transcripts.length > 0) {
                const transcript = transcripts[0];
                
                // Check if there's a download URL
                if (transcript.data?.download_url) {
                  try {
                    // Fetch the transcript from the download URL
                    const downloadResp = await fetch(transcript.data.download_url);
                    if (downloadResp.ok) {
                      const downloadData = await downloadResp.json();
                      
                      transcriptStructure = {
                        source: 'download_url',
                        url: transcript.data.download_url.split('?')[0], // Remove query params for display
                        type: typeof downloadData,
                        isArray: Array.isArray(downloadData)
                      };
                      
                      // Store raw data for proper formatting in frontend
                      transcriptStructure = {
                        source: 'download_url',
                        url: transcript.data.download_url.split('?')[0],
                        type: typeof downloadData,
                        isArray: Array.isArray(downloadData),
                        hasRawData: true
                      };
                      
                      // For now, store the raw JSON data as the transcript
                      // The frontend will format it properly with actual speaker names
                      if (Array.isArray(downloadData) || (downloadData && typeof downloadData === 'object')) {
                        transcriptText = JSON.stringify(downloadData);
                      } else {
                        transcriptText = downloadData;
                      }
                    }
                  } catch(e) {
                    transcriptStructure = {
                      source: 'download_url',
                      error: e.message
                    };
                  }
                }
              }
            }
          } catch(e) {
            // Ignore transcript fetch errors
          }
        }
        
        if (transcriptText) {
          results.transcripts_found++;
        }
        
        // Extract meeting info
        const meetingTitle = botData.meeting_metadata?.title || 
                           botData.meeting_url || 
                           bot.meeting_url ||
                           `Meeting ${new Date(bot.created_at).toLocaleDateString()}`;
        
        results.bots.push({
          id: bot.id,
          status: botData.status?.code || botData.status || bot.status,
          created_at: bot.created_at,
          meeting_url: botData.meeting_url || bot.meeting_url || '',
          meeting_title: meetingTitle,
          recording_id: botData.recording_id,
          transcript_id: botData.transcript_id,
          has_transcript: Boolean(transcriptText),
          transcript_length: transcriptText.length,
          transcript_preview: transcriptText.substring(0, 500),
          transcript_structure: transcriptStructure,
          full_transcript: transcriptText,
          participants: botData.meeting_participants?.map(p => p.name || 'Unknown').join(', ') || '',
          video_url: botData.video_url,
          chat_messages: botData.chat_messages?.length || 0
        });
        
      } catch(e) {
        results.debug.bot_errors = results.debug.bot_errors || [];
        results.debug.bot_errors.push(`Bot ${bot.id}: ${e.message}`);
      }
    }
    
    // Sort by date, newest first
    results.bots.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    
  } catch(e) {
    return jres({ 
      error: 'Failed to fetch bots', 
      details: e.message,
      debug: results.debug
    }, 500, cors);
  }
  
  return jres({
    success: true,
    bots: results.bots,
    total: results.bots.length,
    transcripts_found: results.transcripts_found,
    debug: results.debug
  }, 200, cors);
}