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

const SYSTEM_PROMPT = `You are Planora, an AI Event Planner. Help users plan realistic events through friendly conversation. Ask only for important missing information and never invent details the user has not provided. Collect event type, date, location, guest count, budget, and theme/preferences. Understand Philippine peso amounts such as 50000, 50k and ₱50,000. Do not repeatedly ask for known information. Once enough information is available, provide a structured plan with ## Event Overview, ## Suggested Budget, ## Preparation Checklist, ## Event Program, and ## Recommendations. Keep estimates within the stated budget and clearly say prices are estimates. Never claim suppliers, venues, prices, or bookings are available unless verified. If the user only says they want to create an event, ask what type of event they want to organize.`;

function cleanHistory(history) {
  if (!Array.isArray(history)) return [];
  return history.filter(x => x && ["user","assistant"].includes(x.role) && typeof x.content === "string")
    .slice(-30).map(x => ({ role: x.role === "assistant" ? "model" : "user", parts: [{ text: x.content.slice(0,6000) }] }));
}

async function requireUser(req, res, next) {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY;
  if (!url || !key) return res.status(503).json({ error: "Supabase is not configured on the server." });
  const token = req.headers.authorization?.replace(/^Bearer\s+/i, "");
  if (!token) return res.status(401).json({ error: "Please sign in to use Planora AI." });
  try {
    const r = await fetch(`${url}/auth/v1/user`, { headers: { apikey: key, Authorization: `Bearer ${token}` } });
    if (!r.ok) return res.status(401).json({ error: "Your session expired. Please sign in again." });
    req.user = await r.json();
    next();
  } catch {
    res.status(503).json({ error: "Unable to verify your Planora session." });
  }
}

app.get("/api/config", (req,res) => res.json({ supabaseUrl: process.env.SUPABASE_URL || "", supabaseAnonKey: process.env.SUPABASE_ANON_KEY || "" }));
app.get("/api/health", (req,res) => res.json({ ok:true, provider:"Google Gemini", model:MODEL, accountsConfigured:Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_ANON_KEY) }));

app.post("/api/chat", requireUser, async (req,res) => {
  try {
    if (!process.env.GEMINI_API_KEY) return res.status(500).json({ error:"GEMINI_API_KEY is missing." });
    const message = typeof req.body?.message === "string" ? req.body.message.trim() : "";
    if (!message) return res.status(400).json({ error:"Please enter a message." });
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    const detail = req.body?.event ? `\nKnown event record (do not invent missing fields): ${JSON.stringify(req.body.event).slice(0,2500)}` : "";
    const chat = ai.chats.create({ model:MODEL, history:cleanHistory(req.body?.history), config:{ systemInstruction:SYSTEM_PROMPT + detail, temperature:0.7 } });
    let response;
    for (let attempt=1; attempt<=3; attempt++) {
      try { response = await chat.sendMessage({ message:message.slice(0,6000) }); break; }
      catch (error) {
        const busy=[429,503].includes(error?.status)||/429|503|RESOURCE_EXHAUSTED|UNAVAILABLE/i.test(error?.message||"");
        if (!busy || attempt===3) throw error;
        await new Promise(resolve=>setTimeout(resolve,attempt*2000));
      }
    }
    const reply=response?.text?.trim();
    if (!reply) return res.status(502).json({ error:"Gemini returned an empty response." });
    res.json({ reply });
  } catch (error) {
    console.error("Gemini API Error:", error);
    const msg=error?.message||"";
    if (/API_KEY|API key/i.test(msg)) return res.status(401).json({ error:"Your Gemini API key appears to be invalid." });
    if (/429|quota|RESOURCE_EXHAUSTED/i.test(msg)) return res.status(429).json({ error:"Gemini rate limit or quota reached. Please wait and try again." });
    if (/503|UNAVAILABLE/i.test(msg)) return res.status(503).json({ error:"Gemini is temporarily busy. Please try again shortly." });
    res.status(500).json({ error:"Unable to contact Gemini. Check the Railway/server logs for details." });
  }
});

app.get("*", (req,res) => res.sendFile(path.join(__dirname,"public","index.html")));
app.listen(PORT,"0.0.0.0",()=>console.log(`Planora running on port ${PORT} · ${MODEL}`));
