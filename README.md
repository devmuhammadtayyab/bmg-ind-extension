# BMG ShipStation Facilitator

Chrome extension that adds box, shipment, and packing-slip tools on ShipStation. It talks to the BMG API.

## Setup

```bash
npm install
cp .env.example .env.development
cp .env.example .env.production
npm run dev:build
```

Load the `build` folder in Chrome as an unpacked extension.

Webpack reads a different env file per build:

- `npm run dev:build` and `npm run watch` read `.env.development`
- `npm run prod:build` reads `.env.production`

Both files are gitignored. `.env.example` is the template. Copy it, then set your own values. Do not commit `.env.development` or `.env.production`.

| Variable | What to put |
| --- | --- |
| `REACT_APP_API_URL` | Base URL of the BMG API, for example `http://localhost:4200` |

## Scripts

- `npm run dev:build` builds the extension into `build`
- `npm run watch` rebuilds on file changes
- `npm run prod:build` builds a production folder named from the version in `manifest.json`
