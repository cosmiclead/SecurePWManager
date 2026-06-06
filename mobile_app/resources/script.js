/* ==========================================================
   1. Original Dorse Code Translator Logic (Kept exactly as it is)
   ========================================================== */
const dorse = {
  "_":"-...-","A":"...",	"a":"....-.",	"0":"--...",
  "!":".--.-.",	"B":"--..",	"b":"-..--",	"1":".....",
  ";":"..--..",	"C":"..",	  "c":"--.--",	"2":"---..",
  "#":".-..--",	"D":"--.-",	"d":"--.-.",	"3":"-----",
  "$":"...-.-",	"E":".-.",	"e":".....-",	"4":"----.",
  "%":".-...",	"F":"-",	  "f":"--..-",	"5":"...--",
  "&":"...-..-","G":".---",	"g":"-.-..",	"6":"-....",
  "'":"-.-.--",	"H":"-...",	"h":"....--",	"7":"..---",
  "(":".-.-.",	"I":"-..-",	"i":"......",	"8":"....-",
  ")":".-..-.",	"J":".--.",	"j":"---.-",	"9":".----",
  "*":"-..-.",	"K":"-.--",	"k":".---.",			
  "+":".----.",	"L":".--",	"l":"..--",			
  "-":".-.--.",	"M":"...-",	"m":".--..",			
  ".":"..-.-.",	"N":"-.-.",	"n":"..-..",			
  "/":"..-...",	"O":".-..",	"o":"---.",			
  ":":"...---",	"P":".",	  "p":".-..-",			
  "^":".-.-..",	"Q":"-.-",	"q":"...-.",			
  "<":"-.--.-",	"R":"..-.",	"r":"...-..",			
  "=":".-.-.-",	"S":"-..",	"s":"..--.",			
  ">":".-.---",	"T":"---",	"t":".--.-",			
  "?":"...--.",	"U":".-",	  "u":"..-.-",			
  "@":"---...",	"V":"-.",	  "v":"----",			
  "{":"-.--.",	"W":"....",	"w":".-.--",			
  "|":"-....-",	"X":"--",	  "x":"-.---",			
  "}":"..-..-",	"Y":"--.",	"y":"-.-.-",			
  "~":"-.-.-.",	"Z":"..-",	"z":".-.-",			
};

const rev = {};
for (const [k, v] of Object.entries(dorse)) rev[v] = k;

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
      if (tok === '/'). return ' ';
      const ch = rev[tok];
      return ch || '?';
    }).join('');
  }).join('\n');
}

function detectMode(value) {
  const sample = value.trim().split(/\s+/);
  const codeLike = sample.filter(x => /^[.\-]+$/.test(x)).length;
  return codeLike > sample.length * 0.5 ? 'code' : 'text';
}

const input = document.getElementById('input');
const output = document.getElementById('output');

function update() {
  const val = input.value.trim();
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
   2. BeeWare Toga WebView Mobile Message Bridge
   ========================================================== */

const pendingCallbacks = {};

// Asynchronous call passing JSON messages to Python Toga
function callPython(action, data = {}) {
  return new Promise((resolve) => {
    const callbackId = 'cb_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    pendingCallbacks[callbackId] = resolve;
    
    const request = {
      action: action,
      data: data,
      callbackId: callbackId
    };
    
    // Toga WebView bridge method on Android
    if (window.toga && window.toga.postMessage) {
      window.toga.postMessage(JSON.stringify(request));
    } else {
      console.warn("Toga postMessage not available. Request:", request);
    }
  });
}

// Global hook for Python response callbacks
window.handlePythonResponse = function(callbackId, response) {
  if (pendingCallbacks[callbackId]) {
    pendingCallbacks[callbackId](response);
    delete pendingCallbacks[callbackId];
  }
};


/* ==========================================================
   3. Mobile App Logic
   ========================================================== */

let isVaultUnlocked = false;
let cachedPasswords = [];
let inactivityTimeout = null;
const INACTIVITY_TIME = 5 * 60 * 1000;

// Initialize when page is loaded
window.addEventListener('DOMContentLoaded', () => {
  // Give Toga WebView a tiny buffer to initialize the window object
  setTimeout(checkVaultStatus, 200);
});

function checkVaultStatus() {
  callPython("is_vault_created").then(created => {
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

// Inactivity Locking
function resetInactivityTimer() {
  if (inactivityTimeout) clearTimeout(inactivityTimeout);
  if (isVaultUnlocked) {
    inactivityTimeout = setTimeout(lockVault, INACTIVITY_TIME);
  }
}

['mousemove', 'keydown', 'click', 'scroll', 'mousedown', 'touchstart'].forEach(event => {
  window.addEventListener(event, resetInactivityTimer);
});

function lockVault() {
  isVaultUnlocked = false;
  cachedPasswords = [];
  document.getElementById('password-entries-list').innerHTML = '';
  clearCredentialForm();
  
  document.getElementById('current-master-password').value = '';
  document.getElementById('new-master-pw').value = '';
  document.getElementById('confirm-new-master-pw').value = '';
  document.getElementById('change-pw-modal').style.display = 'none';
  
  callPython("lock_vault").then(() => {
    checkVaultStatus();
  });
}

document.getElementById('lock-vault-btn').addEventListener('click', lockVault);

// Lockout timer polling
function checkLockout() {
  callPython("get_lockout_time").then(lockoutSecs => {
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
  
  passwordInput.value = '';
  
  callPython("unlock", { password: password }).then(response => {
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
  
  newPassEl.value = '';
  confirmPassEl.value = '';
  
  callPython("create_vault", { password: newPass }).then(response => {
    if (response.success) {
      checkVaultStatus();
      hideAuthError();
    } else {
      showAuthError(response.error);
    }
  });
});

// Load credentials
function loadPasswords() {
  callPython("get_passwords").then(response => {
    if (response.success) {
      cachedPasswords = response.passwords;
      renderPasswords(cachedPasswords);
    } else {
      lockVault();
    }
  });
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
  
  attachListEventListeners();
}

function attachListEventListeners() {
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
  
  document.querySelectorAll('.btn-copy-user').forEach(btn => {
    btn.addEventListener('click', () => {
      const username = btn.getAttribute('data-username');
      copyToClipboard(username, btn);
    });
  });
  
  document.querySelectorAll('.btn-copy-pass').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.getAttribute('data-id');
      const entry = cachedPasswords.find(p => p.id === id);
      copyToClipboard(entry.password, btn);
    });
  });
  
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
  
  document.querySelectorAll('.btn-delete').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.getAttribute('data-id');
      const entry = cachedPasswords.find(p => p.id === id);
      if (confirm(`Are you sure you want to delete the credential for "${entry.service}"?`)) {
        callPython("delete_password", { id: id }).then(response => {
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
    callPython("update_password", { id, service, username, password }).then(callback);
  } else {
    callPython("add_password", { service, username, password }).then(callback);
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
  passInput.type = 'text';
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
  
  callPython("change_master_password", { current_pw: currentPw, new_pw: newPw }).then(response => {
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

// HTML escaping helper
function escapeHtml(str) {
  if (typeof str !== 'string') return str;
  return str.replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
}
