# Kanoon 4 U — Backend API

> Legal education platform backend — Node.js · Express 5 · PostgreSQL · MongoDB · Groq RAG

---

## Table of Contents

- [Project Overview](#project-overview)
- [Tech Stack](#tech-stack)
- [Project Structure](#project-structure)
- [Architecture](#architecture)
- [Features](#features)
- [Environment Setup](#environment-setup)
- [Getting Started](#getting-started)
- [API Reference](#api-reference)
- [Data Models](#data-models)
- [User Interest Tracking](#user-interest-tracking)
- [Feed Scoring System](#feed-scoring-system)
- [Security](#security)
- [Error Handling](#error-handling)
- [Testing Checklist](#testing-checklist)
- [Known Bugs Fixed](#known-bugs-fixed)
- [Scripts](#scripts)

---

## Project Overview

Kanoon 4 U is a legal education platform backend providing:

- JWT-based user authentication
- Paginated legal content feed with **composite scoring** (recency + verification + tag relevance)
- AI-powered legal tutor using RAG (Retrieval-Augmented Generation) with Groq LLaMA
- Interactive quiz system with automatic grading
- User activity tracking (fire-and-forget)
- **User interest profiling** — tracks tag interactions to personalise the feed

---

## Tech Stack

| Layer | Technology |
|---|---|
| Runtime | Node.js v23 |
| Framework | Express.js v5 |
| Relational DB | PostgreSQL via Supabase (Sequelize ORM) |
| Document DB | MongoDB (Mongoose ODM) |
| Authentication | JWT + bcryptjs |
| AI | Groq API — llama-3.1-8b-instant with RAG |
| Security | Helmet, CORS, express-rate-limit, express-validator |
| Logging | Winston (structured JSON) |
| Dev tooling | nodemon, dotenvx |

> **Why Groq instead of OpenAI?**
> The project was originally scaffolded with OpenAI GPT-4o-mini. OpenAI's free tier requires billing setup — switched to Groq (free tier, no card required). The SDK interface is identical. To switch back: replace `groq-sdk` with `openai`, change `GROQ_API_KEY` to `OPENAI_API_KEY`, and change the model name to `gpt-4o-mini` in `chatService.js`. Nothing else changes.

---

## Project Structure

```
Kanoon 4 U/
├── server.js                           # Entry point — graceful shutdown, global error handlers
├── app.js                              # Express app — middleware pipeline, routes, error handlers
├── .env                                # Environment variables (required — never commit this)
├── .env.example                        # Template for environment variables
│
├── config/
│   ├── db.js                           # Boots both DBs with Promise.allSettled()
│   ├── postgres.js                     # Sequelize instance — exports { sequelize } named export
│   └── mongo.js                        # Mongoose connect with lifecycle hooks
│
├── models/
│   ├── postgres/
│   │   ├── User.js                     # id, name, email, password, role, isActive
│   │   └── UserInterest.js             # userId, tag, interactionCount, lastInteractedAt
│   └── mongo/
│       ├── Post.js                     # title, summary, tags[], verified, content
│       ├── Quiz.js                     # question, options[], answer, explanation, difficulty
│       └── Activity.js                 # userId (String — never ObjectId), type, metadata
│
├── routes/
│   ├── healthRoutes.js                 # GET /api/health
│   ├── dbStatusRoutes.js               # GET /api/db-status
│   ├── authRoutes.js                   # POST /api/auth/signup, /api/auth/login
│   ├── feedRoutes.js                   # GET /api/feed, /api/post/:id [optionalAuth]
│   ├── chatRoutes.js                   # POST /api/chat
│   ├── quizRoutes.js                   # GET /api/quiz, POST /api/quiz/submit
│   ├── activityRoutes.js               # GET /api/activity/:userId, /summary
│   └── interestRoutes.js               # GET /api/interests/:userId
│
├── controllers/
│   ├── healthController.js
│   ├── dbStatusController.js
│   ├── authController.js
│   ├── feedController.js
│   ├── chatController.js
│   ├── quizController.js
│   ├── activityController.js
│   └── interestController.js           # getInterests() — sortBy, limit
│
├── services/
│   ├── healthService.js                # Uptime, env, timestamp
│   ├── dbStatusService.js              # Ping both DBs, return live status
│   ├── authService.js                  # Signup, login, JWT generate/verify
│   ├── feedService.js                  # Scored feed — recency + verification + tag relevance
│   ├── chatService.js                  # Groq RAG: search → context → generate
│   ├── quizService.js                  # Random questions, scoring, quiz_attempted log
│   ├── activityService.js              # logActivity(), getUserActivity(), getUserSummary()
│   └── interestService.js              # trackTagInteractions(), getUserInterests()
│
├── middleware/
│   ├── securityMiddleware.js           # Helmet, CORS, rate limiting, mongo sanitize (manual)
│   ├── authMiddleware.js               # JWT verify, optionalAuth, role-based authorization
│   ├── validateMiddleware.js           # Input validation with express-validator
│   ├── requestLogger.js                # Structured request logging with requestId
│   └── errorHandler.js                # Centralized error handling with custom error classes
│
└── utils/
    ├── logger.js                       # Winston logger configuration
    ├── AppError.js                     # Custom error classes (ValidationError, NotFoundError, etc.)
    └── apiResponse.js                  # Standardized response helpers (success, error, paginated)
```

---

## Architecture

### Dual Database Design

| Data | Database | Reason |
|---|---|---|
| Users, UserInterests | PostgreSQL (Supabase) | Relational, ACID, foreign keys |
| Posts, Quiz, Activity | MongoDB | Flexible schema, full-text search for RAG |

> **Critical rule for all future developers:**
> Never use `mongoose.Schema.Types.ObjectId` for `userId` in any MongoDB model.
> PostgreSQL user IDs are plain integers. Storing them as ObjectId causes `CastError: Cast to ObjectId failed for value "2"`.
> Always store cross-DB user references as `String` in Mongo.

### Request Flow

```
Client
  → Security Middleware (Helmet, CORS, Rate Limit, Sanitize)
  → Request Logger (requestId generation)
  → Route-specific Middleware (optionalAuth / authenticateToken / validate)
  → Controller
  → Service
  → Database
```

### Middleware Reference

| Middleware | Behaviour | Used on |
|---|---|---|
| `authenticateToken` | Throws 401 if no/invalid token | Protected routes |
| `optionalAuth` | Sets `req.user = null` if no token, never throws | Public routes that gain features when logged in |

Feed and single post routes use `optionalAuth` — guests can browse, authenticated users get personalised scoring and activity tracking.

### Fire-and-Forget Pattern

Activity logging and interest tracking are never awaited. The response goes out immediately; these run after, errors swallowed silently:

```js
if (userId) {
  logActivity(userId, 'post_viewed', { postId, postTitle });  // not awaited
  trackTagInteractions(userId, post.tags);                    // not awaited
}
```

### Express 5 Compatibility Note

Express 5 made `req.query` a read-only getter. `express-mongo-sanitize` cannot be used as middleware directly — it will crash with:

```
Cannot set property query of #<IncomingMessage> which has only a getter
```

It is called manually instead in `securityMiddleware.js`:

```js
(req, res, next) => {
  if (req.body) req.body = mongoSanitize.sanitize(req.body, { replaceWith: '_' });
  if (req.params) req.params = mongoSanitize.sanitize(req.params, { replaceWith: '_' });
  next();
}
```

### Route Mounting Rule

If a route is mounted at a full path in `app.js`, the router must use `/` — never repeat the segment:

```js
// app.js
app.use('/api/health', healthRoutes);

// healthRoutes.js — CORRECT
router.get('/', getHealth);  // → /api/health ✅

// healthRoutes.js — WRONG
router.get('/health', getHealth);  // → /api/health/health ❌
```

Feed routes are an exception — mounted at `/api` so the router defines full sub-paths (`/feed`, `/post/:id`).

---

## Features

### Feed Scoring System

Every post is scored out of 100 before being returned. Guests get recency + verification only. Authenticated users also get tag relevance from their interest profile.

| Signal | Weight | Logic |
|---|---|---|
| Recency | 40 pts | Linear decay over 30 days → 0 |
| Verification | 30 pts | expert=30, reviewed=20, ai=10, unverified=0 |
| Tag Relevance | 30 pts | Normalised against user's max interaction count |

Pool strategy: fetches `5 × page_size` posts from MongoDB, scores all in memory, sorts by score, slices the page. Keeps scoring meaningful without pulling the entire collection.

### User Interest Tracking

When an authenticated user views a post, the post's tags are upserted into `user_interests` (PostgreSQL). Builds a passive interest profile that personalises the feed score. Fire-and-forget — never blocks the response.

### Activity Tracking

| Type | Triggered by |
|---|---|
| `post_viewed` | `GET /api/post/:id` (authenticated) |
| `quiz_attempted` | `POST /api/quiz/submit` |

### AI Chat (RAG)

1. Extract keywords from the question (stop-word filtered)
2. Search MongoDB Posts with `$text` index — falls back to empty context if index missing
3. Build context string from top matching posts
4. Send context + question to Groq `llama-3.1-8b-instant`
5. Return `{ answer, sources }`

---

## Environment Setup

Create a `.env` file in the project root. **Every value must be on a single unbroken line** — line breaks inside a value (especially long API keys) cause silent failures.

```env
PORT=3000
NODE_ENV=development
APP_NAME=Kanoon 4 U
LOG_LEVEL=info

# PostgreSQL (Supabase)
POSTGRES_HOST=db.yourproject.supabase.co
POSTGRES_PORT=5432
POSTGRES_DB=postgres
POSTGRES_USER=postgres
POSTGRES_PASSWORD=your_password

# MongoDB
MONGO_URI=mongodb://localhost:27017/kanoon4u

# Authentication (min 32 characters)
JWT_SECRET=your-super-secret-jwt-key-min-32-chars-long

# Groq — free at https://console.groq.com
GROQ_API_KEY=gsk_your_groq_key_here

# Optional CORS
ALLOWED_ORIGINS=https://example.com,https://app.example.com
```

> **GROQ_API_KEY warning:** Keys are long (~100 chars). If your editor wraps the line, the key will be read truncated and every AI request will silently fail with 401. Verify with:
> ```powershell
> cat .env | Select-String "GROQ_API_KEY"
> ```
> The entire key must appear on one line in the output.

---

## Getting Started

```bash
# 1. Install dependencies
npm install

# 2. Set up environment
cp .env.example .env
# Fill in all values

# 3. Development server (auto-restart)
npm run dev

# 4. Production server
npm start
```

Server starts at `http://localhost:3000`

Both databases connect on startup. Watch for:
```
✅ MongoDB connected successfully
✅ PostgreSQL connected successfully
📦 PostgreSQL models synced
🚀 Server running in development mode on port 3000
```

---

## API Reference

### Health & Status

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| GET | `/api/health` | None | Server uptime, environment, timestamp |
| GET | `/api/db-status` | None | Live PostgreSQL + MongoDB status |

### Authentication

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| POST | `/api/auth/signup` | None | Register → returns JWT |
| POST | `/api/auth/login` | None | Login → returns JWT |

**Password rules:** min 8 / max 128 chars, must include uppercase, lowercase, number, special character.

**Response includes token:**
```json
{
  "success": true,
  "data": {
    "id": 2,
    "name": "Atul Joshi",
    "email": "atul@example.com",
    "role": "user",
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
  }
}
```

Rate limit: 5 requests / 15 minutes on auth routes.

### Content Feed

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| GET | `/api/feed` | Optional | Scored paginated feed |
| GET | `/api/feed/verified` | None | Verified posts only |
| GET | `/api/post/:id` | Optional | Single post — tracks tags if authenticated |
| POST | `/api/post/:id/verify` | Required | Mark post as verified |

**Query params for `/api/feed`:**

| Param | Type | Description |
|---|---|---|
| `page` | number | Page number (default: 1) |
| `limit` | number | Items per page (default: 10) |
| `tag` | string | Filter by tag |
| `verified` | boolean | Filter by verification status |
| `verificationLevel` | string | `ai` / `reviewed` / `expert` |

**Feed meta includes:**
```json
"meta": {
  "scoringWeights": { "recency": 40, "verification": 30, "tagRelevance": 30 },
  "personalised": true,
  "verificationStats": { "total": 10, "expert": 2, "reviewed": 5, "ai": 3 }
}
```

### AI Chat (RAG)

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| POST | `/api/chat` | None | Legal AI tutor |

```json
// Request
{ "question": "What is Article 21?" }

// Response
{
  "answer": "Article 21 of the Indian Constitution...",
  "sources": [{ "title": "Fundamental Rights Overview", "verified": true }]
}
```

Rate limit: 20 requests / 15 minutes.

### Quiz

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| GET | `/api/quiz` | None | Randomised questions |
| POST | `/api/quiz/submit` | None | Submit answers → score + grade |
| POST | `/api/quiz/seed` | None | Seed sample data (dev only) |

**Quiz response — questions live at `data.questions[]`, not `data[]`:**

```json
{
  "data": {
    "questions": [
      {
        "_id": "69f3c44a...",
        "question": "Which Article deals with Right to Equality?",
        "options": ["Article 12", "Article 14", "Article 19", "Article 21"],
        "difficulty": "easy",
        "tags": ["fundamental-rights", "equality"],
        "category": "Constitutional Law"
      }
    ]
  }
}
```

**Submit payload:**
```json
{
  "submissions": [
    { "questionId": "69f3c44a...", "selectedOption": "Article 14" }
  ]
}
```

**Grading scale:**

| Score | Grade |
|---|---|
| 90–100% | A |
| 75–89% | B |
| 60–74% | C |
| 40–59% | D |
| 0–39% | F |

### Activity

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| GET | `/api/activity/:userId` | Required | All activity for a user |
| GET | `/api/activity/:userId/summary` | Required | Aggregated stats |

**Summary response:**
```json
{
  "data": {
    "userId": "2",
    "summary": {
      "postsViewed": 12,
      "quizAttempts": 3,
      "avgQuizScore": 67,
      "bestQuizScore": 80
    }
  }
}
```

### User Interests

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| GET | `/api/interests/:userId` | Required | Ranked tag interest profile |

**Query params:**

| Param | Values | Description |
|---|---|---|
| `sortBy` | `count` (default) / `recent` | Sort by interaction count or recency |
| `limit` | number (default 20, max 100) | Number of tags to return |

**Response:**
```json
{
  "success": true,
  "data": {
    "userId": "2",
    "interests": [
      { "tag": "fundamental-rights", "interactionCount": 5, "lastInteractedAt": "2026-05-01T..." },
      { "tag": "article-21", "interactionCount": 3, "lastInteractedAt": "2026-05-01T..." }
    ]
  }
}
```

---

## Data Models

### PostgreSQL — `users`

| Column | Type | Notes |
|---|---|---|
| id | INTEGER | PK, autoIncrement |
| name | VARCHAR(100) | required |
| email | VARCHAR(255) | unique, required |
| password | VARCHAR(255) | bcrypt hashed, 10 rounds |
| role | ENUM | 'admin', 'user', 'guest' — default 'user' |
| isActive | BOOLEAN | default true |
| createdAt | TIMESTAMPTZ | auto |
| updatedAt | TIMESTAMPTZ | auto |

### PostgreSQL — `user_interests`

| Column | Type | Notes |
|---|---|---|
| id | INTEGER | PK, autoIncrement |
| userId | INTEGER | FK → users(id) ON DELETE CASCADE |
| tag | VARCHAR(100) | lowercased + trimmed before insert |
| interactionCount | INTEGER | default 1, incremented on each post view |
| lastInteractedAt | TIMESTAMPTZ | updated on each post view |
| createdAt | TIMESTAMPTZ | auto |
| updatedAt | TIMESTAMPTZ | auto |
| | UNIQUE | constraint on (userId, tag) |

### MongoDB — `activities`

| Field | Type | Notes |
|---|---|---|
| userId | **String** | PostgreSQL integer as string — **never ObjectId** |
| type | String | 'post_viewed' \| 'quiz_attempted' |
| metadata.postId | String | post_viewed only |
| metadata.postTitle | String | post_viewed only |
| metadata.score | Number | quiz_attempted only |
| metadata.total | Number | quiz_attempted only |
| metadata.percentage | Number | quiz_attempted only |
| metadata.grade | String | quiz_attempted only |
| createdAt | Date | auto |

### MongoDB — `posts`

| Field | Type | Notes |
|---|---|---|
| title | String | required |
| summary | String | required |
| content | String | used by RAG search |
| tags | [String] | used for interest tracking + feed scoring |
| verified | String | 'unverified' \| 'ai' \| 'reviewed' \| 'expert' |
| createdAt | Date | auto |

### MongoDB — `quizzes`

| Field | Type | Notes |
|---|---|---|
| question | String | required |
| options | [String] | array of 4 choices |
| answer | String | correct option text |
| explanation | String | shown after submission |
| difficulty | String | 'easy' \| 'medium' \| 'hard' |
| tags | [String] | topic tags |
| category | String | e.g. 'Constitutional Law' |

---

## User Interest Tracking

Full flow from post view to personalised feed:

```
GET /api/post/:id  (authenticated user)
│
├── optionalAuth sets req.user = { id, email, role }
├── Post fetched from MongoDB
├── Response returned to client immediately
└── Fire-and-forget (not awaited):
    ├── logActivity(userId, 'post_viewed', { postId, postTitle })
    │     └── Inserts Activity document into MongoDB
    └── trackTagInteractions(userId, post.tags)
          └── For each tag (lowercased + trimmed):
                UPSERT INTO user_interests (userId, tag)
                ON CONFLICT (userId, tag):
                  SET interactionCount = interactionCount + 1
                  SET lastInteractedAt = NOW()

GET /api/feed  (authenticated user)
└── feedService fetches user_interests from PostgreSQL
      └── Adds tag relevance score (0–30 pts) per post
            score = (matching tag interactionCount / maxInteractionCount) × 30
```

---

## Security

| Feature | Implementation |
|---|---|
| Security headers | Helmet |
| CORS | Configurable via `ALLOWED_ORIGINS` env var |
| Rate limiting | 100/15min general · 5/15min auth · 20/15min chat |
| Request size | 10KB max body |
| Input validation | express-validator |
| NoSQL sanitization | express-mongo-sanitize — manual mode (Express 5 compat) |
| Password hashing | bcryptjs, 10 salt rounds |
| JWT expiry | 7 days |

---

## Error Handling

**All error responses follow this shape:**
```json
{
  "success": false,
  "message": "Validation error",
  "errorCode": "VALIDATION_ERROR",
  "errors": [
    { "field": "email", "message": "Invalid email format" }
  ]
}
```

| Error Class | HTTP | Use Case |
|---|---|---|
| `ValidationError` | 400 | Invalid input |
| `UnauthorizedError` | 401 | Missing/invalid JWT |
| `ForbiddenError` | 403 | Insufficient permissions |
| `NotFoundError` | 404 | Resource not found |
| `ConflictError` | 409 | Duplicate resource (e.g. email already registered) |
| `RateLimitError` | 429 | Too many requests |
| `BadGatewayError` | 502 | External API failure (Groq) |
| `ServiceUnavailableError` | 503 | Database unavailable |

---

## Testing Checklist

Run these in order after any fresh setup. Use two PowerShell windows — one running `npm run dev`, one for curl commands.

```powershell
# ── Capture token first ────────────────────────────────────────────
$response = curl -UseBasicParsing -Method POST http://localhost:3000/api/auth/login `
  -ContentType "application/json" `
  -Body '{"email":"atul@example.com","password":"StrongPass123!"}'
$token = ($response.Content | ConvertFrom-Json).data.token
Write-Host "Token: $token"

# 1. Health
curl -UseBasicParsing http://localhost:3000/api/health

# 2. DB status (both should show "connected")
curl -UseBasicParsing http://localhost:3000/api/db-status

# 3. Signup (409 if already registered — that's fine)
curl -UseBasicParsing -Method POST http://localhost:3000/api/auth/signup `
  -ContentType "application/json" `
  -Body '{"name":"Atul Joshi","email":"atul@example.com","password":"StrongPass123!"}'

# 4. Login (token must appear in response)
curl -UseBasicParsing -Method POST http://localhost:3000/api/auth/login `
  -ContentType "application/json" `
  -Body '{"email":"atul@example.com","password":"StrongPass123!"}'

# 5. Feed guest (personalised: false)
curl -UseBasicParsing http://localhost:3000/api/feed

# 6. Feed authenticated (personalised: true)
curl -UseBasicParsing http://localhost:3000/api/feed `
  -Headers @{"Authorization"="Bearer $token"}

# 7. Seed quiz
curl -UseBasicParsing -Method POST http://localhost:3000/api/quiz/seed

# 8. Fetch quiz — NOTE: data.questions[], not data[]
$quizResponse = curl -UseBasicParsing http://localhost:3000/api/quiz
$quiz = ($quizResponse.Content | ConvertFrom-Json)
$questionId = $quiz.data.questions[0]._id
$selectedOption = $quiz.data.questions[0].options[0]
Write-Host "ID: $questionId | Option: $selectedOption"

# 9. Submit quiz
curl -UseBasicParsing -Method POST http://localhost:3000/api/quiz/submit `
  -ContentType "application/json" `
  -Body "{`"submissions`":[{`"questionId`":`"$questionId`",`"selectedOption`":`"$selectedOption`"}]}"

# 10. Activity log
curl -UseBasicParsing http://localhost:3000/api/activity/2 `
  -Headers @{"Authorization"="Bearer $token"}

# 11. Activity summary
curl -UseBasicParsing http://localhost:3000/api/activity/2/summary `
  -Headers @{"Authorization"="Bearer $token"}

# 12. Interest profile
curl -UseBasicParsing http://localhost:3000/api/interests/2 `
  -Headers @{"Authorization"="Bearer $token"}

# 13. AI chat
curl -UseBasicParsing -Method POST http://localhost:3000/api/chat `
  -ContentType "application/json" `
  -Body '{"question":"What is Article 21 of the Indian Constitution?"}'

# 14. Security — weak password (expect 400)
curl -UseBasicParsing -Method POST http://localhost:3000/api/auth/signup `
  -ContentType "application/json" `
  -Body '{"name":"X","email":"x@x.com","password":"weak"}'

# 15. Security — no token on protected route (expect 401)
curl -UseBasicParsing http://localhost:3000/api/activity/2

# 16. Rate limit — expect 429 after ~5 attempts
1..7 | ForEach-Object {
  $r = curl -UseBasicParsing -Method POST http://localhost:3000/api/auth/login `
    -ContentType "application/json" `
    -Body '{"email":"x@x.com","password":"wrong"}'
  Write-Host "$_ → $($r.StatusCode)"
}
```

### Expected Results

| # | Endpoint | Expected |
|---|---|---|
| 1 | `/api/health` | 200, `status: OK` |
| 2 | `/api/db-status` | 200, both `connected` |
| 3 | `POST /signup` | 201 + token (or 409 if email exists) |
| 4 | `POST /login` | 200 + token |
| 5 | `GET /feed` guest | 200, `personalised: false` |
| 6 | `GET /feed` auth | 200, `personalised: true` |
| 7 | `POST /quiz/seed` | 200, seeded |
| 8–9 | Quiz fetch + submit | 200, score + grade |
| 10–11 | Activity log + summary | 200 |
| 12 | Interests | 200, tags array |
| 13 | AI chat | 200, answer + sources |
| 14 | Weak password | 400 VALIDATION_ERROR |
| 15 | No token | 401 UNAUTHORIZED |
| 16 | Rate limit | 429 after ~5 attempts |

---

## Known Bugs Fixed

All bugs below were found and fixed during development. Do not reintroduce them.

| # | Bug | Root Cause | Fix Applied |
|---|---|---|---|
| 1 | Silent crash on startup | Unhandled rejection swallowed before logger boots | `process.on('uncaughtException')` + `process.on('unhandledRejection')` in `server.js` |
| 2 | `express-mongo-sanitize` crashes Express 5 | Express 5 made `req.query` read-only getter | Call `mongoSanitize.sanitize()` manually on `req.body` and `req.params` only |
| 3 | All routes return 404 | Double route prefix — path repeated in `app.js` mount AND router file | Router must use `router.get('/')` when `app.use('/api/health', ...)` |
| 4 | `ReferenceError: getHealth is not defined` | Controller imported as object, used as if destructured | Destructure on import or use `healthController.getHealth` |
| 5 | Auth response missing token | `authController` spread only `result.user`, dropped `result.token` | `{ ...result.user, token: result.token }` in both signup and login handlers |
| 6 | `sequelize.define is not a function` in UserInterest | `config/postgres.js` exports `{ sequelize }` named, not default | `const { sequelize } = require('../../config/postgres')` |
| 7 | `CastError: Cast to ObjectId failed for userId "2"` | `Activity.js` typed `userId` as `ObjectId` — Postgres IDs are integers | Changed `userId` to `String` in `Activity.js` |
| 8 | `getUserSummary` always throws `Invalid userId format` | Service called `mongoose.Types.ObjectId.isValid("2")` — always false for integers | Removed ObjectId validation; aggregate `$match` uses `String(userId)` |
| 9 | `/api/interests/:userId` always 404 | `interestRoutes.js` and `interestController.js` never created; route never registered | Created both files; added to `app.js` |
| 10 | Quiz `data[0]` is null | Quiz returns `data.questions[]` not `data[]` | Access via `$quiz.data.questions[0]` |
| 11 | AI chat 502 bad gateway | `OPENAI_API_KEY` was placeholder value | Replaced with real key (then switched to Groq) |
| 12 | AI chat 429 quota exceeded | OpenAI free tier requires billing | Switched to Groq free tier (`groq-sdk`, model `llama-3.1-8b-instant`, key `GROQ_API_KEY`) |
| 13 | AI chat fails silently after key fix | API key was on two lines in `.env` due to editor word wrap — only first line loaded | Rewrote `.env` via PowerShell `Set-Content` to ensure single-line key |

---

## Scripts

```bash
npm run dev    # nodemon — auto-restarts on file changes
npm start      # node server.js — production
```

---

## License

ISC