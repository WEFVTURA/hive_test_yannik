export const config = { runtime: 'edge' };

export default async function handler(req) {
  const cors = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
  
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: cors });
  }
  
  const RECALL_KEY = process.env.RECALL_API_KEY || process.env.RECALL_KEY || process.env.RECALL || '';
  
  if (!RECALL_KEY) {
    return new Response(JSON.stringify({
      error: 'No Recall API key found'
    }), { status: 500, headers: { ...cors, 'Content-Type': 'application/json' } });
  }
  
  const region = (process.env.RECALL_REGION || 'us').trim().toLowerCase();
  const bases = {
    'us': 'https://us-west-2.recall.ai',
    'eu': 'https://eu-west-1.recall.ai',
    'jp': 'https://ap-northeast-1.recall.ai',
    'payg': 'https://api.recall.ai'
  };
  const base = bases[region] || bases.us;
  
  const result = {
    region: region,
    base: base,
    bots: [],
    total: 0,
    completed: 0,
    sample_transcript: null,
    error: null
  };
  
  try {
    // List bots
    const response = await fetch(`${base}/api/v1/bot/?limit=10`, {
      headers: {
        'Authorization': `Token ${RECALL_KEY}`,
        'Accept': 'application/json'
      }
    });
    
    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      result.error = `Failed to list bots: ${response.status} ${response.statusText} - ${errorText}`;
    } else {
      const data = await response.json();
      const bots = Array.isArray(data) ? data : (data.results || []);
      
      result.total = bots.length;
      result.bots = bots.map(bot => ({
        id: bot.id,
        status: bot.status?.code || bot.status || 'unknown',
        status_raw: bot.status,  // Show the raw status object
        meeting_url: bot.meeting_url,
        created_at: bot.created_at,
        transcript_id: bot.transcript_id,
        has_transcript: Boolean(bot.transcript),
        transcript_ready: bot.transcript_ready
      }));
      
      // Count completed
      result.completed = bots.filter(bot => {
        const status = bot.status?.code || bot.status || '';
        return status === 'done' || status === 'completed';
      }).length;
      
      // Try to get a sample transcript from the first completed bot
      const completedBot = bots.find(bot => {
        const status = bot.status?.code || bot.status || '';
        return status === 'done' || status === 'completed';
      });
      
      if (completedBot && completedBot.id) {
        try {
          const botResponse = await fetch(`${base}/api/v1/bot/${completedBot.id}/`, {
            headers: {
              'Authorization': `Token ${RECALL_KEY}`,
              'Accept': 'application/json'
            }
          });
          
          if (botResponse.ok) {
            const botData = await botResponse.json();
            result.sample_transcript = {
              bot_id: completedBot.id,
              has_transcript: Boolean(botData.transcript),
              transcript_type: typeof botData.transcript,
              transcript_keys: botData.transcript ? Object.keys(botData.transcript).slice(0, 5) : [],
              has_transcript_id: Boolean(botData.transcript_id),
              transcript_preview: JSON.stringify(botData.transcript).slice(0, 200)
            };
          }
        } catch(e) {
          result.sample_transcript = { error: e.message };
        }
      }
    }
  } catch(e) {
    result.error = e.message;
  }
  
  return new Response(JSON.stringify(result, null, 2), {
    status: 200,
    headers: { ...cors, 'Content-Type': 'application/json' }
  });
}