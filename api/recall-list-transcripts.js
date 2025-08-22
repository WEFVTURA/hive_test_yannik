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
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
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
  
  const allBots = [];
  const debug = { attempts: [], errors: [] };
  
  try {
    // First, list all bots
    let botsUrl = `${base}/api/v1/bot/?limit=100`;
    let page = 0;
    
    while (botsUrl && page < 10) {
      page++;
      
      const response = await fetch(botsUrl, {
        headers: {
          'Authorization': `Token ${RECALL_KEY}`,
          'Accept': 'application/json'
        }
      });
      
      debug.attempts.push({
        url: botsUrl,
        status: response.status,
        page: page
      });
      
      if (!response.ok) {
        debug.errors.push(`Failed to fetch bots: ${response.status}`);
        break;
      }
      
      const data = await response.json();
      const bots = data.results || data.data || data;
      
      if (Array.isArray(bots)) {
        allBots.push(...bots);
      }
      
      // Handle pagination
      botsUrl = data.next || null;
      if (botsUrl && !botsUrl.startsWith('http')) {
        botsUrl = `${base}${botsUrl}`;
      }
    }
    
    // Now fetch transcript details for each bot
    const transcripts = [];
    
    for (const bot of allBots) {
      try {
        const botId = bot.id;
        const status = bot.status?.code || bot.status || '';
        
        // Include all bots, not just completed ones, so user can see status
        const isCompleted = status === 'done' || status === 'completed' || status === 'finished' || 
                          status === 'in_call_ending' || status === 'in_waiting_room';
        
        // First get full bot details
        const botDetailUrl = `${base}/api/v1/bot/${botId}/`;
        const botDetailResp = await fetch(botDetailUrl, {
          headers: {
            'Authorization': `Token ${RECALL_KEY}`,
            'Accept': 'application/json'
          }
        });
        
        let transcriptText = '';
        let botDetail = null;
        
        if (botDetailResp.ok) {
          botDetail = await botDetailResp.json();
          
          // Check if transcript is directly in bot detail
          if (botDetail.transcript) {
            if (typeof botDetail.transcript === 'string') {
              transcriptText = botDetail.transcript;
            } else if (Array.isArray(botDetail.transcript)) {
              // Format speaker segments
              transcriptText = botDetail.transcript.map(seg => {
                const speaker = seg.speaker_id === 0 ? 'Bot' : (seg.speaker || `Speaker ${seg.speaker_id || 'Unknown'}`);
                const words = seg.words ? seg.words.map(w => w.text || w.word || w).join(' ') : (seg.text || '');
                return `${speaker}: ${words}`;
              }).join('\n\n');
            } else if (botDetail.transcript.text) {
              transcriptText = botDetail.transcript.text;
            } else if (botDetail.transcript.segments) {
              transcriptText = botDetail.transcript.segments.map(seg => 
                `${seg.speaker || 'Unknown'}: ${seg.text || ''}`
              ).join('\n\n');
            }
          }
        }
        
        // If no transcript in bot detail, try the transcript endpoint
        if (!transcriptText && isCompleted) {
          const transcriptUrl = `${base}/api/v1/bot/${botId}/transcript/`;
          const tResp = await fetch(transcriptUrl, {
            headers: {
              'Authorization': `Token ${RECALL_KEY}`,
              'Accept': 'application/json'
            }
          });
          
          if (tResp.ok) {
            const transcriptData = await tResp.json();
            
            // Extract text from various possible formats
            if (typeof transcriptData === 'string') {
              transcriptText = transcriptData;
            } else if (transcriptData?.transcript) {
              transcriptText = transcriptData.transcript;
            } else if (transcriptData?.text) {
              transcriptText = transcriptData.text;
            } else if (Array.isArray(transcriptData)) {
              // Format speaker segments
              transcriptText = transcriptData.map(seg => 
                `${seg.speaker || 'Unknown'}: ${seg.text || seg.words?.map(w => w.text).join(' ') || ''}`
              ).join('\n');
            }
          }
        }
        
        // Get meeting info
        const meetingTitle = botDetail?.meeting_metadata?.title || 
                           bot.meeting_metadata?.title ||
                           bot.meeting_url || 
                           `Meeting ${new Date(bot.created_at).toLocaleDateString()}`;
        
        // Get participants info
        const participants = botDetail?.meeting_participants || bot.meeting_participants || [];
        const participantNames = participants.map(p => p.name || 'Unknown').filter(n => n !== 'Unknown');
        
        transcripts.push({
          id: botId,
          title: meetingTitle,
          status: status,
          status_display: status === 'done' ? 'Completed' : 
                         status === 'in_call_ending' ? 'Ending call' :
                         status === 'in_waiting_room' ? 'In waiting room' :
                         status === 'joining_call' ? 'Joining' :
                         status === 'fatal' ? 'Failed' : status,
          created_at: bot.created_at,
          duration: botDetail?.video_url || bot.video_url ? 'Has recording' : 'No recording',
          meeting_url: bot.meeting_url || '',
          participants: participantNames.length,
          participant_names: participantNames.join(', '),
          has_transcript: Boolean(transcriptText),
          transcript_length: transcriptText.length,
          transcript_preview: transcriptText.substring(0, 500),
          full_transcript: transcriptText
        });
        
      } catch (e) {
        debug.errors.push(`Error processing bot ${bot.id}: ${e.message}`);
      }
    }
    
    // Sort by date, newest first
    transcripts.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    
    return jres({
      success: true,
      total_bots: allBots.length,
      transcripts: transcripts,
      debug: debug
    }, 200, cors);
    
  } catch (e) {
    return jres({ 
      error: 'Failed to fetch transcripts', 
      details: e.message,
      debug: debug
    }, 500, cors);
  }
}