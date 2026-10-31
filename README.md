# Welcome to your Lovable project

## PEAKFIVE FastAPI connection

Set `VITE_PEAKFIVE_API` to your teammate's API base URL in the frontend deployment configuration, then rebuild/redeploy the frontend. There is deliberately no localhost fallback. For local development, set it to your local FastAPI address in an uncommitted `.env.local`. The dashboard's **API base URL** control also accepts a session-only override for judging and connection checks.

The deployed dashboard requires an HTTPS backend. In the FastAPI deployment, set `PEAKFIVE_CORS_ORIGINS` to the exact frontend origins, including `https://id-preview--a5e4ede2-127c-4978-ba9a-1f1d2ba3fb34.lovable.app`, `http://localhost:8080` for local checks, and the eventual published frontend origin. This setting replaces backend defaults; wildcards are not supported. Restart FastAPI after changing it.

Only `GET /health` and `POST /optimize` are used. Optimization requests time out after 45 seconds; errors never substitute frontend demo results. Backend `tank_m3` is start-of-interval storage, with 24:00 calculated separately. Essential site load is included in facility kW. The API provides no baseline or tariff, so no backend savings are shown.

The existing **Start Demo** experience is an isolated frontend-only simulation, not a remote result. Its older system parameters and baseline comparisons do not apply to the backend. Actual API scenarios use the handoff's illustrative parameters and literal 96-value water-demand curve in `src/lib/backend-defaults.json`.

The supplied backend has no authentication or rate limiting beyond concurrent-solve limits. Use a controlled demo deployment; add appropriate protection before wider public exposure.

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Open your project in the [Lovable editor](https://lovable.dev) and keep building.

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: connect the project to GitHub and every change made in Lovable is committed straight to your repository.
- **Full ownership**: this code is yours. Push to your repository and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```

## Built with

- TanStack Start
- TypeScript
- React
- Tailwind CSS
