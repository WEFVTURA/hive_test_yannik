// THE ONLY Meetings Hub - with proper diarization
import { getSupabase } from './lib/supabase.js';

// Speaker colors
const SPEAKER_COLORS = ['#4CAF50', '#2196F3', '#FF9800', '#9C27B0', '#F44336', '#00BCD4', '#FFC107', '#795548'];

export async function renderMeetingsHub() {
  const content = document.getElementById('content');
  
  // MEETINGS HUB IS COMPLETELY SEPARATE FROM SPACES
  content.innerHTML = `
    <div class="meetings-hub">
      <div class="hub-header">
        <div>
          <h1>Meetings Hub</h1>
          <p class="muted">Your meeting transcripts with speaker diarization</p>
        </div>
        <div class="hub-actions" style="display:flex; justify-content:flex-start; gap:12px; flex-wrap:wrap;">
          <button class="button" style="min-width:180px" onclick="location.hash='';">
            <i data-lucide="arrow-left"></i> Back to Spaces
          </button>
          <button class="button primary" style="min-width:180px" onclick="window.showTranscriptImport()">
            <i data-lucide="upload"></i> Import Transcripts
          </button>
        </div>
      </div>

      <div id="hub-insights" class="insights-grid">
        <!-- Insights will be loaded here -->
      </div>
      
      <div id="meetingsList">
        <div class="loading">Loading meetings...</div>
      </div>
    </div>
  `;
  
  // Initialize icons
  if (window.lucide) lucide.createIcons();
  
  await loadMeetings();
  // Expose refresh in case other components call it
  window.refreshMeetingsHub = loadMeetings;
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
      listEl.innerHTML = '<div class="empty-state">No meetings found</div>';
      return;
    }

    // Render insights
    renderInsights(notes);
    
    let html = '<div class="meetings-grid">';
    
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
        <div class="meeting-card" data-note-id="${note.id}">
          <div class="card-header">
            <h3 class="card-title">${escapeHtml(note.title || 'Meeting Transcript')}</h3>
            ${speakerCount > 0 ? `
              <span class="badge">${speakerCount} speakers</span>
            ` : ''}
          </div>
          
          <div class="card-meta">
            <span>
              <i data-lucide="calendar" class="icon-sm"></i>
              ${dateStr}
            </span>
            <span>
              <i data-lucide="clock" class="icon-sm"></i>
              ${timeStr}
            </span>
          </div>
          
          <p class="card-preview">${escapeHtml(preview)}</p>

          <div class="card-actions">
            <button class="button sm" onclick="window.openTranscript('${note.id}')">
              <i data-lucide="eye"></i> View
            </button>
            <button class="button sm" onclick="window.editTranscript('${note.id}')">
              <i data-lucide="pencil"></i> Edit
            </button>
            <button class="button sm" onclick="window.renameSpeakers('${note.id}')">
              <i data-lucide="users"></i> Speakers
            </button>
            <div class="spacer"></div>
            <button class="button sm red" onclick="window.deleteTranscript('${note.id}')">
              <i data-lucide="trash-2"></i>
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
    listEl.innerHTML = `<div class="error-state">Error: ${error.message}</div>`;
  }
}

function renderInsights(notes) {
  const insightsEl = document.getElementById('hub-insights');
  if (!insightsEl) return;

  const totalMeetings = notes.length;
  const meetingsLast7Days = notes.filter(n => {
    const noteDate = new Date(n.created_at);
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    return noteDate > sevenDaysAgo;
  }).length;

  let totalSpeakers = 0;
  const speakerSet = new Set();
  notes.forEach(note => {
    try {
      let content = note.content;
      if (typeof content === 'string' && (content.startsWith('[') || content.startsWith('{'))) {
        const data = JSON.parse(content);
        if (Array.isArray(data)) {
          data.forEach(seg => {
            const speaker = seg.speaker || seg.speaker_name || seg.participant?.name;
            if (speaker) speakerSet.add(speaker);
          });
        }
      }
    } catch(e) {}
  });
  totalSpeakers = speakerSet.size;

  insightsEl.innerHTML = `
    <div class="insight-card">
      <h4>Total Meetings</h4>
      <p>${totalMeetings}</p>
    </div>
    <div class="insight-card">
      <h4>Meetings (Last 7 Days)</h4>
      <p>${meetingsLast7Days}</p>
    </div>
    <div class="insight-card">
      <h4>Unique Speakers</h4>
      <p>${totalSpeakers}</p>
    </div>
     <div class="insight-card">
      <h4>Coming soon</h4>
      <p>🚀</p>
    </div>
  `;
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
  modal.classList.add('transcript-modal');
  
  let transcriptHtml = '';
  
  if (segments.length > 0) {
    // Show speaker legend
    transcriptHtml += '<div class="speaker-legend">';
    speakers.forEach((color, name) => {
      transcriptHtml += `
        <div class="speaker-item">
          <div class="speaker-color" style="background:${color};"></div>
          <span>${escapeHtml(name)}</span>
        </div>
      `;
    });
    transcriptHtml += '</div>';
    
    // Show transcript with diarization
    transcriptHtml += '<div class="transcript-content">';
    segments.forEach(seg => {
      const name = seg.speaker || seg.speaker_name || seg.participant?.name || 'Speaker';
      const color = speakers.get(name);
      const text = seg.text || (seg.words ? seg.words.map(w => w.text || w.word || w).join(' ') : '');
      
      if (text) {
        transcriptHtml += `
          <div class="transcript-segment">
            <div class="segment-color-bar" style="background:${color};"></div>
            <div class="segment-text">
              <div class="segment-speaker" style="color:${color};">${escapeHtml(name)}</div>
              <div class="segment-message">${escapeHtml(text)}</div>
            </div>
          </div>
        `;
      }
    });
    transcriptHtml += '</div>';
  } else {
    // Fallback for non-JSON content
    transcriptHtml = `<div class="transcript-fallback"><pre>${escapeHtml(note.content)}</pre></div>`;
  }
  
  modal.innerHTML = `
    <div class="modal-content-wrapper">
      <div class="transcript-header">
        <h2>${escapeHtml(note.title || 'Transcript')}</h2>
        <button class="button" onclick="this.closest('.transcript-modal').remove()">
          <i data-lucide="x"></i> Close
        </button>
      </div>
      <div class="transcript-body">
        ${transcriptHtml}
      </div>
    </div>
  `;
  
  document.body.appendChild(modal);
  if (window.lucide) lucide.createIcons();
};

window.editTranscript = async function(noteId) {
  const sb = getSupabase();
  const { data: note } = await sb.from('notes').select('*').eq('id', noteId).single();
  if (!note) return alert('Transcript not found');

  const modal = document.createElement('div');
  modal.classList.add('modal-scrim', 'modal-show');
  modal.innerHTML = `
    <div class="modal" style="max-width: 800px;">
      <div class="modal-head">
        <h3>Edit Transcript Content</h3>
        <button class="button sm ghost" onclick="this.closest('.modal-scrim').remove()"><i data-lucide="x"></i></button>
      </div>
      <div class="modal-body">
        <textarea id="editJsonContent" style="width: 100%; height: 50vh; font-family: monospace;"></textarea>
      </div>
      <div class="modal-actions">
        <button class="button" onclick="this.closest('.modal-scrim').remove()">Cancel</button>
        <button class="button primary" id="saveTranscriptChanges">Save Changes</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
  if (window.lucide) lucide.createIcons();

  const textarea = modal.querySelector('#editJsonContent');
  try {
    const content = JSON.parse(note.content);
    textarea.value = JSON.stringify(content, null, 2);
  } catch(e) {
    textarea.value = note.content;
  }

  modal.querySelector('#saveTranscriptChanges').onclick = async () => {
    const updatedContent = textarea.value;
    try {
      // Validate JSON if possible
      JSON.parse(updatedContent);
    } catch(e) {
      if (!confirm("The content is not valid JSON. Save anyway as plain text?")) {
        return;
      }
    }

    const token = localStorage.getItem('sb_access_token');
    const response = await fetch('/api/update-note', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ note_id: noteId, content: updatedContent })
    });

    const result = await response.json();
    if (result.success) {
      modal.remove();
      // Potentially refresh just this card's data, for now a full refresh is simplest
      window.refreshMeetingsHub(); 
    } else {
      alert('Error updating transcript: ' + result.error);
    }
  };
}

window.renameSpeakers = async function(noteId) {
  const sb = getSupabase();
  const { data: note } = await sb.from('notes').select('*').eq('id', noteId).single();
  if (!note) return alert('Transcript not found');

  let segments = [];
  try {
    segments = JSON.parse(note.content);
    if (!Array.isArray(segments)) throw new Error('Not an array');
  } catch(e) {
    return alert('Cannot rename speakers: transcript content is not a valid JSON array of segments.');
  }

  const speakers = [...new Set(segments.map(s => s.speaker || s.speaker_name || s.participant?.name).filter(Boolean))];
  
  const modal = document.createElement('div');
  modal.classList.add('modal-scrim', 'modal-show');
  modal.innerHTML = `
    <div class="modal">
      <div class="modal-head">
        <h3>Rename Speakers</h3>
        <button class="button sm ghost" onclick="this.closest('.modal-scrim').remove()"><i data-lucide="x"></i></button>
      </div>
      <div class="modal-body" id="speakerRenameFields">
        ${speakers.map(s => `
          <div class="field speaker-rename-field">
            <label>${escapeHtml(s)}</label>
            <input type="text" data-original-name="${escapeHtml(s)}" value="${escapeHtml(s)}">
          </div>
        `).join('')}
      </div>
      <div class="modal-actions">
        <button class="button" onclick="this.closest('.modal-scrim').remove()">Cancel</button>
        <button class="button primary" id="saveSpeakerNames">Save Names</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
  if (window.lucide) lucide.createIcons();

  modal.querySelector('#saveSpeakerNames').onclick = async () => {
    const nameMap = new Map();
    modal.querySelectorAll('.speaker-rename-field input').forEach(input => {
      nameMap.set(input.dataset.originalName, input.value);
    });

    const updatedSegments = segments.map(seg => {
      const originalSpeaker = seg.speaker || seg.speaker_name || seg.participant?.name;
      if (originalSpeaker && nameMap.has(originalSpeaker)) {
        const newSpeaker = nameMap.get(originalSpeaker);
        // This is a bit simplistic, assumes 'speaker' is the primary key.
        // A more robust solution would check all possible speaker name fields.
        if(seg.speaker) seg.speaker = newSpeaker;
        if(seg.speaker_name) seg.speaker_name = newSpeaker;
        if(seg.participant?.name) seg.participant.name = newSpeaker;
      }
      return seg;
    });

    const updatedContent = JSON.stringify(updatedSegments, null, 2);
    
    const token = localStorage.getItem('sb_access_token');
    const response = await fetch('/api/update-note', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ note_id: noteId, content: updatedContent })
    });
    
    const result = await response.json();
    if (result.success) {
      modal.remove();
      window.refreshMeetingsHub();
    } else {
      alert('Error updating speaker names: ' + result.error);
    }
  };
}

window.deleteTranscript = async function(noteId) {
  const noteCard = document.querySelector(`.meeting-card[data-note-id="${noteId}"]`);
  const title = noteCard ? noteCard.querySelector('.card-title').textContent : 'this transcript';

  // Simple confirmation for now
  if (!confirm(`Are you sure you want to delete "${title}"? This cannot be undone.`)) {
    return;
  }

  try {
    const token = localStorage.getItem('sb_access_token');
    const response = await fetch('/api/delete-note', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': token ? `Bearer ${token}` : ''
      },
      body: JSON.stringify({ note_id: noteId })
    });

    const result = await response.json();

    if (result.success) {
      if (noteCard) {
        noteCard.remove();
      }
      // Consider refreshing insights or the whole list
      // For now, just removing the card is fine.
      // A toast notification would be a good addition here.
    } else {
      throw new Error(result.error || 'Failed to delete transcript');
    }
  } catch (error) {
    console.error('Error deleting transcript:', error);
    alert(`Could not delete transcript: ${error.message}`);
  }
}

window.refreshMeetingsHub = loadMeetings;

// Show transcript import IN MEETINGS HUB - NOT IN SPACES
window.showTranscriptImport = async function() {
  const modal = document.createElement('div');
  modal.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.9);z-index:10000;display:flex;align-items:center;justify-content:center;';
  
  modal.innerHTML = `
    <div style="background:var(--panel);border-radius:12px;padding:32px;max-width:600px;width:90%;max-height:80vh;overflow-y:auto;">
      <h2 style="margin:0 0 24px 0;">Import Transcripts</h2>
      
      <div style="margin-bottom:24px;">
        <h3 style="margin-bottom:12px;">From Connected Account</h3>
        <button class="button primary" onclick="window.fetchRecallTranscripts()" style="width:100%;">
          Fetch Available Transcripts
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

// Fetch transcripts from connected account
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

// Import specific transcript from connected account
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