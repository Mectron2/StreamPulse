# StreamPulse Dashboard

React/Vite dashboard for processed Wikimedia events.

## Development

Start the backend gateway on port `3002`, then run:

```bash
npm install
npm run dev
```

Vite proxies `/events` and `/socket.io` to `http://localhost:3002`.

For a separately hosted frontend, set `VITE_GATEWAY_URL` to the public gateway URL and set the gateway's `FRONTEND_ORIGIN` to the dashboard origin.

## Docker

The production image builds the Vite app and serves it with Nginx. Nginx proxies `/events` and `/socket.io` to the Compose service named `gateway`.

```bash
docker compose up --build frontend
```

The dashboard is then available at `http://localhost:5173`.
