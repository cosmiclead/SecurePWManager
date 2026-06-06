import os
import time
import json
import shutil
import unittest
from app import VaultManager, VAULT_PATH, SALT_PATH, LOCKOUT_PATH

class TestVaultManager(unittest.TestCase):
    def setUp(self):
        # Backup existing vault files if they exist to prevent losing user data during tests
        self.backups = {}
        for path in [VAULT_PATH, SALT_PATH, LOCKOUT_PATH]:
            if os.path.exists(path):
                backup_path = path + '.bak_test'
                shutil.copy2(path, backup_path)
                self.backups[path] = backup_path
                os.remove(path)

    def tearDown(self):
        # Clean up test files
        for path in [VAULT_PATH, SALT_PATH, LOCKOUT_PATH]:
            if os.path.exists(path):
                os.remove(path)
                
        # Restore backups if they existed
        for orig_path, backup_path in self.backups.items():
            if os.path.exists(backup_path):
                shutil.copy2(backup_path, orig_path)
                os.remove(backup_path)

    def test_vault_lifecycle(self):
        mgr = VaultManager()
        
        # 1. Assert vault is not created initially
        self.assertFalse(mgr.is_vault_created())
        
        # 2. Create vault
        success, msg = mgr.create_vault("super_secret_master_123")
        self.assertTrue(success)
        self.assertTrue(mgr.is_vault_created())
        self.assertTrue(os.path.exists(VAULT_PATH))
        self.assertTrue(os.path.exists(SALT_PATH))
        
        # Clean manager state
        mgr.clear_sensitive_data()
        self.assertIsNone(mgr.key)
        self.assertIsNone(mgr.passwords)
        
        # 3. Unlock with correct password
        success, msg, lockout_secs = mgr.unlock("super_secret_master_123")
        self.assertTrue(success)
        self.assertEqual(lockout_secs, 0)
        self.assertIsNotNone(mgr.key)
        self.assertEqual(mgr.passwords, [])
        
        # 4. Add password and save
        test_entry = {
            "id": "1",
            "service": "google.com",
            "username": "testuser",
            "password": "secretpassword"
        }
        mgr.passwords.append(test_entry)
        mgr.save_vault()
        
        # Clear state and verify it decrypted back correctly
        mgr.clear_sensitive_data()
        success, _, _ = mgr.unlock("super_secret_master_123")
        self.assertTrue(success)
        self.assertEqual(len(mgr.passwords), 1)
        self.assertEqual(mgr.passwords[0]["service"], "google.com")
        
        # 5. Unlock with wrong password
        mgr2 = VaultManager()
        success, msg, lockout_secs = mgr2.unlock("wrong_password")
        self.assertFalse(success)
        self.assertIn("incorrect", msg.lower())
        self.assertIsNone(mgr2.key)
        
    def test_lockout_mechanism(self):
        mgr = VaultManager()
        mgr.create_vault("super_secret_master_123")
        mgr.clear_sensitive_data()
        
        # First failed attempt
        success, msg, lockout_secs = mgr.unlock("wrong_password_1")
        self.assertFalse(success)
        self.assertEqual(lockout_secs, 0)
        
        # Second failed attempt
        success, msg, lockout_secs = mgr.unlock("wrong_password_2")
        self.assertFalse(success)
        self.assertEqual(lockout_secs, 0)
        
        # Third failed attempt - should trigger lockout
        success, msg, lockout_secs = mgr.unlock("wrong_password_3")
        self.assertFalse(success)
        self.assertGreater(lockout_secs, 0)
        self.assertIn("incorrect master password", msg.lower())
        
        # Verify attempt to unlock with CORRECT password during lockout period is blocked
        success, msg, lockout_secs2 = mgr.unlock("super_secret_master_123")
        self.assertFalse(success)
        self.assertGreater(lockout_secs2, 0)
        self.assertIn("too many failed attempts", msg.lower())

    def test_change_master_password(self):
        mgr = VaultManager()
        mgr.create_vault("old_password_123")
        
        # Add a credential before password change
        mgr.passwords.append({
            "id": "1", "service": "git.com", "username": "gituser", "password": "gitpassword"
        })
        mgr.save_vault()
        
        # Change password
        success, msg = mgr.change_master_password("old_password_123", "new_password_abc")
        self.assertTrue(success)
        
        # Lock and unlock with old password -> should fail
        mgr.clear_sensitive_data()
        success, msg, _ = mgr.unlock("old_password_123")
        self.assertFalse(success)
        
        # Unlock with new password -> should succeed and contain old credentials
        mgr.clear_sensitive_data()
        success, msg, _ = mgr.unlock("new_password_abc")
        self.assertTrue(success)
        self.assertEqual(len(mgr.passwords), 1)
        self.assertEqual(mgr.passwords[0]["service"], "git.com")

if __name__ == '__main__':
    unittest.main()
