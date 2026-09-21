const form = document.getElementById("chatForm");
const input = document.getElementById("messageInput");
const messages = document.getElementById("messages");
const sendBtn = document.getElementById("sendBtn");
const newChatBtn = document.getElementById("newChatBtn");
const quickPrompts = document.getElementById("quickPrompts");

let history = [];
let busy = false;

// Prevent AI-generated HTML from being executed
function escapeHtml(text) {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

// Format Markdown inside paragraphs, lists, and headings
function formatInlineMarkdown(text) {
  return text
    // Inline code
    .replace(/`([^`]+)`/g, "<code>$1</code>")

    // Bold: **text**
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")

    // Italic: *text*
    .replace(/(?<!\*)\*([^*\n]+?)\*(?!\*)/g, "<em>$1</em>");
}

// Convert Gemini Markdown into HTML
function formatMessage(text) {
  const safe = escapeHtml(text);
  const lines = safe.split("\n");

  let html = "";
  let inUnorderedList = false;
  let inOrderedList = false;

  function closeLists() {
    if (inUnorderedList) {
      html += "</ul>";
      inUnorderedList = false;
    }

    if (inOrderedList) {
      html += "</ol>";
      inOrderedList = false;
    }
  }

  for (const rawLine of lines) {
    const line = rawLine.trim();

    // Empty line
    if (!line) {
      closeLists();
      continue;
    }

    // Heading 3
    if (/^###\s+/.test(line)) {
      closeLists();

      const content = line.replace(/^###\s+/, "");

      html += `<h3>${formatInlineMarkdown(content)}</h3>`;
      continue;
    }

    // Heading 2
    if (/^##\s+/.test(line)) {
      closeLists();

      const content = line.replace(/^##\s+/, "");

      html += `<h2>${formatInlineMarkdown(content)}</h2>`;
      continue;
    }

    // Heading 1
    if (/^#\s+/.test(line)) {
      closeLists();

      const content = line.replace(/^#\s+/, "");

      html += `<h1>${formatInlineMarkdown(content)}</h1>`;
      continue;
    }

    // Unordered list: - item or * item
    if (/^[-*]\s+/.test(line)) {
      if (inOrderedList) {
        html += "</ol>";
        inOrderedList = false;
      }

      if (!inUnorderedList) {
        html += "<ul>";
        inUnorderedList = true;
      }

      const content = line.replace(/^[-*]\s+/, "");

      html += `<li>${formatInlineMarkdown(content)}</li>`;
      continue;
    }

    // Ordered list: 1. item
    if (/^\d+\.\s+/.test(line)) {
      if (inUnorderedList) {
        html += "</ul>";
        inUnorderedList = false;
      }

      if (!inOrderedList) {
        html += "<ol>";
        inOrderedList = true;
      }

      const content = line.replace(/^\d+\.\s+/, "");

      html += `<li>${formatInlineMarkdown(content)}</li>`;
      continue;
    }

    // Normal paragraph
    closeLists();

    html += `<p>${formatInlineMarkdown(line)}</p>`;
  }

  closeLists();

  return html;
}

// Add message to chat
function addMessage(role, text) {
  const row = document.createElement("div");

  row.className =
    `message-row ${role === "user" ? "user" : "bot"}`;

  // Planora avatar
  if (role !== "user") {
    const avatar = document.createElement("div");

    avatar.className = "avatar";
    avatar.textContent = "P";

    row.appendChild(avatar);
  }

  const bubble = document.createElement("div");

  bubble.className = "bubble";
  bubble.innerHTML = formatMessage(text);

  row.appendChild(bubble);

  messages.appendChild(row);

  messages.scrollTop = messages.scrollHeight;
}

// Show typing animation
function showTyping() {
  const row = document.createElement("div");

  row.id = "typing";
  row.className = "message-row bot typing";

  row.innerHTML = `
    <div class="avatar">P</div>

    <div class="bubble">
      <span class="dots">
        <span></span>
        <span></span>
        <span></span>
      </span>
    </div>
  `;

  messages.appendChild(row);

  messages.scrollTop = messages.scrollHeight;
}

// Remove typing animation
function hideTyping() {
  document.getElementById("typing")?.remove();
}

// Automatically resize textarea
function resizeInput() {
  input.style.height = "auto";

  input.style.height =
    `${Math.min(input.scrollHeight, 150)}px`;
}

// Send message to Gemini
async function sendMessage(message) {
  if (busy || !message.trim()) {
    return;
  }

  busy = true;
  sendBtn.disabled = true;

  // Remove quick prompts after first message
  quickPrompts?.remove();

  const cleanMessage = message.trim();

  // Show user's message
  addMessage("user", cleanMessage);

  input.value = "";
  resizeInput();

  // Show Planora typing
  showTyping();

  try {
    const response = await fetch("/api/chat", {
      method: "POST",

      headers: {
        "Content-Type": "application/json"
      },

      body: JSON.stringify({
        message: cleanMessage,
        history: history
      })
    });

    const data = await response.json();

    hideTyping();

    if (!response.ok) {
      throw new Error(
        data.error || "Something went wrong."
      );
    }

    // Show Gemini response
    addMessage("assistant", data.reply);

    // Save conversation history
    history.push(
      {
        role: "user",
        content: cleanMessage
      },
      {
        role: "assistant",
        content: data.reply
      }
    );

    // Keep latest 20 messages
    history = history.slice(-20);

  } catch (error) {
    hideTyping();

    addMessage(
      "assistant",
      `I couldn't complete that request. ${error.message}`
    );

  } finally {
    busy = false;

    sendBtn.disabled = false;

    input.focus();
  }
}

// Submit message
form.addEventListener("submit", (event) => {
  event.preventDefault();

  sendMessage(input.value);
});

// Resize textarea while typing
input.addEventListener("input", resizeInput);

// Enter = Send
// Shift + Enter = New line
input.addEventListener("keydown", (event) => {
  if (
    event.key === "Enter" &&
    !event.shiftKey
  ) {
    event.preventDefault();

    form.requestSubmit();
  }
});

// Quick prompt buttons
document
  .querySelectorAll("[data-prompt]")
  .forEach((button) => {
    button.addEventListener("click", () => {
      sendMessage(button.dataset.prompt);
    });
  });

// New Chat
newChatBtn.addEventListener("click", () => {
  history = [];

  messages.innerHTML = `
    <div class="message-row bot">

      <div class="avatar">
        P
      </div>

      <div class="bubble">
        <strong>New plan started.</strong>

        <p>
          What event would you like to organize?
        </p>
      </div>

    </div>
  `;

  input.focus();
});

// Initialize textarea
resizeInput();