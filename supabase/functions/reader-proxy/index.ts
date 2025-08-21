import { serve } from "https://deno.land/std@0.177.0/http/server.ts";

serve(async (req: Request) => {
  try {
    if (req.method !== 'POST'){
      return new Response('Method Not Allowed', { status: 405, headers: cors() });
    }
    const { url } = await req.json().catch(()=>({ url: '' }));
    if (!url || typeof url !== 'string'){
      return new Response('Missing url', { status: 400, headers: cors() });
    }
    // Use Jina Reader on the server to extract text from the PDF/webpage
    const target = `https://r.jina.ai/http://${url.replace(/^https?:\/\//,'')}`;
    const r = await fetch(target);
    const text = await r.text();
    return new Response(text, { status: 200, headers: { ...cors(), 'Content-Type': 'text/plain; charset=utf-8' } });
  } catch (e){
    return new Response('Error', { status: 500, headers: cors() });
  }
});

function cors(){
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  };
}


