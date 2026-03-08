/**
 * Creates the vector index in the OpenSearch Serverless collection for Bedrock KB.
 * Uses AWS SDK v3 for proper SigV4 signing.
 *
 * Usage: node scripts/create-oss-index.js <endpoint> <index-name>
 */

const https = require('https');
const crypto = require('crypto');
const url = require('url');

const [, , ENDPOINT, INDEX_NAME = 'krishimitra-knowledge'] = process.argv;

if (!ENDPOINT) {
  console.error('Usage: node create-oss-index.js <oss-endpoint> [index-name]');
  process.exit(1);
}

const ACCESS_KEY = process.env.AWS_ACCESS_KEY_ID;
const SECRET_KEY = process.env.AWS_SECRET_ACCESS_KEY;
const SESSION_TOKEN = process.env.AWS_SESSION_TOKEN || '';
const REGION = process.env.AWS_REGION || 'us-east-1';
const SERVICE = 'aoss';

const INDEX_BODY = JSON.stringify({
  settings: {
    'index.knn': true,
    number_of_shards: 1,
    number_of_replicas: 0,
  },
  mappings: {
    properties: {
      'bedrock-knowledge-base-default-vector': {
        type: 'knn_vector',
        dimension: 1024,
        method: {
          name: 'hnsw',
          space_type: 'cosinesimil',
          engine: 'faiss',
          parameters: { ef_construction: 512, m: 16 },
        },
      },
      AMAZON_BEDROCK_TEXT_CHUNK: { type: 'text' },
      AMAZON_BEDROCK_METADATA: { type: 'text' },
      id: { type: 'text' },
    },
  },
});

function hmac(key, data, encoding) {
  return crypto.createHmac('sha256', key).update(data, 'utf8').digest(encoding);
}

function hash(data) {
  return crypto.createHash('sha256').update(data, 'utf8').digest('hex');
}

function signRequest(method, parsedUrl, body) {
  const now = new Date();
  const dateStamp = now.toISOString().split('T')[0].replace(/-/g, '');
  const amzDate = now.toISOString().replace(/[:-]/g, '').split('.')[0] + 'Z';
  const host = parsedUrl.hostname;
  const path = parsedUrl.pathname;

  const payloadHash = hash(body);
  let canonicalHeaders = `content-type:application/json\nhost:${host}\nx-amz-content-sha256:${payloadHash}\nx-amz-date:${amzDate}\n`;
  let signedHeaders = 'content-type;host;x-amz-content-sha256;x-amz-date';

  if (SESSION_TOKEN) {
    canonicalHeaders += `x-amz-security-token:${SESSION_TOKEN}\n`;
    signedHeaders += ';x-amz-security-token';
  }

  const canonicalRequest = [
    method,
    path,
    '',
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join('\n');

  const credentialScope = `${dateStamp}/${REGION}/${SERVICE}/aws4_request`;
  const stringToSign = ['AWS4-HMAC-SHA256', amzDate, credentialScope, hash(canonicalRequest)].join('\n');

  const signingKey = hmac(
    hmac(hmac(hmac('AWS4' + SECRET_KEY, dateStamp), REGION), SERVICE),
    'aws4_request'
  );
  const signature = hmac(signingKey, stringToSign, 'hex');

  const authorization = `AWS4-HMAC-SHA256 Credential=${ACCESS_KEY}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

  const headers = {
    'Content-Type': 'application/json',
    'X-Amz-Content-Sha256': payloadHash,
    'X-Amz-Date': amzDate,
    Authorization: authorization,
    'Content-Length': Buffer.byteLength(body),
  };
  if (SESSION_TOKEN) headers['X-Amz-Security-Token'] = SESSION_TOKEN;

  return headers;
}

async function createIndex() {
  const cleanEndpoint = ENDPOINT.replace(/\/$/, '');
  const indexUrl = `${cleanEndpoint}/${INDEX_NAME}`;
  const parsedUrl = url.parse(indexUrl);

  const headers = signRequest('PUT', parsedUrl, INDEX_BODY);

  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: parsedUrl.hostname,
      port: 443,
      path: parsedUrl.path,
      method: 'PUT',
      headers,
    }, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        console.log(`HTTP ${res.statusCode}: ${data}`);
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(data);
        } else if (res.statusCode === 400 && data.includes('already exists')) {
          console.log('Index already exists — OK');
          resolve(data);
        } else {
          reject(new Error(`HTTP ${res.statusCode}: ${data}`));
        }
      });
    });
    req.on('error', reject);
    req.write(INDEX_BODY);
    req.end();
  });
}

createIndex()
  .then(() => console.log('Vector index created successfully'))
  .catch(err => {
    console.error('Failed:', err.message);
    process.exit(1);
  });
