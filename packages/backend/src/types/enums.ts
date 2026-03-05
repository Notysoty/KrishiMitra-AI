export enum Role {
  FARMER = 'farmer',
  FIELD_OFFICER = 'field_officer',
  AGRONOMIST = 'agronomist',
  BUYER = 'buyer',
  TENANT_ADMIN = 'tenant_admin',
  PLATFORM_ADMIN = 'platform_admin',
  ML_OPS = 'ml_ops',
}

export enum CropStatus {
  PLANNED = 'planned',
  PLANTED = 'planted',
  GROWING = 'growing',
  HARVESTED = 'harvested',
}

export enum AlertType {
  PRICE_CHANGE = 'price_change',
  WEATHER = 'weather',
  PEST = 'pest',
  SCHEME = 'scheme',
}

export enum AlertPriority {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
}

export enum AlertStatus {
  UNREAD = 'unread',
  READ = 'read',
  ACKNOWLEDGED = 'acknowledged',
}

export enum TenantType {
  FPO = 'fpo',
  NGO = 'ngo',
  COOPERATIVE = 'cooperative',
  GOVERNMENT = 'government',
}

export enum TenantStatus {
  ACTIVE = 'active',
  SUSPENDED = 'suspended',
  DELETED = 'deleted',
}

export enum InputType {
  WATER = 'water',
  FERTILIZER = 'fertilizer',
  PESTICIDE = 'pesticide',
  LABOR = 'labor',
}

export enum IrrigationType {
  RAINFED = 'rainfed',
  DRIP = 'drip',
  SPRINKLER = 'sprinkler',
  FLOOD = 'flood',
}

export enum ArticleStatus {
  DRAFT = 'draft',
  PENDING_REVIEW = 'pending_review',
  APPROVED = 'approved',
  ARCHIVED = 'archived',
}

export enum ETLJobType {
  MARKET_PRICES = 'market_prices',
  WEATHER = 'weather',
  SCHEMES = 'schemes',
}

export enum ETLJobStatus {
  PENDING = 'pending',
  RUNNING = 'running',
  SUCCESS = 'success',
  FAILED = 'failed',
}

export enum VolatilityLevel {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
}

export enum ConfidenceLevel {
  HIGH = 'high',
  MEDIUM = 'medium',
  LOW = 'low',
}

export enum EfficiencyRating {
  HIGH = 'High Efficiency',
  MEDIUM = 'Medium Efficiency',
  LOW = 'Low Efficiency',
}

export enum RiskLevel {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
}

export enum RecommendationType {
  ORGANIC = 'organic',
  CHEMICAL = 'chemical',
  CULTURAL = 'cultural',
}

export enum DataQualitySeverity {
  INFO = 'info',
  WARNING = 'warning',
  ERROR = 'error',
}

export enum DataQualityType {
  STALE_DATA = 'stale_data',
  MISSING_DATA = 'missing_data',
  INCOMPLETE_PROFILE = 'incomplete_profile',
}

export enum ContentModerationStatus {
  QUEUED = 'queued',
  APPROVED = 'approved',
  REJECTED = 'rejected',
  OUTDATED = 'outdated',
}

export enum BroadcastStatus {
  PENDING = 'pending',
  SENT = 'sent',
  FAILED = 'failed',
}

export enum MessageDeliveryStatus {
  PENDING = 'pending',
  DELIVERED = 'delivered',
  VIEWED = 'viewed',
  FAILED = 'failed',
}
