# prvctice — Site Copy v2

---

## HERO TAGLINE

> AI that builds its own tools by watching you work.

---

## SECTION ORDER (priority-ranked)

1. Skill Discovery — the moat, lead with it
2. Your hands, your voice, your rules — the interaction model (merged spatial + hand tracking + voice)
3. Your data. Your machine. Your keys. — privacy + ownership + desktop app
4. Composable skills — the power-user depth
5. Provider freedom — remove the lock-in objection
6. A workstation, not a chatbot — embedded experiences, PDF workspace, games
7. Built with taste — theming + GPU graphics + visual identity

---

## 1. SKILL DISCOVERY

**Section headline:**

> It watches what you do. Never what you say.

**Body copy:**

Most AI apps have "memory" — a notepad where the model jots down facts about you. Your favorite language. Your name. That's it.

This is different.

The system observes your tool usage patterns — which skills you run, how you chain them, where you repeat yourself, which steps you always do manually. It scores those patterns by frequency, recency, and consistency, and when it's confident enough, it proposes a new skill that replaces your five-step routine with one step.

It's not a memory. It's an apprentice.

And the privacy boundary is architectural, not a promise. The observer records event type strings only — `skill:prompt`, never the prompt itself — through a strict allowlist that defines the exact boundary of what can be observed. Your conversations are never touched. It sees the shape of your actions: _summarize → translate → format_. Three steps you keep doing? Now it's one. You approve, tweak, or reject. The system learns either way.

**Pull quote:**

> ChatGPT remembers facts about you. This learns workflows from you.

---

## 2. YOUR HANDS, YOUR VOICE, YOUR RULES

**Section headline:**

> Point your webcam. Speak a command. Drag with your hands. It all works the same way.

**Body copy:**

Every other AI app is a text box with a sidebar. Type, hit enter, scroll. That interaction model hasn't changed since 2022.

prvctice has a unified intent coordinator — a single system that routes keyboard, voice, hand tracking, gamepad, and gesture input to the same targets through the same actions. The same thing happens whether you click a skill, say "run Summarize," or pinch it with your fingers in front of a webcam.

Hand tracking runs through MediaPipe. Point your webcam at your hands and control the entire app: pinch to grab skill pills, drag them into combinations, gesture to execute. Your hand position is visualized live on the ambient particle field.

Voice commands work on desktop without an internet connection — native macOS speech recognition via the Electron shell. In the browser, it falls back to the Web Speech API. Either way, you can execute skills, toggle features, and navigate entirely by voice.

Skills are physical objects. Pill-shaped, draggable, with spring physics — they deform under velocity, glow when near compatible skills, and magnetically snap into chains. Drag "Summarize" onto "Translate" and you've built a pipeline. No YAML. No config files. Just spatial logic.

This isn't a UI feature. It's a different paradigm for interacting with intelligence.

---

## 3. YOUR DATA, YOUR MACHINE, YOUR KEYS

**Section headline:**

> A desktop app. Local storage. No cloud dependency.

**Body copy:**

prvctice is a desktop application — not a browser tab you hope stays open. The Electron shell gives you native speech recognition, auto-updates, file system access, and a real process on your machine.

Bring your own API key. Run a local model. Storage is IndexedDB, OPFS, and SQLite — on your device, not in someone else's data center.

No account required. No telemetry you can't disable. No "we improved our privacy policy" emails. Your conversations, your skills, your workflows — they live where you put them.

For individual users, this means real privacy. For teams and enterprises, it means deployment on your own infrastructure with your own security policies. No third-party risk assessments. No data processing agreements. Just software you run.

---

## 4. COMPOSABLE SKILLS

**Section headline:**

> Six skill types. Three combination modes. Your toolbox.

**Body copy:**

Skills aren't features some product team decided to ship. They're building blocks you control — six types (prompts, actions, modifiers, templates, chains, and triggers), each with different behaviors and combination rules.

Chain them: drag one skill onto another to create a sequential pipeline. Pipe output from one into the input of the next. Modify a skill's behavior with another skill as a filter. Three combination modes that let you build exactly the workflow you need.

Here's where it gets interesting: the Skill Discovery system can generate these automatically. It detects your repeated multi-step patterns and proposes pre-built chains. You approve, tweak, or reject. The system learns either way.

You end up with a toolbox that was built _by_ how you work, _for_ how you work. No two users have the same one.

---

## 5. PROVIDER FREEDOM

**Section headline:**

> Bring any brain. Keep every conversation.

**Body copy:**

ChatGPT locks you to OpenAI. Claude.ai locks you to Anthropic. You're renting a room in someone else's house.

prvctice supports Anthropic, Gemini, hundreds of models through OpenRouter, and fully local inference with LM Studio. Plug in whatever model fits the job. Switch between them mid-conversation if you want.

The system even nudges you when a task might be better suited to a different provider. Not a hard sell. Just a quiet: _"This provider may struggle here — Switch / Keep."_

No lock-in. No forced migrations. If a better model drops tomorrow, plug it in tonight.

---

## 6. A WORKSTATION, NOT A CHATBOT

**Section headline:**

> A workspace with documents, notes, weather, and a reason to stay.

**Body copy:**

Open a PDF and it's not just a viewer — it's a document workspace. Highlight passages, annotate sections, and ask the AI about what you're reading. Responses reference the document directly with highlighted context.

Floating notes powered by TipTap. A weather widget with custom media overlay. Structured result cards that pull cover art and metadata from real databases — Discogs for music, TMDB for films — not just formatted markdown. Image attachments with moodboard support for curating visual references alongside your conversations.

Pong, Block Breaking, and Slice Master — playable with gesture controls via hand tracking. Intentional "take a break" moments built into the workspace.

This is the difference between a tool you visit and an environment you live in. Chat apps give you a text box. This gives you a desk.

---

## 7. BUILT WITH TASTE

**Section headline:**

> Eleven themes. GPU-rendered presence. Custom backgrounds.

**Body copy:**

EVA. Vera Baxter. Fragile. Every theme is a complete visual identity, not a color swap. Upload your own photo for a custom background. A high-contrast theme for accessibility.

The ambient particle system is GPU-accelerated — a dotmatrix field with awareness states that responds to what's happening in the application. It breathes when idle, sharpens when processing, and disperses on completion. Spring physics drive the motion, so nothing pops or snaps. It flows.

This isn't polish for its own sake. Ambient state visualization turns AI processing from a spinner-and-wait into something you can read at a glance. You know what the system is doing without reading a status bar.

---

---

## HACKER NEWS POST

**Title:**

> Show HN: An AI workstation that generates its own tools by watching your usage patterns

**Post body:**

I've been building an AI interface that does something I haven't seen anywhere else: it watches how you use tools, detects repeated patterns, and proposes new single-step automations from them. I'm calling it Skill Discovery.

Here's how it works technically: an observe-detect-score-suggest pipeline monitors action sequences (not conversation content — just tool invocations and their ordering). The observer records event type strings through a strict allowlist, never payloads, into a 500-entry ring buffer. The pattern detector runs n-gram analysis over the action history. The suggestion engine scores patterns with a weighted formula — frequency 50%, recency 30%, consistency 20%, minus dismissal penalties — and when conviction passes 0.7, it calls an LLM to generate a composite skill proposal. You approve, modify, or reject. The system updates its model either way.

This is fundamentally different from ChatGPT's "memory" (key-value storage the model writes to) or Claude's Projects (curated context windows). Those remember facts. This learns behaviors and produces executable automation.

Some other architectural decisions that might interest this crowd:

**Provider-agnostic.** Supports Anthropic, Gemini, OpenRouter (hundreds of models), and LM Studio for fully local inference. There's a provider nudge system that suggests switching when a task might be better suited to a different model. BYO API key for everything. No OpenAI — deliberate choice.

**Spatial interaction model.** Skills are physics-based draggable objects with spring physics, magnetic snapping, velocity-based deformation, and proximity-glow combination previews. Drag skill A onto skill B to create a chain. Six skill types (prompt, action, modifier, template, chain, trigger) with three combination modes (chain, pipe, modify).

**Unified intent coordinator.** One system routes keyboard, voice, hand tracking (MediaPipe via webcam), gamepad, and gesture input to the same targets. Hand tracking lets you pinch-drag skill pills and gesture to execute. Voice works offline on desktop via native macOS speech recognition.

**Desktop app with local-first storage.** Electron shell. IndexedDB + OPFS + SQLite. No cloud. No account. No telemetry you can't disable.

**Embedded workspace.** PDF document analysis (highlight, annotate, ask-the-AI-about-what-you're-reading), floating notes (TipTap), weather widget, structured result cards pulling from Discogs/TMDB, moodboard image support. Mini-games (Pong, Block Breaking, Slice Master) with gesture controls.

**GPU-accelerated ambient UI.** Three.js dotmatrix particle system with awareness states (idle, typing, waiting, responding) driven by spring physics. Eleven cinematic themes, custom photo backgrounds, high-contrast accessibility mode.

I'm most interested in feedback on the skill discovery pipeline — both the detection heuristics and the UX around surfacing proposed automations without being annoying. Also curious if anyone's seen similar approaches to spatial skill composition.

[LINK]

---

## SECTION PRIORITY TABLE

| Priority | Section           | Job It Does                                                   | Emotion It Should Trigger |
| -------- | ----------------- | ------------------------------------------------------------- | ------------------------- |
| 1        | Skill Discovery   | Establish the moat. "Wait, nobody else does this?"            | Curiosity → conviction    |
| 2        | Interaction Model | Make every other AI app feel dated. Webcam + voice + physics. | Desire to try it          |
| 3        | Your Data         | Win trust. Desktop app + local storage + no cloud.            | Trust, safety             |
| 4        | Composable Skills | Show depth. Six types, three modes, auto-generation.          | Respect, power            |
| 5        | Provider Freedom  | Remove the "but I use GPT-4" objection.                       | Relief, autonomy          |
| 6        | Workstation       | Expand from "chat app" to "environment I live in."            | Ambition, belonging       |
| 7        | Visual Identity   | Differentiate on craft. Show taste.                           | Aesthetic pull            |

---

## LANGUAGE RULES

1. **Never say "recursive learning" in user-facing copy.** Say "Skill Discovery" or "it learns how you work."
2. **Never say "we don't read your chats."** Say what you _do_ observe: "tool usage patterns, not conversations."
3. **Always use a concrete example** when explaining Skill Discovery. Abstract pipeline descriptions don't land.
4. **Name the competition directly.** ChatGPT and Claude.ai by name. HN respects directness.
5. **Lead every section with what the user gets**, not how the technology works. Tech details come second paragraph.
6. **Avoid:** "revolutionary," "game-changing," "next-generation," "cutting-edge." Use: "different," "novel," "nobody else has this."
7. **No OpenAI in provider list.** Deliberate exclusion — frame as a principled choice if it comes up, don't explain unprompted.
8. **Say "desktop app" early.** It changes the mental model from "another web tool" to "real software on my machine."
9. **Name specific things.** Pong not "mini-games." Discogs not "databases." MediaPipe not "hand tracking library." Specificity builds credibility.
