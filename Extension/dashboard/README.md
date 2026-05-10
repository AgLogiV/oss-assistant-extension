# OBB Materials Dashboard (Pterodactyl)

Simple Express dashboard to manage `SWAP_MATERIAL_MODELS` (id + name) at runtime.

## Files
- `server.js` - API + static hosting
- `public/` - dashboard UI
- `data/models.json` - persistent storage

## Environment variables
- `PORT` (optional) - default `3000`
- `ADMIN_TOKEN` (required) - required for `add/remove` API calls

## API
- `GET /api/models`  
  Public read-only. Returns: `{ ok: true, models: [{id, name}, ...] }`

- `POST /api/models/add` (admin only)  
  Body: `{ id, name }`

- `POST /api/models/remove` (admin only)  
  Body: `{ id }`

Admin auth:
- send header `x-admin-token: <ADMIN_TOKEN>`

## Run locally
```bash
cd dashboard
npm install
ADMIN_TOKEN="your-token" PORT=3000 npm start
```

## Deploy to Pterodactyl
1. In Pterodactyl, set the environment variables:
   - `ADMIN_TOKEN`
   - `PORT` (if your panel uses another port)
2. Upload the `dashboard/` folder (keep the structure).
3. Start the node app with:
   - `npm install && npm start`

## Notes
- The UI stores the admin token in `sessionStorage` of your browser only.
- When ready to integrate the Chrome extension, we will add a polling fetch to `GET /api/models`.

