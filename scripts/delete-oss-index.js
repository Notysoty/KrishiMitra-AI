const https = require('https');
const crypto = require('crypto');
const url = require('url');

const [, , ENDPOINT, INDEX_NAME = 'krishimitra-knowledge'] = process.argv;

const ACCESS_KEY = process.env.AWS_ACCESS_KEY_ID;
const SECRET_KEY = process.env.AWS_SECRET_ACCESS_KEY;
const SESSION_TOKEN = process.env.AWS_SESSION_TOKEN || '';
const REGION = process.env.AWS_REGION || 'us-east-1';
const SERVICE = 'aoss';

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
  const payloadHash = hash(body);
  let canonicalHeaders = `content-type:application/json\nhost:${host}\nx-amz-content-sha256:${payloadHash}\nx-amz-date:${amzDate}\n`;
  let signedHeaders = 'content-type;host;x-amz-content-sha256;x-amz-date';
  if (SESSION_TOKEN) { canonicalHeaders += `x-amz-security-token:${SESSION_TOKEN}\n`; signedHeaders += ';x-amz-security-token'; }
  const canonicalRequest = [method, parsedUrl.pathname, '', canonicalHeaders, signedHeaders, payloadHash].join('\n');
  const credentialScope = `${dateStamp}/${REGION}/${SERVICE}/aws4_request`;
  const stringToSign = ['AWS4-HMAC-SHA256', amzDate, credentialScope, hash(canonicalRequest)].join('\n');
  const signingKey = hmac(hmac(hmac(hmac('AWS4' + SECRET_KEY, dateStamp), REGION), SERVICE), 'aws4_request');
  const signature = hmac(signingKey, stringToSign, 'hex');
  const authorization = `AWS4-HMAC-SHA256 Credential=${ACCESS_KEY}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;
  const headers = { 'Content-Type': 'application/json', 'X-Amz-Content-Sha256': payloadHash, 'X-Amz-Date': amzDate, Authorization: authorization, 'Content-Length': 0 };
  if (SESSION_TOKEN) headers['X-Amz-Security-Token'] = SESSION_TOKEN;
  return headers;
}

const cleanEndpoint = ENDPOINT.replace(/\/$/, '');
const parsedUrl = url.parse(`${cleanEndpoint}/${INDEX_NAME}`);
const headers = signRequest('DELETE', parsedUrl, '');

const req = https.request({ hostname: parsedUrl.hostname, port: 443, path: parsedUrl.path, method: 'DELETE', headers }, (res) => {
  let data = '';
  res.on('data', c => data += c);
  res.on('end', () => console.log(`HTTP ${res.statusCode}: ${data}`));
});
req.on('error', err => { console.error(err.message); process.exit(1); });
req.end();
