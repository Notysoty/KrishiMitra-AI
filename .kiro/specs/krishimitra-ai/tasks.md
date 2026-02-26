# Implementation Plan: KrishiMitra-AI SaaS Platform

## Overview

This plan implements the KrishiMitra-AI multi-tenant SaaS platform for AI-powered agricultural decision support. The implementation follows an incremental approach: database and core infrastructure first, then services layer by layer, then AI/ML integration, then frontend PWA, and finally wiring everything together. Each task builds on previous tasks with no orphaned code.

## Tasks

- [x] 1. Set up project structure, shared types, and database schema
  - [x] 1.1 Initialize monorepo with backend and frontend packages
    - Create monorepo structure with `packages/backend` (Node.js/TypeScript) and `packages/frontend` (React/TypeScript PWA)
    - Configure `tsconfig.json`, `package.json`, ESLint, Prettier for both packages
    - Install core dependencies: Express, pg, redis, fast-check, jest, supertest
    - _Requirements: 33.1, 40.1_

  - [x] 1.2 Define shared TypeScript interfaces and enums
    - Create `packages/backend/src/types/` with interfaces: `BaseEntity`, `Tenant`, `User`, `Role`, `Farm`, `Crop`, `InputLog`, `YieldRecord`, `MarketPrice`, `KnowledgeArticle`, `Conversation`, `Message`, `Alert`, `AlertPreferences`, `AuditLog`, `ETLJob`, `AIResponse`, `Citation`, `DiseaseClassification`, `Recommendation`, `MarketRecommendation`, `PriceForecast`, `WaterEfficiency`, `ClimateRisk`, `ValidationError`, `SafetyRefusal`, `DataQualityWarning`
    - Define enums for `Role`, crop status, alert types, priorities
    - _Requirements: 1.1, 3.1, 4.1, 9.1, 13.3_

  - [x] 1.3 Create PostgreSQL database schema and migrations (Amazon RDS for PostgreSQL)
    - Create migration files for all tables: `tenants`, `users`, `farms`, `crops`, `input_logs`, `yield_records`, `market_prices`, `knowledge_articles`, `conversations`, `alerts`, `alert_preferences`, `audit_logs`, `etl_jobs`
    - Enable Row-Level Security (RLS) on tenant-scoped tables: `users`, `farms`, `knowledge_articles`, `conversations`
    - Create RLS policies using `current_setting('app.current_tenant')`
    - Create indexes: `idx_market_prices_crop_date`, `idx_alerts_user_status`, `idx_audit_logs_timestamp`, `idx_audit_logs_user`
    - Set up pgvector extension for RAG embeddings (MVP vector store)
    - _Requirements: 1.1, 1.2, 1.4, 25.1_

  - [x] 1.4 Set up database connection pool and tenant context middleware
    - Create database connection pool with `pg` library and connection retry logic (Amazon RDS connection pooling)
    - Implement `setTenantContext` middleware that sets `app.current_tenant` session variable per request
    - Create base repository class with tenant-aware query methods
    - Store database credentials in AWS Secrets Manager; load at startup via SDK
    - _Requirements: 1.2, 1.4, 31.5_

- [x] 2. Implement Authentication Service
  - [x] 2.1 Implement user registration and OTP-based login
    - Create `AuthService` with `register`, `login`, `verifyOtp`, `logout`, `refreshToken` methods
    - Implement phone-based OTP generation and verification (mock OTP provider for MVP)
    - Implement secure session token generation (JWT) with 24-hour expiration
    - Implement account lockout after 5 failed attempts for 15 minutes
    - Create API routes: `POST /api/v1/auth/register`, `POST /api/v1/auth/login`, `POST /api/v1/auth/verify-otp`, `POST /api/v1/auth/logout`, `GET /api/v1/auth/me`, `POST /api/v1/auth/refresh`
    - Enforce HTTPS for all auth endpoints
    - Invalidate all active session tokens on logout
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7_

  - [ ]* 2.2 Write property test for account lockout (Property 2)
    - **Property 2: Account Lockout After Failed Attempts**
    - Test that for any user, 5 consecutive invalid login attempts lock the account for 15 minutes, and further attempts during lockout are rejected
    - Use `fast-check` with arbitrary user credentials and invalid password sequences
    - **Validates: Requirements 2.3**

  - [x] 2.3 Implement Role-Based Access Control (RBAC) middleware with IAM integration
    - Create `RBACMiddleware` that verifies user roles against required permissions per endpoint
    - Support roles: Farmer, Field_Officer, Agronomist, Buyer, Tenant_Admin, Platform_Admin, ML_Ops
    - Implement union of permissions for users with multiple roles
    - Prevent privilege escalation by restricting role assignment to authorized admins
    - Log all role changes to audit log with timestamp and actor
    - Apply permission changes immediately without requiring re-login
    - Define IAM role-based access policies for service-to-service authentication; apply principle of least privilege so each backend service assumes only the IAM permissions it needs
    - Use IAM roles (not long-lived keys) for all AWS SDK calls from backend services
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7_

  - [ ]* 2.4 Write property test for role-based permission enforcement (Property 3)
    - **Property 3: Role-Based Permission Enforcement**
    - Test that for any user and action, the system verifies required role permissions and rejects unauthorized actions
    - Use `fast-check` with arbitrary user-role combinations and action types
    - **Validates: Requirements 3.2**

- [x] 3. Checkpoint - Core infrastructure and auth
  - Ensure all tests pass, ask the user if questions arise.

- [x] 4. Implement Farm Service
  - [x] 4.1 Implement farm profile CRUD operations
    - Create `FarmService` with `createFarm`, `getFarm`, `updateFarm`, `deleteFarm` methods
    - Implement location validation (coordinates within India bounds)
    - Support multiple crop entries per farm with planting/harvest dates
    - Implement farm profile data encryption at rest
    - Prompt for required fields when profile is incomplete
    - Anonymize historical data on profile deletion while preserving aggregate analytics
    - Create API routes: `POST /api/v1/farms`, `GET /api/v1/farms/:id`, `PUT /api/v1/farms/:id`, `DELETE /api/v1/farms/:id`
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6_

  - [x] 4.2 Implement crop tracking and input/yield logging
    - Create `CropService` with CRUD for crops, input logs, and yield records
    - Create API routes: `POST /api/v1/farms/:id/crops`, `POST /api/v1/farms/:id/inputs`, `POST /api/v1/farms/:id/yields`
    - Validate input types (water, fertilizer, pesticide, labor) and units
    - _Requirements: 4.3, 14.1, 14.2_

  - [ ]* 4.3 Write property test for tenant data isolation (Property 1)
    - **Property 1: Tenant Data Isolation**
    - Test that for any two different tenants, users from one tenant cannot access data belonging to the other tenant
    - Use `fast-check` with arbitrary tenant/user/farm combinations
    - **Validates: Requirements 1.2, 1.1**

  - [ ]* 4.4 Write property test for data deletion preserving anonymized analytics (Property 16)
    - **Property 16: Data Deletion Preserves Anonymized Analytics**
    - Test that after user data deletion, personal data is removed but anonymized aggregate analytics remain intact
    - **Validates: Requirements 25.3**

- [x] 5. Implement Safety Guardrails and AI Service core
  - [x] 5.1 Implement SafetyGuardrail class
    - Create `SafetyGuardrail` with `isPromptInjection`, `isProhibitedTopic`, `requiresChemicalRefusal` methods
    - Implement prompt injection detection patterns: "ignore previous instructions", "pretend you are", "roleplay as", "simulate", "act as if", "you are now"
    - Implement prohibited topics list: explosive, bomb, weapon, illegal, self-harm, suicide
    - Implement chemical keyword detection for dosage/mixing ratio requests
    - Implement toxic/abusive input detection
    - _Requirements: 5.6, 5.10, 26.1, 26.2, 26.7, 26.8, 26.9_

  - [ ]* 5.2 Write property test for chemical dosage refusal (Property 5)
    - **Property 5: Chemical Dosage Requests Are Refused**
    - Test that for any query requesting chemical pesticide dosages, mixing ratios, or application instructions, the system refuses and recommends consulting a licensed agronomist
    - Use `fast-check` with `chemicalDosageQueryArbitrary` generator
    - **Validates: Requirements 5.6, 26.2**

  - [ ]* 5.3 Write property test for prompt injection blocking (Property 6)
    - **Property 6: Prompt Injection Attempts Are Blocked**
    - Test that for any input containing prompt injection patterns, the system detects and refuses to process the instruction
    - Use `fast-check` with arbitrary prompt injection variations
    - **Validates: Requirements 5.10, 26.8**

  - [x] 5.4 Implement RAG System with pgvector
    - Create `RAGSystem` class with `retrieve` and `index` methods
    - Implement document chunking (~500 tokens with 50 token overlap)
    - Implement embedding generation via OpenAI embeddings API
    - Implement vector search with tenant_id filter using pgvector (Amazon RDS for PostgreSQL)
    - Implement re-ranking by relevance score
    - Support knowledge base content in text, PDF, and structured data formats; store uploaded documents in Amazon S3
    - Index new content within 10 minutes of upload
    - _Requirements: 17.1, 17.2, 17.3, 17.5, 17.6_

  - [x] 5.5 Implement AIAssistant class with confidence scoring and citations
    - Create `AIAssistant` with `processQuery` method integrating SafetyGuardrail and RAGSystem
    - Implement LLM client wrapper (OpenAI API with Azure fallback)
    - Build system prompt with safety rules, language context, and farm context
    - Implement confidence score calculation based on document count, relevance scores
    - Implement citation extraction from retrieved documents
    - Add uncertainty message when confidence < 70%: "I am uncertain about this answer. Please consult a local agricultural expert."
    - Refuse to answer when confidence < 50%: "I don't have enough information to answer this question reliably"
    - Add educational disclaimer to all responses
    - Implement rate limiting: max 100 AI queries per user per day
    - Log all AI interactions for quality monitoring
    - Create API routes: `POST /api/v1/ai/chat`, `GET /api/v1/ai/history`
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.7, 5.8, 5.9, 26.3, 26.4, 26.5, 26.6, 27.1, 27.2, 27.3, 27.5, 27.6_

  - [ ]* 5.6 Write property test for low confidence uncertainty message (Property 4)
    - **Property 4: Low Confidence Triggers Uncertainty Message**
    - Test that for any AI response with confidence score below 70%, the response includes an uncertainty statement recommending expert consultation
    - **Validates: Requirements 5.4**

  - [ ]* 5.7 Write property test for RAG citations (Property 14)
    - **Property 14: RAG Responses Include Citations**
    - Test that for any AI response using knowledge base documents, the response includes citations identifying which documents were used
    - **Validates: Requirements 17.4**

  - [ ]* 5.8 Write property test for missing knowledge base fallback (Property 15)
    - **Property 15: Missing Knowledge Base Content Triggers Fallback Message**
    - Test that when no relevant knowledge base content is found, the system indicates the answer is based on general knowledge
    - **Validates: Requirements 17.8**

  - [ ]* 5.9 Write property test for insufficient information admission (Property 17)
    - **Property 17: Insufficient Information Triggers Admission**
    - Test that when the AI lacks sufficient information, it responds with "I don't have enough information" rather than generating unverified content
    - **Validates: Requirements 27.1**

  - [ ]* 5.10 Write property test for numerical data citations (Property 18)
    - **Property 18: Numerical Data Requires Citations**
    - Test that any AI response containing numerical data has those numbers sourced from retrieved documents with citations
    - **Validates: Requirements 27.5**

- [x] 6. Checkpoint - AI service and safety guardrails
  - Ensure all tests pass, ask the user if questions arise.

- [x] 7. Implement Disease Classification Service
  - [x] 7.1 Implement DiseaseClassifier with image preprocessing and inference
    - Create `DiseaseClassifier` class with `classify` method
    - Implement image preprocessing: decode, resize to 224x224, normalize
    - Integrate pre-trained model (ResNet/EfficientNet) for inference
    - Calculate confidence scores from prediction probabilities
    - Return uncertainty message when confidence < 60%
    - Recommend contacting extension officer when high-risk disease detected with confidence > 80%
    - Sanitize chemical information from recommendations (replace dosages with "[consult agronomist for dosage]")
    - Validate image format (JPEG, PNG) and size (max 5MB)
    - Detect poor image quality (blur, low light) and prompt retake
    - Store images with user consent for model improvement
    - Create API routes: `POST /api/v1/disease/classify`, `GET /api/v1/disease/history`
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.7, 7.8, 7.9, 7.10_

  - [ ]* 7.2 Write property test for disease classification performance (Property 7)
    - **Property 7: Disease Classification Performance**
    - Test that for any valid crop image, classification completes within 8 seconds and returns a confidence score between 0 and 1
    - **Validates: Requirements 7.1, 7.2**

- [ ] 8. Implement Market Intelligence Service
  - [x] 8.1 Implement market price data management and historical display
    - Create `MarketService` with `getPrices`, `getHistoricalPrices` methods
    - Display historical data for minimum 6 months
    - Label data source as "Source: [Public Dataset Name]" or "Source: Synthetic Data (Demo)"
    - Include "Last Updated: [timestamp]" for all market data
    - Show volatility indicators (High/Medium/Low)
    - Support price comparison across minimum 3 markets per crop
    - Display warning when data is older than 7 days
    - Show prices in INR with appropriate formatting
    - Create API routes: `GET /api/v1/markets/prices`
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5, 9.6, 9.7, 9.8_

  - [ ]* 8.2 Write property test for market data timestamps (Property 8)
    - **Property 8: Market Data Includes Timestamps**
    - Test that for any market price data displayed, the response includes a "Last Updated" timestamp
    - **Validates: Requirements 9.3**

  - [ ] 8.3 Implement MarketIntelligence with recommendations and explainability
    - Create `MarketIntelligence` class with `getRecommendations` method
    - Implement Haversine distance calculation between farm and markets
    - Estimate transportation cost (₹5/km baseline)
    - Calculate net profit (price minus transport cost)
    - Rank markets by net profit descending
    - Generate explanations with top 3 contributing factors per recommendation
    - Warn when distance exceeds 100km about transport costs and spoilage risk
    - Indicate low confidence when market data quality is poor
    - Create API route: `GET /api/v1/markets/recommendations`
    - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.5, 10.6, 10.7_

  - [ ]* 8.4 Write property test for market recommendation explanations (Property 9)
    - **Property 9: Market Recommendations Include Explanations**
    - Test that for any market recommendation, the system provides up to 3 contributing factors explaining the recommendation
    - **Validates: Requirements 10.1**

  - [ ]* 8.5 Write property test for markets ranked by net profit (Property 10)
    - **Property 10: Markets Ranked By Net Profit**
    - Test that for any set of market recommendations, markets are ranked in descending order by estimated net profit
    - Use `fast-check` with arbitrary crop, farm location, and market price arrays
    - **Validates: Requirements 10.4**

  - [~] 8.6 Implement PriceForecaster with confidence intervals
    - Create `PriceForecaster` class with `forecast` method
    - Implement simple moving average forecast using last 6 months of data
    - Calculate volatility and map to confidence levels (High/Medium/Low)
    - Calculate confidence interval using standard deviation (1.96 * stdDev)
    - Include methodology explanation in simple terms
    - Include disclaimer about forecast limitations
    - Highlight significant price changes (>20%) with explanation
    - Update forecasts daily
    - Create API route: `GET /api/v1/markets/forecast`
    - _Requirements: 11.1, 11.2, 11.3, 11.4, 11.5, 11.6, 11.7_

  - [ ]* 8.7 Write property test for price forecast confidence intervals (Property 11)
    - **Property 11: Price Forecasts Include Confidence Intervals**
    - Test that for any price forecast, the response includes a confidence interval range (lower and upper bounds)
    - **Validates: Requirements 11.2**

- [ ] 9. Implement Alert Service
  - [~] 9.1 Implement AlertGenerator for price and weather alerts
    - Create `AlertGenerator` class with `checkPriceAlerts` and `checkWeatherAlerts` methods
    - Trigger price alerts when crop price changes >15% in 7 days or crosses custom thresholds
    - Trigger weather alerts when severe weather forecasted within 48 hours (rainfall >100mm, temperature >40°C)
    - Send emergency weather alerts within 30 minutes of detection
    - Batch multiple alerts within 24 hours into summary notification
    - Include actionable information in all alerts
    - Suppress dismissed alerts for 48 hours
    - _Requirements: 12.1, 12.3, 12.5, 12.6, 12.7, 16.1, 16.3, 16.4_

  - [~] 9.2 Implement alert delivery (in-app, SMS) and preferences
    - Create multi-channel delivery: in-app notifications and optional SMS
    - Implement alert preferences management per user (in-app, SMS, email toggles; event type toggles)
    - Track delivery status for each channel
    - Create API routes: `GET /api/v1/alerts`, `POST /api/v1/alerts/preferences`, `PUT /api/v1/alerts/:id/acknowledge`, `GET /api/v1/alerts/history`
    - Also create price alert CRUD: `POST /api/v1/markets/alerts`, `GET /api/v1/markets/alerts`
    - _Requirements: 12.2, 12.4, 16.2, 16.5, 16.6, 16.7_

- [ ] 10. Checkpoint - Market intelligence and alerts
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 11. Implement Sustainability Service
  - [~] 11.1 Implement water efficiency tracking
    - Create `SustainabilityCalculator` class with `calculateWaterEfficiency` method
    - Calculate liters per hectare per crop cycle from input logs
    - Compare against regional benchmarks (anonymized aggregate data)
    - Return efficiency rating: "High Efficiency", "Medium Efficiency", or "Low Efficiency"
    - Generate explanation: "Your water usage is [X] liters/hectare, which is [above/below/similar to] the typical range of [Y-Z] liters/hectare for [crop]"
    - Include confidence indicator based on data completeness
    - Provide water conservation tips when usage exceeds recommended levels by 30%
    - Create API route: `GET /api/v1/sustainability/water-efficiency/:farmId`
    - _Requirements: 13.1, 13.2, 13.3, 13.4, 13.5, 13.6, 13.7, 13.8_

  - [ ]* 11.2 Write property test for water efficiency rating validity (Property 12)
    - **Property 12: Water Efficiency Rating Validity**
    - Test that for any water efficiency calculation, the rating is exactly one of: "High Efficiency", "Medium Efficiency", or "Low Efficiency"
    - **Validates: Requirements 13.3**

  - [ ]* 11.3 Write property test for efficiency calculation explanations (Property 13)
    - **Property 13: Efficiency Calculations Include Explanations**
    - Test that for any sustainability metric calculation, the response includes an explanation describing the logic and benchmark comparison
    - **Validates: Requirements 13.4**

  - [~] 11.4 Implement input cost/yield tracking and climate risk index
    - Implement `calculateInputEfficiency` method: cost per unit of yield, comparison to benchmarks, savings estimates
    - Implement `calculateClimateRiskIndex` method: assess risks from weather forecast (heavy rainfall, heat stress, drought)
    - Calculate overall risk level (Low/Medium/High) with contributing factors
    - Generate actionable recommendations per risk type
    - Integrate with weather API (or synthetic data for MVP)
    - Update climate risk daily
    - Include "Last Updated" timestamp and handle unavailable weather data gracefully
    - Create API routes: `GET /api/v1/sustainability/input-efficiency/:farmId`, `GET /api/v1/sustainability/climate-risk/:farmId`, `GET /api/v1/sustainability/insights/:farmId`
    - _Requirements: 14.1, 14.2, 14.3, 14.4, 14.5, 14.6, 14.7, 14.8, 15.1, 15.2, 15.3, 15.4, 15.5, 15.6, 15.7, 15.8_

- [ ] 12. Implement Admin Services
  - [~] 12.1 Implement Tenant Administration service
    - Create `TenantAdminService` with tenant branding configuration (logo, colors, org name)
    - Implement user management: add, remove, role assignment
    - Support regional preferences, supported crops/markets/languages configuration
    - Implement content approval workflow for knowledge base
    - Provide usage analytics: active users, AI interactions, feature adoption
    - Support bulk user import via CSV (max 1,000 users for MVP)
    - Configure notification preference defaults for new users
    - Maintain audit log of all administrative actions
    - _Requirements: 21.1, 21.2, 21.3, 21.4, 21.5, 21.6, 21.7, 21.8, 21.9_

  - [~] 12.2 Implement Platform Administration service
    - Create `PlatformAdminService` with tenant provisioning (create, suspend, delete)
    - Implement dashboard: all tenants with status, user counts, resource usage
    - Support global AI model/provider/safety policy configuration
    - Provide aggregated cross-tenant analytics
    - Support data export generation within 72 hours
    - Implement feature flags per tenant
    - Support maintenance scheduling with 24-hour advance notifications
    - _Requirements: 22.1, 22.2, 22.3, 22.4, 22.5, 22.6, 22.7, 22.8, 22.9_

  - [ ]* 12.3 Write property test for tenant deletion cleanup (Property 24)
    - **Property 24: Tenant Deletion Cleanup**
    - Test that for any tenant deletion, all associated data is removed while audit logs are preserved for compliance
    - **Validates: Requirements 1.3**

  - [~] 12.4 Implement Content Moderation and Field Officer Group Management
    - Create content moderation workflow: queue AI-generated content for agronomist review, approval/rejection with logging, version control, outdated content flagging (>12 months), automated content filtering
    - Create `GroupService` for Field Officer group management: create groups, add farmers by phone, broadcast messages with delivery tracking, view tracking, group analytics, export group data
    - Support groups of up to 100 farmers for MVP
    - _Requirements: 23.1, 23.2, 23.3, 23.4, 23.5, 23.6, 23.7, 23.8, 24.1, 24.2, 24.3, 24.4, 24.5, 24.6, 24.7_

- [ ] 13. Implement Audit, Observability, and Error Handling
  - [~] 13.1 Implement Audit Trail service
    - Create `AuditService` with immutable audit log recording
    - Log all admin actions with timestamp, actor, action type, affected resources
    - Record sensitive data access events
    - Implement audit log search/filtering by date, user, action type, resource
    - Support audit log export in CSV format
    - Flag suspicious activity (multiple failed logins, unusual data access)
    - Implement role-based access to audit logs with separate auditor role
    - Retain audit logs for minimum 3 years
    - _Requirements: 28.1, 28.2, 28.3, 28.4, 28.5, 28.6, 28.7, 28.8, 28.9_

  - [~] 13.2 Implement structured logging, distributed tracing, and monitoring (Amazon CloudWatch + AWS X-Ray)
    - Implement structured JSON logging across all services; ship logs to Amazon CloudWatch Logs
    - Set up distributed tracing for cross-service request flows using AWS X-Ray
    - Track KPIs: response time, error rate, availability via CloudWatch metrics and dashboards
    - Alert when error rates exceed 1% over 5 minutes (CloudWatch Alarms)
    - Log AI model invocations: model name, version, latency, token usage
    - Implement AI provider cost tracking with budget alerts
    - Monitor database query performance, alert when queries exceed 2 seconds
    - Retain logs for minimum 30 days
    - _Requirements: 29.1, 29.2, 29.3, 29.4, 29.5, 29.6, 29.7, 29.8, 29.9, 29.10_

  - [~] 13.3 Implement error handling, circuit breakers, and retry strategies
    - Create `CircuitBreaker` class with closed/open/half-open states and configurable failure thresholds
    - Implement `retryWithBackoff` utility with exponential backoff (configurable max retries and base delay)
    - Implement graceful degradation: cached fallback for AI, market, weather service failures
    - Return user-friendly error messages without technical details
    - Implement `ValidationError` responses with field-level details
    - Implement connection pool retry for database failures
    - Support resumable file uploads from last successful chunk
    - Implement health checks for all critical services
    - _Requirements: 31.1, 31.2, 31.3, 31.4, 31.5, 31.6, 31.7, 31.8, 31.9, 31.10_

  - [ ]* 13.4 Write property test for cached fallback on service failure (Property 19)
    - **Property 19: Service Failures Trigger Cached Fallback**
    - Test that for any external service failure, the system falls back to cached data with a staleness indicator
    - **Validates: Requirements 31.1**

  - [ ]* 13.5 Write property test for error messages hiding technical details (Property 20)
    - **Property 20: Error Messages Hide Technical Details**
    - Test that for any error response shown to users, the message is user-friendly and does not expose stack traces or internal system information
    - **Validates: Requirements 31.4**

- [ ] 14. Checkpoint - Backend services complete
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 15. Implement ML Operations and Data Pipelines
  - [~] 15.1 Implement ML model monitoring and versioning
    - Create `MLOpsService` to track inference latency, throughput, error rates per model
    - Monitor confidence score distributions to detect model degradation
    - Alert ML_Ops when accuracy drops below 75% on benchmarks
    - Track AI provider costs and usage by model and tenant
    - Implement model versioning with rollback capability
    - Support A/B testing for gradual model rollout
    - Generate daily performance metrics and weekly reports
    - _Requirements: 30.1, 30.2, 30.3, 30.4, 30.5, 30.6, 30.7, 30.8, 30.9, 30.10_

  - [~] 15.2 Implement ETL pipelines for market prices and weather data
    - Create `ETLService` with configurable pipeline execution for market prices, weather, and scheme data
    - Implement data validation against schemas before loading
    - Handle data quality issues: skip corrupted records, alert ML_Ops
    - Use cached data when external APIs are unavailable, mark as stale
    - Track pipeline execution history with success/failure rates
    - Implement data versioning for rollback of bad data loads
    - Label all data with source and timestamp
    - Support configuration-driven pipeline creation for new data sources
    - _Requirements: 32.1, 32.2, 32.3, 32.4, 32.5, 32.6, 32.7, 32.8, 32.9, 32.10_

- [ ] 16. Implement Voice and Speech Services
  - [~] 16.1 Implement speech-to-text and text-to-speech integration
    - Create `SpeechService` with `speechToText` and `textToSpeech` methods via cloud APIs
    - Support voice input in all 5 MVP languages (Hindi, Tamil, Telugu, Kannada, English)
    - Target minimum 80% accuracy for supported languages
    - Compress audio data for low-bandwidth conditions
    - Provide fallback to text input after 2 failed speech-to-text attempts
    - Support voice commands for common actions: "check prices", "weather forecast", "my alerts"
    - Prompt user to speak in quieter environment when background noise degrades quality
    - Create API routes: `POST /api/v1/ai/speech-to-text`, `POST /api/v1/ai/text-to-speech`
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7_

- [ ] 17. Implement Agentic Workflows and Scheme Eligibility
  - [~] 17.1 Implement basic agentic workflows
    - Create `WorkflowService` with support for "Plan my season" and "Check scheme eligibility" workflows
    - "Plan my season": generate step-by-step plan considering crop selection, planting dates, harvest timing from Farm_Profile
    - "Check scheme eligibility": evaluate applicable government schemes based on Farm_Profile data
    - Allow saving workflow results for future reference
    - Fetch external data with citations when needed
    - Indicate clearly when workflow steps cannot be completed due to missing data
    - Create API route: `POST /api/v1/ai/workflow/:type`
    - _Requirements: 18.1, 18.2, 18.3, 18.4, 18.5_

  - [~] 17.2 Implement Government Scheme information service
    - Create `SchemeService` with eligibility evaluation based on Farm_Profile
    - Return eligibility status: Eligible/Not Eligible/Insufficient Data
    - Provide step-by-step application guidance for eligible schemes
    - Label data source (Public_Dataset vs Synthetic_Dataset)
    - Include citations linking to official government sources
    - Explain ineligibility reasons clearly
    - Display "Last Updated" timestamp, warn when info >30 days old
    - _Requirements: 36.1, 36.2, 36.3, 36.4, 36.5, 36.6, 36.7, 36.8_

- [ ] 18. Checkpoint - All backend services complete
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 19. Implement Frontend PWA - Core Shell and Auth
  - [~] 19.1 Set up React PWA with service worker and offline support
    - Initialize React app with TypeScript, configure PWA manifest and service worker
    - Set up IndexedDB for local data caching (prices, advisories, weather)
    - Implement offline detection and connection status indicator (Online/Offline/Slow)
    - Implement request queuing for offline actions (max 50 queued actions with warning)
    - Implement automatic background sync when connectivity returns
    - Configure Amazon CloudFront CDN for static assets
    - Optimize for low-end mobile devices: lightweight UI variant with reduced graphics/animations
    - _Requirements: 34.1, 34.2, 34.3, 34.4, 34.5, 34.7, 34.8, 34.9, 35.1, 35.5_

  - [ ]* 19.2 Write property test for offline cached data access (Property 22)
    - **Property 22: Offline Access to Cached Data**
    - Test that in offline mode, the system allows read access to previously cached prices, advisories, and weather data
    - **Validates: Requirements 34.3**

  - [ ]* 19.3 Write property test for automatic sync after reconnection (Property 23)
    - **Property 23: Automatic Sync After Reconnection**
    - Test that queued requests created while offline are automatically synced when connectivity is restored
    - **Validates: Requirements 34.5**

  - [~] 19.4 Implement authentication UI and i18n framework
    - Build login/registration screens with phone OTP flow
    - Implement i18n framework supporting 5 languages: Hindi, Tamil, Telugu, Kannada, English
    - Create language selector component
    - Implement session management on client side (token storage, refresh, expiry handling)
    - Support biometric authentication where available
    - _Requirements: 2.1, 4.7, 5.2, 35.10_

- [ ] 20. Implement Frontend PWA - Feature Screens
  - [~] 20.1 Implement Farm Profile and Onboarding UI
    - Build interactive onboarding tutorial covering key features (Farm_Profile, AI_Assistant, Market_Intelligence)
    - Build Farm Profile creation/edit forms with tooltips and examples
    - Implement GPS-based location capture
    - Implement crop management UI (add/edit/remove crops with dates)
    - Provide contextual help for new features
    - Show positive reinforcement on milestone completion
    - Offer additional guidance after 3+ failed attempts
    - _Requirements: 4.1, 4.2, 4.3, 8.1, 8.2, 8.3, 8.5, 8.7, 35.3, 35.7_

  - [~] 20.2 Implement AI Chat and Voice interaction UI
    - Build conversational chat interface with message history
    - Display confidence scores, citations, and disclaimers in responses
    - Implement voice input button with speech-to-text integration
    - Implement audio playback for text-to-speech responses
    - Support voice commands for common actions
    - Display safety refusal messages clearly
    - Implement image upload for disease classification with camera integration
    - Show classification results with confidence, recommendations, and alternative diagnoses
    - _Requirements: 5.1, 5.3, 5.4, 6.1, 6.2, 6.5, 6.6, 7.1, 7.3, 7.4, 7.8, 7.9_

  - [~] 20.3 Implement Market Intelligence UI
    - Build market price display with historical charts (6 months)
    - Show data source labels, "Last Updated" timestamps, volatility indicators
    - Display stale data warnings (>7 days old)
    - Build market recommendations view with explanations, top factors, net profit
    - Build price forecast display with confidence intervals and methodology
    - Build price alert configuration UI (custom thresholds, crop/market selection)
    - Display alert notifications with actionable information
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5, 9.6, 9.7, 10.1, 10.3, 10.4, 10.5, 11.1, 11.2, 11.3, 11.5, 12.2, 12.4_

  - [~] 20.4 Implement Sustainability Dashboard UI
    - Build water efficiency display with visual charts and efficiency rating
    - Build input cost/yield tracking UI with trend charts over crop cycles
    - Build climate risk index display with contributing factors and recommendations
    - Show 7-day weather forecast with temperature, rainfall probability, wind speed
    - Display weather alerts with actionable advice
    - Show "Last Updated" timestamps and handle unavailable data gracefully
    - _Requirements: 13.3, 13.4, 13.7, 14.3, 14.4, 14.7, 15.1, 15.2, 15.6, 15.7, 15.8, 16.4_

  - [~] 20.5 Implement Admin Dashboard UI
    - Build Tenant Admin dashboard: branding config, user management, regional preferences, content approval, usage analytics, bulk CSV import
    - Build Platform Admin dashboard: tenant management, global config, cross-tenant analytics, feature flags, maintenance scheduling
    - Build content moderation review interface: content, sources, confidence scores, approve/reject
    - Build Field Officer group management UI: create groups, broadcast messages, view tracking, group analytics
    - Build audit log viewer with search/filtering
    - Build analytics and reporting UI with PDF/CSV export
    - _Requirements: 21.1, 21.2, 21.6, 21.7, 22.1, 22.2, 22.4, 22.8, 23.2, 24.1, 24.2, 24.4, 28.5, 37.1, 37.2, 37.3_

- [ ] 21. Implement Localization, Data Privacy, and Security Hardening
  - [~] 21.1 Implement localization and cultural adaptation
    - Implement region-specific crop calendars based on local climate
    - Support Indian measurement units (acres, quintals, liters)
    - Use DD/MM/YYYY date format
    - Format currency as INR (₹1,234.56)
    - Use culturally appropriate agricultural terminology in translations
    - Allow Tenant_Admins to configure regional preferences
    - _Requirements: 38.1, 38.2, 38.3, 38.4, 38.5, 38.6, 38.7, 38.8_

  - [~] 21.2 Implement data privacy and security measures with IAM least-privilege
    - Implement AES-256 encryption at rest for all data (RDS encryption, S3 server-side encryption)
    - Enforce TLS 1.3+ for all data in transit
    - Implement data deletion within 30 days with anonymized analytics preservation
    - Implement data minimization (collect only necessary data)
    - Implement data masking in logs and monitoring
    - Support complete data export in JSON format
    - Implement data retention policies (auto-delete >3 years)
    - Support periodic security audits and vulnerability assessments
    - Define per-service IAM policies following the principle of least privilege (e.g., AI service gets read-only S3 access to knowledge-base bucket, ETL service gets write access to data buckets only)
    - Use IAM roles for ECS/EKS task execution; no hard-coded AWS credentials
    - Store all application secrets (DB passwords, API keys, OTP provider tokens) in AWS Secrets Manager with automatic rotation
    - _Requirements: 25.1, 25.2, 25.3, 25.4, 25.5, 25.6, 25.7, 25.8, 25.9, 25.10_

- [ ] 22. Implement Performance, Caching, and Rate Limiting
  - [~] 22.1 Implement caching layer and rate limiting (Amazon ElastiCache, AWS API Gateway, Amazon CloudFront)
    - Set up Amazon ElastiCache (Redis) caching: 1-hour TTL for market data, 24-hour TTL for knowledge base
    - Implement per-user rate limiting (100 AI requests/day) and per-tenant rate limiting (configurable)
    - Implement AWS API Gateway with routing, auth, and load balancing
    - Implement Amazon CloudFront CDN configuration for static assets and frontend PWA bundles
    - Log slow database queries (>2 seconds) for optimization
    - _Requirements: 33.1, 33.5, 33.6, 33.8, 33.9_

  - [ ]* 22.2 Write property test for AI response time performance (Property 21)
    - **Property 21: AI Response Time Performance**
    - Test that for AI text queries under normal load, response time is under 5 seconds for at least 90% of requests
    - **Validates: Requirements 33.3**

- [ ] 23. Implement Backup, Recovery, and Testing Infrastructure
  - [~] 23.1 Implement backup and disaster recovery (Multi-AZ, cross-region)
    - Set up automated database backups at regular intervals using Amazon RDS automated backups
    - Configure RDS Multi-AZ deployment for high availability and automatic failover
    - Enable Amazon S3 versioning on all storage buckets (knowledge base, uploads, backups)
    - Implement cross-region backup replication: replicate RDS snapshots and S3 objects to a secondary AWS region
    - Verify backup integrity and store in geographically distributed locations
    - Maintain 30-day backup retention
    - Implement restoration procedures targeting 8-hour RTO and 12-hour RPO
    - Support automatic failover to redundant infrastructure (Multi-AZ RDS failover, ECS service auto-recovery)
    - Validate data consistency after restoration
    - _Requirements: 39.1, 39.2, 39.3, 39.4, 39.5, 39.6, 39.7, 39.8_

  - [~] 23.2 Set up CI/CD pipeline and testing infrastructure (AWS CodePipeline / GitHub Actions)
    - Configure CI/CD pipeline using AWS CodePipeline or GitHub Actions: unit tests on every commit, property tests on every PR, integration tests before deployment
    - Set up security scans (weekly schedule)
    - Create synthetic test datasets for all services (farm profiles, market prices, weather, images, multilingual queries)
    - Ensure minimum 70% code coverage, 100% for safety-critical components
    - Configure test execution time targets: unit <5min, property <15min, integration <30min
    - _Requirements: 40.1, 40.2, 40.3, 40.5, 40.6_

  - [~] 23.3 Define Infrastructure as Code (Terraform / AWS CDK)
    - Create IaC project (Terraform or AWS CDK in TypeScript) under `packages/infra/`
    - Define Amazon RDS for PostgreSQL (Multi-AZ, pgvector extension, parameter groups, security groups)
    - Define Amazon ElastiCache (Redis) cluster with encryption at rest and in transit
    - Define Amazon S3 buckets (knowledge base, uploads, backups) with versioning, lifecycle policies, and cross-region replication
    - Define Amazon CloudFront distribution for frontend PWA and static assets
    - Define AWS API Gateway with routes, throttling, and WAF integration
    - Define Amazon ECS (or EKS) cluster, task definitions, and services for backend microservices
    - Define IAM roles and policies for each service following least-privilege principle
    - Define AWS Secrets Manager entries for database credentials, API keys, and OTP provider tokens
    - Define Amazon CloudWatch log groups, metric alarms, and dashboards
    - Define AWS X-Ray tracing configuration
    - Define VPC, subnets (public/private), NAT gateways, and security groups
    - Output key resource ARNs and endpoints for use by application configuration
    - _Requirements: 33.1, 39.1, 39.5, 25.1, 40.1_

- [ ] 24. Integration wiring and end-to-end flows
  - [~] 24.1 Wire all backend services together through AWS API Gateway
    - Connect all microservices through AWS API Gateway with proper routing
    - Deploy backend services on Amazon ECS (or EKS) with container orchestration
    - Wire AI Assistant tool-calling to market data, weather, and scheme eligibility services
    - Wire alert generator to market and weather data pipelines
    - Wire sustainability calculator to farm input logs and weather APIs
    - Wire content moderation to knowledge base and RAG system
    - Wire ML monitoring to all AI service invocations
    - Ensure all cross-service calls use circuit breakers and retry strategies
    - _Requirements: 5.7, 31.6_

  - [~] 24.2 Wire frontend to backend APIs
    - Connect all frontend screens to their corresponding backend API endpoints
    - Implement API client with authentication token injection, error handling, and retry logic
    - Wire offline queue to sync service
    - Wire push notifications to alert service
    - Wire image upload to disease classification and compression pipeline
    - Wire voice input/output to speech services
    - _Requirements: 34.4, 34.5, 35.6_

  - [ ]* 24.3 Write integration tests for critical user workflows
    - Test farmer onboarding → profile creation → first AI query flow
    - Test image upload → disease classification → recommendations flow
    - Test market price query → recommendations → alert creation flow
    - Test offline mode → queue actions → reconnect → sync flow
    - Test admin creates tenant → adds users → configures settings flow
    - _Requirements: 40.3_

- [ ] 25. Final checkpoint - Full system integration
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation at key milestones
- Property tests validate universal correctness properties from the design document (24 properties total, 20 covered as test tasks)
- Properties 19-21 and 22-23 are covered by integration/performance tests rather than standalone property tests
- The implementation uses TypeScript throughout (Node.js backend, React frontend) as specified in the design
- Phase 2 features (video understanding, video generation, advanced agentic workflows) are excluded from this plan
- AWS service mappings: PostgreSQL → Amazon RDS, Redis → Amazon ElastiCache, Object Storage → Amazon S3, CDN → Amazon CloudFront, API Gateway → AWS API Gateway, Containers → Amazon ECS/EKS, Monitoring → Amazon CloudWatch + AWS X-Ray, CI/CD → AWS CodePipeline / GitHub Actions, Secrets → AWS Secrets Manager
- IAM least-privilege policies and service-to-service IAM roles are enforced across all backend services (see tasks 2.3, 21.2, 23.3)
- Infrastructure as Code (task 23.3) codifies all AWS resources for reproducible, production-ready deployments
