# Ekiden

A small web app to run an ekiden (a marathon relay) as a team: create a team, share a join code, and track each runner's leg.

## Features

- Create a team and get a join code (`EKIDEN-XXXX`) to share with your runners
- Join a team from any phone with the code, no account needed
- Add runners and record each leg: distance and time
- Team dashboard with the pace of every runner and the total time

## Stack

React · Vite · Supabase (Postgres) · Cloudflare Workers static assets

## Getting started

```bash
npm install
npm run dev
```

Create a `.env` file with the keys of your Supabase project:

```bash
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

The app expects three tables: `teams` (with a unique `join_code`), `runners` and `legs2`.

`npm run build` then `npx wrangler deploy` publishes the `dist/` folder to Cloudflare.

## Security notes

This is an MVP built for one race day. There are no user accounts: the join code is the only thing that protects a team, and the app uses the public Supabase anon key. Add Supabase Auth and row level security before using it for anything sensitive.

## License

[MIT](LICENSE) © 2026 Adrien Balcioglu
