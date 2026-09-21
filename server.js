import express from "express";
import dotenv from "dotenv";
import { GoogleGenAI } from "@google/genai";
import path from "path";
import { fileURLToPath } from "url";

dotenv.config();

const app = express();

const PORT = process.env.PORT || 3000;
const MODEL = process.env.GEMINI_MODEL || "gemini-3.6-flash";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

app.use(express.json({ limit: "1mb" }));
app.use(express.static(path.join(__dirname, "public")));

const SYSTEM_PROMPT = `
You are Planora, an AI Event Planner.

Your job is to help users organize realistic events through
a friendly conversation.

IMPORTANT RULES:

1. Ask for important missing event information.
2. Do not invent details the user has not provided.
3. Understand Philippine peso amounts such as:
   - 50000
   - 50k
   - ₱50,000

Try to collect:

- Event type
- Date
- Location
- Number of guests
- Budget
- Theme or preferences

Do not repeatedly ask for information the user already provided.

Once enough information is available, generate a complete event plan.

The final event plan should contain:

## Event Overview

Include:
- Event type
- Date
- Location
- Guest count
- Budget
- Theme

## Suggested Budget

Create a realistic budget allocation.

Possible categories include:

- Venue
- Food and drinks
- Decorations
- Entertainment
- Photography
- Cake
- Equipment
- Transportation
- Emergency/contingency fund

Never intentionally exceed the user's stated budget.

Clearly explain that prices are estimates.

## Preparation Checklist

Generate practical tasks the organizer should complete.

## Event Program

Create an appropriate event-day timeline.

Example:

5:00 PM - Guest arrival
5:30 PM - Opening program
6:00 PM - Dinner
7:00 PM - Main activities

Adjust the program according to the event.

## Recommendations

Provide useful recommendations based on:

- Budget
- Guest count
- Event type
- Theme

Do not claim that a venue, supplier, caterer, photographer,
product, price, or booking is actually available unless
verified information was provided.

Be friendly, practical, and concise.

If the user simply says something like:

"I want to create an event"

do NOT immediately generate a fake event plan.

Instead ask:

"What type of event would you like to organize?"

Continue gathering information naturally.
`;

function cleanHistory(history) {
    if (!Array.isArray(history)) {
        return [];
    }

    return history
        .filter(
            (item) =>
                item &&
                ["user", "assistant"].includes(item.role) &&
                typeof item.content === "string"
        )
        .slice(-20)
        .map((item) => ({
            role: item.role === "assistant" ? "model" : "user",
            parts: [
                {
                    text: item.content.slice(0, 6000),
                },
            ],
        }));
}

app.get("/api/health", (req, res) => {
    res.json({
        ok: true,
        provider: "Google Gemini",
        model: MODEL,
    });
});

app.post("/api/chat", async (req, res) => {
    try {

        if (!process.env.GEMINI_API_KEY) {
            return res.status(500).json({
                error:
                    "GEMINI_API_KEY is missing. Add it to your .env file.",
            });
        }

        const message =
            typeof req.body?.message === "string"
                ? req.body.message.trim()
                : "";

        if (!message) {
            return res.status(400).json({
                error: "Please enter a message.",
            });
        }

        const history = cleanHistory(req.body?.history);

        const ai = new GoogleGenAI({
            apiKey: process.env.GEMINI_API_KEY,
        });

        const chat = ai.chats.create({
            model: MODEL,

            history,

            config: {
                systemInstruction: SYSTEM_PROMPT,
                temperature: 0.7,
            },
        });

        let response;

const maxRetries = 3;

for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
        response = await chat.sendMessage({
            message: message.slice(0, 6000),
        });

        break;

    } catch (error) {

        const isServerBusy =
            [429, 503].includes(error?.status) ||
            error?.message?.includes("429") ||
            error?.message?.includes("503") ||
            error?.message?.includes("RESOURCE_EXHAUSTED") ||
            error?.message?.includes("UNAVAILABLE");

        if (!isServerBusy || attempt === maxRetries) {
            throw error;
        }

        console.log(
            `Gemini is temporarily unavailable. Retrying... (${attempt}/${maxRetries})`
        );

        // Wait longer after each failed attempt:
        // 2 seconds → 4 seconds → 6 seconds
        await new Promise((resolve) =>
            setTimeout(resolve, attempt * 2000)
        );
    }
}

        const reply = response.text?.trim();

        if (!reply) {
            return res.status(502).json({
                error: "Gemini returned an empty response.",
            });
        }

        res.json({
            reply,
        });

    } catch (error) {

        console.error("Gemini API Error:");
        console.error(error);

        const message =
            error?.message ||
            "Unknown Gemini API error.";

        if (
            message.includes("API_KEY") ||
            message.includes("API key")
        ) {
            return res.status(401).json({
                error:
                    "Your Gemini API key appears to be invalid.",
            });
        }

        if (
            message.includes("429") ||
            message.toLowerCase().includes("quota")
        ) {
            return res.status(429).json({
                error:
                    "Gemini rate limit or quota reached. Please wait and try again.",
            });
        }

        res.status(500).json({
            error:
                "Unable to contact Gemini. Check the VS Code terminal for details.",
        });
    }
});

app.get("*", (req, res) => {
    res.sendFile(
        path.join(__dirname, "public", "index.html")
    );
});

app.listen(PORT, "0.0.0.0", () => {
  console.log("");
  console.log("---------------------------------------");
  console.log(" Planora AI Event Planner");
  console.log("---------------------------------------");
  console.log(` Server running on port: ${PORT}`);
  console.log(` AI:       Google Gemini`);
  console.log(` Model:    ${MODEL}`);
  console.log("---------------------------------------");
  console.log("");
});