# Planora — AI Event Planner

Planora is a deployable AI-powered event-planning chatbot built with HTML, CSS, JavaScript, Node.js, Express, and the Google Gemini API.

It helps users organize events by collecting important event details and generating personalized plans, including budget suggestions, preparation checklists, schedules, and recommendations.

## Features

- AI-powered natural-language event planning
- Interactive chatbot interface
- Follow-up questions for missing event details
- Event type, date, location, guest count, budget, and theme collection
- Budget allocation suggestions
- Preparation checklist generation
- Event-day timeline and program generation
- Event recommendations
- Markdown-formatted AI responses
- Responsive chat interface
- Conversation history during the current session
- Server-side Gemini API key protection
- Automatic retry handling for temporary Gemini API errors
- Ready for GitHub and cloud deployment

## Technologies Used

### Frontend

- HTML5
- CSS3
- JavaScript

### Backend

- Node.js
- Express.js

### Artificial Intelligence

- Google Gemini API
- Google GenAI SDK (`@google/genai`)

### Deployment

- GitHub
- Railway

## Requirements

Before running Planora locally, make sure you have:

- Node.js installed
- npm installed
- A Google Gemini API key

You can create and manage a Gemini API key using Google AI Studio.

## Run Locally

### 1. Clone or download the project

Clone the repository:

```bash
git clone https://github.com/escosurajuniel-sudo/ai-event-planner.git
```

Then enter the project folder:

```bash
cd ai-event-planner
```

### 2. Install dependencies

```bash
npm install
```

### 3. Create the environment file

Create a `.env` file in the root directory.

You may use `.env.example` as a guide.

### 4. Configure Gemini

Add the following to `.env`:

```env
GEMINI_API_KEY=your_gemini_api_key_here
GEMINI_MODEL=gemini-3.6-flash
PORT=3000
```

Replace `your_gemini_api_key_here` with your actual Gemini API key.

Never share or commit your real API key.

### 5. Start Planora

```bash
npm start
```

The server should start locally on:

```text
http://localhost:3000
```

Open the address in your browser to use Planora.

## Environment Variables

| Variable | Description |
| --- | --- |
| `GEMINI_API_KEY` | Required. Your private Google Gemini API key. |
| `GEMINI_MODEL` | Gemini model used by Planora. |
| `PORT` | Local server port. Defaults to `3000`. |

Example:

```env
GEMINI_API_KEY=your_private_key
GEMINI_MODEL=gemini-3.6-flash
PORT=3000
```

## How Planora Works

Planora communicates with Gemini through the Node.js backend.

```text
User
  ↓
Planora Web Interface
  ↓
POST /api/chat
  ↓
Node.js + Express
  ↓
Google Gemini API
  ↓
AI Response
  ↓
Planora Web Interface
```

The Gemini API key stays on the server and is never exposed directly to the browser.

## Event Planning Flow

Planora communicates naturally with the user and collects important information such as:

- Event type
- Date
- Location
- Number of guests
- Budget
- Theme and preferences

If important information is missing, Planora asks follow-up questions.

Once enough information has been collected, Planora can generate:

### Event Overview

A summary of the event and the user's requirements.

### Suggested Budget

A suggested allocation of the available budget across important event expenses.

### Preparation Checklist

A list of tasks that should be completed before the event.

### Event Program

A suggested event-day schedule or timeline.

### Recommendations

Additional suggestions based on the type of event, budget, guests, and preferences.

## Conversation History

Conversation history is maintained in the browser during the current chat session.

Recent messages are sent to the backend together with each new request so Gemini can understand the context of the conversation.

The current version of Planora does not require a database.

Starting a new chat clears the current conversation history.

## Deployment

Planora is deployed as a Node.js/Express application.

The project source code is hosted on GitHub and can be deployed using Railway or another Node.js-compatible hosting provider.

### Railway Environment Variables

The following variables should be configured in the Railway service:

```text
GEMINI_API_KEY=your_private_gemini_api_key
GEMINI_MODEL=gemini-3.6-flash
```

Do not place the real API key directly inside `server.js`, `app.js`, or any other source file.

Railway provides the production `PORT` environment variable automatically.

### Build Command

```bash
npm install
```

### Start Command

```bash
npm start
```

## Security

The `.env` file is excluded from Git using `.gitignore`.

The following files and folders should never be committed:

```gitignore
node_modules/
.env
```

Never upload your Gemini API key to GitHub.

For production deployment, store sensitive values using the hosting provider's environment-variable system.

## Gemini API Limits

Google Gemini may provide free-tier API access depending on the selected model and account.

Free-tier usage is not unlimited and may have request, token, or daily quota limits.

If a limit is reached, Planora may temporarily be unable to generate a response until API access becomes available again.

## Project Structure

```text
ai-event-planner/
│
├── public/
│   ├── app.js
│   ├── index.html
│   └── style.css
│
├── .env
├── .env.example
├── .gitignore
├── package.json
├── package-lock.json
├── README.md
└── server.js
```

The `.env` file exists only on the developer's local machine and should not appear in the GitHub repository.

## Suggested Future Improvements

Future versions of Planora may include:

- User registration and login
- PostgreSQL or Supabase database integration
- Saved event plans
- Event management dashboard
- Admin dashboard
- Supplier and venue database
- Calendar integration
- PDF event-plan export
- Event reminders
- Structured event-detail extraction
- Multiple saved conversations
- Improved Gemini fallback and retry handling

## Project

**Planora — AI Event Planner**

An AI-powered chatbot designed to make event planning more organized, interactive, and convenient.