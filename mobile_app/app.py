import os
import json
import time
import base64
import uuid
import toga
from toga.style import Pack
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC
from cryptography.hazmat.primitives import hashes

PBKDF2_ITERATIONS = 600000
MAX_FAILED_ATTEMPTS = 3
INITIAL_LOCKOUT_DURATION = 30

class MobileVaultManager:
    """
    Handles key derivation, AES-256-GCM encryption/decryption,
    and lockout persistence in the mobile sandboxed storage.
    """
    def __init__(self, data_dir):
        self.DATA_DIR = data_dir
        self.VAULT_PATH = os.path.join(self.DATA_DIR, 'vault.enc')
        self.SALT_PATH = os.path.join(self.DATA_DIR, 'vault.salt')
        self.LOCKOUT_PATH = os.path.join(self.DATA_DIR, 'lockout.json')
        self.key = None
        self.passwords = None

    def is_vault_created(self):
        return os.path.exists(self.VAULT_PATH) and os.path.exists(self.SALT_PATH)

    def get_lockout_data(self):
        if not os.path.exists(self.LOCKOUT_PATH):
            return {"failed_attempts": 0, "lockout_until": 0.0, "lockout_duration": INITIAL_LOCKOUT_DURATION}
        try:
            with open(self.LOCKOUT_PATH, 'r') as f:
                data = json.load(f)
                if "failed_attempts" not in data or "lockout_until" not in data:
                    raise ValueError("Invalid structure")
                if "lockout_duration" not in data:
                    data["lockout_duration"] = INITIAL_LOCKOUT_DURATION
                return data
        except Exception:
            return {"failed_attempts": 0, "lockout_until": 0.0, "lockout_duration": INITIAL_LOCKOUT_DURATION}

    def save_lockout_data(self, data):
        try:
            with open(self.LOCKOUT_PATH, 'w') as f:
                json.dump(data, f)
        except Exception as e:
            print(f"Error saving lockout data: {e}")

    def check_lockout(self):
        data = self.get_lockout_data()
        now = time.time()
        remaining = data["lockout_until"] - now
        return max(0, int(remaining))

    def record_failed_attempt(self):
        data = self.get_lockout_data()
        data["failed_attempts"] += 1
        
        if data["failed_attempts"] >= MAX_FAILED_ATTEMPTS:
            mult = 2 ** (data["failed_attempts"] - MAX_FAILED_ATTEMPTS)
            duration = data["lockout_duration"] * mult
            duration = min(duration, 3600)
            data["lockout_until"] = time.time() + duration
        
        self.save_lockout_data(data)
        return self.check_lockout()

    def reset_failed_attempts(self):
        data = self.get_lockout_data()
        data["failed_attempts"] = 0
        data["lockout_until"] = 0.0
        data["lockout_duration"] = INITIAL_LOCKOUT_DURATION
        self.save_lockout_data(data)

    def derive_key(self, master_password, salt):
        kdf = PBKDF2HMAC(
            algorithm=hashes.SHA256(),
            length=32,
            salt=salt,
            iterations=PBKDF2_ITERATIONS
        )
        return kdf.derive(master_password.encode('utf-8'))

    def create_vault(self, master_password):
        if self.is_vault_created():
            return False, "Vault already exists."
        
        try:
            salt = os.urandom(16)
            self.key = self.derive_key(master_password, salt)
            self.passwords = []
            
            with open(self.SALT_PATH, 'w') as f:
                f.write(base64.b64encode(salt).decode('utf-8'))
                
            self.save_vault()
            self.reset_failed_attempts()
            return True, "Vault created successfully."
        except Exception as e:
            self.clear_sensitive_data()
            return False, f"Failed to create vault: {str(e)}"

    def unlock(self, master_password):
        lockout_secs = self.check_lockout()
        if lockout_secs > 0:
            return False, f"Too many failed attempts. Try again in {lockout_secs} seconds.", lockout_secs

        if not self.is_vault_created():
            return False, "Vault files not found.", 0

        try:
            with open(self.SALT_PATH, 'r') as f:
                salt_b64 = f.read().strip()
                salt = base64.b64decode(salt_b64)
                
            derived_key = self.derive_key(master_password, salt)
            
            with open(self.VAULT_PATH, 'rb') as f:
                encrypted_data = f.read()
                
            if len(encrypted_data) < 13:
                raise ValueError("Vault file is corrupted or empty.")
                
            nonce = encrypted_data[:12]
            ciphertext = encrypted_data[12:]
            
            aesgcm = AESGCM(derived_key)
            decrypted_bytes = aesgcm.decrypt(nonce, ciphertext, None)
            
            self.passwords = json.loads(decrypted_bytes.decode('utf-8'))
            self.key = derived_key
            self.reset_failed_attempts()
            return True, "Vault unlocked successfully.", 0
            
        except Exception as e:
            self.clear_sensitive_data()
            rem_lockout = self.record_failed_attempt()
            return False, "Incorrect master password.", rem_lockout

    def save_vault(self):
        if self.key is None or self.passwords is None:
            raise PermissionError("Vault is not unlocked.")
            
        plain_bytes = json.dumps(self.passwords).encode('utf-8')
        aesgcm = AESGCM(self.key)
        nonce = os.urandom(12)
        ciphertext = aesgcm.encrypt(nonce, plain_bytes, None)
        
        with open(self.VAULT_PATH, 'wb') as f:
            f.write(nonce + ciphertext)

    def change_master_password(self, current_password, new_password):
        if self.key is None:
            return False, "Vault is locked."
            
        with open(self.SALT_PATH, 'r') as f:
            salt_b64 = f.read().strip()
            salt = base64.b64decode(salt_b64)
            
        current_derived = self.derive_key(current_password, salt)
        if current_derived != self.key:
            return False, "Incorrect current master password."
            
        try:
            new_salt = os.urandom(16)
            new_key = self.derive_key(new_password, new_salt)
            
            with open(self.SALT_PATH, 'w') as f:
                f.write(base64.b64encode(new_salt).decode('utf-8'))
                
            self.key = new_key
            self.save_vault()
            return True, "Master password changed successfully."
        except Exception as e:
            return False, f"Failed to change master password: {str(e)}"

    def clear_sensitive_data(self):
        self.key = None
        self.passwords = None

class SecurePasswordManager(toga.App):
    def startup(self):
        # 1. Setup persistent storage paths in the mobile sandbox
        self.vault_mgr = MobileVaultManager(self.paths.data)
        
        # 2. Setup WebView Component
        self.webview = toga.WebView(style=Pack(flex=1))
        self.webview.on_message = self.handle_js_message
        
        # Load index.html from app resources folder
        self.webview.url = self.paths.app / "resources/index.html"

        # 3. Main Window Layout
        self.main_window = toga.MainWindow(title=self.formal_name)
        self.main_window.content = self.webview
        self.main_window.show()

    def handle_js_message(self, webview, message):
        """
        Processes API calls passed from JavaScript via window.toga.postMessage
        """
        try:
            req = json.loads(message)
            action = req.get("action")
            data = req.get("data", {})
            callback_id = req.get("callbackId")
            
            result = self.process_action(action, data)
            self.send_js_response(callback_id, result)
            
        except Exception as e:
            print(f"Error handling WebView message: {e}")

    def send_js_response(self, callback_id, payload):
        """
        Sends the execution result back to the webview callback handler
        """
        response_str = json.dumps(payload)
        js_cmd = f"window.handlePythonResponse('{callback_id}', {response_str});"
        self.webview.evaluate_javascript(js_cmd)

    def process_action(self, action, data):
        """
        Routing logic for the Mobile API actions
        """
        if action == "is_vault_created":
            return self.vault_mgr.is_vault_created()
            
        elif action == "get_lockout_time":
            return self.vault_mgr.check_lockout()
            
        elif action == "unlock":
            password = data.get("password", "")
            if not password:
                return {"success": False, "error": "Password cannot be empty.", "lockout_time": 0}
            success, msg, lockout_secs = self.vault_mgr.unlock(password)
            return {"success": success, "error": msg if not success else "", "lockout_time": lockout_secs}
            
        elif action == "create_vault":
            password = data.get("password", "")
            if not password or len(password) < 8:
                return {"success": False, "error": "Password must be at least 8 characters."}
            success, msg = self.vault_mgr.create_vault(password)
            return {"success": success, "error": msg if not success else ""}
            
        elif action == "lock_vault":
            self.vault_mgr.clear_sensitive_data()
            return True
            
        elif action == "get_passwords":
            if self.vault_mgr.key is None or self.vault_mgr.passwords is None:
                return {"success": False, "error": "Vault is locked."}
            return {"success": True, "passwords": self.vault_mgr.passwords}
            
        elif action == "add_password":
            if self.vault_mgr.key is None or self.vault_mgr.passwords is None:
                return {"success": False, "error": "Vault is locked."}
            service = data.get("service", "").strip()
            username = data.get("username", "").strip()
            password = data.get("password", "").strip()
            if not service or not username or not password:
                return {"success": False, "error": "All fields are required."}
            try:
                entry = {"id": str(uuid.uuid4()), "service": service, "username": username, "password": password}
                self.vault_mgr.passwords.append(entry)
                self.vault_mgr.save_vault()
                return {"success": True, "entry": entry}
            except Exception as e:
                return {"success": False, "error": str(e)}
                
        elif action == "update_password":
            if self.vault_mgr.key is None or self.vault_mgr.passwords is None:
                return {"success": False, "error": "Vault is locked."}
            entry_id = data.get("id", "")
            service = data.get("service", "").strip()
            username = data.get("username", "").strip()
            password = data.get("password", "").strip()
            if not service or not username or not password:
                return {"success": False, "error": "All fields are required."}
            try:
                for entry in self.vault_mgr.passwords:
                    if entry["id"] == entry_id:
                        entry["service"] = service
                        entry["username"] = username
                        entry["password"] = password
                        self.vault_mgr.save_vault()
                        return {"success": True, "entry": entry}
                return {"success": False, "error": "Entry not found."}
            except Exception as e:
                return {"success": False, "error": str(e)}
                
        elif action == "delete_password":
            if self.vault_mgr.key is None or self.vault_mgr.passwords is None:
                return {"success": False, "error": "Vault is locked."}
            entry_id = data.get("id", "")
            try:
                for i, entry in enumerate(self.vault_mgr.passwords):
                    if entry["id"] == entry_id:
                        self.vault_mgr.passwords.pop(i)
                        self.vault_mgr.save_vault()
                        return {"success": True}
                return {"success": False, "error": "Entry not found."}
            except Exception as e:
                return {"success": False, "error": str(e)}
                
        elif action == "change_master_password":
            current_pw = data.get("current_pw", "")
            new_pw = data.get("new_pw", "")
            if not new_pw or len(new_pw) < 8:
                return {"success": False, "error": "New master password must be at least 8 characters."}
            success, msg = self.vault_mgr.change_master_password(current_pw, new_pw)
            return {"success": success, "error": msg if not success else ""}
            
        return {"error": "Invalid Action"}

def main():
    return SecurePasswordManager()
