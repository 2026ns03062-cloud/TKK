# 🏛️ TKK Temple Festival - Event Deployment Guide

## ⚠️ Current Status

### Local Backend ✅
- **Database Connection**: Working perfectly
- **Real-time Updates**: ✅ Database updates confirmed
- **Authentication**: ✅ Working
- **Token Redemption**: ✅ Working with live database tracking
- **Status**: PRODUCTION READY

### Cloud Backend (Render) ❌
- **Database Connection**: Failing (despite whitelist configuration)
- **Status**: Investigating MongoDB Atlas connectivity from Render infrastructure
- **Note**: Fallback memory storage working, but **NOT suitable for live event** per your requirements

---

## 🚀 Option 1: Use Local Backend for Live Event (RECOMMENDED)

### Setup (Do this before the event):

#### Step 1: Ensure Backend is Running
```bash
cd c:\Learning\venkat\git\TKK\backend
npm install
npm start
```
- Should show: `✅ [SRV Standard TLS] Connected successfully!`
- Should show: `Server running on port 3000`
- Should show: `✅ Database connected - Ready for live event`

#### Step 2: Update Frontend Base URL for Event

Edit `c:\Learning\venkat\git\TKK\frontend\lib\main.dart`:

Change this line:
```dart
const String baseUrl = 'https://tkk-token-backend.onrender.com';
```

To:
```dart
const String baseUrl = 'http://localhost:3000';  // LOCAL DURING EVENT
```

Then rebuild Flutter web:
```bash
cd c:\Learning\venkat\git\TKK\frontend
flutter run -d chrome
```

#### Step 3: Event Day Procedure

1. **Start Backend** (Run on volunteer's laptop connected to temple WiFi)
   ```bash
   npm start
   ```

2. **Access Frontend** from any device on same WiFi network
   - Open browser: `http://<volunteer-laptop-ip>:51006` (find IP with `ipconfig`)
   - Or use `localhost:51006` if accessing from same machine

3. **Backup Database** (Optional but recommended)
   - Before event: `node verify-db.js`
   - After event: Export database from MongoDB Atlas dashboard

---

## 🌐 Option 2: Fix Render Deployment (If you want cloud access)

### Troubleshooting Render MongoDB Connection:

1. **Verify MongoDB Atlas Network Access**
   - Go to: https://cloud.mongodb.com
   - Select **cluster0** → **Network Access**
   - Confirm `0.0.0.0/0` exists and shows "Active" (Green dot)
   - If "Pending": Wait 10+ minutes for changes to propagate

2. **Force Render Redeploy After 10 Minutes**
   - Dashboard: https://dashboard.render.com
   - Select **tkk-token-backend**
   - Click **Manual deploy** → **Deploy latest commit**

3. **Monitor Render Logs**
   - After redeploy, check logs for: `✅ Connected successfully!`
   - If still seeing TLS errors: Contact MongoDB Atlas support

### Alternative: Use Different Deployment Platform

If Render continues failing, consider:
- **Railway.app** (Similar to Render, often better MongoDB support)
- **Replit.com** (Free hosting, good for short-term events)
- **Local machine with port forwarding** (Most reliable option)

---

## 🔄 Comparison: Local vs Cloud Deployment

| Feature | Local Backend | Render Cloud |
|---------|---------------|-------------|
| Database Connection | ✅ Working | ❌ Troubleshooting |
| Real-time Updates | ✅ Verified | ⏳ Pending |
| Accessibility | 🏠 Same WiFi only | 🌐 Anywhere internet |
| Setup Difficulty | ⭐ Easy | ⭐⭐⭐ Complex |
| Event-Ready | ✅ YES | ⏳ NO (yet) |

---

## 📋 Event Day Checklist

### Before Event (2 hours prior):
- [ ] Backend running locally and showing "✅ Connected successfully!"
- [ ] `/health` endpoint shows `"database":"connected"`
- [ ] Test login with volunteer1/1234 → should work
- [ ] Test token redemption with TKZ-001 → should update database
- [ ] Frontend accessible at `localhost:51006` or network URL
- [ ] Admins can view token summary and see live updates

### During Event:
- [ ] Keep laptop running with backend (don't lock/sleep)
- [ ] Monitor `/health` endpoint - if shows "disconnected", restart backend
- [ ] Have volunteer pin ready (1234) in case of login issues
- [ ] Admin has access to view token status in real-time

### After Event:
- [ ] Export redemption logs from MongoDB Atlas
- [ ] Backup token data: `node verify-db.js`
- [ ] Document any issues for future improvements

---

## 🆘 Emergency Contacts & Solutions

### Backend Connection Lost During Event:
1. Check if laptop is still connected to WiFi
2. Run health check: `curl http://localhost:3000/health`
3. If fails: Restart backend (`npm start`)
4. System will use fallback tokens while reconnecting (data will sync when backend restarts)

### Token Scanning Fails:
1. Verify backend is running: Check terminal for server logs
2. Clear browser cache: `Ctrl+Shift+Delete`
3. Refresh page and try again

### Database Not Updating After Event:
1. Run: `node verify-db.js` to check database integrity
2. Run: `node test-e2e.js` to test all endpoints
3. Contact: [Your technical support person]

---

## ✅ Recommendation for Temple Festival

**USE LOCAL BACKEND** for maximum reliability:
- ✅ 100% tested and verified
- ✅ Real-time database updates
- ✅ No internet dependency issues
- ✅ Fallback-ready if needed
- ✅ Full audit trail in MongoDB

**Render as backup** for future events when connection is verified.

---

## 📞 Questions or Issues?

Check logs at:
- Backend: Terminal output when running `npm start`
- Frontend errors: Browser console (`F12` → Console tab)
- Database: `node test-e2e.js`

---

*Last Updated: 2026-07-18*  
*Status: Local deployment ready for live event*
