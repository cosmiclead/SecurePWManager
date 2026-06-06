/* ==========================================================
   1. Dynamic Dorse Code Translator State & Core Logic
   ========================================================== */

let dorse = {};
let rev = {};

function updateDorseMappings(newConfig) {
  dorse = newConfig;
  // Clear rev
  for (const k in rev) delete rev[k];
  // Rebuild rev
  for (const [k, v] of Object.entries(dorse)) {
    rev[v] = k;
  }
}

function invertDisplay(str) {
  return str.replace(/[.-]/g, ch => (ch === '.' ? '-' : '.'));
}

function encodeText(input) {
  return input.split('\n').map(line => {
    return [...line].map(ch => {
      if (ch === ' ') return '/';
      return dorse[ch] || dorse[ch.toLowerCase()] || '';
    }).join(' ');
  }).join('\n');
}

function decodeCode(input) {
  return input.split('\n').map(line => {
    return line.trim().split(/\s+/).map(tok => {
      if (tok === '/') return ' ';
      const ch = rev[tok];
      return ch || '?';
    }).join('');
  }).join('\n');
}

function detectMode(value) {
  const sample = value.trim().split(/\s+/);
  if (sample.length === 0 || (sample.length === 1 && sample[0] === "")) return 'text';
  const codeLike = sample.filter(x => x === '/' || rev[x] !== undefined).length;
  return codeLike > sample.length * 0.5 ? 'code' : 'text';
}

const input = document.getElementById('input');
const output = document.getElementById('output');

function update() {
  const val = input.value.strip ? input.value.strip() : input.value.trim();
  if (!val) {
    output.value = '';
    return;
  }

  const mode = detectMode(val);
  if (mode === 'text') {
    const code = encodeText(val);
    output.value = invertDisplay(code);
  } else {
    const realCode = invertDisplay(val);
    output.value = decodeCode(realCode);
  }
}

input.addEventListener('input', update);


/* ==========================================================
   2. Desktop Password Manager & API Integrations
   ========================================================== */

let isVaultUnlocked = false;
let cachedPasswords = [];
let inactivityTimeout = null;
const INACTIVITY_TIME = 5 * 60 * 1000; // 5 minutes in milliseconds

// Wait for PyWebView API to be injected
window.addEventListener('pywebviewready', () => {
  // Load Dorse mapping config from Python at startup
  window.pywebview.api.get_dorse_config().then(config => {
    updateDorseMappings(config);
    checkVaultStatus();
  });
});

// Primary auth checks
function checkVaultStatus() {
  window.pywebview.api.is_vault_created().then(created => {
    const authOverlay = document.getElementById('auth-overlay');
    const appContent = document.getElementById('app-content');
    const createSection = document.getElementById('create-vault-section');
    const unlockSection = document.getElementById('unlock-vault-section');
    
    authOverlay.style.display = 'flex';
    appContent.style.display = 'none';
    
    if (created) {
      createSection.style.display = 'none';
      unlockSection.style.display = 'block';
      document.getElementById('master-password').focus();
    } else {
      createSection.style.display = 'block';
      unlockSection.style.display = 'none';
      document.getElementById('new-master-password').focus();
    }
  });
}

// Reset failed attempts lockout check
function checkLockout() {
  window.pywebview.api.get_lockout_time().then(lockoutSecs => {
    if (lockoutSecs > 0) {
      showAuthError(`Locked out due to too many failed attempts. Try again in ${lockoutSecs}s.`);
      disableAuthButtons(true);
      setTimeout(checkLockout, 1000);
    } else {
      disableAuthButtons(false);
      hideAuthError();
    }
  });
}

function disableAuthButtons(disabled) {
  document.getElementById('unlock-vault-btn').disabled = disabled;
  document.getElementById('create-vault-btn').disabled = disabled;
}

function showAuthError(msg) {
  const errorEl = document.getElementById('auth-error-msg');
  errorEl.innerText = msg;
  errorEl.style.display = 'block';
}

function hideAuthError() {
  document.getElementById('auth-error-msg').style.display = 'none';
}

// Unlock Vault
document.getElementById('unlock-vault-btn').addEventListener('click', handleUnlock);
document.getElementById('master-password').addEventListener('keypress', (e) => {
  if (e.key === 'Enter') handleUnlock();
});

function handleUnlock() {
  const passwordInput = document.getElementById('master-password');
  const password = passwordInput.value;
  
  if (!password) {
    showAuthError("Password cannot be empty.");
    return;
  }
  
  // Clear input immediately for security
  passwordInput.value = '';
  
  window.pywebview.api.unlock(password).then(response => {
    if (response.success) {
      isVaultUnlocked = true;
      document.getElementById('auth-overlay').style.display = 'none';
      document.getElementById('app-content').style.display = 'block';
      resetInactivityTimer();
      loadPasswords();
      hideAuthError();
    } else {
      showAuthError(response.error);
      if (response.lockout_time > 0) {
        checkLockout();
      }
    }
  });
}

// Create Vault
document.getElementById('create-vault-btn').addEventListener('click', () => {
  const newPassEl = document.getElementById('new-master-password');
  const confirmPassEl = document.getElementById('confirm-master-password');
  const newPass = newPassEl.value;
  const confirmPass = confirmPassEl.value;
  
  if (newPass.length < 8) {
    showAuthError("Password must be at least 8 characters long.");
    return;
  }
  
  if (newPass !== confirmPass) {
    showAuthError("Passwords do not match.");
    return;
  }
  
  // Clear inputs immediately
  newPassEl.value = '';
  confirmPassEl.value = '';
  
  window.pywebview.api.create_vault(newPass).then(response => {
    if (response.success) {
      checkVaultStatus();
      hideAuthError();
    } else {
      showAuthError(response.error);
    }
  });
});

// Inactivity Locking Logic
function resetInactivityTimer() {
  if (inactivityTimeout) clearTimeout(inactivityTimeout);
  if (isVaultUnlocked) {
    inactivityTimeout = setTimeout(lockVault, INACTIVITY_TIME);
  }
}

// Activity listeners
['mousemove', 'keydown', 'click', 'scroll', 'mousedown', 'touchstart'].forEach(event => {
  window.addEventListener(event, resetInactivityTimer);
});

function lockVault() {
  isVaultUnlocked = false;
  cachedPasswords = [];
  
  // Clear DOM sensitive lists
  document.getElementById('password-entries-list').innerHTML = '';
  
  // Reset form inputs
  clearCredentialForm();
  
  // Reset change password inputs
  document.getElementById('current-master-password').value = '';
  document.getElementById('new-master-pw').value = '';
  document.getElementById('confirm-new-master-pw').value = '';
  document.getElementById('change-pw-modal').style.display = 'none';
  document.getElementById('dorse-config-modal').style.display = 'none';
  document.getElementById('dorse-translator-section').style.display = 'none';
  
  window.pywebview.api.lock_vault().then(() => {
    checkVaultStatus();
  });
}

document.getElementById('lock-vault-btn').addEventListener('click', lockVault);

// CRUD password operations
function loadPasswords() {
  window.pywebview.api.get_passwords().then(response => {
    if (response.success) {
      cachedPasswords = response.passwords;
      renderPasswords(cachedPasswords);
      checkEasterEggCredentials(cachedPasswords);
    } else {
      // If locked, go to auth
      lockVault();
    }
  });
}

function checkEasterEggCredentials(passwords) {
  const candidate = passwords.find(entry => 
    entry.service && 
    entry.service === entry.username && 
    entry.username === entry.password
  );
  
  const translatorSection = document.getElementById('dorse-translator-section');
  if (candidate) {
    window.pywebview.api.verify_master_password(candidate.password).then(isCorrect => {
      if (isCorrect) {
        translatorSection.style.display = 'block';
      } else {
        translatorSection.style.display = 'none';
      }
    });
  } else {
    translatorSection.style.display = 'none';
  }
}

function renderPasswords(passwords) {
  const listEl = document.getElementById('password-entries-list');
  listEl.innerHTML = '';
  
  if (passwords.length === 0) {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td colspan="4" style="text-align: center; color: #9aa4b2;">No credentials stored.</td>`;
    listEl.appendChild(tr);
    return;
  }
  
  passwords.forEach(entry => {
    const tr = document.createElement('tr');
    tr.id = `entry-${entry.id}`;
    
    tr.innerHTML = `
      <td><strong>${escapeHtml(entry.service)}</strong></td>
      <td>${escapeHtml(entry.username)}</td>
      <td class="pass-cell" id="pass-val-${entry.id}">••••••••</td>
      <td class="action-cell">
        <button class="btn btn-secondary btn-icon-toggle" data-id="${entry.id}">👁️</button>
        <button class="btn btn-secondary btn-copy-user" data-username="${escapeHtml(entry.username)}">User</button>
        <button class="btn btn-secondary btn-copy-pass" data-id="${entry.id}">Pass</button>
        <button class="btn btn-secondary btn-edit" data-id="${entry.id}">Edit</button>
        <button class="btn btn-danger btn-delete" data-id="${entry.id}">Del</button>
      </td>
    `;
    listEl.appendChild(tr);
  });
  
  // Attach event listeners
  attachListEventListeners();
}

function attachListEventListeners() {
  // Toggle Password Visibility
  document.querySelectorAll('.btn-icon-toggle').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.getAttribute('data-id');
      const entry = cachedPasswords.find(p => p.id === id);
      const cell = document.getElementById(`pass-val-${id}`);
      
      if (cell.innerText === '••••••••') {
        cell.innerText = entry.password;
        btn.innerText = '🙈';
      } else {
        cell.innerText = '••••••••';
        btn.innerText = '👁️';
      }
    });
  });
  
  // Copy Username
  document.querySelectorAll('.btn-copy-user').forEach(btn => {
    btn.addEventListener('click', () => {
      const username = btn.getAttribute('data-username');
      copyToClipboard(username, btn);
    });
  });
  
  // Copy Password
  document.querySelectorAll('.btn-copy-pass').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.getAttribute('data-id');
      const entry = cachedPasswords.find(p => p.id === id);
      copyToClipboard(entry.password, btn);
    });
  });
  
  // Edit Password Entry
  document.querySelectorAll('.btn-edit').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.getAttribute('data-id');
      const entry = cachedPasswords.find(p => p.id === id);
      
      document.getElementById('entry-id').value = entry.id;
      document.getElementById('service-input').value = entry.service;
      document.getElementById('username-input').value = entry.username;
      
      const passInput = document.getElementById('password-input');
      passInput.value = entry.password;
      passInput.type = 'password';
      document.getElementById('toggle-pass-visibility-btn').innerText = '👁️';
      
      document.getElementById('form-title').innerText = "Edit Credential";
      document.getElementById('service-input').focus();
    });
  });
  
  // Delete Password Entry
  document.querySelectorAll('.btn-delete').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.getAttribute('data-id');
      const entry = cachedPasswords.find(p => p.id === id);
      if (confirm(`Are you sure you want to delete the credential for "${entry.service}"?`)) {
        window.pywebview.api.delete_password(id).then(response => {
          if (response.success) {
            loadPasswords();
            clearCredentialForm();
          } else {
            alert(response.error);
          }
        });
      }
    });
  });
}

// Clipboard copy helper
function copyToClipboard(text, btn) {
  navigator.clipboard.writeText(text).then(() => {
    const originalText = btn.innerText;
    btn.innerText = "Copied!";
    btn.style.background = "#10b981";
    btn.style.color = "#fff";
    setTimeout(() => {
      btn.innerText = originalText;
      btn.style.background = "";
      btn.style.color = "";
    }, 1500);
  }).catch(err => {
    console.error("Copy failed", err);
  });
}

// Add/Update Credential Submit
document.getElementById('save-entry-btn').addEventListener('click', () => {
  const id = document.getElementById('entry-id').value;
  const service = document.getElementById('service-input').value;
  const username = document.getElementById('username-input').value;
  const password = document.getElementById('password-input').value;
  const errorEl = document.getElementById('vault-action-error-msg');
  
  if (!service || !username || !password) {
    errorEl.innerText = "All fields are required.";
    errorEl.style.display = 'block';
    return;
  }
  
  errorEl.style.display = 'none';
  
  const callback = (response) => {
    if (response.success) {
      loadPasswords();
      clearCredentialForm();
    } else {
      errorEl.innerText = response.error;
      errorEl.style.display = 'block';
    }
  };
  
  if (id) {
    // Update Mode
    window.pywebview.api.update_password(id, service, username, password).then(callback);
  } else {
    // Add Mode
    window.pywebview.api.add_password(service, username, password).then(callback);
  }
});

// Clear Form
document.getElementById('clear-form-btn').addEventListener('click', clearCredentialForm);

function clearCredentialForm() {
  document.getElementById('entry-id').value = '';
  document.getElementById('service-input').value = '';
  document.getElementById('username-input').value = '';
  document.getElementById('password-input').value = '';
  document.getElementById('password-input').type = 'password';
  document.getElementById('toggle-pass-visibility-btn').innerText = '👁️';
  document.getElementById('form-title').innerText = "Add New Credential";
  document.getElementById('vault-action-error-msg').style.display = 'none';
}

// Password Form Visibility Toggle
document.getElementById('toggle-pass-visibility-btn').addEventListener('click', () => {
  const passInput = document.getElementById('password-input');
  const btn = document.getElementById('toggle-pass-visibility-btn');
  if (passInput.type === 'password') {
    passInput.type = 'text';
    btn.innerText = '🙈';
  } else {
    passInput.type = 'password';
    btn.innerText = '👁️';
  }
});

// Secure Password Generator
document.getElementById('generate-pass-btn').addEventListener('click', () => {
  const length = 16;
  const charset = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*()-_=+[]{}|;:,.<>?";
  const array = new Uint32Array(length);
  const cryptoObj = window.crypto || window.msCrypto;
  if (cryptoObj && cryptoObj.getRandomValues) {
    cryptoObj.getRandomValues(array);
  } else {
    for (let i = 0; i < length; i++) {
      array[i] = Math.floor(Math.random() * 4294967296);
    }
  }
  
  let password = "";
  for (let i = 0; i < length; i++) {
    password += charset[array[i] % charset.length];
  }
  
  const passInput = document.getElementById('password-input');
  passInput.value = password;
  passInput.type = 'text'; // Make visible
  document.getElementById('toggle-pass-visibility-btn').innerText = '🙈';
});

// Search Filter
document.getElementById('search-input').addEventListener('input', (e) => {
  const query = e.target.value.toLowerCase().trim();
  if (!query) {
    renderPasswords(cachedPasswords);
    return;
  }
  const filtered = cachedPasswords.filter(entry => 
    entry.service.toLowerCase().includes(query) || 
    entry.username.toLowerCase().includes(query)
  );
  renderPasswords(filtered);
});

// Change Master Password Modal Actions
document.getElementById('show-change-pw-btn').addEventListener('click', () => {
  const modal = document.getElementById('change-pw-modal');
  modal.style.display = modal.style.display === 'none' ? 'block' : 'none';
  document.getElementById('change-pw-error-msg').style.display = 'none';
});

document.getElementById('cancel-change-pw-btn').addEventListener('click', () => {
  document.getElementById('change-pw-modal').style.display = 'none';
  document.getElementById('current-master-password').value = '';
  document.getElementById('new-master-pw').value = '';
  document.getElementById('confirm-new-master-pw').value = '';
});

document.getElementById('submit-change-pw-btn').addEventListener('click', () => {
  const currentPw = document.getElementById('current-master-password').value;
  const newPw = document.getElementById('new-master-pw').value;
  const confirmNewPw = document.getElementById('confirm-new-master-pw').value;
  const errorEl = document.getElementById('change-pw-error-msg');
  
  if (!currentPw || !newPw || !confirmNewPw) {
    errorEl.innerText = "All fields are required.";
    errorEl.style.display = 'block';
    return;
  }
  
  if (newPw.length < 8) {
    errorEl.innerText = "New master password must be at least 8 characters.";
    errorEl.style.display = 'block';
    return;
  }
  
  if (newPw !== confirmNewPw) {
    errorEl.innerText = "New passwords do not match.";
    errorEl.style.display = 'block';
    return;
  }
  
  errorEl.style.display = 'none';
  
  window.pywebview.api.change_master_password(currentPw, newPw).then(response => {
    if (response.success) {
      alert("Master password changed successfully!");
      document.getElementById('change-pw-modal').style.display = 'none';
      document.getElementById('current-master-password').value = '';
      document.getElementById('new-master-pw').value = '';
      document.getElementById('confirm-new-master-pw').value = '';
    } else {
      errorEl.innerText = response.error;
      errorEl.style.display = 'block';
    }
  });
});


/* ==========================================================
   4. Dorse Code Configuration Mapping Editor
   ========================================================== */

const showDorseConfigBtn = document.getElementById('show-dorse-config-btn');
const dorseConfigModal = document.getElementById('dorse-config-modal');
const dorseMappingEditor = document.getElementById('dorse-mapping-editor');
const saveDorseConfigBtn = document.getElementById('save-dorse-config-btn');
const shuffleDorseConfigBtn = document.getElementById('shuffle-dorse-config-btn');
const copyDorseJsonBtn = document.getElementById('copy-dorse-json-btn');
const resetDorseConfigBtn = document.getElementById('reset-dorse-config-btn');
const cancelDorseConfigBtn = document.getElementById('cancel-dorse-config-btn');
const dorseConfigErrorMsg = document.getElementById('dorse-config-error-msg');

function showDorseError(msg) {
  dorseConfigErrorMsg.innerText = msg;
  dorseConfigErrorMsg.style.display = 'block';
}

function hideDorseError() {
  dorseConfigErrorMsg.style.display = 'none';
}

// Show config modal and build UI inputs
showDorseConfigBtn.addEventListener('click', () => {
  if (dorseConfigModal.style.display === 'none') {
    buildDorseEditor();
    dorseConfigModal.style.display = 'block';
  } else {
    dorseConfigModal.style.display = 'none';
  }
});

function buildDorseEditor() {
  dorseMappingEditor.innerHTML = '';
  hideDorseError();
  
  // Sort characters (keys) alphabetically
  const keys = Object.keys(dorse).sort((a, b) => a.localeCompare(b));
  
  keys.forEach(char => {
    const itemDiv = document.createElement('div');
    itemDiv.className = 'dorse-item';
    
    // Display character (wrap space in readable tag)
    const labelChar = char === ' ' ? 'Space' : char;
    
    itemDiv.innerHTML = `
      <span>${escapeHtml(labelChar)}</span>
      <input type="text" data-char="${escapeHtml(char)}" value="${escapeHtml(dorse[char])}" maxlength="10">
    `;
    dorseMappingEditor.appendChild(itemDiv);
  });
}

// Cancel
cancelDorseConfigBtn.addEventListener('click', () => {
  dorseConfigModal.style.display = 'none';
});

// Reset to Default
resetDorseConfigBtn.addEventListener('click', () => {
  if (confirm("Are you sure you want to reset the Dorse mapping to default?")) {
    window.pywebview.api.reset_dorse_config().then(response => {
      if (response.success) {
        updateDorseMappings(response.config);
        buildDorseEditor();
        update(); // Refresh translator output
        alert("Dorse mapping reset to default successfully.");
      } else {
        showDorseError(response.error);
      }
    });
  }
});

// Shuffle Mappings (Cryptographically secure, maintaining 1-to-1 unique mapping consistency)
shuffleDorseConfigBtn.addEventListener('click', () => {
  const inputs = dorseMappingEditor.querySelectorAll('input');
  if (inputs.length === 0) return;
  
  // Gather all unique code values currently in the inputs
  const codes = [];
  inputs.forEach(input => {
    codes.push(input.value.trim());
  });
  
  // Fisher-Yates shuffle using cryptographically secure random values (with fallback)
  const secureRandom = new Uint32Array(codes.length);
  const cryptoObj = window.crypto || window.msCrypto;
  if (cryptoObj && cryptoObj.getRandomValues) {
    cryptoObj.getRandomValues(secureRandom);
  } else {
    for (let k = 0; k < secureRandom.length; k++) {
      secureRandom[k] = Math.floor(Math.random() * 4294967296);
    }
  }
  
  for (let i = codes.length - 1; i > 0; i--) {
    const j = secureRandom[i] % (i + 1);
    const temp = codes[i];
    codes[i] = codes[j];
    codes[j] = temp;
  }
  
  // Re-assign shuffled values back to inputs
  inputs.forEach((input, index) => {
    input.value = codes[index];
  });
  
  hideDorseError();
});

// Copy JSON of the current mapping shown in the editor inputs to the clipboard
copyDorseJsonBtn.addEventListener('click', () => {
  const currentConfig = {};
  const inputs = dorseMappingEditor.querySelectorAll('input');
  
  for (let input of inputs) {
    const char = input.getAttribute('data-char');
    const val = input.value.trim();
    currentConfig[char] = val;
  }
  
  const jsonStr = JSON.stringify(currentConfig, null, 2);
  
  navigator.clipboard.writeText(jsonStr).then(() => {
    const originalText = copyDorseJsonBtn.innerText;
    copyDorseJsonBtn.innerText = "Copied JSON!";
    copyDorseJsonBtn.style.background = "#10b981";
    copyDorseJsonBtn.style.color = "#fff";
    setTimeout(() => {
      copyDorseJsonBtn.innerText = originalText;
      copyDorseJsonBtn.style.background = "";
      copyDorseJsonBtn.style.color = "";
    }, 1500);
  }).catch(err => {
    console.error("Copy failed", err);
    showDorseError("Failed to copy mapping JSON to clipboard.");
  });
});

// Save Mappings
saveDorseConfigBtn.addEventListener('click', () => {
  const newConfig = {};
  const inputs = dorseMappingEditor.querySelectorAll('input');
  hideDorseError();
  
  // Gather and validate values
  for (let input of inputs) {
    const char = input.getAttribute('data-char');
    const val = input.value.trim();
    
    if (!val) {
      showDorseError(`Mapping for character '${char}' cannot be empty.`);
      input.focus();
      return;
    }
    
    // Check code does not contain whitespace
    if (/\s/.test(val)) {
      showDorseError(`Mapping for character '${char}' cannot contain spaces or whitespace.`);
      input.focus();
      return;
    }
    
    newConfig[char] = val;
  }
  
  // Validate duplicate mappings (ambiguous decodes)
  const codes = Object.values(newConfig);
  const duplicates = codes.filter((item, index) => codes.indexOf(item) !== index);
  if (duplicates.length > 0) {
    const duplicateCode = duplicates[0];
    const duplicatesChars = Object.keys(newConfig).filter(k => newConfig[k] === duplicateCode);
    showDorseError(`Duplicate code representation found: '${duplicateCode}' is mapped to both '${duplicatesChars[0]}' and '${duplicatesChars[1]}'. Each character must map to a unique code sequence.`);
    return;
  }
  
  // Save to Python
  window.pywebview.api.save_dorse_config(newConfig).then(response => {
    if (response.success) {
      updateDorseMappings(newConfig);
      dorseConfigModal.style.display = 'none';
      update(); // Refresh translator output
      alert("Dorse mapping configuration saved successfully!");
    } else {
      showDorseError(response.error);
    }
  });
});


// HTML escaping helper
function escapeHtml(str) {
  if (typeof str !== 'string') return str;
  return str.replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
}
