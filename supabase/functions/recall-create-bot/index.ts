// Supabase Edge Function: recall-create-bot
// Creates a Recall bot to join a meeting and record/transcribe
// Env: RECALL_API_TOKEN (us-west-2), optional BOT_NAME (default HIVE)

import 'jsr:@supabase/functions-js/edge-runtime.d.ts';

const corsHeaders = {
	'Access-Control-Allow-Origin': '*',
	'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
	'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

Deno.serve(async (req: Request) => {
	if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
	if (req.method !== 'POST') return new Response('Method not allowed', { status: 405, headers: corsHeaders });
	let body: any = {};
	try { body = await req.json(); } catch { return new Response('Bad JSON', { status: 400, headers: corsHeaders }); }
	const meeting_url: string = body.meeting_url || '';
	if (!meeting_url) return new Response(JSON.stringify({ error:'meeting_url required' }), { status:400, headers:{...corsHeaders,'Content-Type':'application/json'} });

	const envToken = Deno.env.get('RECALL_API_TOKEN');
	const reqToken = typeof body.recall_api_token === 'string' ? body.recall_api_token : '';
	const token = envToken || reqToken;
	const botName = Deno.env.get('BOT_NAME') || 'HIVE';
	if (!token) return new Response(JSON.stringify({ error:'RECALL_API_TOKEN missing' }), { status:500, headers:{...corsHeaders,'Content-Type':'application/json'} });

	const resp = await fetch('https://us-west-2.recall.ai/api/v1/bot', {
		method:'POST',
		headers:{ 'Authorization': `Token ${token}`, 'Content-Type':'application/json', 'Accept':'application/json' },
		body: JSON.stringify({ meeting_url, bot_name: botName, recording_config: { transcript: { provider: { recallai_streaming: {} } } } })
	});
	const j = await resp.json().catch(()=>({}));
	if (!resp.ok) return new Response(JSON.stringify({ error:'recall_failed', detail:j }), { status:resp.status, headers:{...corsHeaders,'Content-Type':'application/json'} });
	return new Response(JSON.stringify(j), { headers:{...corsHeaders,'Content-Type':'application/json'} });
});
