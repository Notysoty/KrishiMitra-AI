# Design Document: KrishiMitra-AI SaaS Platform

## Overview

KrishiMitra-AI is a multi-tenant SaaS platform that provides AI-powered agricultural decision support for smallholder farmers in rural India. The system architecture prioritizes safety, scalability, low-bandwidth operation, and responsible AI practices.

### Design Principles

1. **Safety First**: All AI outputs include confidence scores, citations, and safety guardrails to prevent harmful recommendations
2. **Offline-First**: Progressive Web App architecture with local caching for degraded network conditions
3. **Multi-Tenancy**: Complete data isolation between organizations with shared infrastructure
4. **Explainability**: All recommendations include reasoning and contributing factors
5. **Scalability**: Horizontal scaling architecture supporting growth from MVP (1,000 users) to production (10,000+ users)
6. **Responsible AI**: Hallucination mitigation, prompt injection protection, and uncertainty acknowledgment

### Technology Stack

**Frontend**:
- Progressive Web App (PWA) using React with TypeScript
- Offline support via Service Workers and IndexedDB
- Responsive UI optimized for low-end mobile devices
- i18n support for 5 Indian languages (MVP)

**Backend**:
- Microservices architecture using Node.js/TypeScript
- API Gateway for routing and rate limiting
- PostgreSQL for relational data with row-level security for multi-tenancy
- Redis for caching and session management
- Message queue (RabbitMQ) for async processing

**AI/ML**:
- LLM integration via OpenAI API or Azure OpenAI (with fallback)
- Vector database for RAG system (production-scale options: Pinecone, Weaviate; MVP: PostgreSQL with pgvector extension)
- Image classification using pre-trained models (ResNet, EfficientNet)
- Speech-to-text and text-to-speech via cloud APIs

**Infrastructure**:
- Cloud deployment (AWS or Azure)
- CDN for static assets
- Object storage (S3) for images and documents
- Container orchestration (production-scale deployment option: Kubernetes)


## Architecture

**MVP vs Production Infrastructure Note**: The architecture described below is designed for scalability from MVP to production. For MVP deployment (1-5 tenants, 1,000 users), simpler infrastructure options are appropriate (e.g., single-region deployment, PostgreSQL with pgvector for RAG, managed container services). Production-scale features like multi-region deployment, Kubernetes orchestration, and dedicated vector databases are noted as "production-scale deployment options" and can be adopted as the system grows.

### High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         Client Layer                             │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │
│  │   PWA Web    │  │   Mobile     │  │   SMS/       │          │
│  │   Client     │  │   Browser    │  │   WhatsApp   │          │
│  └──────────────┘  └──────────────┘  └──────────────┘          │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                         CDN Layer                                │
│              (Static Assets, Images, Cached Content)             │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                      API Gateway Layer                           │
│  ┌────────────────────────────────────────────────────────┐     │
│  │  Rate Limiting │ Auth │ Routing │ Load Balancing      │     │
│  └────────────────────────────────────────────────────────┘     │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Application Services Layer                    │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐       │
│  │  Auth    │  │  Farm    │  │  Market  │  │  AI      │       │
│  │  Service │  │  Service │  │  Service │  │  Service │       │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘       │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐       │
│  │  Alert   │  │  Content │  │  Admin   │  │  Analytics│      │
│  │  Service │  │  Service │  │  Service │  │  Service  │      │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘       │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                      Data & AI Layer                             │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐       │
│  │PostgreSQL│  │  Redis   │  │  Vector  │  │  Object  │       │
│  │  (Multi- │  │  Cache   │  │  DB      │  │  Storage │       │
│  │  Tenant) │  │          │  │  (RAG)   │  │  (S3)    │       │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘       │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    External Services Layer                       │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐       │
│  │  LLM     │  │  Vision  │  │  Speech  │  │  Weather │       │
│  │  API     │  │  API     │  │  API     │  │  API     │       │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘       │
│  ┌──────────┐  ┌──────────┐                                     │
│  │  SMS     │  │  Email   │                                     │
│  │  Gateway │  │  Service │                                     │
│  └──────────┘  └──────────┘                                     │
└─────────────────────────────────────────────────────────────────┘
```

### Multi-Tenancy Architecture

**Tenant Isolation Strategy**: Shared database with row-level security (RLS)

```typescript
// Database schema with tenant_id in all tables
interface BaseEntity {
  id: string;
  tenant_id: string;  // Foreign key to tenants table
  created_at: Date;
  updated_at: Date;
}

// PostgreSQL Row-Level Security Policy
CREATE POLICY tenant_isolation ON farms
  USING (tenant_id = current_setting('app.current_tenant')::uuid);

// Middleware sets tenant context for each request
function setTenantContext(req: Request, res: Response, next: NextFunction) {
  const tenantId = req.user.tenant_id;
  await db.query('SET app.current_tenant = $1', [tenantId]);
  next();
}
```

**Tenant Resource Limits**:
- User count per tenant (configurable, default 1,000 for MVP)
- Storage quota per tenant (configurable, default 10GB)
- API rate limits per tenant (configurable, default 10,000 requests/day)


## Components and Interfaces

### 1. Authentication Service

**Responsibilities**:
- User registration and login (phone OTP, email)
- Session management
- Role-based access control (RBAC)
- Token generation and validation

**API Endpoints**:
```typescript
POST   /api/v1/auth/register          // Register new user
POST   /api/v1/auth/login             // Login with phone/email
POST   /api/v1/auth/verify-otp        // Verify OTP
POST   /api/v1/auth/logout            // Logout
GET    /api/v1/auth/me                // Get current user
POST   /api/v1/auth/refresh           // Refresh token
```

**Data Models**:
```typescript
interface User {
  id: string;
  tenant_id: string;
  phone: string;
  email?: string;
  name: string;
  roles: Role[];
  language_preference: string;
  created_at: Date;
  last_login: Date;
}

enum Role {
  FARMER = 'farmer',
  FIELD_OFFICER = 'field_officer',
  AGRONOMIST = 'agronomist',
  BUYER = 'buyer',
  TENANT_ADMIN = 'tenant_admin',
  PLATFORM_ADMIN = 'platform_admin',
  ML_OPS = 'ml_ops'
}

interface Session {
  id: string;
  user_id: string;
  token: string;
  expires_at: Date;
  device_info: string;
  ip_address: string;
}
```

### 2. Farm Service

**Responsibilities**:
- Farm profile management
- Crop tracking
- Input logging (water, fertilizer)
- Yield recording

**API Endpoints**:
```typescript
POST   /api/v1/farms                  // Create farm profile
GET    /api/v1/farms/:id              // Get farm profile
PUT    /api/v1/farms/:id              // Update farm profile
DELETE /api/v1/farms/:id              // Delete farm profile
POST   /api/v1/farms/:id/crops        // Add crop
POST   /api/v1/farms/:id/inputs       // Log input usage
POST   /api/v1/farms/:id/yields       // Record yield
GET    /api/v1/farms/:id/sustainability // Get sustainability metrics
```

**Data Models**:
```typescript
interface Farm {
  id: string;
  tenant_id: string;
  user_id: string;
  name: string;
  location: {
    latitude: number;
    longitude: number;
    address: string;
    state: string;
    district: string;
  };
  total_acreage: number;
  irrigation_type: 'rainfed' | 'drip' | 'sprinkler' | 'flood';
  created_at: Date;
}

interface Crop {
  id: string;
  farm_id: string;
  crop_type: string;
  variety: string;
  acreage: number;
  planting_date: Date;
  expected_harvest_date: Date;
  actual_harvest_date?: Date;
  status: 'planned' | 'planted' | 'growing' | 'harvested';
}

interface InputLog {
  id: string;
  farm_id: string;
  crop_id: string;
  input_type: 'water' | 'fertilizer' | 'pesticide' | 'labor';
  quantity: number;
  unit: string;
  cost: number;
  date: Date;
  notes?: string;
}

interface YieldRecord {
  id: string;
  farm_id: string;
  crop_id: string;
  quantity: number;
  unit: string;
  harvest_date: Date;
  quality_grade?: string;
}
```

### 3. AI Service

**Responsibilities**:
- Conversational AI (text queries)
- RAG system integration
- Confidence scoring
- Citation generation
- Safety guardrails
- Prompt injection detection

**API Endpoints**:
```typescript
POST   /api/v1/ai/chat                // Send chat message
POST   /api/v1/ai/classify-disease    // Classify crop disease from image
POST   /api/v1/ai/speech-to-text      // Convert speech to text
POST   /api/v1/ai/text-to-speech      // Convert text to speech
POST   /api/v1/ai/workflow/:type      // Execute agentic workflow
GET    /api/v1/ai/history              // Get conversation history
```

**Core Components**:

```typescript
// AI Assistant with RAG
class AIAssistant {
  private llmClient: LLMClient;
  private ragSystem: RAGSystem;
  private safetyGuardrail: SafetyGuardrail;
  
  async processQuery(query: string, context: UserContext): Promise<AIResponse> {
    // 1. Detect prompt injection
    if (this.safetyGuardrail.isPromptInjection(query)) {
      return this.refuseResponse("I can only provide agricultural information.");
    }
    
    // 2. Retrieve relevant documents from knowledge base
    const documents = await this.ragSystem.retrieve(query, context.tenant_id);
    
    // 3. Check for prohibited topics
    if (this.safetyGuardrail.isProhibitedTopic(query)) {
      return this.refuseResponse("I cannot provide information on this topic.");
    }
    
    // 4. Generate response with LLM
    const response = await this.llmClient.generate({
      query,
      documents,
      context,
      systemPrompt: this.buildSystemPrompt(context)
    });
    
    // 5. Calculate confidence score
    const confidence = this.calculateConfidence(response, documents);
    
    // 6. Check confidence threshold
    if (confidence < 0.5) {
      return this.uncertainResponse("I don't have enough information to answer reliably.");
    }
    
    if (confidence < 0.7) {
      response.disclaimer = "I am uncertain about this answer. Please consult a local agricultural expert.";
    }
    
    // 7. Extract citations
    const citations = this.extractCitations(documents);
    
    // 8. Add safety disclaimer
    response.disclaimer = "This information is for educational purposes. Always consult local agricultural experts for your specific situation.";
    
    return {
      text: response.text,
      confidence,
      citations,
      disclaimer: response.disclaimer,
      sources: documents.map(d => d.source)
    };
  }
  
  private buildSystemPrompt(context: UserContext): string {
    return `You are an agricultural assistant for farmers in India.
    
Rules:
- NEVER provide specific chemical dosages, mixing ratios, or application instructions
- ALWAYS recommend consulting licensed agronomists for chemical treatments
- If uncertain, explicitly state uncertainty
- Provide citations for factual claims
- Use simple language appropriate for farmers
- Respond in ${context.language}
- Consider the user's farm context: ${JSON.stringify(context.farm)}

When asked about chemicals or pesticides, respond with general information only and recommend consulting experts.`;
  }
  
  private calculateConfidence(response: LLMResponse, documents: Document[]): number {
    // Confidence based on:
    // 1. Number of relevant documents found
    // 2. Semantic similarity between query and documents
    // 3. LLM's internal confidence (if available)
    // 4. Presence of specific facts vs general statements
    
    let confidence = 0.5; // Base confidence
    
    if (documents.length > 0) {
      confidence += 0.2;
    }
    
    if (documents.length >= 3) {
      confidence += 0.1;
    }
    
    // Adjust based on document relevance scores
    const avgRelevance = documents.reduce((sum, d) => sum + d.relevance_score, 0) / documents.length;
    confidence += avgRelevance * 0.2;
    
    return Math.min(confidence, 1.0);
  }
}

// Safety Guardrail
class SafetyGuardrail {
  private prohibitedTopics = [
    'explosive', 'bomb', 'weapon', 'illegal', 'self-harm', 'suicide'
  ];
  
  private chemicalKeywords = [
    'dosage', 'mixing ratio', 'application rate', 'how much', 'how to mix'
  ];
  
  isPromptInjection(query: string): boolean {
    const injectionPatterns = [
      /ignore (previous|above) instructions/i,
      /you are now/i,
      /pretend (you are|to be)/i,
      /roleplay as/i,
      /simulate/i,
      /act as if/i
    ];
    
    return injectionPatterns.some(pattern => pattern.test(query));
  }
  
  isProhibitedTopic(query: string): boolean {
    const lowerQuery = query.toLowerCase();
    return this.prohibitedTopics.some(topic => lowerQuery.includes(topic));
  }
  
  requiresChemicalRefusal(query: string): boolean {
    const lowerQuery = query.toLowerCase();
    const hasChemicalKeyword = this.chemicalKeywords.some(kw => lowerQuery.includes(kw));
    const hasPesticideKeyword = lowerQuery.includes('pesticide') || lowerQuery.includes('chemical');
    
    return hasChemicalKeyword && hasPesticideKeyword;
  }
}

// RAG System
class RAGSystem {
  private vectorDB: VectorDatabase;
  private embeddings: EmbeddingService;
  
  async retrieve(query: string, tenantId: string, topK: number = 5): Promise<Document[]> {
    // 1. Generate query embedding
    const queryEmbedding = await this.embeddings.embed(query);
    
    // 2. Search vector database with tenant filter
    const results = await this.vectorDB.search({
      vector: queryEmbedding,
      filter: { tenant_id: tenantId },
      topK
    });
    
    // 3. Re-rank results by relevance
    const reranked = this.rerank(query, results);
    
    return reranked;
  }
  
  async index(document: Document, tenantId: string): Promise<void> {
    // 1. Chunk document
    const chunks = this.chunkDocument(document);
    
    // 2. Generate embeddings for each chunk
    const embeddings = await Promise.all(
      chunks.map(chunk => this.embeddings.embed(chunk.text))
    );
    
    // 3. Store in vector database with tenant_id
    await this.vectorDB.upsert(
      chunks.map((chunk, i) => ({
        id: `${document.id}_chunk_${i}`,
        vector: embeddings[i],
        metadata: {
          tenant_id: tenantId,
          document_id: document.id,
          source: document.source,
          chunk_index: i,
          text: chunk.text
        }
      }))
    );
  }
  
  private chunkDocument(document: Document): Chunk[] {
    // Split document into chunks of ~500 tokens with 50 token overlap
    const maxChunkSize = 500;
    const overlap = 50;
    
    // Implementation details omitted for brevity
    return [];
  }
  
  private rerank(query: string, results: SearchResult[]): Document[] {
    // Re-rank based on semantic similarity and recency
    // Implementation details omitted for brevity
    return results.map(r => r.document);
  }
}

interface AIResponse {
  text: string;
  confidence: number;
  citations: Citation[];
  disclaimer?: string;
  sources: string[];
}

interface Citation {
  text: string;
  source: string;
  url?: string;
}

interface Document {
  id: string;
  tenant_id: string;
  title: string;
  content: string;
  source: string;
  language: string;
  created_at: Date;
  relevance_score?: number;
}
```


### 4. Market Service

**Responsibilities**:
- Market price data management
- Price forecasting
- Market recommendations with explainability
- Price alerts

**API Endpoints**:
```typescript
GET    /api/v1/markets/prices         // Get market prices
GET    /api/v1/markets/forecast       // Get price forecast
GET    /api/v1/markets/recommendations // Get market recommendations
POST   /api/v1/markets/alerts         // Create price alert
GET    /api/v1/markets/alerts         // Get user's alerts
```

**Core Components**:

```typescript
// Market Intelligence Engine
class MarketIntelligence {
  async getRecommendations(
    crop: string,
    farmLocation: Location,
    context: UserContext
  ): Promise<MarketRecommendation[]> {
    // 1. Get recent prices for crop across markets
    const prices = await this.getPrices(crop);
    
    // 2. Calculate distance and transportation cost
    const marketsWithCosts = prices.map(market => ({
      ...market,
      distance: this.calculateDistance(farmLocation, market.location),
      transportCost: this.estimateTransportCost(farmLocation, market.location)
    }));
    
    // 3. Calculate net profit
    const marketsWithProfit = marketsWithCosts.map(market => ({
      ...market,
      netProfit: market.price - market.transportCost
    }));
    
    // 4. Rank by net profit
    const ranked = marketsWithProfit.sort((a, b) => b.netProfit - a.netProfit);
    
    // 5. Generate explanations
    return ranked.slice(0, 5).map(market => ({
      market_name: market.name,
      price: market.price,
      distance: market.distance,
      transport_cost: market.transportCost,
      net_profit: market.netProfit,
      volatility: market.volatility,
      explanation: this.generateExplanation(market, ranked[0]),
      top_factors: this.identifyTopFactors(market)
    }));
  }
  
  private generateExplanation(market: Market, topMarket: Market): string {
    const factors = [];
    
    if (market.price === topMarket.price) {
      factors.push("Highest price");
    } else if (market.price > topMarket.price * 0.95) {
      factors.push("Competitive price");
    }
    
    if (market.distance < 50) {
      factors.push("Close distance");
    } else if (market.distance > 100) {
      factors.push("Long distance may increase costs");
    }
    
    if (market.volatility === 'low') {
      factors.push("Stable prices");
    } else if (market.volatility === 'high') {
      factors.push("Price volatility risk");
    }
    
    return factors.join(". ");
  }
  
  private identifyTopFactors(market: Market): string[] {
    const factors = [];
    
    // Price factor
    if (market.price > 100) {
      factors.push(`Higher price: ₹${market.price}/kg`);
    }
    
    // Distance factor
    if (market.distance < 50) {
      factors.push(`Lower distance: ${market.distance}km`);
    }
    
    // Volatility factor
    if (market.volatility === 'low') {
      factors.push("Stable prices");
    }
    
    // Return up to 3 factors
    return factors.slice(0, 3);
  }
  
  private calculateDistance(from: Location, to: Location): number {
    // Haversine formula for distance calculation
    const R = 6371; // Earth's radius in km
    const dLat = this.toRad(to.latitude - from.latitude);
    const dLon = this.toRad(to.longitude - from.longitude);
    
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
              Math.cos(this.toRad(from.latitude)) * Math.cos(this.toRad(to.latitude)) *
              Math.sin(dLon / 2) * Math.sin(dLon / 2);
    
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }
  
  private estimateTransportCost(from: Location, to: Location): number {
    const distance = this.calculateDistance(from, to);
    // Estimate: ₹5 per km for truck transport
    return distance * 5;
  }
  
  private toRad(degrees: number): number {
    return degrees * (Math.PI / 180);
  }
}

// Price Forecasting
class PriceForecaster {
  async forecast(crop: string, days: number = 14): Promise<PriceForecast> {
    // 1. Get historical prices (last 6 months)
    const historicalPrices = await this.getHistoricalPrices(crop, 180);
    
    // 2. Simple moving average forecast
    const forecast = this.simpleMovingAverage(historicalPrices, days);
    
    // 3. Calculate confidence based on historical volatility
    const volatility = this.calculateVolatility(historicalPrices);
    const confidence = this.volatilityToConfidence(volatility);
    
    // 4. Calculate confidence interval
    const stdDev = this.calculateStdDev(historicalPrices);
    const confidenceInterval = {
      lower: forecast - (1.96 * stdDev),
      upper: forecast + (1.96 * stdDev)
    };
    
    return {
      crop,
      forecast_price: forecast,
      confidence_level: confidence,
      confidence_interval: confidenceInterval,
      methodology: "Based on last 6 months of price patterns using moving average",
      disclaimer: "Forecasts are estimates and may not reflect actual future prices",
      last_updated: new Date()
    };
  }
  
  private simpleMovingAverage(prices: number[], days: number): number {
    const recent = prices.slice(-30); // Last 30 days
    return recent.reduce((sum, p) => sum + p, 0) / recent.length;
  }
  
  private calculateVolatility(prices: number[]): number {
    const returns = [];
    for (let i = 1; i < prices.length; i++) {
      returns.push((prices[i] - prices[i-1]) / prices[i-1]);
    }
    return this.calculateStdDev(returns);
  }
  
  private calculateStdDev(values: number[]): number {
    const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
    const squaredDiffs = values.map(v => Math.pow(v - mean, 2));
    const variance = squaredDiffs.reduce((sum, v) => sum + v, 0) / values.length;
    return Math.sqrt(variance);
  }
  
  private volatilityToConfidence(volatility: number): 'high' | 'medium' | 'low' {
    if (volatility < 0.05) return 'high';
    if (volatility < 0.15) return 'medium';
    return 'low';
  }
}

interface MarketRecommendation {
  market_name: string;
  price: number;
  distance: number;
  transport_cost: number;
  net_profit: number;
  volatility: 'low' | 'medium' | 'high';
  explanation: string;
  top_factors: string[];
}

interface PriceForecast {
  crop: string;
  forecast_price: number;
  confidence_level: 'high' | 'medium' | 'low';
  confidence_interval: {
    lower: number;
    upper: number;
  };
  methodology: string;
  disclaimer: string;
  last_updated: Date;
}

interface MarketPrice {
  id: string;
  market_name: string;
  crop: string;
  price: number;
  unit: string;
  date: Date;
  source: string;
  location: Location;
}
```

### 5. Sustainability Service

**Responsibilities**:
- Calculate water efficiency metrics
- Calculate input cost efficiency
- Generate climate risk index
- Provide efficiency insights

**API Endpoints**:
```typescript
GET    /api/v1/sustainability/water-efficiency/:farmId
GET    /api/v1/sustainability/input-efficiency/:farmId
GET    /api/v1/sustainability/climate-risk/:farmId
GET    /api/v1/sustainability/insights/:farmId
```

**Core Components**:

```typescript
// Sustainability Calculator
class SustainabilityCalculator {
  async calculateWaterEfficiency(farmId: string): Promise<WaterEfficiency> {
    // 1. Get water usage logs
    const waterLogs = await this.getInputLogs(farmId, 'water');
    
    // 2. Get crop information
    const crops = await this.getCrops(farmId);
    
    // 3. Calculate liters per hectare
    const totalWater = waterLogs.reduce((sum, log) => sum + log.quantity, 0);
    const totalAcreage = crops.reduce((sum, crop) => sum + crop.acreage, 0);
    const litersPerHectare = totalWater / (totalAcreage * 0.4047); // Convert acres to hectares
    
    // 4. Get regional benchmark
    const benchmark = await this.getRegionalBenchmark(crops[0].crop_type, 'water');
    
    // 5. Calculate efficiency rating
    const rating = this.calculateEfficiencyRating(litersPerHectare, benchmark);
    
    // 6. Generate explanation
    const explanation = this.generateWaterExplanation(litersPerHectare, benchmark, rating);
    
    return {
      liters_per_hectare: litersPerHectare,
      rating,
      explanation,
      benchmark_range: benchmark,
      confidence: waterLogs.length > 5 ? 'high' : 'medium'
    };
  }
  
  async calculateClimateRiskIndex(farmId: string): Promise<ClimateRisk> {
    // 1. Get farm location
    const farm = await this.getFarm(farmId);
    
    // 2. Get weather forecast
    const forecast = await this.getWeatherForecast(farm.location, 7);
    
    // 3. Get current crops
    const crops = await this.getCrops(farmId);
    
    // 4. Assess risks
    const risks = [];
    
    // Heavy rainfall risk
    if (forecast.some(day => day.rainfall > 100)) {
      risks.push({
        type: 'heavy_rainfall',
        severity: 'high',
        description: 'Heavy rainfall forecasted during critical growth stage'
      });
    }
    
    // Heat stress risk
    if (forecast.some(day => day.temperature > 40)) {
      risks.push({
        type: 'heat_stress',
        severity: 'high',
        description: 'High temperatures may stress crops'
      });
    }
    
    // Drought risk
    if (forecast.every(day => day.rainfall < 5)) {
      risks.push({
        type: 'drought',
        severity: 'medium',
        description: 'Low rainfall forecasted'
      });
    }
    
    // 5. Calculate overall risk level
    const riskLevel = this.calculateOverallRisk(risks);
    
    // 6. Generate recommendations
    const recommendations = this.generateRiskRecommendations(risks);
    
    return {
      risk_level: riskLevel,
      risks,
      recommendations,
      contributing_factors: risks.map(r => r.description),
      last_updated: new Date()
    };
  }
  
  private calculateEfficiencyRating(
    actual: number,
    benchmark: { min: number; max: number }
  ): 'high' | 'medium' | 'low' {
    if (actual <= benchmark.min) return 'high';
    if (actual <= benchmark.max) return 'medium';
    return 'low';
  }
  
  private generateWaterExplanation(
    actual: number,
    benchmark: { min: number; max: number },
    rating: string
  ): string {
    const comparison = actual < benchmark.min ? 'below' :
                      actual > benchmark.max ? 'above' : 'within';
    
    return `Your water usage is ${actual.toFixed(0)} liters/hectare, which is ${comparison} the typical range of ${benchmark.min}-${benchmark.max} liters/hectare.`;
  }
  
  private calculateOverallRisk(risks: Risk[]): 'low' | 'medium' | 'high' {
    if (risks.some(r => r.severity === 'high')) return 'high';
    if (risks.some(r => r.severity === 'medium')) return 'medium';
    return 'low';
  }
  
  private generateRiskRecommendations(risks: Risk[]): string[] {
    const recommendations = [];
    
    for (const risk of risks) {
      if (risk.type === 'heavy_rainfall') {
        recommendations.push("Ensure drainage channels are clear");
        recommendations.push("Consider delaying fertilizer application");
      } else if (risk.type === 'heat_stress') {
        recommendations.push("Increase irrigation frequency");
        recommendations.push("Consider shade netting for sensitive crops");
      } else if (risk.type === 'drought') {
        recommendations.push("Implement water conservation measures");
        recommendations.push("Consider drought-resistant crop varieties");
      }
    }
    
    return recommendations;
  }
}

interface WaterEfficiency {
  liters_per_hectare: number;
  rating: 'high' | 'medium' | 'low';
  explanation: string;
  benchmark_range: { min: number; max: number };
  confidence: 'high' | 'medium' | 'low';
}

interface ClimateRisk {
  risk_level: 'low' | 'medium' | 'high';
  risks: Risk[];
  recommendations: string[];
  contributing_factors: string[];
  last_updated: Date;
}

interface Risk {
  type: string;
  severity: 'low' | 'medium' | 'high';
  description: string;
}
```


### 6. Alert Service

**Responsibilities**:
- Generate alerts (price changes, weather, pest outbreaks)
- Deliver alerts via multiple channels (in-app, SMS, email)
- Manage user alert preferences
- Track alert delivery status

**API Endpoints**:
```typescript
GET    /api/v1/alerts                 // Get user's alerts
POST   /api/v1/alerts/preferences     // Update alert preferences
PUT    /api/v1/alerts/:id/acknowledge // Acknowledge alert
GET    /api/v1/alerts/history         // Get alert history
```

**Core Components**:

```typescript
// Alert Generator
class AlertGenerator {
  async checkPriceAlerts(): Promise<void> {
    // 1. Get all active price alerts
    const alerts = await this.getActivePriceAlerts();
    
    // 2. Get current prices
    const prices = await this.getCurrentPrices();
    
    // 3. Check each alert
    for (const alert of alerts) {
      const currentPrice = prices.find(p => 
        p.crop === alert.crop && p.market === alert.market
      );
      
      if (!currentPrice) continue;
      
      // Check if price crossed threshold
      if (this.shouldTrigger(alert, currentPrice)) {
        await this.triggerAlert({
          user_id: alert.user_id,
          type: 'price_change',
          title: `${alert.crop} price alert`,
          message: `${alert.crop} price is now ₹${currentPrice.price}/kg at ${alert.market}`,
          priority: 'medium',
          data: { crop: alert.crop, price: currentPrice.price }
        });
      }
    }
  }
  
  async checkWeatherAlerts(): Promise<void> {
    // 1. Get all farms
    const farms = await this.getAllFarms();
    
    // 2. For each farm, check weather forecast
    for (const farm of farms) {
      const forecast = await this.getWeatherForecast(farm.location, 2);
      
      // Check for severe weather
      for (const day of forecast) {
        if (day.rainfall > 100) {
          await this.triggerAlert({
            user_id: farm.user_id,
            type: 'weather',
            title: 'Heavy rainfall alert',
            message: `Heavy rain expected on ${day.date}. Ensure drainage channels are clear.`,
            priority: 'high',
            data: { date: day.date, rainfall: day.rainfall }
          });
        }
        
        if (day.temperature > 40) {
          await this.triggerAlert({
            user_id: farm.user_id,
            type: 'weather',
            title: 'Heat wave alert',
            message: `High temperature (${day.temperature}°C) expected on ${day.date}. Increase irrigation.`,
            priority: 'high',
            data: { date: day.date, temperature: day.temperature }
          });
        }
      }
    }
  }
  
  private shouldTrigger(alert: PriceAlert, currentPrice: MarketPrice): boolean {
    if (alert.condition === 'above' && currentPrice.price > alert.threshold) {
      return true;
    }
    if (alert.condition === 'below' && currentPrice.price < alert.threshold) {
      return true;
    }
    return false;
  }
  
  private async triggerAlert(alert: AlertPayload): Promise<void> {
    // 1. Create alert record
    const alertRecord = await this.createAlertRecord(alert);
    
    // 2. Get user preferences
    const preferences = await this.getUserPreferences(alert.user_id);
    
    // 3. Deliver via configured channels
    const deliveryPromises = [];
    
    if (preferences.in_app) {
      deliveryPromises.push(this.deliverInApp(alertRecord));
    }
    
    if (preferences.sms && alert.priority === 'high') {
      deliveryPromises.push(this.deliverSMS(alertRecord));
    }
    
    if (preferences.email) {
      deliveryPromises.push(this.deliverEmail(alertRecord));
    }
    
    // 4. Track delivery status
    await Promise.allSettled(deliveryPromises);
  }
}

interface Alert {
  id: string;
  user_id: string;
  type: 'price_change' | 'weather' | 'pest' | 'scheme';
  title: string;
  message: string;
  priority: 'low' | 'medium' | 'high';
  status: 'unread' | 'read' | 'acknowledged';
  created_at: Date;
  data: any;
}

interface AlertPreferences {
  user_id: string;
  in_app: boolean;
  sms: boolean;
  email: boolean;
  price_alerts: boolean;
  weather_alerts: boolean;
  pest_alerts: boolean;
}
```

### 7. Disease Classification Service

**Responsibilities**:
- Classify crop diseases from images
- Calculate confidence scores
- Provide treatment recommendations
- Store images for model improvement

**API Endpoints**:
```typescript
POST   /api/v1/disease/classify       // Classify disease from image
GET    /api/v1/disease/history        // Get classification history
```

**Core Components**:

```typescript
// Disease Classifier
class DiseaseClassifier {
  private model: ImageClassificationModel;
  
  async classify(image: Buffer, cropType: string): Promise<DiseaseClassification> {
    // 1. Preprocess image
    const preprocessed = await this.preprocessImage(image);
    
    // 2. Run inference
    const predictions = await this.model.predict(preprocessed);
    
    // 3. Get top prediction
    const topPrediction = predictions[0];
    
    // 4. Calculate confidence
    const confidence = topPrediction.probability;
    
    // 5. Check confidence threshold
    if (confidence < 0.6) {
      return {
        disease: 'unknown',
        confidence: confidence,
        message: "Uncertain diagnosis. Please consult a local agronomist for accurate identification.",
        recommendations: [],
        disclaimer: "For accurate diagnosis, please consult an agricultural expert."
      };
    }
    
    // 6. Get treatment recommendations
    const recommendations = await this.getRecommendations(topPrediction.disease);
    
    // 7. Add safety disclaimer for chemical treatments
    const disclaimer = "For chemical treatments, consult a licensed agronomist or agricultural extension officer for proper dosage, safety equipment, and application methods.";
    
    return {
      disease: topPrediction.disease,
      confidence: confidence,
      message: this.generateMessage(topPrediction.disease, confidence),
      recommendations: recommendations,
      disclaimer: disclaimer,
      alternative_diagnoses: predictions.slice(1, 3).map(p => ({
        disease: p.disease,
        confidence: p.probability
      }))
    };
  }
  
  private async preprocessImage(image: Buffer): Promise<Tensor> {
    // 1. Decode image
    // 2. Resize to model input size (e.g., 224x224)
    // 3. Normalize pixel values
    // 4. Convert to tensor
    // Implementation details omitted
    return null as any;
  }
  
  private async getRecommendations(disease: string): Promise<Recommendation[]> {
    // Get recommendations from knowledge base
    const recommendations = await this.knowledgeBase.getRecommendations(disease);
    
    // Filter out specific chemical dosages
    return recommendations.map(r => ({
      ...r,
      description: this.sanitizeChemicalInfo(r.description)
    }));
  }
  
  private sanitizeChemicalInfo(text: string): string {
    // Remove specific dosages, mixing ratios, etc.
    // Keep only general information
    return text.replace(/\d+\s*(ml|g|kg|l)\/acre/gi, '[consult agronomist for dosage]');
  }
  
  private generateMessage(disease: string, confidence: number): string {
    if (confidence > 0.8) {
      return `Likely diagnosis: ${disease}. Confidence: High`;
    } else if (confidence > 0.6) {
      return `Possible diagnosis: ${disease}. Confidence: Medium. Consider consulting an expert for confirmation.`;
    } else {
      return `Uncertain diagnosis. Please consult a local agronomist.`;
    }
  }
}

interface DiseaseClassification {
  disease: string;
  confidence: number;
  message: string;
  recommendations: Recommendation[];
  disclaimer: string;
  alternative_diagnoses?: Array<{
    disease: string;
    confidence: number;
  }>;
}

interface Recommendation {
  type: 'organic' | 'chemical' | 'cultural';
  title: string;
  description: string;
  priority: number;
}
```


## Data Models

### Core Entities

```typescript
// Tenant
interface Tenant {
  id: string;
  name: string;
  type: 'fpo' | 'ngo' | 'cooperative' | 'government';
  status: 'active' | 'suspended' | 'deleted';
  branding: {
    logo_url?: string;
    primary_color?: string;
    secondary_color?: string;
  };
  settings: {
    supported_languages: string[];
    supported_crops: string[];
    supported_markets: string[];
    default_region: string;
  };
  limits: {
    max_users: number;
    max_storage_gb: number;
    max_api_requests_per_day: number;
  };
  created_at: Date;
  updated_at: Date;
}

// User (already defined above)

// Farm (already defined above)

// Crop (already defined above)

// Knowledge Base Article
interface KnowledgeArticle {
  id: string;
  tenant_id: string;
  title: string;
  content: string;
  language: string;
  category: string;
  tags: string[];
  source: string;
  source_url?: string;
  status: 'draft' | 'pending_review' | 'approved' | 'archived';
  created_by: string;
  approved_by?: string;
  created_at: Date;
  updated_at: Date;
  version: number;
}

// Conversation
interface Conversation {
  id: string;
  user_id: string;
  tenant_id: string;
  messages: Message[];
  created_at: Date;
  updated_at: Date;
}

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  confidence?: number;
  citations?: Citation[];
  timestamp: Date;
}

// Audit Log
interface AuditLog {
  id: string;
  tenant_id?: string;
  user_id: string;
  action: string;
  resource_type: string;
  resource_id: string;
  changes?: any;
  ip_address: string;
  user_agent: string;
  timestamp: Date;
}

// ETL Job
interface ETLJob {
  id: string;
  name: string;
  type: 'market_prices' | 'weather' | 'schemes';
  status: 'pending' | 'running' | 'success' | 'failed';
  source: string;
  records_processed: number;
  records_failed: number;
  error_message?: string;
  started_at?: Date;
  completed_at?: Date;
  next_run_at: Date;
}
```

### Database Schema (PostgreSQL)

```sql
-- Tenants table
CREATE TABLE tenants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  type VARCHAR(50) NOT NULL,
  status VARCHAR(50) NOT NULL DEFAULT 'active',
  branding JSONB,
  settings JSONB,
  limits JSONB,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Users table
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  phone VARCHAR(20) UNIQUE NOT NULL,
  email VARCHAR(255),
  name VARCHAR(255) NOT NULL,
  roles TEXT[] NOT NULL,
  language_preference VARCHAR(10) NOT NULL DEFAULT 'en',
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  last_login TIMESTAMP,
  CONSTRAINT users_tenant_fk FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);

-- Enable Row-Level Security
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON users
  USING (tenant_id = current_setting('app.current_tenant')::uuid);

-- Farms table
CREATE TABLE farms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  user_id UUID NOT NULL REFERENCES users(id),
  name VARCHAR(255) NOT NULL,
  location JSONB NOT NULL,
  total_acreage DECIMAL(10, 2) NOT NULL,
  irrigation_type VARCHAR(50) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

ALTER TABLE farms ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON farms
  USING (tenant_id = current_setting('app.current_tenant')::uuid);

-- Crops table
CREATE TABLE crops (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  farm_id UUID NOT NULL REFERENCES farms(id),
  crop_type VARCHAR(100) NOT NULL,
  variety VARCHAR(100),
  acreage DECIMAL(10, 2) NOT NULL,
  planting_date DATE NOT NULL,
  expected_harvest_date DATE,
  actual_harvest_date DATE,
  status VARCHAR(50) NOT NULL DEFAULT 'planned',
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Input logs table
CREATE TABLE input_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  farm_id UUID NOT NULL REFERENCES farms(id),
  crop_id UUID REFERENCES crops(id),
  input_type VARCHAR(50) NOT NULL,
  quantity DECIMAL(10, 2) NOT NULL,
  unit VARCHAR(20) NOT NULL,
  cost DECIMAL(10, 2),
  date DATE NOT NULL,
  notes TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Market prices table
CREATE TABLE market_prices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  market_name VARCHAR(255) NOT NULL,
  crop VARCHAR(100) NOT NULL,
  price DECIMAL(10, 2) NOT NULL,
  unit VARCHAR(20) NOT NULL,
  date DATE NOT NULL,
  source VARCHAR(255) NOT NULL,
  location JSONB NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE(market_name, crop, date)
);

CREATE INDEX idx_market_prices_crop_date ON market_prices(crop, date DESC);

-- Knowledge articles table
CREATE TABLE knowledge_articles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  title VARCHAR(500) NOT NULL,
  content TEXT NOT NULL,
  language VARCHAR(10) NOT NULL,
  category VARCHAR(100) NOT NULL,
  tags TEXT[],
  source VARCHAR(255) NOT NULL,
  source_url VARCHAR(500),
  status VARCHAR(50) NOT NULL DEFAULT 'draft',
  created_by UUID NOT NULL REFERENCES users(id),
  approved_by UUID REFERENCES users(id),
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  version INTEGER NOT NULL DEFAULT 1
);

ALTER TABLE knowledge_articles ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON knowledge_articles
  USING (tenant_id = current_setting('app.current_tenant')::uuid);

-- Alerts table
CREATE TABLE alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id),
  type VARCHAR(50) NOT NULL,
  title VARCHAR(255) NOT NULL,
  message TEXT NOT NULL,
  priority VARCHAR(20) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'unread',
  data JSONB,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  read_at TIMESTAMP,
  acknowledged_at TIMESTAMP
);

CREATE INDEX idx_alerts_user_status ON alerts(user_id, status, created_at DESC);

-- Audit logs table
CREATE TABLE audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id),
  user_id UUID NOT NULL REFERENCES users(id),
  action VARCHAR(100) NOT NULL,
  resource_type VARCHAR(100) NOT NULL,
  resource_id VARCHAR(255) NOT NULL,
  changes JSONB,
  ip_address VARCHAR(45),
  user_agent TEXT,
  timestamp TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_audit_logs_timestamp ON audit_logs(timestamp DESC);
CREATE INDEX idx_audit_logs_user ON audit_logs(user_id, timestamp DESC);

-- Conversations table
CREATE TABLE conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  messages JSONB NOT NULL DEFAULT '[]',
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON conversations
  USING (tenant_id = current_setting('app.current_tenant')::uuid);
```


## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system—essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: Tenant Data Isolation

*For any* two different tenants, when users from each tenant access the system, they should never be able to view, modify, or access data belonging to the other tenant.

**Validates: Requirements 1.2, 1.1**

### Property 2: Account Lockout After Failed Attempts

*For any* user account, when invalid login attempts reach 5 consecutive failures, the account should be locked for at least 15 minutes, and further login attempts during this period should be rejected.

**Validates: Requirements 2.2**

### Property 3: Role-Based Permission Enforcement

*For any* user and any action, when the user attempts the action, the system should verify the user has the required role permissions, and reject the action if permissions are insufficient.

**Validates: Requirements 3.1**

### Property 4: Low Confidence Triggers Uncertainty Message

*For any* AI Assistant response with confidence score below 70%, the response should explicitly include an uncertainty statement recommending expert consultation.

**Validates: Requirements 5.4**

### Property 5: Chemical Dosage Requests Are Refused

*For any* query requesting chemical pesticide dosages, mixing ratios, or application instructions, the Safety Guardrail should refuse the request and recommend consulting a licensed agronomist.

**Validates: Requirements 5.6, 21.2**

### Property 6: Prompt Injection Attempts Are Blocked

*For any* input containing prompt injection patterns (e.g., "ignore previous instructions", "pretend you are", "roleplay as"), the system should detect the malicious intent and refuse to process the instruction.

**Validates: Requirements 5.10, 21.8**

### Property 7: Disease Classification Performance

*For any* valid crop image, the disease classification should complete within 8 seconds and return a result with a confidence score between 0 and 1.

**Validates: Requirements 7.1, 7.2**

### Property 8: Market Data Includes Timestamps

*For any* market price data displayed to users, the response should include a "Last Updated" timestamp indicating when the data was last refreshed.

**Validates: Requirements 9.3**

### Property 9: Market Recommendations Include Explanations

*For any* market recommendation, the system should provide up to 3 contributing factors explaining why the market was recommended (e.g., price, distance, volatility).

**Validates: Requirements 10.1**

### Property 10: Markets Ranked By Net Profit

*For any* set of market recommendations for a given crop and farm location, the markets should be ranked in descending order by estimated net profit (price minus transportation cost).

**Validates: Requirements 10.4**

### Property 11: Price Forecasts Include Confidence Intervals

*For any* price forecast, the response should include a confidence interval range (lower and upper bounds) in addition to the point forecast.

**Validates: Requirements 11.2**

### Property 12: Water Efficiency Rating Validity

*For any* water efficiency calculation, the rating should be exactly one of: "High Efficiency", "Medium Efficiency", or "Low Efficiency".

**Validates: Requirements 13.3**

### Property 13: Efficiency Calculations Include Explanations

*For any* sustainability metric calculation (water efficiency, input efficiency), the response should include an explanation describing the calculation logic and how the user's value compares to benchmarks.

**Validates: Requirements 13.4**

### Property 14: RAG Responses Include Citations

*For any* AI Assistant response that uses knowledge base documents, the response should include citations identifying which documents were used.

**Validates: Requirements 17.4**

### Property 15: Missing Knowledge Base Content Triggers Fallback Message

*For any* query where no relevant knowledge base content is found, the system should respond with a message indicating the answer is based on general knowledge and should be verified with local experts.

**Validates: Requirements 17.8**

### Property 16: Data Deletion Preserves Anonymized Analytics

*For any* user data deletion request, after processing, the user's personal data should be removed from the system, but anonymized aggregate analytics should remain intact.

**Validates: Requirements 20.3**

### Property 17: Insufficient Information Triggers Admission

*For any* query where the AI Assistant lacks sufficient information to provide a reliable answer, the system should respond with "I don't have enough information to answer this question reliably" rather than generating unverified content.

**Validates: Requirements 22.1**

### Property 18: Numerical Data Requires Citations

*For any* AI response containing numerical data (prices, yields, measurements), the numbers should come from retrieved sources with citations, never generated synthetically.

**Validates: Requirements 22.5**

### Property 19: Service Failures Trigger Cached Fallback

*For any* external service failure (weather API, price API, LLM API), the system should fall back to cached data and clearly indicate to the user that cached data is being used with a staleness indicator.

**Validates: Requirements 29.1**

### Property 20: Error Messages Hide Technical Details

*For any* error response shown to users, the message should be user-friendly and should not expose technical details such as stack traces, database errors, or internal system information.

**Validates: Requirements 29.4**

### Property 21: AI Response Time Performance

*For any* AI Assistant text query under normal load conditions, the response time should be under 5 seconds for at least 90% of requests.

**Validates: Requirements 33.3**

### Property 22: Offline Access to Cached Data

*For any* user in offline mode, the system should allow read access to previously cached prices, advisories, and weather data without requiring network connectivity.

**Validates: Requirements 34.3**

### Property 23: Automatic Sync After Reconnection

*For any* queued requests created while offline, when network connectivity is restored, the system should automatically sync all queued requests in the background without user intervention.

**Validates: Requirements 34.5**

### Property 24: Tenant Deletion Cleanup

*For any* tenant deletion, all associated user data, farm data, and content should be removed from the system, while audit logs related to that tenant should be preserved for compliance.

**Validates: Requirements 1.3**


## Error Handling

### Error Categories

**1. User Input Errors (4xx)**
- Invalid farm profile data (missing required fields, invalid coordinates)
- Malformed API requests
- Authentication failures
- Permission denied errors

**Strategy**: Return clear, actionable error messages in the user's language. Include field-level validation errors.

```typescript
interface ValidationError {
  field: string;
  message: string;
  code: string;
}

// Example response
{
  "error": "Validation failed",
  "details": [
    {
      "field": "location.latitude",
      "message": "Latitude must be between -90 and 90",
      "code": "INVALID_LATITUDE"
    }
  ]
}
```

**2. External Service Failures (503)**
- LLM API unavailable
- Weather API timeout
- SMS gateway failure
- Image classification service down

**Strategy**: Implement circuit breakers, exponential backoff, and fallback to cached data. Display user-friendly messages indicating temporary unavailability.

```typescript
class CircuitBreaker {
  private failureCount = 0;
  private lastFailureTime?: Date;
  private state: 'closed' | 'open' | 'half-open' = 'closed';
  
  async execute<T>(fn: () => Promise<T>, fallback: () => Promise<T>): Promise<T> {
    if (this.state === 'open') {
      // Check if enough time has passed to try again
      if (Date.now() - this.lastFailureTime!.getTime() > 60000) {
        this.state = 'half-open';
      } else {
        return fallback();
      }
    }
    
    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      return fallback();
    }
  }
  
  private onSuccess() {
    this.failureCount = 0;
    this.state = 'closed';
  }
  
  private onFailure() {
    this.failureCount++;
    this.lastFailureTime = new Date();
    
    if (this.failureCount >= 5) {
      this.state = 'open';
    }
  }
}
```

**3. Data Quality Issues**
- Stale market data (>7 days old)
- Missing weather forecast
- Incomplete farm profile
- Corrupted image uploads

**Strategy**: Display warnings to users, provide data staleness indicators, and prompt for missing information.

```typescript
interface DataQualityWarning {
  type: 'stale_data' | 'missing_data' | 'incomplete_profile';
  message: string;
  severity: 'info' | 'warning' | 'error';
  action?: string;
}

// Example
{
  "type": "stale_data",
  "message": "Market price data is 10 days old. Prices may have changed.",
  "severity": "warning",
  "action": "Verify prices locally before making decisions"
}
```

**4. AI Safety Violations**
- Prompt injection attempts
- Requests for prohibited content
- Chemical dosage requests
- Low confidence responses

**Strategy**: Refuse requests with clear explanations, log incidents for review, and provide alternative guidance.

```typescript
interface SafetyRefusal {
  refused: true;
  reason: string;
  alternative?: string;
}

// Example
{
  "refused": true,
  "reason": "I cannot provide specific chemical dosages or mixing instructions.",
  "alternative": "Please consult a licensed agronomist or agricultural extension officer for safe chemical application guidance."
}
```

**5. System Errors (5xx)**
- Database connection failures
- Out of memory errors
- Unhandled exceptions

**Strategy**: Log detailed error context for debugging, return generic error messages to users, trigger alerts to operations team.

```typescript
// User-facing error
{
  "error": "An unexpected error occurred. Please try again later.",
  "error_id": "err_abc123"
}

// Internal log
{
  "error_id": "err_abc123",
  "timestamp": "2024-01-15T10:30:00Z",
  "user_id": "user_xyz",
  "tenant_id": "tenant_123",
  "endpoint": "/api/v1/ai/chat",
  "error_type": "DatabaseConnectionError",
  "stack_trace": "...",
  "context": { ... }
}
```

### Retry Strategies

**Exponential Backoff**:
```typescript
async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  baseDelay: number = 1000
): Promise<T> {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      if (attempt === maxRetries - 1) throw error;
      
      const delay = baseDelay * Math.pow(2, attempt);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  throw new Error('Max retries exceeded');
}
```

### Graceful Degradation

**Feature Availability Matrix**:

| Feature | Primary Service | Fallback | Degraded Mode |
|---------|----------------|----------|---------------|
| AI Chat | LLM API | Cached responses | Show "AI temporarily unavailable" |
| Disease Detection | Vision API | None | Show "Service unavailable, try later" |
| Market Prices | Price API | Cached prices | Show staleness warning |
| Weather Alerts | Weather API | Cached forecast | Show "Using last available data" |
| Voice Input | Speech API | Text input | Prompt user to type |


## Testing Strategy

### Dual Testing Approach

The system requires both unit tests and property-based tests for comprehensive coverage:

- **Unit tests**: Verify specific examples, edge cases, and error conditions
- **Property tests**: Verify universal properties across all inputs

Both approaches are complementary and necessary. Unit tests catch concrete bugs in specific scenarios, while property tests verify general correctness across a wide range of inputs.

### Unit Testing

**Focus Areas**:
1. Specific examples demonstrating correct behavior
2. Integration points between components
3. Edge cases and boundary conditions
4. Error handling paths

**Example Unit Tests**:

```typescript
describe('MarketIntelligence', () => {
  it('should calculate distance correctly for known coordinates', () => {
    const from = { latitude: 28.6139, longitude: 77.2090 }; // Delhi
    const to = { latitude: 19.0760, longitude: 72.8777 }; // Mumbai
    
    const distance = marketIntelligence.calculateDistance(from, to);
    
    expect(distance).toBeCloseTo(1150, 0); // ~1150 km
  });
  
  it('should handle empty market list gracefully', async () => {
    const recommendations = await marketIntelligence.getRecommendations(
      'tomato',
      farmLocation,
      context
    );
    
    expect(recommendations).toEqual([]);
  });
  
  it('should refuse chemical dosage requests', async () => {
    const query = "How much pesticide should I use per acre?";
    
    const response = await aiAssistant.processQuery(query, context);
    
    expect(response.text).toContain("consult a licensed agronomist");
    expect(response.refused).toBe(true);
  });
});
```

**Unit Test Coverage Targets**:
- Minimum 70% code coverage for MVP
- 100% coverage for safety-critical components (SafetyGuardrail, authentication)
- All error handling paths tested

### Property-Based Testing

**Configuration**:
- Minimum 100 iterations per property test (due to randomization)
- Each test must reference its design document property
- Tag format: `Feature: krishimitra-ai-saas, Property {number}: {property_text}`

**Property Test Library**: Use `fast-check` for TypeScript/JavaScript

**Example Property Tests**:

```typescript
import fc from 'fast-check';

describe('Property Tests', () => {
  // Feature: krishimitra-ai-saas, Property 1: Tenant Data Isolation
  it('should enforce tenant data isolation for all users', () => {
    fc.assert(
      fc.property(
        fc.record({
          tenant1: tenantArbitrary(),
          tenant2: tenantArbitrary(),
          user1: userArbitrary(),
          user2: userArbitrary()
        }),
        async ({ tenant1, tenant2, user1, user2 }) => {
          // Setup: Create two tenants with users
          await createTenant(tenant1);
          await createTenant(tenant2);
          
          user1.tenant_id = tenant1.id;
          user2.tenant_id = tenant2.id;
          
          await createUser(user1);
          await createUser(user2);
          
          // Create farm for user1
          const farm = await createFarm({
            user_id: user1.id,
            tenant_id: tenant1.id,
            name: 'Test Farm'
          });
          
          // Test: User2 should not be able to access user1's farm
          const result = await getFarm(farm.id, user2);
          
          expect(result).toBeNull(); // Should not find farm
        }
      ),
      { numRuns: 100 }
    );
  });
  
  // Feature: krishimitra-ai-saas, Property 5: Chemical Dosage Requests Are Refused
  it('should refuse all chemical dosage requests', () => {
    fc.assert(
      fc.property(
        chemicalDosageQueryArbitrary(),
        async (query) => {
          const response = await aiAssistant.processQuery(query, context);
          
          // Should refuse
          expect(response.refused).toBe(true);
          
          // Should recommend agronomist
          expect(response.text.toLowerCase()).toContain('agronomist');
          
          // Should not contain specific dosages
          expect(response.text).not.toMatch(/\d+\s*(ml|g|kg|l)\/acre/i);
        }
      ),
      { numRuns: 100 }
    );
  });
  
  // Feature: krishimitra-ai-saas, Property 10: Markets Ranked By Net Profit
  it('should rank markets by net profit in descending order', () => {
    fc.assert(
      fc.property(
        fc.record({
          crop: cropArbitrary(),
          farmLocation: locationArbitrary(),
          markets: fc.array(marketPriceArbitrary(), { minLength: 2, maxLength: 10 })
        }),
        async ({ crop, farmLocation, markets }) => {
          // Setup: Insert market prices
          await insertMarketPrices(markets);
          
          // Test: Get recommendations
          const recommendations = await marketIntelligence.getRecommendations(
            crop,
            farmLocation,
            context
          );
          
          // Verify: Sorted by net profit descending
          for (let i = 0; i < recommendations.length - 1; i++) {
            expect(recommendations[i].net_profit).toBeGreaterThanOrEqual(
              recommendations[i + 1].net_profit
            );
          }
        }
      ),
      { numRuns: 100 }
    );
  });
  
  // Feature: krishimitra-ai-saas, Property 14: RAG Responses Include Citations
  it('should include citations when using knowledge base', () => {
    fc.assert(
      fc.property(
        fc.record({
          query: queryArbitrary(),
          documents: fc.array(knowledgeDocumentArbitrary(), { minLength: 1, maxLength: 5 })
        }),
        async ({ query, documents }) => {
          // Setup: Index documents in knowledge base
          for (const doc of documents) {
            await ragSystem.index(doc, context.tenant_id);
          }
          
          // Test: Query should retrieve documents
          const response = await aiAssistant.processQuery(query, context);
          
          // Verify: Citations present if documents were used
          if (response.sources.length > 0) {
            expect(response.citations.length).toBeGreaterThan(0);
            
            // Each citation should reference a source
            for (const citation of response.citations) {
              expect(citation.source).toBeTruthy();
            }
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});

// Arbitraries (generators for random test data)
function tenantArbitrary() {
  return fc.record({
    id: fc.uuid(),
    name: fc.string({ minLength: 1, maxLength: 100 }),
    type: fc.constantFrom('fpo', 'ngo', 'cooperative'),
    status: fc.constant('active')
  });
}

function chemicalDosageQueryArbitrary() {
  const templates = [
    "How much {chemical} should I use per acre?",
    "What is the mixing ratio for {chemical}?",
    "How to apply {chemical} dosage?",
    "Tell me the application rate of {chemical}"
  ];
  
  const chemicals = ['pesticide', 'insecticide', 'fungicide', 'herbicide'];
  
  return fc.tuple(
    fc.constantFrom(...templates),
    fc.constantFrom(...chemicals)
  ).map(([template, chemical]) => template.replace('{chemical}', chemical));
}

function marketPriceArbitrary() {
  return fc.record({
    market_name: fc.string({ minLength: 5, maxLength: 50 }),
    crop: fc.constantFrom('tomato', 'potato', 'onion', 'wheat', 'rice'),
    price: fc.float({ min: 10, max: 200 }),
    location: locationArbitrary(),
    date: fc.date({ min: new Date('2024-01-01'), max: new Date() })
  });
}

function locationArbitrary() {
  return fc.record({
    latitude: fc.float({ min: 8.0, max: 37.0 }), // India bounds
    longitude: fc.float({ min: 68.0, max: 97.0 })
  });
}
```

### Integration Testing

**Critical User Workflows**:
1. Farmer onboarding → profile creation → first AI query
2. Image upload → disease classification → recommendations
3. Market price query → recommendations → alert creation
4. Offline mode → queue actions → reconnect → sync
5. Admin creates tenant → adds users → configures settings

**Integration Test Example**:

```typescript
describe('Farmer Onboarding Flow', () => {
  it('should complete full onboarding workflow', async () => {
    // 1. Register
    const registerResponse = await request(app)
      .post('/api/v1/auth/register')
      .send({
        phone: '+919876543210',
        name: 'Test Farmer',
        language_preference: 'hi'
      });
    
    expect(registerResponse.status).toBe(200);
    
    // 2. Verify OTP
    const verifyResponse = await request(app)
      .post('/api/v1/auth/verify-otp')
      .send({
        phone: '+919876543210',
        otp: '123456' // Mock OTP
      });
    
    expect(verifyResponse.status).toBe(200);
    const { token } = verifyResponse.body;
    
    // 3. Create farm profile
    const farmResponse = await request(app)
      .post('/api/v1/farms')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'My Farm',
        location: {
          latitude: 28.6139,
          longitude: 77.2090,
          address: 'Delhi'
        },
        total_acreage: 5,
        irrigation_type: 'drip'
      });
    
    expect(farmResponse.status).toBe(201);
    
    // 4. Ask first AI question
    const chatResponse = await request(app)
      .post('/api/v1/ai/chat')
      .set('Authorization', `Bearer ${token}`)
      .send({
        message: 'What crops should I plant in Delhi?'
      });
    
    expect(chatResponse.status).toBe(200);
    expect(chatResponse.body.text).toBeTruthy();
    expect(chatResponse.body.confidence).toBeGreaterThan(0);
  });
});
```

### Performance Testing

**Load Testing Scenarios**:
1. 1,000 concurrent users making AI queries
2. 100 simultaneous image uploads for disease classification
3. 10,000 market price API requests per minute
4. Database query performance under load

**Tools**: k6 or Artillery for load testing

**Performance Targets** (from requirements):
- AI response time: < 5 seconds (90th percentile)
- Disease classification: < 8 seconds (90th percentile)
- API response time: < 3 seconds (90th percentile)
- System uptime: 99%

### Security Testing

**Security Test Areas**:
1. SQL injection attempts
2. XSS attacks
3. CSRF protection
4. Authentication bypass attempts
5. Tenant isolation breaches
6. Prompt injection attacks
7. Rate limiting enforcement

**Tools**: OWASP ZAP, Burp Suite for vulnerability scanning

### Test Data Management

**Synthetic Datasets**:
- Generate realistic farm profiles, crop data, market prices
- Create diverse test images for disease classification
- Generate multilingual test queries
- Mock weather data and forecasts

**Data Privacy**:
- Never use real user data in tests
- Anonymize any production data used for testing
- Clear test data after test runs

### Continuous Integration

**CI/CD Pipeline**:
1. Run unit tests on every commit
2. Run property tests on every pull request
3. Run integration tests before deployment
4. Run security scans weekly
5. Run performance tests before major releases

**Test Execution Time Targets**:
- Unit tests: < 5 minutes
- Property tests: < 15 minutes
- Integration tests: < 30 minutes
- Full test suite: < 1 hour

