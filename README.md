# Do.I.Fly?

Do.I.Fly? is a wind-first drone flight decision app. It combines live weather, location-aware regulatory checks, aircraft profile constraints, and a 5-day forecast to help pilots make clearer go/no-go calls before takeoff.

The app supports:
- Personalized checks using your selected drone model/class/category and operation purpose
- Generic advisory mode when location is unavailable
- Scheduled flights with forecast snapshots and reminders
- A responsive desktop/mobile UI with PWA install support

## Stack

- Next.js 16
- React 19
- TypeScript

## Data and Storage

- Without sign-in: assessment state and UI choices run in-browser for the current session.
- With sign-in: profile data syncs to Supabase (`profiles`) so it follows your account across devices.
- Synced profile data includes:
  - Drone profile (model, class/category, weight, licenses, operation purpose)
  - Visual theme preference
  - Saved scheduled flights
  - Stored scheduled-flight forecast reports
- Cookies are used for auth/session and remembered username convenience.

## Location Handling

- Device geolocation is requested only after explicit user action (tap/click).
- If geolocation is unavailable or denied, users can still run checks via manual location search.
- Approximate location fallback is available through the app location APIs when needed.
- Location is used to compute weather/regulatory assessment results and forecast cards shown in the UI.

## Local Development

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

## Checks

```bash
npm run build
npx eslint src
```

## Notes

- The app includes server routes under `src/app/api`, so it needs a platform that can run Next.js server logic.
- GitHub Pages is not a fit for the current architecture because it only serves static files.

## License

See [license.md](./license.md).
