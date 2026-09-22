# Planora — AI Event Planner

Planora is a full-stack AI event-planning workspace using Node.js, Express, Google Gemini, and Supabase.

## Included

- Email/password sign up, login, password reset and logout
- Private per-user profiles and settings
- Dashboard and My Events
- New Event and Continue Planning
- Persistent event details and AI conversations
- Automatic saving
- Supabase Row Level Security (RLS) so users can only access their own data
- Profile, Appearance, AI Preferences, Notifications, Security and Account settings
- Gemini API kept server-side
- Responsive light/dark interface

## Setup

1. Create a Supabase project.
2. Open **SQL Editor** and run `supabase-schema.sql`.
3. In Supabase Authentication, enable Email authentication. Choose whether email confirmation is required.
4. Copy `.env.example` to `.env` and add your Gemini key, Supabase Project URL and Supabase publishable/anon key.
5. Run `npm install` then `npm start`.
6. Open `http://localhost:3000`.

## Railway variables

Add these variables to Railway:

```text
GEMINI_API_KEY=...
GEMINI_MODEL=gemini-3.6-flash
SUPABASE_URL=https://YOUR_PROJECT.supabase.co
SUPABASE_ANON_KEY=...
```

Railway supplies `PORT` automatically.

## Security

`.env` is ignored by Git. Never commit Gemini secrets or a Supabase service-role key. The Supabase publishable/anon key is intended for client use; data isolation is enforced by the RLS policies in `supabase-schema.sql`.

The Express `/api/chat` route verifies the signed-in Supabase user before calling Gemini.

## Account deletion note

The Settings page can permanently delete the user's Planora profile, settings, events and messages. Deleting the underlying Supabase Auth user itself requires a trusted server-side admin operation/service-role key. That key is intentionally **not** included in this browser-first version. Do not expose a service-role key in frontend code.

## Project structure

```text
public/
  index.html
  style.css
  app.js
server.js
supabase-schema.sql
.env.example
```
