# MongoDB Atlas Setup for TKK Token Redemption System

## Problem: Database Not Connecting on Render

The current system is using **in-memory fallback storage** instead of updating MongoDB directly. This is **NOT suitable for a live temple event**.

### Root Cause
The TLS connection error indicates that **Render's servers cannot reach MongoDB Atlas**. The most common reason is:

**Network Access Whitelist is blocking Render's IP addresses**

---

## Solution: Update MongoDB Atlas Network Whitelist

### Step 1: Go to MongoDB Atlas Dashboard
1. Open https://cloud.mongodb.com
2. Login to your account
3. Select **cluster0** (or your cluster name)
4. Click on **Network Access** (in left sidebar under Security)

### Step 2: Update Network Access Rules
You should see your current whitelist entries. The issue is likely:
- ❌ Only your laptop IP is whitelisted (e.g., 192.168.x.x)
- ❌ Render's Heroku IP addresses are NOT in the list

**Option A: Allow All IPs (Quick Fix for Event - ⚠️ Less Secure)**
1. Click **EDIT** on an existing rule or **+ ADD IP ADDRESS**
2. Enter: **0.0.0.0/0** (this allows all IPs)
3. Click **Confirm**
4. Click **Confirm Changes**

**Option B: Add Render's IP (More Secure)**
1. Get Render's outbound IP address:
   - Go to https://dashboard.render.com
   - Select your service (**tkk-token-backend**)
   - In **Environment** section, you might see network info
   - Or contact Render support for the outbound IPs
2. Add the IP to MongoDB Atlas whitelist

### Step 3: Verify Connection
After updating the whitelist, **wait 1-2 minutes** for changes to propagate, then:

1. Check the health endpoint:
   ```
   https://tkk-token-backend.onrender.com/health
   ```

2. Look for response:
   ```json
   {
     "status": "ok",
     "service": "tkk-token-api",
     "database": "connected",
     "message": "✅ Database connected - Ready for live event"
   }
   ```

3. If still disconnected, check Render logs:
   - Go to https://dashboard.render.com
   - Select **tkk-token-backend**
   - Click **Logs**
   - Look for connection errors

---

## Testing After Fix

### Test 1: Local Verification
```bash
cd c:\Learning\venkat\git\TKK\backend
node verify-db.js
```
Should show: `Found X tokens` with database connection ✅

### Test 2: Live Redemption Test
1. Go to browser: `localhost:51006`
2. Login as **volunteer1 / 1234**
3. Redeem token **TKZ-002**
4. Verify in database:
   ```bash
   node verify-db.js
   ```
   Should show: `TKZ-002 (status: redeemed)` ✅

### Test 3: Render Health Check
```
https://tkk-token-backend.onrender.com/health
```
Should show: `"database": "connected"` ✅

---

## Quick Reference: MongoDB Atlas Settings

- **Cluster**: cluster0
- **Database**: tkk_festival
- **Connection String**: `mongodb+srv://2026ns03062_db_user:rEaRHZeO0FKOz9z8@cluster0.brbgxbn.mongodb.net/`
- **Dashboard**: https://cloud.mongodb.com

---

## Critical: For Live Temple Event

✅ **DO NOT** proceed with event until:
- [x] Health endpoint shows `"database": "connected"`
- [x] Local verify-db.js runs successfully
- [x] Test redemption works and updates database
- [x] Admin screen shows redeemed tokens

Without these checks, the system will use **memory-only storage** which will **LOSE ALL DATA if server restarts**.
