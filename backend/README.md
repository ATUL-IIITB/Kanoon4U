# Kanoon 4 U — Backend API

A legal education platform backend built with Node.js and Express. It provides user authentication, a legal content feed, an AI-powered legal tutor with RAG (Retrieval-Augmented Generation), a quiz system, and user activity tracking — all backed by a dual-database architecture (PostgreSQL + MongoDB).

## Features

- **Dual Database Architecture**: PostgreSQL for user data, MongoDB for content
- **JWT Authentication**: Secure token-based auth with role-based access control
- **AI Legal Tutor**: RAG-powered chatbot using OpenAI GPT-4o-mini
- **Quiz System**: Interactive quizzes with automatic grading and activity tracking
- **Activity Tracking**: Fire-and-forget logging for user engagement metrics
- **Production-Ready**: Security headers, rate limiting, structured logging, centralized error handling

---

## Tech Stack

| Layer | Technology |
|---|---|
| Runtime | Node.js v23 |
| Framework | Express.js |
| Relational DB | PostgreSQL via Supabase (Sequelize ORM) |
| Document DB | MongoDB (Mongoose ODM) |
| Authentication | JWT + bcryptjs |
| AI | OpenAI API — gpt-4o-mini with RAG |
| Security | Helmet, CORS, express-rate-limit, express-validator |
| Logging | Winston (structured JSON logging) |
| Dev tooling | nodemon, dotenv |

---

## Project Structure

```
Kanoon 4 U/
├── server.js                       # Entry point — graceful shutdown, unhandled exception handlers
├── app.js                          # Express app — middleware pipeline, routes, error handlers
├── .env                            # Environment variables (required)
├── .env.example                    # Template for environment variables
│
├── config/
│   ├── db.js                       # Boots both DBs with Promise.allSettled()
│   ├── postgres.js                 # Sequelize instance with connection pool
│   └── mongo.js                    # Mongoose connect with lifecycle hooks
│
├── models/
│   ├── postgres/
│   │   └── User.js                 # id, name, email, password, role, isActive
│   └── mongo/
│       ├── Post.js                 # title, summary, tags[], verified, content
│       ├── Quiz.js                 # question, options[], answer, explanation, difficulty
│       └── Activity.js             # userId, type, metadata, timestamps
│
├── routes/
│   ├── healthRoutes.js             # GET /api/health
│   ├── dbStatusRoutes.js           # GET /api/db-status
│   ├── authRoutes.js               # POST /api/auth/signup, /api/auth/login
│   ├── feedRoutes.js               # GET /api/feed, /api/post/:id
│   ├── chatRoutes.js               # POST /api/chat
│   ├── quizRoutes.js               # GET /api/quiz, POST /api/quiz/submit
│   └── activityRoutes.js           # GET /api/activity/:userId, /summary
│
├── controllers/
│   ├── healthController.js
│   ├── dbStatusController.js
│   ├── authController.js
│   ├── feedController.js
│   ├── chatController.js
│   ├── quizController.js
│   └── activityController.js
│
├── services/
│   ├── healthService.js            # Uptime, env, timestamp
│   ├── dbStatusService.js          # Ping both DBs, return live status
│   ├── authService.js              # Signup, login, JWT generate/verify
│   ├── feedService.js              # Paginated feed + post_viewed activity log
│   ├── chatService.js              # OpenAI RAG: search → context → generate
│   ├── quizService.js              # Random questions, scoring, quiz_attempted log
│   └── activityService.js          # logActivity(), getUserActivity(), getUserSummary()
│
├── middleware/                     # [NEW] Request processing pipeline
│   ├── securityMiddleware.js       # Helmet, CORS, rate limiting, request size limits
│   ├── authMiddleware.js           # JWT verification, role-based authorization
│   ├── validateMiddleware.js       # Input validation with express-validator
│   ├── requestLogger.js            # Structured request logging with requestId
│   └── errorHandler.js             # Centralized error handling with custom error classes
│
└── utils/                          # [NEW] Shared utilities
    ├── logger.js                   # Winston logger configuration
    ├── AppError.js                 # Custom error classes (ValidationError, NotFoundError, etc.)
    └── apiResponse.js              # Standardized response helpers (success, error, paginated)
```

---

## API Reference

### Health & Status

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/health` | Server uptime, environment, timestamp |
| GET | `/api/db-status` | Live PostgreSQL + MongoDB connection status |

**Health response:**
```json
{
  "success": true,
  "data": {
    "status": "OK",
    "app": "Kanoon 4 U",
    "environment": "development",
    "timestamp": "2026-05-01T12:00:00.000Z",
    "uptime": "3600s"
  }
}
```

### Authentication

| Method | Endpoint | Description |
|---|---|---|
| POST | `/api/auth/signup` | Register user → returns JWT |
| POST | `/api/auth/login` | Login → returns JWT |

**Signup body:**
```json
{
  "name": "Atul Joshi",
  "email": "atul@example.com",
  "password": "StrongPass123!"
}
```

**Password requirements:**
- Minimum 8 characters, maximum 128
- Must contain: uppercase, lowercase, number, special character

**Response format:**
```json
{
  "success": true,
  "message": "User registered successfully",
  "data": {
    "id": "123",
    "name": "Atul Joshi",
    "email": "atul@example.com",
    "role": "user",
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
  }
}
```

### Content Feed (MongoDB)

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/feed` | Paginated posts. Query: `?page=1&limit=10&tag=constitutional&verified=true` |
| GET | `/api/post/:id` | Single post by ID — increments view count, logs activity if authenticated |

**Feed response:**
```json
{
  "success": true,
  "message": "Success",
  "data": [...posts],
  "pagination": {
    "currentPage": 1,
    "totalPages": 5,
    "totalItems": 50,
    "itemsPerPage": 10,
    "hasNextPage": true,
    "hasPrevPage": false
  }
}
```

### AI Chat with RAG

| Method | Endpoint | Description |
|---|---|---|
| POST | `/api/chat` | Legal AI tutor. Body: `{ "question": "..." }` → `{ answer, sources }` |

**How RAG works:**
1. Extract keywords from the question
2. Search MongoDB posts with `$text` query
3. Build context from matching posts
4. Send context + question to OpenAI gpt-4o-mini
5. Return the generated answer with source references

**Rate limit:** 20 requests per 15 minutes

### Quiz System (MongoDB)

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/quiz` | Fetch randomised questions. Query: `?limit=10&difficulty=easy&category=Constitutional Law&tags=writs` |
| POST | `/api/quiz/submit` | Submit answers → returns score, grade, explanations |
| POST | `/api/quiz/seed` | Seed sample questions (dev only) |

**Submit body:**
```json
{
  "submissions": [
    {
      "questionId": "64f1a2b3c4d5e6f7a8b9c0d1",
      "selectedOption": "No one is above the law, including the government"
    }
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

### User Activity Tracking (MongoDB)

| Method | Endpoint | Description | Auth Required |
|---|---|---|---|
| GET | `/api/activity/:userId` | All activity for a user. Query: `?type=post_viewed&page=1&limit=20` | Yes |
| GET | `/api/activity/:userId/summary` | Aggregated stats — posts viewed, quiz attempts, avg score | Yes |

**Note:** Activity routes now require JWT authentication to prevent unauthorized access to user data.

**Tracked activity types:**

| Type | Triggered when |
|---|---|
| `post_viewed` | User hits `GET /api/post/:id` |
| `quiz_attempted` | User hits `POST /api/quiz/submit` |

Activity logging is **fire-and-forget** — it never slows down the main API response. If logging fails, the error is caught silently and the user response is unaffected.

---

## Environment Variables

Create a `.env` file in the project root:

```env
# Server
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

# Authentication (REQUIRED - min 32 characters recommended)
JWT_SECRET=your-super-secret-jwt-key-min-32-chars-long

# OpenAI (REQUIRED)
OPENAI_API_KEY=sk-your-openai-api-key

# Optional: CORS (comma-separated origins)
ALLOWED_ORIGINS=https://example.com,https://app.example.com
```

---

## Getting Started

```bash
# 1. Install dependencies
npm install

# 2. Set up .env with all variables above
cp .env.example .env
# Edit .env with your credentials

# 3. Start development server
npm run dev

# 4. Start production server
npm start

# Server starts at http://localhost:3000
```

---

## Security Features

| Feature | Implementation |
|---|---|
| **Security Headers** | Helmet middleware (X-Content-Type-Options, X-Frame-Options, CSP, etc.) |
| **CORS** | Configurable allowed origins via `ALLOWED_ORIGINS` env var |
| **Rate Limiting** | 100 req/15min general, 5 req/15min auth, 20 req/15min chat |
| **Request Size Limit** | 10KB max body size |
| **Input Validation** | express-validator on all user inputs |
| **NoSQL Injection** | express-mongo-sanitize |
| **Password Hashing** | bcryptjs with 10 salt rounds |
| **JWT Expiry** | 7 days |

---

## Error Handling

### Standardized Error Response

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

### Custom Error Classes

| Error Class | HTTP Status | Use Case |
|---|---|---|
| `ValidationError` | 400 | Invalid input |
| `UnauthorizedError` | 401 | Missing/invalid JWT |
| `ForbiddenError` | 403 | Insufficient permissions |
| `NotFoundError` | 404 | Resource not found |
| `ConflictError` | 409 | Duplicate resource |
| `RateLimitError` | 429 | Too many requests |
| `BadGatewayError` | 502 | External API failure |
| `ServiceUnavailableError` | 503 | Database unavailable |

---

## Logging

### Structured Logging with Winston

**Log levels:**
- `error` — Errors that need attention
- `warn` — Potential issues
- `info` — General operational info
- `debug` — Detailed debugging info

**Log output (development):**
```
2026-05-01 12:00:00 [info]: Incoming request {
  "requestId": "abc-123-def",
  "method": "POST",
  "path": "/api/auth/login",
  "ip": "127.0.0.1",
  "userAgent": "Mozilla/5.0..."
}
```

**Log files (production):**
- `logs/error.log` — Error-level logs only
- `logs/combined.log` — All logs

Each request is assigned a unique `requestId` for distributed tracing.

---

## Database Indexes

### MongoDB — Post
```js
postSchema.index({ title: 'text', summary: 'text' }); // full-text search for RAG
postSchema.index({ tags: 1 });
postSchema.index({ verified: 1, createdAt: -1 });
postSchema.index({ tags: 1, verified: 1, createdAt: -1 });
```

### MongoDB — Quiz
```js
quizSchema.index({ tags: 1 });
quizSchema.index({ difficulty: 1 });
quizSchema.index({ category: 1 });
quizSchema.index({ isActive: 1, createdAt: -1 });
```

### MongoDB — Activity
```js
activitySchema.index({ userId: 1, createdAt: -1 });
activitySchema.index({ userId: 1, type: 1, createdAt: -1 });
```

---

## Key Patterns

### Request Flow
```
Client 
  → Security Middleware (Helmet, CORS, Rate Limit)
  → Request Logger (requestId generation)
  → Route-specific Middleware (Auth, Validation)
  → Controller
  → Service
  → Database
```

### Response Format
All responses follow a consistent structure:
```js
// Success
{
  "success": true,
  "message": "Operation completed",
  "data": { ... }
}

// Error
{
  "success": false,
  "message": "Error description",
  "errorCode": "ERROR_CODE",
  "errors": [ ... ]
}
```

### Fire-and-Forget Activity Logging
```js
// Never awaited — response goes out immediately, logging happens after
if (userId) {
  logActivity(userId, 'post_viewed', { postId, postTitle });
}
```

---

## Scripts

```bash
npm run dev    # nodemon — auto-restarts on file changes
npm start      # node server.js — production
```

---

## Dependencies

### Core
```json
{
  "express": "^5.x",
  "sequelize": "^6.x",
  "pg": "^8.x",
  "mongoose": "^9.x",
  "dotenv": "^16.x",
  "jsonwebtoken": "^9.x",
  "bcryptjs": "^3.x",
  "openai": "^4.x"
}
```

### Security & Validation
```json
{
  "helmet": "^7.x",
  "cors": "^2.x",
  "express-rate-limit": "^7.x",
  "express-validator": "^7.x",
  "express-mongo-sanitize": "^2.x"
}
```

### Logging
```json
{
  "winston": "^3.x",
  "uuid": "^9.x"
}
```

---

## Quick Test Sequence

```bash
# 1. Health check
curl http://localhost:3000/api/health

# 2. DB status check
curl http://localhost:3000/api/db-status

# 3. Signup (test password validation)
curl -X POST http://localhost:3000/api/auth/signup \
  -H "Content-Type: application/json" \
  -d '{"name":"Test User","email":"test@example.com","password":"weak"}'
# Should fail: password too weak

curl -X POST http://localhost:3000/api/auth/signup \
  -H "Content-Type: application/json" \
  -d '{"name":"Test User","email":"test@example.com","password":"StrongPass123!"}'
# Should succeed

# 4. Login
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"StrongPass123!"}'

# 5. Seed quiz questions (dev only)
curl -X POST http://localhost:3000/api/quiz/seed

# 6. Fetch questions
curl http://localhost:3000/api/quiz

# 7. Submit answers (replace ID with real _id from step 6)
curl -X POST http://localhost:3000/api/quiz/submit \
  -H "Content-Type: application/json" \
  -d '{"submissions":[{"questionId":"REPLACE_ID","selectedOption":"Article 14"}]}'

# 8. View activity (requires JWT from login)
curl -H "Authorization: Bearer YOUR_TOKEN" \
  http://localhost:3000/api/activity/USER_ID

# 9. Activity summary (requires JWT)
curl -H "Authorization: Bearer YOUR_TOKEN" \
  http://localhost:3000/api/activity/USER_ID/summary

# 10. AI Chat
curl -X POST http://localhost:3000/api/chat \
  -H "Content-Type: application/json" \
  -d '{"question":"What is the difference between civil and criminal law?"}'

# 11. Test 404 handler
curl http://localhost:3000/api/nonexistent
# Should return: {"success":false,"message":"Route /api/nonexistent not found",...}

# 12. Test rate limiting (run 6+ times quickly)
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"wrong"}'
# Should return 429 after 5 attempts
```

---

## Graceful Shutdown

The server handles SIGTERM and SIGINT signals for graceful shutdown:

1. Stops accepting new connections
2. Closes existing HTTP connections
3. Closes PostgreSQL connection pool
4. Closes MongoDB connection
5. Exits cleanly

This ensures no data loss during deployments or restarts.

---

## License

ISC
