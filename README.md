# Do.I.Fly?

Do.I.Fly? helps drone pilots make safer go/no-go decisions with live location checks, wind and weather insights, and a 5-day forecast. It supports scheduled flights, auto-refreshes saved forecast data when updated, and presents flight-readiness information in a responsive UI for desktop and mobile.

## Stack

- Next.js 16
- React 19
- TypeScript

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
