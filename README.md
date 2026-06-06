# Secure Password Manager & Translator

A portable, desktop password manager and customizable translator built for Windows. It stores all your credentials locally with top-tier security and keeps your data completely in your own hands.

---

## 🚀 How to Run the Application

1. Double-click `app.exe` (located in the `dist/` folder).
2. The first time you launch the application, you will be prompted to create a **Master Password** to initialize and secure your vault.
3. Every time after that, simply enter your Master Password to unlock your credentials.

---

## ✨ Key Features

### 1. Zero-Trust Local Security
* **Strong Encryption**: All passwords are encrypted on your computer using AES-256-GCM. No one—not even developers—can access your passwords without your Master Password.
* **Master Password Key derivation**: The app uses PBKDF2-HMAC-SHA256 with 600,000 iterations to process your master password. This prevents hackers from brute-forcing your passwords even if they steal your files.

### 2. Auto-Lock & Brute-Force Prevention
* **Inactivity Lock**: If you leave the application open and inactive for 5 minutes, it automatically locks itself and wipes all passwords from the computer's memory.
* **Login Lockout**: If someone enters the wrong Master Password 3 times, the app temporarily locks them out. The lockout duration grows longer with more failed attempts and persists even if they close and restart the app.

### 3. Portable Database Design
* All database files are saved in a hidden folder named `.data` created right next to your `app.exe`.
* **To back up or move to another PC**: Just copy the entire folder containing `app.exe` and the hidden `.data` folder. Your vault will work instantly on the new machine.
* **To delete everything**: Simply delete the folder containing `app.exe` and the `.data` folder. No remnants of your passwords will remain on your computer.

### 4. Customizable Symbol Translator
* Map characters to custom codes (using any symbols, letters, numbers, or emojis you like).
* **Random Shuffle**: Scrambles your mapping with one click to keep your translation code unique and completely unpredictable, while automatically preventing duplicate representations.
* **Export Mapping**: Easily copy your active mappings as a standard JSON string to the clipboard to share or use elsewhere.

### 5. Hidden Easter Egg
* By default, the translator is hidden. To make it appear, create a new credential entry where the **Service Name**, **Username**, and **Password** are all exactly equal to your **Master Password**. 
* Once saved, the translator appears instantly and will persist every time you unlock the vault. Delete this credential to hide the translator again.

---

## 🗄️ File Storage Information

The hidden `.data/` folder contains:
* `vault.enc` - Your encrypted passwords.
* `vault.salt` - The random salt used to secure your Master Password.
* `lockout.json` - Lockout tracking information.
* `dorse.json` - Your customized symbol mapping settings.

*Keep these files safe! Deleting `vault.enc` or `vault.salt` will permanently delete your stored passwords.*
