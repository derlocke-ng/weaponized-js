import './style.css'
import Gun from 'gun'
import 'gun/sea'
import { config } from './config.js'
import { marked } from 'marked'
import DOMPurify from 'dompurify'

// Initialize Gun with provided relays
const gun = Gun({
  peers: [
    "https://gun.defucc.me/gun",
    "https://gun.o8.is/gun",
    "https://shogun-relay.scobrudot.dev/gun",
    "https://relay.peer.ooo/gun",
    "https://gun.kiwi-network.eu/herbhub-relay/gun",
    "https://gun2.kiwi-network.eu/herbhub-relay/gun"
  ]
});

class EncryptedPastebin {
  constructor() {
    this.user = gun.user();
  }

  // Create a new encrypted paste
  async createPaste(content, passphrase, ttlMinutes, isBurnAfterReading) {
    try {
      if (!content) throw new Error("Content is empty");
      if (!passphrase) throw new Error("Passphrase is required");

      const pasteId = Gun.text.random();

      // Calculate expiration time if TTL is provided
      const expiration = ttlMinutes ? Date.now() + (ttlMinutes * 60 * 1000) : null;

      // Prepare data packet
      const dataToEncrypt = JSON.stringify({
        text: content,
        burn: isBurnAfterReading,
        exp: expiration
      });

      // Encrypt the paste content
      const encryptedContent = await Gun.SEA.encrypt(dataToEncrypt, passphrase);

      // Store the encrypted paste
      gun.get('pastes').get(pasteId).put({
        content: encryptedContent,
        timestamp: Date.now()
      });

      return pasteId;
    } catch (error) {
      console.error('Paste creation failed:', error);
      throw error;
    }
  }

  // Retrieve and decrypt a paste
  async retrievePaste(pasteId, passphrase) {
    return new Promise((resolve, reject) => {
      // Fetch data
      gun.get('pastes').get(pasteId).once(async (data) => {
        if (!data || !data.content) {
          reject(new Error('Paste not found or empty'));
          return;
        }

        try {
          // Decrypt the paste content
          const decryptedRaw = await Gun.SEA.decrypt(data.content, passphrase);

          if (!decryptedRaw) {
            reject(new Error('Decryption failed. Incorrect passphrase?'));
            return;
          }

          let decryptedData;

          if (typeof decryptedRaw === 'string') {
            try {
              decryptedData = JSON.parse(decryptedRaw);
            } catch (e) {
              decryptedData = decryptedRaw; // Should not happen if createPaste wraps in JSON
            }
          } else {
            decryptedData = decryptedRaw;
          }

          // Check expiration
          if (decryptedData.exp && Date.now() > decryptedData.exp) {
            // Delete if possible (client-side only for this demo)
            gun.get('pastes').get(pasteId).put(null);
            reject(new Error('Paste has expired'));
            return;
          }

          // Check Burn After Reading
          if (decryptedData.burn) {
            // Delete the paste immediately
            gun.get('pastes').get(pasteId).put(null);
          }

          resolve({
            content: decryptedData.text,
            timestamp: data.timestamp,
            burn: decryptedData.burn,
            expires: decryptedData.exp
          });
        } catch (error) {
          console.error("Decryption error:", error);
          reject(new Error('Decryption failed or data corrupted'));
        }
      });
    });
  }
}

const app = new EncryptedPastebin();

function renderMarkdown(raw, purifyConfig) {
  const template = document.createElement('template');
  template.innerHTML = marked.parse(raw || '');

  template.content.querySelectorAll('li').forEach((listItem) => {
    const checkbox = listItem.querySelector('input[type="checkbox"]');
    if (checkbox) {
      listItem.classList.add('task-list-item');
      checkbox.setAttribute('disabled', '');
    }
  });

  return DOMPurify.sanitize(template.innerHTML, purifyConfig);
}

// Initialize UI
function initUI() {
  // Configure Marked options
  marked.setOptions({
    gfm: true,
    breaks: true
  });

  // Configure DOMPurify to allow checkboxes
  const purifyConfig = {
    ADD_TAGS: ['input'],
    ADD_ATTR: ['type', 'checked', 'disabled']
  };

  // Populate TTL Options
  const ttlSelect = document.getElementById('paste-ttl');
  if (ttlSelect) {
    ttlSelect.innerHTML = config.ttlOptions.map(opt => `<option value="${opt.value}" ${opt.value === config.defaultTTL ? 'selected' : ''}>${opt.label}</option>`).join('');
  }

  // Logic for Main Tabs (Transmit/Receive)
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));

      btn.classList.add('active');
      document.getElementById(`${btn.dataset.tab}-panel`).classList.add('active');
    });
  });

  // Sub-Tabs Logic (Create: Edit vs Preview)
  const createEditView = document.getElementById('create-edit-view');
  const createPreviewView = document.getElementById('create-preview-view');
  const pasteContent = document.getElementById('paste-content');

  document.querySelectorAll('#create-panel .sub-tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#create-panel .sub-tab-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      if (btn.dataset.view === 'preview') {
        createEditView.style.display = 'none';
        createPreviewView.style.display = 'block';
        // Render Markdown
        const raw = pasteContent.value;
        createPreviewView.innerHTML = renderMarkdown(raw, purifyConfig);
      } else {
        createEditView.style.display = 'block';
        createPreviewView.style.display = 'none';
      }
    });
  });

  // Sub-Tabs Logic (Retrieve: Rendered vs Source)
  const retrieveRenderView = document.getElementById('retrieve-render-view');
  const resultContent = document.getElementById('result-content');

  document.querySelectorAll('#retrieve-panel .sub-tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#retrieve-panel .sub-tab-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      if (btn.id === 'btn-view-source') {
        retrieveRenderView.style.display = 'none';
        resultContent.style.display = 'block';
      } else {
        retrieveRenderView.style.display = 'block';
        resultContent.style.display = 'none';
      }
    });
  });


  // CREATE Logic
  const btnCreate = document.getElementById('btn-create');
  const createError = document.getElementById('create-error');
  const createResult = document.getElementById('create-result');
  const resultIdInput = document.getElementById('result-id');

  btnCreate.addEventListener('click', async () => {
    const content = document.getElementById('paste-content').value;
    const passphrase = document.getElementById('paste-passphrase').value;
    const ttl = parseInt(document.getElementById('paste-ttl').value);
    const burn = document.getElementById('paste-burn')?.checked || false;

    createError.style.display = 'none';
    createResult.classList.remove('visible');

    if (!content || !passphrase) {
      createError.textContent = 'Please enter both content and a passphrase.';
      createError.style.display = 'block';
      return;
    }

    btnCreate.disabled = true;
    btnCreate.innerHTML = '<span class="spinner"></span> Encrypting...';

    try {
      const pasteId = await app.createPaste(content, passphrase, ttl, burn);

      // Create logic success update
      const shareUrl = `${window.location.origin}${window.location.pathname}?id=${pasteId}`;
      resultIdInput.value = shareUrl;
      createResult.classList.add('visible');

      btnCreate.innerHTML = 'Transmission Complete';
      setTimeout(() => {
        btnCreate.disabled = false;
        btnCreate.innerHTML = 'INITIATE ENCRYPTION';
        // Clear sensitive inputs
        document.getElementById('paste-content').value = '';
        document.getElementById('paste-passphrase').value = '';
        // Reset Preview
        createPreviewView.innerHTML = '';
      }, 2000);

    } catch (err) {
      createError.textContent = err.message || 'Error creating paste.';
      createError.style.display = 'block';
      btnCreate.disabled = false;
      btnCreate.innerHTML = 'INITIATE ENCRYPTION';
    }
  });

  // Copy ID Logic
  document.getElementById('btn-copy-id').addEventListener('click', () => {
    resultIdInput.select();
    document.execCommand('copy');
    const btn = document.getElementById('btn-copy-id');
    const originalText = btn.textContent;
    btn.textContent = 'COPIED';
    setTimeout(() => btn.textContent = originalText, 1500);
  });

  // RETRIEVE Logic
  const btnRetrieve = document.getElementById('btn-retrieve');
  const retrieveError = document.getElementById('retrieve-error');
  const retrieveResult = document.getElementById('retrieve-result');
  const retrieveMeta = document.getElementById('retrieve-meta');

  btnRetrieve.addEventListener('click', async () => {
    const pasteId = document.getElementById('retrieve-id').value;
    const passphrase = document.getElementById('retrieve-passphrase').value;

    retrieveError.style.display = 'none';
    retrieveResult.classList.remove('visible');
    resultContent.value = '';
    retrieveRenderView.innerHTML = '';

    if (!pasteId || !passphrase) {
      retrieveError.textContent = 'Authentication required (ID + Key).';
      retrieveError.style.display = 'block';
      return;
    }

    btnRetrieve.disabled = true;
    btnRetrieve.innerHTML = '<span class="spinner"></span> Decrypting...';

    try {
      // Extract ID if a URL was pasted
      let cleanId = pasteId;
      try {
        const url = new URL(pasteId);
        if (url.searchParams.has('id')) {
          cleanId = url.searchParams.get('id');
        }
      } catch (e) {
        // Not a URL, assume it's the ID
      }

      const data = await app.retrievePaste(cleanId, passphrase);

      resultContent.value = data.content;
      // Render Markdown
      retrieveRenderView.innerHTML = renderMarkdown(data.content, purifyConfig);

      retrieveResult.classList.add('visible');

      let metaText = '';
      if (data.burn) metaText += '🔥 Burned after reading. ';
      if (data.expires) metaText += `Expires at: ${new Date(data.expires).toLocaleString()}`;
      retrieveMeta.textContent = metaText;

      btnRetrieve.disabled = false;
      btnRetrieve.innerHTML = 'DECRYPT SIGNAL';

    } catch (err) {
      retrieveError.textContent = err.message || 'Decryption failed.';
      retrieveError.style.display = 'block';
      btnRetrieve.disabled = false;
      btnRetrieve.innerHTML = 'DECRYPT SIGNAL';
    }
  });

  // Handle URL query params on load
  const urlParams = new URLSearchParams(window.location.search);
  const sharedId = urlParams.get('id');
  if (sharedId) {
    // Switch to Retrieve tab
    document.querySelector('[data-tab="retrieve"]').click();
    // Pre-fill ID
    document.getElementById('retrieve-id').value = sharedId;
  }
}

// Ensure DOM is ready (module scripts might get deferred)
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initUI);
} else {
  initUI();
}
