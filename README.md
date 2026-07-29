# TestRigor retry runner

A simple React app that lets you:
- choose a retry count of 2, 5, or 10
- enter a suite ID, auth token, and test case UUID
- trigger the TestRigor retest flow repeatedly
- wait for each status check to return Finished before continuing
- stop early if the status returns Failed

## Local development

Use Node.js 24 and install the locked dependencies:

```bash
npm ci
```

Then start the frontend:

```bash
npm start
```

For the API route to work during local development, run the app through Vercel CLI:

```bash
npx vercel dev
```

## Deploy to Vercel

1. Import the repository into Vercel (or use the existing linked project).
2. Keep the project root set to the repository root.
3. Deploy. The checked-in Vercel configuration runs `npm run build`, publishes
   `build`, and exposes [api/testrigor.js](api/testrigor.js) as `/api/testrigor`.

No environment variables are required. The TestRigor auth token is entered at
runtime and is forwarded by the serverless function; it is not bundled into the
frontend.
