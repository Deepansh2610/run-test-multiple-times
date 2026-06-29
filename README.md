# TestRigor retry runner

A simple React app that lets you:
- choose a retry count of 2, 5, or 10
- enter a suite ID, auth token, and test case UUID
- trigger the TestRigor retest flow repeatedly
- wait for each status check to return Finished before continuing
- stop early if the status returns Failed

## Local development

```bash
npm start
```

For the API route to work during local development, run the app through Vercel CLI:

```bash
npx vercel dev
```

## Deploy to Vercel

1. Connect the repository to Vercel.
2. Deploy the project.
3. The API route is served from the Vercel function in [api/testrigor.js](api/testrigor.js).
