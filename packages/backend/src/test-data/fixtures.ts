/**
 * Synthetic test datasets for KrishiMitra-AI services.
 * Used by unit tests, property tests, and integration tests.
 * All data is clearly labelled as synthetic / demo data.
 *
 * Requirements: 40.1, 40.2, 40.3
 */

// ─────────────────────────────────────────────────────────────────────────────
// Farm Profile Fixtures
// ─────────────────────────────────────────────────────────────────────────────

export interface FarmProfileFixture {
  id: string;
  tenantId: string;
  ownerId: string;
  name: string;
  location: { lat: number; lng: number; district: string; state: string };
  areaHectares: number;
  soilType: string;
  irrigationType: string;
  crops: Array<{ name: string; variety: string; plantingDate: string; expectedHarvestDate: string }>;
  dataSource: 'Synthetic_Dataset';
}

export const farmProfileFixtures: FarmProfileFixture[] = [
  {
    id: 'farm-fixture-001',
    tenantId: 'tenant-fixture-001',
    ownerId: 'user-fixture-001',
    name: 'Sharma Rice Farm',
    location: { lat: 28.6139, lng: 77.209, district: 'New Delhi', state: 'Delhi' },
    areaHectares: 2.5,
    soilType: 'Alluvial',
    irrigationType: 'Canal',
    crops: [
      { name: 'Rice', variety: 'Basmati 1121', plantingDate: '2024-06-15', expectedHarvestDate: '2024-11-10' },
    ],
    dataSource: 'Synthetic_Dataset',
  },
  {
    id: 'farm-fixture-002',
    tenantId: 'tenant-fixture-001',
    ownerId: 'user-fixture-002',
    name: 'Patel Cotton Estate',
    location: { lat: 22.3072, lng: 73.1812, district: 'Vadodara', state: 'Gujarat' },
    areaHectares: 8.0,
    soilType: 'Black Cotton',
    irrigationType: 'Drip',
    crops: [
      { name: 'Cotton', variety: 'Bt Cotton Hybrid', plantingDate: '2024-05-01', expectedHarvestDate: '2024-12-15' },
      { name: 'Wheat', variety: 'HD-2967', plantingDate: '2024-11-20', expectedHarvestDate: '2025-04-10' },
    ],
    dataSource: 'Synthetic_Dataset',
  },
  {
    id: 'farm-fixture-003',
    tenantId: 'tenant-fixture-002',
    ownerId: 'user-fixture-003',
    name: 'Reddy Tomato Farm',
    location: { lat: 17.385, lng: 78.4867, district: 'Hyderabad', state: 'Telangana' },
    areaHectares: 1.2,
    soilType: 'Red Laterite',
    irrigationType: 'Sprinkler',
    crops: [
      { name: 'Tomato', variety: 'Hybrid Tomato F1', plantingDate: '2024-07-01', expectedHarvestDate: '2024-10-30' },
    ],
    dataSource: 'Synthetic_Dataset',
  },
  {
    id: 'farm-fixture-004',
    tenantId: 'tenant-fixture-002',
    ownerId: 'user-fixture-004',
    name: 'Kumar Sugarcane Fields',
    location: { lat: 18.5204, lng: 73.8567, district: 'Pune', state: 'Maharashtra' },
    areaHectares: 5.0,
    soilType: 'Medium Black',
    irrigationType: 'Furrow',
    crops: [
      { name: 'Sugarcane', variety: 'Co-86032', plantingDate: '2024-01-10', expectedHarvestDate: '2025-01-10' },
    ],
    dataSource: 'Synthetic_Dataset',
  },
  {
    id: 'farm-fixture-005',
    tenantId: 'tenant-fixture-003',
    ownerId: 'user-fixture-005',
    name: 'Nair Banana Plantation',
    location: { lat: 10.8505, lng: 76.2711, district: 'Thrissur', state: 'Kerala' },
    areaHectares: 3.0,
    soilType: 'Laterite',
    irrigationType: 'Drip',
    crops: [
      { name: 'Banana', variety: 'Nendran', plantingDate: '2024-03-01', expectedHarvestDate: '2025-01-15' },
      { name: 'Coconut', variety: 'West Coast Tall', plantingDate: '2020-01-01', expectedHarvestDate: '2025-12-31' },
    ],
    dataSource: 'Synthetic_Dataset',
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// Market Price Fixtures — 6 months × 3 crops × 3 markets
// ─────────────────────────────────────────────────────────────────────────────

export interface MarketPriceFixture {
  cropName: string;
  marketName: string;
  marketLocation: { lat: number; lng: number; state: string };
  priceHistory: Array<{ date: string; pricePerQuintal: number; unit: 'INR/quintal' }>;
  dataSource: 'Synthetic_Dataset';
  lastUpdated: string;
}

const generatePriceHistory = (
  basePrice: number,
  startDate: Date,
  months: number,
): Array<{ date: string; pricePerQuintal: number; unit: 'INR/quintal' }> => {
  const history: Array<{ date: string; pricePerQuintal: number; unit: 'INR/quintal' }> = [];
  for (let m = 0; m < months; m++) {
    const d = new Date(startDate);
    d.setMonth(d.getMonth() + m);
    // Simulate seasonal variation ±15%
    const variation = 1 + (Math.sin((m / months) * Math.PI) * 0.15);
    history.push({
      date: d.toISOString().split('T')[0],
      pricePerQuintal: Math.round(basePrice * variation),
      unit: 'INR/quintal',
    });
  }
  return history;
};

const sixMonthsAgo = new Date('2024-01-01');

export const marketPriceFixtures: MarketPriceFixture[] = [
  // Rice × 3 markets
  {
    cropName: 'Rice',
    marketName: 'Azadpur Mandi',
    marketLocation: { lat: 28.7041, lng: 77.1025, state: 'Delhi' },
    priceHistory: generatePriceHistory(2200, sixMonthsAgo, 6),
    dataSource: 'Synthetic_Dataset',
    lastUpdated: '2024-06-30T10:00:00Z',
  },
  {
    cropName: 'Rice',
    marketName: 'Vashi APMC',
    marketLocation: { lat: 19.076, lng: 72.8777, state: 'Maharashtra' },
    priceHistory: generatePriceHistory(2350, sixMonthsAgo, 6),
    dataSource: 'Synthetic_Dataset',
    lastUpdated: '2024-06-30T10:00:00Z',
  },
  {
    cropName: 'Rice',
    marketName: 'Koyambedu Market',
    marketLocation: { lat: 13.0827, lng: 80.2707, state: 'Tamil Nadu' },
    priceHistory: generatePriceHistory(2100, sixMonthsAgo, 6),
    dataSource: 'Synthetic_Dataset',
    lastUpdated: '2024-06-30T10:00:00Z',
  },
  // Tomato × 3 markets
  {
    cropName: 'Tomato',
    marketName: 'Azadpur Mandi',
    marketLocation: { lat: 28.7041, lng: 77.1025, state: 'Delhi' },
    priceHistory: generatePriceHistory(1500, sixMonthsAgo, 6),
    dataSource: 'Synthetic_Dataset',
    lastUpdated: '2024-06-30T10:00:00Z',
  },
  {
    cropName: 'Tomato',
    marketName: 'Vashi APMC',
    marketLocation: { lat: 19.076, lng: 72.8777, state: 'Maharashtra' },
    priceHistory: generatePriceHistory(1800, sixMonthsAgo, 6),
    dataSource: 'Synthetic_Dataset',
    lastUpdated: '2024-06-30T10:00:00Z',
  },
  {
    cropName: 'Tomato',
    marketName: 'Koyambedu Market',
    marketLocation: { lat: 13.0827, lng: 80.2707, state: 'Tamil Nadu' },
    priceHistory: generatePriceHistory(1200, sixMonthsAgo, 6),
    dataSource: 'Synthetic_Dataset',
    lastUpdated: '2024-06-30T10:00:00Z',
  },
  // Cotton × 3 markets
  {
    cropName: 'Cotton',
    marketName: 'Rajkot APMC',
    marketLocation: { lat: 22.3039, lng: 70.8022, state: 'Gujarat' },
    priceHistory: generatePriceHistory(6500, sixMonthsAgo, 6),
    dataSource: 'Synthetic_Dataset',
    lastUpdated: '2024-06-30T10:00:00Z',
  },
  {
    cropName: 'Cotton',
    marketName: 'Akola Market',
    marketLocation: { lat: 20.7002, lng: 77.0082, state: 'Maharashtra' },
    priceHistory: generatePriceHistory(6200, sixMonthsAgo, 6),
    dataSource: 'Synthetic_Dataset',
    lastUpdated: '2024-06-30T10:00:00Z',
  },
  {
    cropName: 'Cotton',
    marketName: 'Adilabad Yard',
    marketLocation: { lat: 19.6641, lng: 78.5319, state: 'Telangana' },
    priceHistory: generatePriceHistory(6350, sixMonthsAgo, 6),
    dataSource: 'Synthetic_Dataset',
    lastUpdated: '2024-06-30T10:00:00Z',
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// Weather Fixtures — 7-day forecast
// ─────────────────────────────────────────────────────────────────────────────

export interface WeatherDayFixture {
  date: string;
  location: { lat: number; lng: number; district: string };
  temperatureMaxC: number;
  temperatureMinC: number;
  rainfallMm: number;
  humidity: number;
  windSpeedKmh: number;
  condition: 'Sunny' | 'Partly Cloudy' | 'Cloudy' | 'Light Rain' | 'Heavy Rain' | 'Thunderstorm';
  severeWeatherAlert: boolean;
  dataSource: 'Synthetic_Dataset';
}

export const weatherFixtures: WeatherDayFixture[] = [
  {
    date: '2024-07-01',
    location: { lat: 28.6139, lng: 77.209, district: 'New Delhi' },
    temperatureMaxC: 38,
    temperatureMinC: 28,
    rainfallMm: 0,
    humidity: 55,
    windSpeedKmh: 12,
    condition: 'Sunny',
    severeWeatherAlert: false,
    dataSource: 'Synthetic_Dataset',
  },
  {
    date: '2024-07-02',
    location: { lat: 28.6139, lng: 77.209, district: 'New Delhi' },
    temperatureMaxC: 36,
    temperatureMinC: 27,
    rainfallMm: 5,
    humidity: 65,
    windSpeedKmh: 18,
    condition: 'Partly Cloudy',
    severeWeatherAlert: false,
    dataSource: 'Synthetic_Dataset',
  },
  {
    date: '2024-07-03',
    location: { lat: 28.6139, lng: 77.209, district: 'New Delhi' },
    temperatureMaxC: 32,
    temperatureMinC: 25,
    rainfallMm: 45,
    humidity: 80,
    windSpeedKmh: 25,
    condition: 'Heavy Rain',
    severeWeatherAlert: false,
    dataSource: 'Synthetic_Dataset',
  },
  {
    date: '2024-07-04',
    location: { lat: 28.6139, lng: 77.209, district: 'New Delhi' },
    temperatureMaxC: 30,
    temperatureMinC: 24,
    rainfallMm: 120,
    humidity: 90,
    windSpeedKmh: 40,
    condition: 'Thunderstorm',
    severeWeatherAlert: true, // >100mm triggers severe alert
    dataSource: 'Synthetic_Dataset',
  },
  {
    date: '2024-07-05',
    location: { lat: 28.6139, lng: 77.209, district: 'New Delhi' },
    temperatureMaxC: 33,
    temperatureMinC: 26,
    rainfallMm: 20,
    humidity: 75,
    windSpeedKmh: 15,
    condition: 'Light Rain',
    severeWeatherAlert: false,
    dataSource: 'Synthetic_Dataset',
  },
  {
    date: '2024-07-06',
    location: { lat: 28.6139, lng: 77.209, district: 'New Delhi' },
    temperatureMaxC: 41,
    temperatureMinC: 30,
    rainfallMm: 0,
    humidity: 45,
    windSpeedKmh: 10,
    condition: 'Sunny',
    severeWeatherAlert: true, // >40°C triggers heat alert
    dataSource: 'Synthetic_Dataset',
  },
  {
    date: '2024-07-07',
    location: { lat: 28.6139, lng: 77.209, district: 'New Delhi' },
    temperatureMaxC: 37,
    temperatureMinC: 28,
    rainfallMm: 0,
    humidity: 50,
    windSpeedKmh: 14,
    condition: 'Partly Cloudy',
    severeWeatherAlert: false,
    dataSource: 'Synthetic_Dataset',
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// Multilingual Query Fixtures
// ─────────────────────────────────────────────────────────────────────────────

export interface MultilingualQueryFixture {
  language: 'Hindi' | 'Tamil' | 'Telugu' | 'Kannada' | 'English';
  languageCode: 'hi' | 'ta' | 'te' | 'kn' | 'en';
  query: string;
  expectedTopicCategory: 'crop_advice' | 'market_price' | 'weather' | 'scheme' | 'disease';
  safeQuery: boolean;
}

export const multilingualQueryFixtures: MultilingualQueryFixture[] = [
  {
    language: 'Hindi',
    languageCode: 'hi',
    query: 'मेरी धान की फसल में पीले पत्ते क्यों हो रहे हैं?',
    expectedTopicCategory: 'disease',
    safeQuery: true,
  },
  {
    language: 'Hindi',
    languageCode: 'hi',
    query: 'आज गेहूं का बाजार भाव क्या है?',
    expectedTopicCategory: 'market_price',
    safeQuery: true,
  },
  {
    language: 'Tamil',
    languageCode: 'ta',
    query: 'என் நெல் பயிரில் நோய் இருக்கிறதா என்று எப்படி தெரியும்?',
    expectedTopicCategory: 'disease',
    safeQuery: true,
  },
  {
    language: 'Tamil',
    languageCode: 'ta',
    query: 'தக்காளி விலை இன்று என்ன?',
    expectedTopicCategory: 'market_price',
    safeQuery: true,
  },
  {
    language: 'Telugu',
    languageCode: 'te',
    query: 'నా పత్తి పంటకు ఏ ఎరువు వేయాలి?',
    expectedTopicCategory: 'crop_advice',
    safeQuery: true,
  },
  {
    language: 'Telugu',
    languageCode: 'te',
    query: 'రేపు వర్షం వస్తుందా?',
    expectedTopicCategory: 'weather',
    safeQuery: true,
  },
  {
    language: 'Kannada',
    languageCode: 'kn',
    query: 'ನನ್ನ ಜಮೀನಿಗೆ ಯಾವ ಸರ್ಕಾರಿ ಯೋಜನೆ ಅನ್ವಯಿಸುತ್ತದೆ?',
    expectedTopicCategory: 'scheme',
    safeQuery: true,
  },
  {
    language: 'Kannada',
    languageCode: 'kn',
    query: 'ಭತ್ತದ ಬೆಲೆ ಎಷ್ಟಿದೆ?',
    expectedTopicCategory: 'market_price',
    safeQuery: true,
  },
  {
    language: 'English',
    languageCode: 'en',
    query: 'What is the best time to plant wheat in Punjab?',
    expectedTopicCategory: 'crop_advice',
    safeQuery: true,
  },
  {
    language: 'English',
    languageCode: 'en',
    query: 'How do I identify blast disease in rice?',
    expectedTopicCategory: 'disease',
    safeQuery: true,
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// Disease Image Fixtures — metadata for synthetic classification test cases
// ─────────────────────────────────────────────────────────────────────────────

export interface DiseaseImageFixture {
  id: string;
  cropName: string;
  diseaseName: string;
  expectedConfidenceRange: { min: number; max: number };
  imageQuality: 'good' | 'blurry' | 'low_light' | 'partial';
  expectedClassificationResult: 'classified' | 'uncertain' | 'retake_required';
  highRisk: boolean;
  dataSource: 'Synthetic_Dataset';
}

export const diseaseImageFixtures: DiseaseImageFixture[] = [
  {
    id: 'disease-img-001',
    cropName: 'Rice',
    diseaseName: 'Rice Blast',
    expectedConfidenceRange: { min: 0.82, max: 0.95 },
    imageQuality: 'good',
    expectedClassificationResult: 'classified',
    highRisk: true,
    dataSource: 'Synthetic_Dataset',
  },
  {
    id: 'disease-img-002',
    cropName: 'Tomato',
    diseaseName: 'Early Blight',
    expectedConfidenceRange: { min: 0.75, max: 0.90 },
    imageQuality: 'good',
    expectedClassificationResult: 'classified',
    highRisk: false,
    dataSource: 'Synthetic_Dataset',
  },
  {
    id: 'disease-img-003',
    cropName: 'Cotton',
    diseaseName: 'Cotton Leaf Curl Virus',
    expectedConfidenceRange: { min: 0.55, max: 0.70 },
    imageQuality: 'good',
    expectedClassificationResult: 'uncertain', // confidence < 60% boundary
    highRisk: false,
    dataSource: 'Synthetic_Dataset',
  },
  {
    id: 'disease-img-004',
    cropName: 'Wheat',
    diseaseName: 'Yellow Rust',
    expectedConfidenceRange: { min: 0.0, max: 0.40 },
    imageQuality: 'blurry',
    expectedClassificationResult: 'retake_required',
    highRisk: false,
    dataSource: 'Synthetic_Dataset',
  },
  {
    id: 'disease-img-005',
    cropName: 'Banana',
    diseaseName: 'Panama Disease',
    expectedConfidenceRange: { min: 0.88, max: 0.98 },
    imageQuality: 'good',
    expectedClassificationResult: 'classified',
    highRisk: true, // high-risk + confidence > 80% → recommend extension officer
    dataSource: 'Synthetic_Dataset',
  },
];
