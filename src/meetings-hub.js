// THE ONLY Meetings Hub - with proper diarization
import { getSupabase } from './lib/supabase.js';

// Speaker colors
const SPEAKER_COLORS = ['#4CAF50', '#2196F3', '#FF9800', '#9C27B0', '#F44336', '#00BCD4', '#FFC107', '#795548'];

export async function renderMeetingsHub() {
  const content = document.getElementById('content');
  
  content.innerHTML = `
    <div style="padding: 24px; max-width: 1400px; margin: 0 auto;">
      <h1 style="margin-bottom: 32px;">Meetings Hub</h1>
      
      <div style="display: flex; gap: 12px; margin-bottom: 24px;">
        <button class="button primary" onclick="window.location.hash='meetings/transcript-list'">
          Import Transcripts
        </button>
        <button class="button" onclick="window.refreshMeetingsHub()">
          Refresh
        </button>
      </div>
      
      <div id="meetingsList">
        <div class="loading">Loading meetings...</div>
      </div>
    </div>
  `;
  
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
    
    let html = '';
    notes.forEach(note => {
      const date = new Date(note.created_at);
      
      // Parse content to get preview
      let preview = 'Click to view transcript';
      try {
        let content = note.content;
        if (typeof content === 'string' && (content.startsWith('[') || content.startsWith('{'))) {
          const data = JSON.parse(content);
          if (Array.isArray(data) && data[0]) {
            const first = data[0];
            const speaker = first.speaker || first.speaker_name || first.participant?.name || 'Speaker';
            const text = first.text || (first.words ? first.words.map(w => w.text || w.word || w).join(' ') : '');
            if (text) {
              preview = `${speaker}: ${text}`.substring(0, 200) + '...';
            }
          }
        } else if (typeof content === 'string') {
          preview = content.substring(0, 200) + '...';
        }
      } catch(e) {}
      
      html += `
        <div style="background: var(--panel); padding: 20px; margin-bottom: 16px; border-radius: 8px; cursor: pointer;"
             onclick="window.openTranscript('${note.id}')">
          <h3 style="margin: 0 0 8px 0;">${escapeHtml(note.title || 'Untitled')}</h3>
          <div style="color: var(--muted); font-size: 14px; margin-bottom: 12px;">
            ${date.toLocaleDateString()} at ${date.toLocaleTimeString()}
          </div>
          <div style="color: var(--text-secondary); font-size: 14px;">
            ${escapeHtml(preview)}
          </div>
        </div>
      `;
    });
    
    listEl.innerHTML = html;
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

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text || '';
  return div.innerHTML;
}