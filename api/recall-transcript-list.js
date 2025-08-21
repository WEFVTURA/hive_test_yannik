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
        
        // Get transcript text if URL is provided
        if (transcript.transcript_url) {
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