import { db_createNote, db_updateNote } from '../lib/supabase.js';

export async function renderTxLive(root){
  root.setAttribute('data-view','tx-live');
  root.innerHTML = `
    <div class="content-head"><div class="title"><h2>Transcripts — Live</h2></div></div>
    <div class="panel" id="txLiveFeed" style="padding:12px; max-height:60vh; overflow:auto"></div>`;
  const feed = document.getElementById('txLiveFeed');
  feed.innerHTML = `<div class='muted'>Transcripts from Deepgram/Recall will appear here in real-time when webhooks hit.</div>`;
}

export async function renderTxJobs(root){
  root.setAttribute('data-view','tx-jobs');
  root.innerHTML = `
    <div class="content-head"><div class="title"><h2>Transcripts — Jobs</h2></div></div>
    <div class="panel" style="padding:12px">
      <div class="muted">Paste a Deepgram request_id to fetch its result and save as a note.</div>
      <div style="display:flex; gap:8px; margin-top:8px">
        <input id="jobIdInput" placeholder="Deepgram request_id" style="flex:1" />
        <button class="button" id="fetchJobBtn">Fetch</button>
      </div>
      <pre id="jobResult" style="white-space:pre-wrap; margin-top:12px"></pre>
    </div>`;
  document.getElementById('fetchJobBtn').addEventListener('click', async()=>{
    const id = document.getElementById('jobIdInput').value.trim();
    if (!id) return;
    try{
      const r = await fetch(`https://api.deepgram.com/v1/listen/${encodeURIComponent(id)}`, { headers:{ Authorization:`Token ${ (window.DEEPGRAM_API_KEY||'') }` } });
      const j = await r.json();
      document.getElementById('jobResult').textContent = JSON.stringify(j, null, 2);
    }catch{ document.getElementById('jobResult').textContent = 'Failed to fetch job'; }
  });
}

export async function renderTxFiles(root){
  root.setAttribute('data-view','tx-files');
  root.innerHTML = `
    <div class="content-head"><div class="title"><h2>Transcripts — Files</h2></div></div>
    <div class="panel" style="padding:12px">
      <button class="button" id="pickAudioBtn">Choose audio and transcribe with Deepgram</button>
      <div id="txFilesStatus" class="muted" style="margin-top:8px"></div>
    </div>`;
  document.getElementById('pickAudioBtn').addEventListener('click', async()=>{
    const { showProgress, completeProgress } = await import('./progress.js');
    const { getSupabase } = await import('../lib/supabase.js');
    const { db_createNote, db_updateNote } = await import('../lib/supabase.js');
    const pickFile = ()=>new Promise(r=>{ const i=document.createElement('input'); i.type='file'; i.accept='audio/*'; i.onchange=()=>r(i.files?.[0]||null); i.click(); });
    const file = await pickFile(); if(!file) return;
    const sb = getSupabase();
    const bucket = sb.storage.from('hive-attachments');
    const path = `${Date.now()}_${file.name}`;
    const pId = showProgress({ label:'Uploading…', determinate:true });
    try{
      const signed = await bucket.createSignedUploadUrl(path).catch(()=>null);
      if (signed?.data?.signedUrl){
        await new Promise((resolve,reject)=>{ const xhr=new XMLHttpRequest(); xhr.open('POST', signed.data.signedUrl); xhr.upload.onprogress=(e)=>{ if(e.lengthComputable) (import('./progress.js')).then(m=>m.updateProgress(pId,(e.loaded/e.total)*100)); }; xhr.onload=()=> (xhr.status>=200&&xhr.status<300)?resolve(null):reject(new Error('upload')); xhr.onerror=()=>reject(new Error('network')); const form=new FormData(); form.append('file',file); xhr.send(form); });
      } else {
        const up = await bucket.upload(path,file,{ upsert:true }); if (up.error) throw up.error;
      }
      completeProgress(pId,true);
      const url = bucket.getPublicUrl(path).data.publicUrl;
      const r = await fetch('/api/deepgram-upload',{ method:'POST', headers:{ Authorization:`Bearer ${ (window.DEEPGRAM_API_KEY||'') }`, 'Content-Type':'application/json' }, body: JSON.stringify({ url }) });
      const j = await r.json();
      if (j?.text){ const n=await db_createNote(localStorage.getItem('hive_meetings_space_id')||null); await db_updateNote(n.id,{ title:(file.name||'Audio').replace(/\.[^/.]+$/,''), content:j.text||'' }); document.getElementById('txFilesStatus').textContent='Transcript saved.'; }
      else { document.getElementById('txFilesStatus').textContent='Deepgram accepted job; waiting for webhook.'; }
    }catch{ completeProgress(pId,false); document.getElementById('txFilesStatus').textContent='Upload failed.'; }
  });
}


