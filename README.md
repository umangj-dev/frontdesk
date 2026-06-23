# FrontDesk

AI front desk for local businesses — answers website chat, Instagram DMs, and missed-call texts, and books appointments.

Real production deploy on Railway. Per-client credentials (Twilio, calendar) configured live from the admin dashboard. One Anthropic key powers the AI for every client.

## Local dev
```bash
npm install
npm start
# open http://localhost:5210/admin.html
```

## Deploy (Railway)
- Mount a persistent Volume at `/app/data`
- Set env `FRONTDESK_DATA=/app/data`
- Set env `PORT=5210` (Railway sets this automatically)
