# Welcome to your Lovable project

## PEAKFIVE FastAPI connection

Vite configuration supplies `VITE_PEAKFIVE_API` as `https://peakfive-api.onrender.com` for the production service. There is deliberately no localhost fallback. The dashboard's **API base URL** control also accepts a session-only override for connection checks.

The deployed dashboard requires an HTTPS backend. Render currently permits `https://peakfive.lovable.app`. To use the editor preview and local checks too, set Render's `PEAKFIVE_CORS_ORIGINS` to `https://peakfive.lovable.app,https://id-preview--a5e4ede2-127c-4978-ba9a-1f1d2ba3fb34.lovable.app,http://localhost:8080`. This setting replaces backend defaults; wildcards are not supported. Restart FastAPI after changing it.

The frontend uses `GET /health`, `POST /optimize` and `POST /compare`. Requests wait up to 180 seconds to accommodate Render cold starts; errors never substitute frontend demo results. Comparison requests follow the deployed OpenAPI example, including the two-element time-array peak window. Both returned 96-slot schedules and comparison metrics are independently checked before display. Backend `tank_m3` is start-of-interval storage, with 24:00 calculated separately. Essential site load is included in facility kW. The comparison baseline is simulated conventional control, not measured Hamilton data, energy-efficiency savings or financial savings; no tariffs are supplied.

The Hamilton **Start Demo** experience uses the shared actual backend schedules; legacy frontend-only demonstrations remain isolated and never substitute for API results. Actual API scenarios use illustrative parameters and the literal 96-value water-demand curve in `src/lib/backend-defaults.json`. Climatiq continues to consume only the validated optimized schedule; selecting baseline playback does not change its accounting inputs.

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
