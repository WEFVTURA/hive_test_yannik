/**
 * Simple modal system for speaker identification
 */

export function openModal(content, options = {}) {
  const {
    className = '',
    closeOnOverlay = true,
    closeOnEscape = true
  } = options;
  
  // Create modal elements
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay active';
  
  const modal = document.createElement('div');
  modal.className = `modal active ${className}`;
  
  // Set content
  if (typeof content === 'string') {
    modal.innerHTML = content;
  } else {
    modal.appendChild(content);
  }
  
  // Add to DOM
  document.body.appendChild(overlay);
  document.body.appendChild(modal);
  
  // Close function
  const close = () => {
    overlay.classList.remove('active');
    modal.classList.remove('active');
    setTimeout(() => {
      overlay.remove();
      modal.remove();
    }, 300);
  };
  
  // Event handlers
  if (closeOnOverlay) {
    overlay.addEventListener('click', close);
  }
  
  if (closeOnEscape) {
    const escHandler = (e) => {
      if (e.key === 'Escape') {
        close();
        document.removeEventListener('keydown', escHandler);
      }
    };
    document.addEventListener('keydown', escHandler);
  }
  
  // Return controller
  return { close, modal, overlay };
}

/**
 * Show a confirmation dialog
 */
export async function confirmDialog(message, options = {}) {
  const {
    title = 'Confirm',
    confirmText = 'Yes',
    cancelText = 'Cancel',
    isDangerous = false
  } = options;
  
  return new Promise((resolve) => {
    const content = `
      <div class="confirm-dialog">
        <h3>${title}</h3>
        <p>${message}</p>
        <div class="dialog-actions">
          <button class="button secondary" id="cancelBtn">${cancelText}</button>
          <button class="button ${isDangerous ? 'danger' : 'primary'}" id="confirmBtn">${confirmText}</button>
        </div>
      </div>
    `;
    
    const { close } = openModal(content, { closeOnOverlay: false });
    
    const modal = document.querySelector('.modal.active');
    
    modal.querySelector('#confirmBtn').onclick = () => {
      close();
      resolve(true);
    };
    
    modal.querySelector('#cancelBtn').onclick = () => {
      close();
      resolve(false);
    };
  });
}

/**
 * Add required styles for modals
 */
const modalStyles = `
  .modal-overlay {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.5);
    backdrop-filter: blur(4px);
    z-index: 9998;
    opacity: 0;
    transition: opacity 0.3s ease;
  }
  
  .modal-overlay.active {
    opacity: 1;
  }
  
  .modal {
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%) scale(0.9);
    background: white;
    border-radius: 12px;
    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
    z-index: 9999;
    opacity: 0;
    transition: all 0.3s ease;
    max-width: 90vw;
    max-height: 90vh;
    overflow: auto;
  }
  
  .modal.active {
    opacity: 1;
    transform: translate(-50%, -50%) scale(1);
  }
  
  .confirm-dialog {
    padding: 24px;
    min-width: 300px;
  }
  
  .confirm-dialog h3 {
    margin: 0 0 12px 0;
    font-size: 18px;
  }
  
  .confirm-dialog p {
    margin: 0 0 20px 0;
    color: #666;
  }
  
  .dialog-actions {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
  }
  
  @media (prefers-color-scheme: dark) {
    .modal {
      background: #1e1e1e;
      color: white;
    }
    
    .confirm-dialog p {
      color: #aaa;
    }
  }
`;

// Inject styles if not already present
if (!document.querySelector('#modal-styles')) {
  const styleEl = document.createElement('style');
  styleEl.id = 'modal-styles';
  styleEl.textContent = modalStyles;
  document.head.appendChild(styleEl);
}