# ClinicCore EMR Workstation V1.0 - One-Pager Deployment Guide
### Asaan Roman Urdu Guide: Build Banane Se Le Kar Clinic Par Chalane Tak

---

## 📋 Khulasa (Quick Overview)
- **Zero Internet Required:** Pura system 100% offline air-gapped LAN par chalta hai.
- **Zero Friction Licensing:** Doctor se pehle se MAC address ya UUID lene ki zaroorat nahi. Software pehli dafa chalte hi khud us PC ke sath lock ho jata hai.
- **Clean Database:** 1 button dabane se tamam mock mareez aur fake bills saaf ho jate hain.

---

## 🛠️ Step 1: Apne Laptop Par Build Tayyar Karna

1. Apne laptop par project folder open karein.
2. Agar **Pediatrics (Bacho ka Clinic)** hai to is file par double-click karein:
   👉 `BUILD_FOR_PEDS_CLINIC.bat`
   *(Agar General / Family clinic hai to `BUILD_AIRGAP_RELEASE.bat` par double-click karein).*
3. Yeh script auto-pilot par:
   - Clinic ka theme aur modules configure karega.
   - First-Boot Auto-Lock active karega.
   - Pura system compile karke **`dist-release\`** folder mein pack kar dega.
4. Build complete hone par **`dist-release\`** folder ko apni **USB Drive** mein copy kar lein.

---

## 🚗 Step 2: Clinic PC Par Setup Karna

1. USB drive ko clinic ke **Main Server PC** (jo PC hamesha on rahega) mein lagayein.
2. `dist-release` folder ko copy karke C: drive mein paste karein:
   - Path: `C:\ClinicCore\`
3. Folder ke andar mojood is file par double-click karein:
   👉 `START_CLINIC_HOST.bat`

### 🔒 Kya Hoga (Automatic Hardware Lock):
- Pehli dafa chalte hi system khud us PC ka **Motherboard UUID + CPU + MAC** read karega.
- Ek second mein **`host.lock`** bana kar software ko **us PC ke sath permanently lock** kar dega.
- Screen par yeh show hoga:
  ```text
  ======================================================
  🏥 CLINICCORE WORKSTATION IS LIVE ON LAN & LOCALHOST!
  ======================================================
  💻 Server Host PC URL:   http://localhost:3000
  🌐 Clinic LAN Workstation: http://192.168.1.105:3000
  ======================================================
  ```

---

## 🧹 Step 3: Demo / Fake Data Khatam Karna (1-Click Fresh Clean)

1. Server PC par Google Chrome ya Edge browser kholein:
   - URL: `http://localhost:3000`
2. Top bar mein Settings ke sath **Amber (Peelay) Rang ka Button** nazar aayega:
   👉 **`[ ↺ Reset Demo Data ]`**
3. Yeh button dabayein aur **OK** karein.
4. **Result:**
   - Tamam fake mareez (Fatima Zahra, Usman, wagaira) foran delete ho jayenge.
   - Tamam purani fake parchiya aur bills zero ho jayenge.
   - Doctor ka login account aur clinic ki branding bilkul safe rahegi.
   - **Database 100% fresh aur real mareezon ke liye ready ho jayega!**

---

## 🌐 Step 4: Doosray Kamron ke PCs (Reception, Pharmacy, Doctor) Ko Jorna

Kisi internet ki zaroorat nahi hai. Sirf clinic ke tamam computer ek hi Wi-Fi router ya switch se connect hone chahiye.

1. Server PC ka Local IP note karein (maslan: `192.168.1.105`).
2. **Reception PC par:** Browser kholein aur type karein:
   `http://192.168.1.105:3000`
3. **Doctor PC par:** Browser kholein aur type karein:
   `http://192.168.1.105:3000`
4. **Pharmacy PC par:** Browser kholein aur type karein:
   `http://192.168.1.105:3000`

*(Asani ke liye `CONNECT_WORKSTATION_CLIENT.bat` file chala kar bhi IP daal sakte hain).*

---

## 🔑 Default Master Login Credentials
- **Username:** `superadmin`
- **Password:** `Admin@12345` (ya jo aapne profile mein rakha tha)
- Login karne ke baad aap Settings / Users mein ja kar Doctor, Pharmacist, aur Receptionist ke alag alag accounts bana sakte hain.

---

## ⚡ Quick Troubleshooting Checklist

| Masla | Hal |
| :--- | :--- |
| **Doosray PC par page nahi khul raha?** | Check karein ke Server PC ka Windows Firewall port `3000` allow kar raha hai, aur dono PC ek hi Wi-Fi se connect hain. |
| **Router restart hone se IP badal gaya?** | Server PC ke network settings mein ja kar IP address ko **Static** set kar dein (maslan `192.168.1.105`). |
| **Kisi ne folder doosre laptop par copy kar liya?** | Software foran **Hardware Signature Mismatch** error de kar band ho jayega. Chori hone ka koi khatra nahi. |
| **Max Seats Error?** | System 10 concurrent active workstations ko allow karta hai. Agar 10 se zyada PCs connect hon to 11th PC reject ho jayega. |
