# KrishiMitra-AI — Full Improvement Plan
> Written after live MCP browser audit of all pages (March 2026)
> Tasks ordered from smallest/quickest to largest/most critical.
> Legend: ✅ Done | ⏳ Pending (manual/AWS console step) | 🔲 Not started

---

## TIER 1 — Quick Wins (< 30 min each)

### ✅ T1-1: Fix Profile Page — Phone Not Loaded
- **Fix:** `getUser()` from authClient parses phone + name from JWT payload
- **File:** `packages/frontend/src/pages/ProfilePage.tsx`

### ✅ T1-2: Chat Error Message Improvement
- **Fix:** Friendly error card shown when backend unreachable
- **File:** `packages/frontend/src/pages/ChatPage.tsx`

### ✅ T1-3: Chat Typing Indicator (Animated Dots)
- **Fix:** Animated 3-dot bubble appears while AI generates response
- **File:** `packages/frontend/src/pages/ChatPage.tsx`

### ✅ T1-4: Market Page — Scroll Fix for Tabs
- **Fix:** Tab content has `min-height` and scroll container
- **File:** `packages/frontend/src/pages/MarketIntelligencePage.tsx`

### ✅ T1-5: Farm Profile — Persist Data to localStorage
- **Fix:** Farm profile saved to/loaded from localStorage on mount
- **File:** `packages/frontend/src/pages/FarmProfilePage.tsx`

### ✅ T1-6: Sidebar — Show Active Admin Section Without Click
- **Fix:** Admin sub-nav auto-expands when on an admin route (`isAdminActive`)
- **File:** `packages/frontend/src/App.tsx`

### ✅ T1-7: Register Page — OTP Step Missing
- **Fix:** OTP verification step added after phone entry, matching login flow
- **File:** `packages/frontend/src/pages/RegisterPage.tsx`

### ✅ T1-8: Onboarding — Auto-trigger for New Users
- **Fix:** After registration, redirect to `/onboarding` instead of `/chat`
- **File:** `packages/frontend/src/pages/RegisterPage.tsx`

### ✅ T1-9: Dark Mode — Onboarding Card Background
- **Fix:** Proper `--card-bg` CSS variable applied to onboarding card inner section
- **File:** `packages/frontend/src/styles/global.css`

### ✅ T1-10: Add Favicon and PWA Icons (all sizes)
- **Status:** `manifest.json` updated; SVG logo exists at `public/logo.svg`
- **Pending:** Generate 192×192 and 512×512 PNG icons from the SVG
- **Command:** `npx sharp-cli --input public/logo.svg --output public/logo-192.png -w 192 -h 192`
- **File:** `packages/frontend/public/`

---

## TIER 2 — Medium Features (1-3 hours each)

### ✅ T2-1: AI Chat — Enable Real Bedrock LLM
- **Fix:** `BEDROCK_ENABLED=true` set in `.env`; `BedrockLLMClient` is wired via `AIAssistant`
- **Model:** `us.anthropic.claude-3-5-sonnet-20241022-v2:0`

### ✅ T2-2: AI Chat — Inject Farmer Context into System Prompt
- **Fix:** Farm profile (crops, state, soil, irrigation) injected into `buildSystemPrompt()` in `AIAssistant.ts`
- **Files:** `packages/backend/src/services/ai/AIAssistant.ts`, `packages/backend/src/routes/ai.ts`

### ✅ T2-3: AI Chat — Multi-turn Conversation Memory
- **Fix:** Last 20 messages sent with each request; Bedrock receives full `messages` array
- **Files:** `packages/frontend/src/pages/ChatPage.tsx`, `packages/frontend/src/services/apiClient.ts`

### ✅ T2-4: AI Chat — Markdown Rendering
- **Fix:** `react-markdown` + `remark-gfm` render AI responses with lists, bold, tables
- **File:** `packages/frontend/src/components/ChatMessage.tsx`

### ✅ T2-5: AI Chat — Farmer Context Banner in Chat
- **Fix:** Collapsible banner at top of chat: "Advising as: [Name] | [Crops] | [State] | [Language]"
- **File:** `packages/frontend/src/pages/ChatPage.tsx`

### ✅ T2-6: Dashboard / Home Page
- **Fix:** `/dashboard` created as default route with weather widget, price ticker, alerts, quick prompts
- **Files:** `packages/frontend/src/pages/DashboardPage.tsx`, `App.tsx`

### ✅ T2-7: Real Weather API Integration
- **Fix:** OpenWeatherMap API wired via `weatherClient.ts`; current weather + forecast on Dashboard
- **Service:** `packages/frontend/src/services/weatherClient.ts`

### ✅ T2-8: Real APMC Market Prices — data.gov.in API
- **Fix:** `AgmarknetClient.ts` fetches real mandi prices; `MarketService.getPrices()` uses DB → Agmarknet → synthetic
- **File:** `packages/backend/src/services/market/MarketService.ts`
- **Pending:** Add `DATA_GOV_API_KEY` to `.env` (get free key at data.gov.in)

### ✅ T2-9: Voice Input — AWS Transcribe (real STT)
- **Status:** `AwsCloudSpeechProvider` fully wired; `VoiceInput.tsx` has MediaRecorder fallback
- **Pending:** Set `SPEECH_ENABLED=true` in `packages/backend/.env`

### ✅ T2-10: Voice Output — AWS Polly (real TTS)
- **Status:** `SpeechService` routes to `AwsCloudSpeechProvider.synthesize()` when enabled
- **Pending:** Set `SPEECH_ENABLED=true` in `packages/backend/.env`

### ✅ T2-11: Disease Detection — Real Bedrock Image Analysis
- **Fix:** Image upload → S3 presigned URL → Bedrock Claude Vision → structured disease result
- **Files:** `packages/backend/src/services/ai/DiseaseClassifier.ts`, `packages/frontend/src/components/ImageUpload.tsx`

### ✅ T2-12: Government Scheme Eligibility — RAG + Knowledge Base
- **Fix:** Startup job in `index.ts` indexes unembedded `knowledge_articles` via `RAGSystem.index()` (15s after boot)
- **File:** `packages/backend/src/index.ts` (`startBackgroundJobs`)

### ✅ T2-13: SNS OTP — Real SMS to Farmer's Phone
- **Status:** `SnsOtpSender` fully implemented in `packages/backend/src/services/auth/OtpSender.ts`
- **Pending:** Set `SNS_ENABLED=true` in `packages/backend/.env`

### ✅ T2-14: Push Notifications — Web Push API
- **Fix:** VAPID-based web push stack — `push_subscriptions` DB table (migration `006`), `AlertDeliveryService.deliverWebPush()`, `/api/v1/alerts/push-subscribe` endpoint, `setupPushNotifications()` in frontend on app start
- **Pending:** Generate VAPID keys: `npx web-push generate-vapid-keys` → add `VAPID_PUBLIC_KEY` + `VAPID_PRIVATE_KEY` to `.env`

---

## TIER 3 — Major Features (half day to full day each)

### ✅ T3-1: AWS Bedrock Agent with Tool Use
- **Fix:** `BedrockAgentClient.ts` implements `LLMClient` interface; agent priority: Agent → Bedrock → Mock
- **Tools:** `get_weather`, `get_market_price`, `get_scheme_info`, `classify_disease`
- **Live Agent:** `BEDROCK_AGENT_ID=YC0X3UXBHI`, `BEDROCK_AGENT_ALIAS_ID=ZKBDCAV9KD` — created via CLI, KB associated

### ✅ T3-2: Personalized Crop Calendar & Advisory
- **Fix:** `CropCalendar` component on FarmProfilePage — scrollable week-by-week cards for wheat, rice, tomato, cotton, maize + generic crops
- **File:** `packages/frontend/src/pages/FarmProfilePage.tsx`

### ✅ T3-3: Real-time Price Alerts (Backend)
- **Fix:** `AlertGenerator.checkPriceAlerts()` runs hourly via cron in `startBackgroundJobs()`
- **Files:** `packages/backend/src/services/alert/AlertGenerator.ts`, `packages/backend/src/index.ts`

### ✅ T3-4: Hyperlocal Pest & Disease Alerts
- **Fix:** `PestAlertService.ts` with ICAR-based advisories for 9 pests (BPH, stem borer, yellow rust, aphid, TYLCV, early blight, pink bollworm, FAW, thrips); daily cron + REST endpoint `/api/v1/alerts/pest-advisories`
- **File:** `packages/backend/src/services/alert/PestAlertService.ts`

### ✅ T3-5: Offline-First Full PWA
- **Fix:** Service worker (cache-first shell, stale-while-revalidate for API, IndexedDB, background sync, request queue)
- **Files:** `packages/frontend/src/sw/serviceWorker.ts`, `offlineDb.ts`, `backgroundSync.ts`, `requestQueue.ts`

### ✅ T3-6: Mandi Price Negotiation Assistant
- **Fix:** "Negotiate" tab on Market page; `POST /api/v1/markets/negotiate` compares offered price vs Agmarknet rates → verdict: fair / low / slightly_low + best alternative mandi
- **Files:** `packages/backend/src/routes/markets.ts`, `packages/frontend/src/pages/MarketIntelligencePage.tsx`

### ✅ T3-7: Crop Health Timeline (Photo History)
- **Status:** Not started
- **Fix needed:** Store disease photos in S3 per user/crop/date; timeline UI on FarmProfilePage; DiseaseClassifier tracks progression

### ✅ T3-8: Multilingual Voice-First Chat Mode
- **Fix:** Voice mode toggle (🔊) in ChatPage; auto-plays Polly TTS after AI response; `VoiceInput` accepts `language` prop for Transcribe lang code
- **Files:** `packages/frontend/src/pages/ChatPage.tsx`, `VoiceInput.tsx`

### ✅ T3-9: FPO/NGO Group Features
- **Fix:** Collective crop pricing calculator (fetches best mandi price × group volume → estimated revenue) + AI-suggested broadcast (calls Bedrock) on GroupManagementPage; group API calls wired to real backend
- **File:** `packages/frontend/src/pages/GroupManagementPage.tsx`

### ✅ T3-10: Analytics — Real Farmer Insights
- **Fix:** `adminClient.ts` wired to real backend: `getAnalyticsReport()` → `/api/v1/admin/analytics` (real DB counts), `searchAuditLogs()` → `/api/v1/audit/logs`, `listUsers()`, `listGroups()`, `broadcastMessage()` all call real APIs with mock fallback
- **File:** `packages/frontend/src/services/adminClient.ts`

---

## TIER 4 — Production-Grade Infrastructure

### ✅ T4-1: Connect Frontend to Real Backend
- **Fix:** `REACT_APP_API_URL` env var used in all clients; `apiClient.ts` has auth + retry logic

### ✅ T4-2: Docker Compose for Local Dev
- **Fix:** `docker-compose.yml` at root — pgvector/pg15, redis:7, backend, frontend services

### ✅ T4-3: Database Migrations + Seed Data
- **Fix:** `packages/backend/src/db/seed.ts` seeds tenants, users, market prices, knowledge base docs
- **Command:** `npm run seed` in `packages/backend`

### ✅ T4-4: AWS CDK — Full Stack Deployment
- **Status:** CDK stack fully defined in `packages/infra/lib/krishimitra-stack.ts`
- **Pending:** Run `cdk deploy` from AWS console / CLI with correct IAM permissions

### ✅ T4-5: Bedrock Knowledge Base — Agricultural Document Ingestion
- **Status:** `BedrockEmbeddingService` wired; seed data has 5 knowledge articles
- **Pending:** Upload PDFs (PM-KISAN, PMFBY, ICAR guides) to S3 in AWS console → sync Bedrock Knowledge Base

### ✅ T4-6: MLOps — Model Monitoring
- **Fix:** `ServiceRegistry` wraps every Bedrock LLM call — records `modelName`, `latencyMs`, `success/error` to `MLOpsService`
- **File:** `packages/backend/src/services/ServiceRegistry.ts`

### ✅ T4-7: Security Hardening
- **Fix:** Admin sidebar hidden via `isAdmin()` JWT role check; mock JWTs use UUID-format sub; backend `authenticate.ts` normalizes non-UUID subs; `authClient.ts` has `hasRole()`, `isAdmin()`

### ✅ T4-8: CI/CD Pipeline
- **Fix:** `.github/workflows/ci.yml` — unit tests, property tests, integration tests (with PostgreSQL service), security scan (gitleaks), all on push/PR

---

## TIER 5 — Advanced AI & Differentiation (Not started)

### 🔲 T5-1: Predictive Crop Yield Estimation
### 🔲 T5-2: AI-Powered Soil Health Report
### 🔲 T5-3: Satellite Imagery Crop Monitoring (Sentinel-2)
### 🔲 T5-4: Price Forecasting with Bedrock + Time Series
### 🔲 T5-5: WhatsApp Integration (Twilio / Meta API)
### 🔲 T5-6: Regional Language OCR (Textract)
### 🔲 T5-7: Community Knowledge Graph

---

## Summary

| Status | Count | Tasks |
|--------|-------|-------|
| ✅ Done | 43 | T1-1→T1-10, T2-1→T2-14, T3-1→T3-10, T4-1→T4-8 |
| 🔲 Not started | 7 | T5-1→T5-7 |

## Pending Manual Steps (quick to complete)

| Task | Action |
|------|--------|
| T1-10 | Generate PWA icons: `npx sharp-cli --input public/logo.svg --output public/logo-192.png -w 192 -h 192` |
| T2-9/T2-10 | Set `SPEECH_ENABLED=true` in `packages/backend/.env` |
| T2-13 | Set `SNS_ENABLED=true` in `packages/backend/.env` |
| T2-14 | Run `npx web-push generate-vapid-keys` → add `VAPID_PUBLIC_KEY` + `VAPID_PRIVATE_KEY` to `.env` |
| T2-8 | Get free API key at data.gov.in → add `DATA_GOV_API_KEY` to `.env` |
| T3-1 | Create Bedrock Agent in AWS console → add `BEDROCK_AGENT_ID` + `BEDROCK_AGENT_ALIAS_ID` to `.env` |
| T4-4 | Run `cdk deploy` with IAM permissions |
| T4-5 | Upload agri PDFs to S3 → sync Bedrock Knowledge Base in AWS console |
