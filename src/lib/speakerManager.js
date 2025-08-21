/**
 * Speaker Management System
 * Handles speaker identification, naming, and metadata storage
 */

/**
 * Extract unique speakers from transcript
 */
export function extractSpeakers(transcript) {
  const speakerPattern = /Speaker (\d+):/g;
  const speakers = new Set();
  let match;
  
  while ((match = speakerPattern.exec(transcript)) !== null) {
    speakers.add(parseInt(match[1]));
  }
  
  return Array.from(speakers).sort((a, b) => a - b);
}

/**
 * Replace speaker numbers with actual names in transcript
 */
export function replaceSpeakerNames(transcript, speakerMap) {
  let updatedTranscript = transcript;
  
  // Sort by speaker number descending to avoid replacing "Speaker 1" when replacing "Speaker 11"
  const sortedEntries = Object.entries(speakerMap).sort((a, b) => parseInt(b[0]) - parseInt(a[0]));
  
  for (const [speakerNum, info] of sortedEntries) {
    const pattern = new RegExp(`Speaker ${speakerNum}:`, 'g');
    const replacement = `${info.name}:`;
    updatedTranscript = updatedTranscript.replace(pattern, replacement);
  }
  
  return updatedTranscript;
}

/**
 * Generate speaker metadata for database storage
 */
export function generateSpeakerMetadata(speakerMap) {
  const contributors = Object.values(speakerMap).map(info => ({
    name: info.name,
    email: info.email || null,
    role: info.role || 'participant'
  }));
  
  // Generate search tags
  const tags = [
    ...contributors.map(c => c.name),
    ...contributors.filter(c => c.email).map(c => c.email)
  ];
  
  return {
    contributors,
    tags: [...new Set(tags)], // Remove duplicates
    speaker_count: contributors.length,
    has_speaker_identification: true
  };
}

/**
 * Create speaker identification modal HTML
 */
export function createSpeakerModal(speakers, existingSpeakerMap = {}) {
  const speakerFields = speakers.map(num => {
    const existing = existingSpeakerMap[num] || {};
    return `
      <div class="speaker-field" data-speaker="${num}">
        <div class="speaker-label">Speaker ${num}</div>
        <div class="speaker-inputs">
          <input 
            type="text" 
            class="speaker-name" 
            placeholder="Name (required)" 
            value="${existing.name || ''}"
            data-speaker="${num}"
          />
          <input 
            type="email" 
            class="speaker-email" 
            placeholder="Email (optional)" 
            value="${existing.email || ''}"
            data-speaker="${num}"
          />
        </div>
      </div>
    `;
  }).join('');
  
  return `
    <div class="speaker-modal">
      <div class="modal-header">
        <h3>Identify Speakers</h3>
        <p class="modal-subtitle">Add names for ${speakers.length} speaker${speakers.length > 1 ? 's' : ''} found in the transcript</p>
      </div>
      <div class="speaker-fields">
        ${speakerFields}
      </div>
      <div class="modal-actions">
        <button class="button secondary" id="skipSpeakers">Skip</button>
        <button class="button primary" id="saveSpeakers">Save Names</button>
      </div>
    </div>
  `;
}

/**
 * Extract speaker map from modal inputs
 */
export function extractSpeakerMap(modalElement) {
  const speakerMap = {};
  const nameInputs = modalElement.querySelectorAll('.speaker-name');
  
  nameInputs.forEach(input => {
    const speakerNum = input.dataset.speaker;
    const name = input.value.trim();
    
    if (name) {
      const emailInput = modalElement.querySelector(`.speaker-email[data-speaker="${speakerNum}"]`);
      speakerMap[speakerNum] = {
        name,
        email: emailInput?.value.trim() || null
      };
    }
  });
  
  return speakerMap;
}

/**
 * Validate speaker map (ensure at least one name is provided)
 */
export function validateSpeakerMap(speakerMap, totalSpeakers) {
  const namedSpeakers = Object.keys(speakerMap).length;
  
  if (namedSpeakers === 0) {
    return { valid: false, message: 'Please provide at least one speaker name' };
  }
  
  // Check for duplicate names
  const names = Object.values(speakerMap).map(s => s.name.toLowerCase());
  const uniqueNames = new Set(names);
  
  if (names.length !== uniqueNames.size) {
    return { valid: false, message: 'Each speaker must have a unique name' };
  }
  
  return { valid: true };
}

/**
 * Store speaker map in localStorage for future use
 */
export function storeSpeakerHistory(speakerMap) {
  try {
    const history = JSON.parse(localStorage.getItem('speaker_history') || '{}');
    
    // Store by email for future auto-fill
    Object.values(speakerMap).forEach(info => {
      if (info.email) {
        history[info.email] = {
          name: info.name,
          lastUsed: Date.now()
        };
      }
    });
    
    localStorage.setItem('speaker_history', JSON.stringify(history));
  } catch (e) {
    console.warn('Failed to store speaker history:', e);
  }
}

/**
 * Get speaker suggestions from history
 */
export function getSpeakerSuggestions() {
  try {
    const history = JSON.parse(localStorage.getItem('speaker_history') || '{}');
    return Object.entries(history)
      .map(([email, info]) => ({ email, ...info }))
      .sort((a, b) => b.lastUsed - a.lastUsed)
      .slice(0, 10); // Return top 10 most recent
  } catch {
    return [];
  }
}

/**
 * Add inline speaker identification button to note
 */
export function addSpeakerButton(noteElement, noteId, transcript) {
  const speakers = extractSpeakers(transcript);
  
  if (speakers.length === 0) return;
  
  const button = document.createElement('button');
  button.className = 'speaker-identify-btn';
  button.innerHTML = `👥 Identify ${speakers.length} Speaker${speakers.length > 1 ? 's' : ''}`;
  button.dataset.noteId = noteId;
  button.dataset.speakers = JSON.stringify(speakers);
  
  // Insert after title or at top of note
  const titleElement = noteElement.querySelector('.note-title');
  if (titleElement) {
    titleElement.insertAdjacentElement('afterend', button);
  } else {
    noteElement.insertAdjacentElement('afterbegin', button);
  }
  
  return button;
}