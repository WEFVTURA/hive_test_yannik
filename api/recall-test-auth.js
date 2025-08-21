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
    auth_test: {},
    api_key_info: {
      key_length: RECALL_KEY.length,
      key_prefix: RECALL_KEY.substring(0, 10) + '...',
      region: region,
      base_url: base
    },
    endpoints_tested: []
  };
  
  try {
    // Test 1: Check basic auth with user endpoint
    const userUrl = `${base}/api/v1/user/`;
    const userResp = await fetch(userUrl, {
      headers: {
        'Authorization': `Token ${RECALL_KEY}`,
        'Accept': 'application/json'
      }
    });
    
    results.endpoints_tested.push({
      endpoint: '/api/v1/user/',
      status: userResp.status,
      ok: userResp.ok
    });
    
    if (userResp.ok) {
      const userData = await userResp.json();
      results.auth_test.user = {
        email: userData.email,
        permissions: userData.permissions,
        account_type: userData.account_type
      };
    }
    
    // Test 2: Try to get a single bot with full details
    const botsResp = await fetch(`${base}/api/v1/bot/?limit=1`, {
      headers: {
        'Authorization': `Token ${RECALL_KEY}`,
        'Accept': 'application/json'
      }
    });
    
    if (botsResp.ok) {
      const botsData = await botsResp.json();
      const bots = botsData.results || [];
      
      if (bots.length > 0) {
        const testBot = bots[0];
        
        // Get full bot details
        const botDetailUrl = `${base}/api/v1/bot/${testBot.id}/`;
        const botDetailResp = await fetch(botDetailUrl, {
          headers: {
            'Authorization': `Token ${RECALL_KEY}`,
            'Accept': 'application/json'
          }
        });
        
        if (botDetailResp.ok) {
          const botDetail = await botDetailResp.json();
          
          results.test_bot = {
            id: testBot.id,
            status: botDetail.status,
            all_fields: Object.keys(botDetail),
            has_transcript: 'transcript' in botDetail,
            has_transcript_url: 'transcript_url' in botDetail,
            has_recording_id: 'recording_id' in botDetail,
            has_video_url: 'video_url' in botDetail,
            raw_sample: JSON.stringify(botDetail).substring(0, 2000)
          };
          
          // Try different transcript endpoints
          const transcriptEndpoints = [
            `/api/v1/bot/${testBot.id}/transcript/`,
            `/api/v1/bot/${testBot.id}/transcript`,
            `/api/v2/bot/${testBot.id}/transcript/`,
            `/api/v1/transcript/?bot_id=${testBot.id}`
          ];
          
          for (const endpoint of transcriptEndpoints) {
            try {
              const tResp = await fetch(`${base}${endpoint}`, {
                headers: {
                  'Authorization': `Token ${RECALL_KEY}`,
                  'Accept': 'application/json'
                }
              });
              
              results.endpoints_tested.push({
                endpoint: endpoint,
                status: tResp.status,
                ok: tResp.ok,
                size: tResp.headers.get('content-length')
              });
              
              if (tResp.ok) {
                const tData = await tResp.json();
                results.transcript_found = {
                  endpoint: endpoint,
                  type: typeof tData,
                  is_array: Array.isArray(tData),
                  sample: JSON.stringify(tData).substring(0, 500)
                };
                break;
              }
            } catch(e) {
              results.endpoints_tested.push({
                endpoint: endpoint,
                error: e.message
              });
            }
          }
          
          // If bot has recording_id, try recording endpoints
          if (botDetail.recording_id) {
            const recordingUrl = `${base}/api/v2/recordings/${botDetail.recording_id}/`;
            const recResp = await fetch(recordingUrl, {
              headers: {
                'Authorization': `Token ${RECALL_KEY}`,
                'Accept': 'application/json'
              }
            });
            
            results.endpoints_tested.push({
              endpoint: `/api/v2/recordings/${botDetail.recording_id}/`,
              status: recResp.status,
              ok: recResp.ok
            });
            
            if (recResp.ok) {
              const recData = await recResp.json();
              results.recording_data = {
                fields: Object.keys(recData),
                has_transcript: 'transcript' in recData,
                has_transcript_url: 'transcript_url' in recData
              };
            }
          }
        }
      }
    }
    
    // Test 3: Check transcript list endpoint directly
    const transcriptListResp = await fetch(`${base}/api/v1/transcript/?limit=1`, {
      headers: {
        'Authorization': `Token ${RECALL_KEY}`,
        'Accept': 'application/json'
      }
    });
    
    results.endpoints_tested.push({
      endpoint: '/api/v1/transcript/',
      status: transcriptListResp.status,
      ok: transcriptListResp.ok
    });
    
    if (transcriptListResp.ok) {
      const tListData = await transcriptListResp.json();
      results.transcript_list = {
        count: tListData.count,
        has_results: Boolean(tListData.results),
        sample: tListData.results?.[0]
      };
    }
    
  } catch(e) {
    results.error = e.message;
  }
  
  return jres({
    success: true,
    ...results
  }, 200, cors);
}