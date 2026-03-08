# KrishiMitra-AI Build Plan — Mock → Production AWS

## Phase 1 — Real Auth (AWS SNS OTP + Secrets Manager JWT) ✅
- [x] Add `@aws-sdk/client-sns` to backend package.json
- [x] `src/config/secrets.ts` — loads JWT_SECRET from Secrets Manager at startup (`AUTH_SECRET_NAME` env var)
- [x] `src/services/auth/OtpSender.ts` — `OtpSender` interface, `MockOtpSender` (dev), `SnsOtpSender` (prod), `createOtpSender()` factory
- [x] `AuthService.ts` — accepts `OtpSender` in constructor, uses `getJwtSecret()` for signing/verifying
- [x] `index.ts` — calls `loadSecrets()` before `initPool()` at startup

### New env vars needed in production
| Var | Purpose |
|---|---|
| `AUTH_SECRET_NAME` | Secrets Manager secret name containing `{ "JWT_SECRET": "..." }` |
| `SNS_ENABLED` | Set to `"true"` to use real SMS delivery |
| `SNS_SENDER_ID` | SMS sender ID shown to recipient (default: `KRISHIM`, max 11 chars) |
| `AWS_REGION` | AWS region (default: `ap-south-1`) |

---

## Phase 2 — Real AI (Bedrock LLM + Multimodal + Embeddings) ✅
- [x] `BedrockEmbeddingService.ts` (new) — Titan Embeddings v2, 1024-dim
- [x] `AIAssistant.ts` — defaults to `BedrockLLMClient` when `BEDROCK_ENABLED=true`, else `MockLLMClient`
- [x] `AIAssistant.ts` — defaults to `BedrockEmbeddingService` when `BEDROCK_ENABLED=true`, else `MockEmbeddingService`
- [x] `DiseaseClassifier.ts` — already wired to `BedrockMultimodalClient` (no change needed)

### New env vars needed in production
| Var | Purpose |
|---|---|
| `BEDROCK_ENABLED` | Set to `"true"` to use Bedrock LLM, multimodal, and embeddings |
| `BEDROCK_MODEL_ID` | Optional, default: `us.anthropic.claude-3-5-sonnet-20241022-v2:0` |
| `BEDROCK_EMBEDDING_MODEL_ID` | Optional, default: `amazon.titan-embed-text-v2:0` |

---

## Phase 3 — Real Speech (AWS Polly + Transcribe) ✅
- [x] Added `@aws-sdk/client-polly` and `@aws-sdk/client-transcribe-streaming` to package.json
- [x] `AwsCloudSpeechProvider.ts` (new) — Transcribe Streaming (STT) + Polly neural TTS
- [x] `SpeechService.ts` — defaults to `AwsCloudSpeechProvider` when `SPEECH_ENABLED=true`

### Polly voice mapping
| Language | Voice | Engine |
|---|---|---|
| hi-IN, en-IN | Kajal | Neural |
| ta-IN, te-IN, kn-IN | Raveena | Standard (no native Polly voice) |

### New env vars needed in production
| Var | Purpose |
|---|---|
| `SPEECH_ENABLED` | Set to `"true"` to use Transcribe + Polly |

---

## Phase 4 — IAM Cleanup ✅
- [x] `BedrockLLMClient.ts` — removed hardcoded `credentials` from both client constructors
- [x] `BedrockEmbeddingService.ts` — uses default credential chain only
- [x] `AwsCloudSpeechProvider.ts` — uses default credential chain only
- [x] `isBedrockConfigured()` — now checks `BEDROCK_ENABLED=true` (not env credential vars)

---

## Phase 5 — i18n Completion ✅
- [x] Added 38 new translation keys to all 6 languages (en, hi, mr, ta, te, kn)
- [x] `MarketIntelligencePage` — wired page title, tab labels, crop label, error messages
- [x] `SustainabilityPage` — wired page title, tab labels, error message
- [x] `OnboardingPage` — wired Back/Next/Get Started/Skip/step counter
- [x] `TenantAdminPage` — wired page title, tab labels
- [x] `PlatformAdminPage` — wired page title, tab labels
- [x] `AuditLogPage` — wired page title
- [x] `ContentModerationPage` — wired page title
- [x] `GroupManagementPage` — wired page title

---

## Phase 6 — DB Smoke Test ⬜
- [ ] Verify `initPool()` connects to RDS with `DB_SECRET_NAME`
- [ ] Verify migrations run end-to-end (`npm run migrate`)
- [ ] Verify RLS policies enforce tenant isolation
- [ ] (Manual) Run `npm test` in backend with real DB to confirm all repository tests pass
