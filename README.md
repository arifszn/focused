# Focused

A minimal focus timer. Track time per activity (reading, gym, practice) and see it day by day on a calendar.

Live: https://arifszn.github.io/focused/

## Features

- One card per activity on the home screen: today's time, this week, days in a row and the last 28 days.
- A dashboard per activity: today, week and month totals, a month calendar shaded by time spent, and a log for each day.
- Starting a session opens a full-screen timer with Pause, Resume and Finish.
- Sessions under one minute are not saved.
- Rename or delete an activity; delete one session (with undo) or all sessions of an activity.

## Data

Everything is stored in your browser's `localStorage`. Nothing is sent to a server, and data does not sync between browsers or devices. Clearing site data deletes it.

## Run locally

No build step. Serve the folder with any static server:

```sh
python3 -m http.server 8000
```

Then open http://localhost:8000.

## Deploy

`.github/workflows/deploy.yml` deploys every push to `main`:

- **GitHub Pages**: set the repository's Pages source to GitHub Actions.
- **Cloudflare Pages** (project `focused`): add the repository secrets `CLOUDFLARE_API_TOKEN` (with the Cloudflare Pages: Edit permission) and `CLOUDFLARE_ACCOUNT_ID`. Without them this job is skipped.

## License

MIT
