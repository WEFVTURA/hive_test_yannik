import { db_createNote, db_updateNote } from '../lib/supabase.js';

export async function renderTxLive(root){
  root.setAttribute('data-view','tx-live');
  root.innerHTML = `
    <div class="content-head"><div class="title"><h2>Transcripts — Live</h2></div></div>
    <div class="panel" id="txLiveFeed" style="padding:12px; max-height:60vh; overflow:auto"></div>`;
  const feed = document.getElementById('txLiveFeed');
  feed.innerHTML = `<div class='muted'>Transcripts from connected services will appear here in real-time when webhooks hit.</div>`;
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
    const { showProgress, completeProgress, updateProgress } = await import('./progress.js');
    const { db_createNote, db_updateNote } = await import('../lib/supabase.js');
    const pickFile = ()=>new Promise(r=>{ const i=document.createElement('input'); i.type='file'; i.accept='audio/*'; i.onchange=()=>r(i.files?.[0]||null); i.click(); });
    const file = await pickFile(); if(!file) return;
    
    const pId = showProgress({ label:'Transcribing audio...', determinate:true });
    try{
      // Send file directly to Deepgram
      const formData = new FormData();
      formData.append('file', file);
      
      // Update progress during upload
      const xhr = new XMLHttpRequest();
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) {
          updateProgress(pId, (e.loaded / e.total) * 50); // 0-50% for upload
        }
      };
      
      const response = await new Promise((resolve, reject) => {
        xhr.open('POST', '/api/deepgram-upload');
        xhr.setRequestHeader('Authorization', `Bearer ${window.DEEPGRAM_API_KEY || ''}`);
        
        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            resolve(JSON.parse(xhr.responseText));
          } else {
            reject(new Error(xhr.responseText));
          }
        };
        xhr.onerror = () => reject(new Error('Network error'));
        
        xhr.send(formData);
      });
      
      updateProgress(pId, 75); // 75% after upload complete
      
      if (response?.text || response?.speaker_transcript || response?.formatted_transcript) { 
        // Save transcript to Supabase
        const n = await db_createNote(localStorage.getItem('hive_meetings_space_id') || null); 
        
        // Use speaker transcript if available, otherwise formatted or regular
        const content = response.speaker_transcript || response.formatted_transcript || response.text || '';
        const hasSpeakers = !!response.speaker_transcript || !!response.utterances;
        const title = `${(file.name||'Audio').replace(/\.[^/.]+$/,'')}${hasSpeakers ? ' (with speakers)' : ''}`;
        
        await db_updateNote(n.id, { title, content }); 
        
        completeProgress(pId, true);
        document.getElementById('txFilesStatus').textContent = hasSpeakers ? 'Transcript with speakers saved.' : 'Transcript saved.'; 
      }
      else if (response?.accepted) { 
        completeProgress(pId, true);
        document.getElementById('txFilesStatus').textContent = 'Deepgram accepted job; waiting for webhook.'; 
      }
      else {
        throw new Error('No transcript received');
      }
    }catch(error){ 
      completeProgress(pId, false); 
      document.getElementById('txFilesStatus').textContent = `Transcription failed: ${error.message || 'Unknown error'}`; 
    }
  });
}


