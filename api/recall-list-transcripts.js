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
    'Access-Control-Allow-Headers': 'Content-Type',
  };
  
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  
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
        
        // Only get transcripts for completed bots
        if (status !== 'done' && status !== 'completed') {
          continue;
        }
        
        // Try to get transcript
        const transcriptUrl = `${base}/api/v1/bot/${botId}/transcript/`;
        const tResp = await fetch(transcriptUrl, {
          headers: {
            'Authorization': `Token ${RECALL_KEY}`,
            'Accept': 'application/json'
          }
        });
        
        let transcriptText = '';
        let transcriptData = null;
        
        if (tResp.ok) {
          transcriptData = await tResp.json();
          
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
        
        // Get meeting info
        const meetingTitle = bot.meeting_metadata?.title || 
                           bot.meeting_url || 
                           `Meeting ${new Date(bot.created_at).toLocaleDateString()}`;
        
        transcripts.push({
          id: botId,
          title: meetingTitle,
          status: status,
          created_at: bot.created_at,
          duration: bot.video_url ? 'Has recording' : 'No recording',
          meeting_url: bot.meeting_url || '',
          participants: bot.meeting_participants?.length || 0,
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