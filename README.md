# Planora — AI Event Planner

A deployable AI-powered event-planning chatbot built with HTML/CSS/JavaScript, Node.js, Express, and the OpenAI Responses API.

## Features

- Natural-language event planning
- Follow-up questions for missing event details
- Budget allocation suggestions
- Preparation checklist
- Event-day timeline/program
- Responsive chat interface
- Server-side API key protection
- Ready for GitHub and cloud deployment

## Requirements

- Node.js 18+
- An OpenAI API key

## Run locally

1. Extract/open the project folder.
2. Install dependencies:

   npm install

3. Copy `.env.example` to `.env`.
4. Put your API key in `.env`:

   OPENAI_API_KEY=your_key_here

5. Start the app:

   npm start

6. Open:

   http://localhost:3000

## Environment variables

- `OPENAI_API_KEY` — required
- `OPENAI_MODEL` — optional; defaults to `gpt-5.6-luna`
- `PORT` — optional; defaults to `3000`

## Deploy

This is a standard Node/Express app. Push the project to GitHub, then import the repository into a Node-compatible hosting provider.

Set this environment variable in the hosting dashboard:

`OPENAI_API_KEY=...`

Optional:

`OPENAI_MODEL=gpt-5.6-luna`

Use:

- Build command: `npm install` (or leave the provider default)
- Start command: `npm start`

Do **not** commit your `.env` file or API key to GitHub.

## Architecture

Browser → Express `/api/chat` → OpenAI Responses API → chatbot response

Conversation history is kept in the browser for the current session and sent to the backend with each request. This MVP does not require a database.

## Suggested next upgrades

- User accounts
- PostgreSQL/Supabase event storage
- Saved event plans
- Admin dashboard
- Supplier/venue database
- Calendar integration
- Export plan to PDF
- Structured event-detail extraction
