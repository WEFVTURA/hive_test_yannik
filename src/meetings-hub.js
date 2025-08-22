// THE ONLY Meetings Hub - with proper diarization
import { getSupabase } from './lib/supabase.js';

// Speaker colors
const SPEAKER_COLORS = ['#4CAF50', '#2196F3', '#FF9800', '#9C27B0', '#F44336', '#00BCD4', '#FFC107', '#795548'];

export async function renderMeetingsHub() {
  const content = document.getElementById('content');
  
  // MEETINGS HUB IS COMPLETELY SEPARATE FROM SPACES
  content.innerHTML = `
    <div style="padding: 24px; max-width: 1400px; margin: 0 auto;">
      <h1 style="margin-bottom: 32px; font-size: 32px;">Meetings Hub</h1>
      <p style="color: var(--muted); margin-bottom: 24px;">Your meeting transcripts with speaker diarization</p>
      
      <div style="display: flex; gap: 12px; margin-bottom: 32px;">
        <button class="button primary" onclick="window.showTranscriptImport()">
          <i data-lucide="upload"></i> Import Transcripts
        </button>
        <button class="button" onclick="window.refreshMeetingsHub()">
          <i data-lucide="refresh-cw"></i> Refresh
        </button>
      </div>
      
      <div id="meetingsList">
        <div class="loading">Loading meetings...</div>
      </div>
    </div>
  `;
  
  // Initialize icons
  if (window.lucide) lucide.createIcons();
  
  await loadMeetings();
}

async function loadMeetings() {
  const listEl = document.getElementById('meetingsList');
  
  try {
    const token = localStorage.getItem('sb_access_token');
    const response = await fetch('/api/meetings-data', {
      headers: token ? { Authorization: `Bearer ${token}` } : {}
    });
    
    const data = await response.json();
    const notes = data.notes || [];
    
    if (notes.length === 0) {
      listEl.innerHTML = '<div style="padding: 48px; text-align: center; color: var(--muted);">No meetings found</div>';
      return;
    }
    
    let html = '<div style="display: grid; gap: 16px;">';
    
    notes.forEach(note => {
      const date = new Date(note.created_at);
      const dateStr = date.toLocaleDateString();
      const timeStr = date.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
      
      // Get a clean preview without showing JSON
      let preview = 'Click to view formatted transcript';
      let speakerCount = 0;
      
      try {
        let content = note.content;
        if (typeof content === 'string' && (content.startsWith('[') || content.startsWith('{'))) {
          const data = JSON.parse(content);
          if (Array.isArray(data)) {
            // Count unique speakers
            const speakers = new Set();
            data.forEach(seg => {
              const speaker = seg.speaker || seg.speaker_name || seg.participant?.name;
              if (speaker) speakers.add(speaker);
            });
            speakerCount = speakers.size;
            
            // Get preview from first segment with text
            const firstWithText = data.find(seg => {
              const text = seg.text || (seg.words ? seg.words.map(w => w.text || w.word || w).join(' ') : '');
              return text && text.trim();
            });
            
            if (firstWithText) {
              const speaker = firstWithText.speaker || firstWithText.speaker_name || firstWithText.participant?.name || 'Speaker';
              const text = firstWithText.text || (firstWithText.words ? firstWithText.words.map(w => w.text || w.word || w).join(' ') : '');
              preview = `${speaker}: ${text}`.substring(0, 150) + '...';
            }
          }
        }
      } catch(e) {
        // Don't show JSON errors to user
        preview = 'Transcript available';
      }
      
      html += `
        <div style="background: var(--panel); border: 1px solid var(--border); border-radius: 12px; overflow: hidden; transition: all 0.2s; cursor: pointer;"
             onmouseover="this.style.transform='translateY(-2px)'; this.style.boxShadow='0 4px 12px rgba(0,0,0,0.3)'"
             onmouseout="this.style.transform=''; this.style.boxShadow=''"
             onclick="window.openTranscript('${note.id}')">
          
          <div style="padding: 20px;">
            <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 12px;">
              <h3 style="margin: 0; font-size: 18px; color: var(--text);">
                ${escapeHtml(note.title || 'Meeting Transcript')}
              </h3>
              ${speakerCount > 0 ? `
                <span style="background: var(--accent); color: white; padding: 4px 8px; border-radius: 12px; font-size: 12px;">
                  ${speakerCount} speakers
                </span>
              ` : ''}
            </div>
            
            <div style="display: flex; gap: 16px; margin-bottom: 12px;">
              <span style="color: var(--muted); font-size: 13px;">
                <i data-lucide="calendar" style="width: 14px; height: 14px; display: inline-block; vertical-align: -2px;"></i>
                ${dateStr}
              </span>
              <span style="color: var(--muted); font-size: 13px;">
                <i data-lucide="clock" style="width: 14px; height: 14px; display: inline-block; vertical-align: -2px;"></i>
                ${timeStr}
              </span>
            </div>
            
            <div style="color: var(--text-secondary); font-size: 14px; line-height: 1.5;">
              ${escapeHtml(preview)}
            </div>
          </div>
          
          <div style="background: var(--panel-2); padding: 12px 20px; border-top: 1px solid var(--border);">
            <button class="button sm primary" style="width: 100%;">
              View Transcript with Diarization
            </button>
          </div>
        </div>
      `;
    });
    
    html += '</div>';
    
    listEl.innerHTML = html;
    
    // Initialize icons
    if (window.lucide) lucide.createIcons();
    
  } catch(error) {
    listEl.innerHTML = `<div style="color: var(--danger);">Error: ${error.message}</div>`;
  }
}

// Open transcript with proper diarization
window.openTranscript = async function(noteId) {
  const sb = getSupabase();
  const { data: note } = await sb.from('notes').select('*').eq('id', noteId).single();
  
  if (!note) {
    alert('Transcript not found');
    return;
  }
  
  // Parse content
  let segments = [];
  try {
    let content = note.content;
    
    // Handle various formats
    if (typeof content === 'string') {
      if (content.startsWith('[') || content.startsWith('{')) {
        const parsed = JSON.parse(content);
        if (Array.isArray(parsed)) {
          segments = parsed;
        } else if (parsed.transcript) {
          segments = parsed.transcript;
        } else if (parsed.segments) {
          segments = parsed.segments;
        }
      }
    }
  } catch(e) {
    console.error('Parse error:', e);
  }
  
  // Build speaker map
  const speakers = new Map();
  let colorIndex = 0;
  
  segments.forEach(seg => {
    const name = seg.speaker || seg.speaker_name || seg.participant?.name || 'Speaker';
    if (!speakers.has(name)) {
      speakers.set(name, SPEAKER_COLORS[colorIndex % SPEAKER_COLORS.length]);
      colorIndex++;
    }
  });
  
  // Create modal
  const modal = document.createElement('div');
  modal.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:#1a1a1a;z-index:9999;overflow-y:auto;';
  
  let transcriptHtml = '';
  
  if (segments.length > 0) {
    // Show speaker legend
    transcriptHtml += '<div style="padding:20px;background:#2a2a2a;margin-bottom:20px;">';
    transcriptHtml += '<div style="display:flex;gap:20px;flex-wrap:wrap;">';
    speakers.forEach((color, name) => {
      transcriptHtml += `
        <div style="display:flex;align-items:center;gap:8px;">
          <div style="width:12px;height:12px;background:${color};border-radius:50%;"></div>
          <span>${escapeHtml(name)}</span>
        </div>
      `;
    });
    transcriptHtml += '</div></div>';
    
    // Show transcript with diarization
    transcriptHtml += '<div style="padding:20px;">';
    segments.forEach(seg => {
      const name = seg.speaker || seg.speaker_name || seg.participant?.name || 'Speaker';
      const color = speakers.get(name);
      const text = seg.text || (seg.words ? seg.words.map(w => w.text || w.word || w).join(' ') : '');
      
      if (text) {
        transcriptHtml += `
          <div style="display:flex;margin-bottom:20px;">
            <div style="width:4px;background:${color};margin-right:16px;"></div>
            <div>
              <div style="color:${color};font-weight:600;margin-bottom:4px;">${escapeHtml(name)}</div>
              <div style="color:#e0e0e0;line-height:1.6;">${escapeHtml(text)}</div>
            </div>
          </div>
        `;
      }
    });
    transcriptHtml += '</div>';
  } else {
    // Fallback for non-JSON content
    transcriptHtml = `<div style="padding:20px;"><pre style="white-space:pre-wrap;">${escapeHtml(note.content)}</pre></div>`;
  }
  
  modal.innerHTML = `
    <div style="padding:20px;background:#2a2a2a;border-bottom:1px solid #444;display:flex;justify-content:space-between;align-items:center;">
      <h2 style="margin:0;">${escapeHtml(note.title || 'Transcript')}</h2>
      <button class="button" onclick="this.closest('div[style*=fixed]').remove()">Close</button>
    </div>
    ${transcriptHtml}
  `;
  
  document.body.appendChild(modal);
};

window.refreshMeetingsHub = loadMeetings;

// Show transcript import IN MEETINGS HUB - NOT IN SPACES
window.showTranscriptImport = async function() {
  const modal = document.createElement('div');
  modal.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.9);z-index:10000;display:flex;align-items:center;justify-content:center;';
  
  modal.innerHTML = `
    <div style="background:var(--panel);border-radius:12px;padding:32px;max-width:600px;width:90%;max-height:80vh;overflow-y:auto;">
      <h2 style="margin:0 0 24px 0;">Import Transcripts</h2>
      
      <div style="margin-bottom:24px;">
        <h3 style="margin-bottom:12px;">From Recall.ai</h3>
        <button class="button primary" onclick="window.fetchRecallTranscripts()" style="width:100%;">
          Fetch Available Transcripts from Recall
        </button>
      </div>
      
      <div style="margin-bottom:24px;">
        <h3 style="margin-bottom:12px;">Or Paste JSON</h3>
        <textarea id="transcriptJson" placeholder="Paste transcript JSON here..." 
                  style="width:100%;height:200px;padding:12px;background:var(--panel-2);border:1px solid var(--border);border-radius:8px;color:var(--text);font-family:monospace;"></textarea>
        <button class="button" onclick="window.importJsonTranscript()" style="width:100%;margin-top:12px;">
          Import JSON Transcript
        </button>
      </div>
      
      <div id="importStatus" style="margin-top:16px;"></div>
      
      <button class="button ghost" onclick="this.closest('div[style*=fixed]').remove()" style="width:100%;margin-top:16px;">
        Close
      </button>
    </div>
  `;
  
  document.body.appendChild(modal);
};

// Fetch transcripts from Recall
window.fetchRecallTranscripts = async function() {
  const statusEl = document.getElementById('importStatus');
  statusEl.innerHTML = '<div class="loading">Fetching transcripts...</div>';
  
  try {
    const token = localStorage.getItem('sb_access_token');
    const response = await fetch('/api/recall-transcript-list', {
      headers: token ? { Authorization: `Bearer ${token}` } : {}
    });
    
    const data = await response.json();
    
    if (!data.success || !data.transcripts?.length) {
      statusEl.innerHTML = '<div style="color:var(--muted);">No transcripts available</div>';
      return;
    }
    
    statusEl.innerHTML = `
      <div style="margin-bottom:12px;">Found ${data.transcripts.length} transcripts:</div>
      <div style="max-height:300px;overflow-y:auto;">
        ${data.transcripts.map((t, i) => `
          <div style="padding:12px;background:var(--panel-2);margin-bottom:8px;border-radius:8px;">
            <div style="font-weight:600;">${t.title || `Transcript ${i+1}`}</div>
            <button class="button sm" onclick="window.importRecallTranscript('${t.id || i}')" style="margin-top:8px;">
              Import This
            </button>
          </div>
        `).join('')}
      </div>
    `;
  } catch(error) {
    statusEl.innerHTML = `<div style="color:var(--danger);">Error: ${error.message}</div>`;
  }
};

// Import specific Recall transcript
window.importRecallTranscript = async function(transcriptId) {
  const statusEl = document.getElementById('importStatus');
  statusEl.innerHTML = '<div class="loading">Importing...</div>';
  
  try {
    const token = localStorage.getItem('sb_access_token');
    const response = await fetch('/api/transcript-import-direct', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': token ? `Bearer ${token}` : ''
      },
      body: JSON.stringify({ transcript_id: transcriptId })
    });
    
    const result = await response.json();
    
    if (result.success) {
      statusEl.innerHTML = '<div style="color:var(--success);">✓ Transcript imported successfully!</div>';
      setTimeout(() => {
        document.querySelector('div[style*=fixed]')?.remove();
        window.refreshMeetingsHub();
      }, 1500);
    } else {
      statusEl.innerHTML = `<div style="color:var(--danger);">Import failed: ${result.error}</div>`;
    }
  } catch(error) {
    statusEl.innerHTML = `<div style="color:var(--danger);">Error: ${error.message}</div>`;
  }
};

// Import JSON transcript
window.importJsonTranscript = async function() {
  const jsonText = document.getElementById('transcriptJson').value.trim();
  const statusEl = document.getElementById('importStatus');
  
  if (!jsonText) {
    statusEl.innerHTML = '<div style="color:var(--danger);">Please paste transcript JSON</div>';
    return;
  }
  
  try {
    const data = JSON.parse(jsonText);
    
    statusEl.innerHTML = '<div class="loading">Importing...</div>';
    
    const token = localStorage.getItem('sb_access_token');
    const response = await fetch('/api/transcript-import-direct', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': token ? `Bearer ${token}` : ''
      },
      body: JSON.stringify({
        title: data.title || 'Imported Transcript',
        content: JSON.stringify(data.transcript || data)
      })
    });
    
    const result = await response.json();
    
    if (result.success) {
      statusEl.innerHTML = '<div style="color:var(--success);">✓ Transcript imported successfully!</div>';
      setTimeout(() => {
        document.querySelector('div[style*=fixed]')?.remove();
        window.refreshMeetingsHub();
      }, 1500);
    } else {
      statusEl.innerHTML = `<div style="color:var(--danger);">Import failed: ${result.error}</div>`;
    }
  } catch(error) {
    statusEl.innerHTML = `<div style="color:var(--danger);">Invalid JSON: ${error.message}</div>`;
  }
};

window.refreshMeetingsHub = loadMeetings;

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text || '';
  return div.innerHTML;
}