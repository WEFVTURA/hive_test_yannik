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
  const region = (process.env.RECALL_REGION || 'us').trim().toLowerCase();
  
  const result = {
    has_key: Boolean(RECALL_KEY),
    key_length: RECALL_KEY.length,
    region: region,
    endpoints_tested: [],
    working_endpoint: null,
    bot_count: 0,
    sample_bot: null
  };
  
  if (!RECALL_KEY) {
    return new Response(JSON.stringify({
      ...result,
      error: 'No Recall API key configured'
    }), { status: 200, headers: { ...cors, 'Content-Type': 'application/json' } });
  }
  
  // Test different base URLs
  const bases = [
    'https://us-west-2.recall.ai',
    'https://api.recall.ai',
    'https://eu-west-1.recall.ai',
    'https://ap-northeast-1.recall.ai'
  ];
  
  for (const base of bases) {
    try {
      const testUrl = `${base}/api/v1/bot/?limit=5`;
      const response = await fetch(testUrl, {
        headers: {
          'Authorization': `Token ${RECALL_KEY}`,
          'Accept': 'application/json'
        }
      });
      
      const endpointResult = {
        base: base,
        url: testUrl,
        status: response.status,
        ok: response.ok
      };
      
      if (response.ok) {
        const data = await response.json();
        const bots = Array.isArray(data) ? data : (data.results || data.data || []);
        
        endpointResult.bot_count = bots.length;
        endpointResult.has_pagination = 'next' in data;
        
        if (bots.length > 0) {
          result.working_endpoint = base;
          result.bot_count = bots.length;
          result.sample_bot = {
            id: bots[0].id,
            status: bots[0].status,
            created_at: bots[0].created_at,
            meeting_url: bots[0].meeting_url?.substring(0, 50)
          };
        }
      } else {
        const errorText = await response.text().catch(() => '');
        endpointResult.error = errorText.substring(0, 100);
      }
      
      result.endpoints_tested.push(endpointResult);
      
      if (result.working_endpoint) break;
      
    } catch (e) {
      result.endpoints_tested.push({
        base: base,
        error: e.message
      });
    }
  }
  
  return new Response(JSON.stringify(result, null, 2), {
    status: 200,
    headers: { ...cors, 'Content-Type': 'application/json' }
  });
}