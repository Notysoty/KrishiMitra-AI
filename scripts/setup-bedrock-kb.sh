#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# KrishiMitra — Bedrock Knowledge Base Setup Script
# Creates: OSS Collection, IAM role, Knowledge Base, S3 data source, ingests docs
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

REGION=${AWS_REGION:-us-east-1}
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
BUCKET="krishimitra-knowledge-base-$ACCOUNT_ID"
KB_NAME="krishimitra-agricultural-kb"
COLLECTION_NAME="krishimitra-vectors"
INDEX_NAME="krishimitra-knowledge"
ROLE_NAME="AmazonBedrockExecutionRoleForKB-krishimitra"

echo "Setting up KrishiMitra Bedrock Knowledge Base..."
echo "Account: $ACCOUNT_ID | Region: $REGION | Bucket: $BUCKET"

# ── 1. Create IAM Role ───────────────────────────────────────────────────────
echo ""
echo "Step 1: Creating IAM role..."

TRUST_POLICY=$(cat <<TRUST
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Principal": {"Service": "bedrock.amazonaws.com"},
    "Action": "sts:AssumeRole",
    "Condition": {
      "StringEquals": {"aws:SourceAccount": "$ACCOUNT_ID"},
      "ArnLike": {"aws:SourceArn": "arn:aws:bedrock:$REGION:$ACCOUNT_ID:knowledge-base/*"}
    }
  }]
}
TRUST
)

ROLE_ARN=$(aws iam get-role --role-name "$ROLE_NAME" --query "Role.Arn" --output text 2>/dev/null || \
  aws iam create-role --role-name "$ROLE_NAME" \
    --assume-role-policy-document "$TRUST_POLICY" \
    --query "Role.Arn" --output text)

echo "Role ARN: $ROLE_ARN"

# Attach S3 policy
S3_POLICY=$(cat <<S3POL
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Action": ["s3:GetObject", "s3:ListBucket"],
    "Resource": [
      "arn:aws:s3:::$BUCKET",
      "arn:aws:s3:::$BUCKET/*"
    ]
  }, {
    "Effect": "Allow",
    "Action": ["bedrock:InvokeModel"],
    "Resource": "arn:aws:bedrock:$REGION::foundation-model/amazon.titan-embed-text-v2:0"
  }, {
    "Effect": "Allow",
    "Action": ["aoss:APIAccessAll"],
    "Resource": "arn:aws:aoss:$REGION:$ACCOUNT_ID:collection/*"
  }]
}
S3POL
)

aws iam put-role-policy --role-name "$ROLE_NAME" \
  --policy-name "KrishiMitraKBPermissions" \
  --policy-document "$S3_POLICY" 2>/dev/null || true

sleep 10  # IAM propagation

# ── 2. Create OpenSearch Serverless Collection ───────────────────────────────
echo ""
echo "Step 2: Creating OpenSearch Serverless collection..."

# Create encryption policy
aws opensearchserverless create-security-policy \
  --name "krishimitra-enc" \
  --type encryption \
  --policy "{\"Rules\":[{\"Resource\":[\"collection/$COLLECTION_NAME\"],\"ResourceType\":\"collection\"}],\"AWSOwnedKey\":true}" 2>/dev/null || true

# Create network policy (public access for Bedrock to reach it)
aws opensearchserverless create-security-policy \
  --name "krishimitra-net" \
  --type network \
  --policy "[{\"Description\":\"Bedrock KB access\",\"Rules\":[{\"Resource\":[\"collection/$COLLECTION_NAME\"],\"ResourceType\":\"collection\"},{\"Resource\":[\"collection/$COLLECTION_NAME\"],\"ResourceType\":\"dashboard\"}],\"AllowFromPublic\":true}]" 2>/dev/null || true

# Create data access policy
aws opensearchserverless create-access-policy \
  --name "krishimitra-data" \
  --type data \
  --policy "[{\"Description\":\"KB role access\",\"Rules\":[{\"Resource\":[\"collection/$COLLECTION_NAME\"],\"Permission\":[\"aoss:CreateCollectionItems\",\"aoss:DeleteCollectionItems\",\"aoss:UpdateCollectionItems\",\"aoss:DescribeCollectionItems\"]},{\"Resource\":[\"index/$COLLECTION_NAME/*\"],\"Permission\":[\"aoss:CreateIndex\",\"aoss:DeleteIndex\",\"aoss:UpdateIndex\",\"aoss:DescribeIndex\",\"aoss:ReadDocument\",\"aoss:WriteDocument\"]}],\"Principal\":[\"$ROLE_ARN\"]}]" 2>/dev/null || true

# Create collection
COLLECTION_ID=$(aws opensearchserverless list-collections \
  --filters "name=$COLLECTION_NAME" \
  --query "collectionSummaries[0].id" --output text 2>/dev/null | grep -v None || echo "")

if [ -z "$COLLECTION_ID" ] || [ "$COLLECTION_ID" = "None" ]; then
  COLLECTION_ID=$(aws opensearchserverless create-collection \
    --name "$COLLECTION_NAME" \
    --type VECTORSEARCH \
    --description "KrishiMitra agricultural knowledge vector store" \
    --query "createCollectionDetail.id" --output text)
  echo "Collection created: $COLLECTION_ID"

  echo "Waiting for collection to become ACTIVE (this takes 2-3 minutes)..."
  for i in $(seq 1 18); do
    STATUS=$(aws opensearchserverless batch-get-collection \
      --ids "$COLLECTION_ID" \
      --query "collectionDetails[0].status" --output text 2>/dev/null)
    echo "  Status: $STATUS (attempt $i/18)"
    if [ "$STATUS" = "ACTIVE" ]; then break; fi
    sleep 10
  done
else
  echo "Using existing collection: $COLLECTION_ID"
fi

COLLECTION_ARN="arn:aws:aoss:$REGION:$ACCOUNT_ID:collection/$COLLECTION_ID"
COLLECTION_ENDPOINT=$(aws opensearchserverless batch-get-collection \
  --ids "$COLLECTION_ID" \
  --query "collectionDetails[0].collectionEndpoint" --output text 2>/dev/null)

echo "Collection ARN: $COLLECTION_ARN"
echo "Collection Endpoint: $COLLECTION_ENDPOINT"

# ── 3. Create vector index in OSS ───────────────────────────────────────────
echo ""
echo "Step 3: Creating vector index..."

INDEX_BODY=$(cat <<IDXBODY
{
  "settings": {
    "index.knn": true,
    "number_of_shards": 1,
    "number_of_replicas": 0
  },
  "mappings": {
    "properties": {
      "bedrock-knowledge-base-default-vector": {
        "type": "knn_vector",
        "dimension": 1024,
        "method": {
          "name": "hnsw",
          "space_type": "cosine",
          "engine": "faiss"
        }
      },
      "AMAZON_BEDROCK_TEXT_CHUNK": {"type": "text", "index": "false"},
      "AMAZON_BEDROCK_METADATA": {"type": "text", "index": "false"},
      "id": {"type": "text"}
    }
  }
}
IDXBODY
)

curl -s -X PUT \
  -H "Content-Type: application/json" \
  -H "X-Amz-Security-Token: $AWS_SESSION_TOKEN" \
  --aws-sigv4 "aws:amz:$REGION:aoss" \
  --user "$AWS_ACCESS_KEY_ID:$AWS_SECRET_ACCESS_KEY" \
  "$COLLECTION_ENDPOINT/$INDEX_NAME" \
  -d "$INDEX_BODY" 2>/dev/null | head -c 200 || echo "(index creation attempted)"

# ── 4. Create Bedrock Knowledge Base ────────────────────────────────────────
echo ""
echo "Step 4: Creating Knowledge Base..."

KB_CONFIG=$(cat <<KBCONF
{
  "name": "$KB_NAME",
  "description": "Agricultural knowledge base for KrishiMitra AI — government schemes, crop guides, IPM guidelines",
  "roleArn": "$ROLE_ARN",
  "knowledgeBaseConfiguration": {
    "type": "VECTOR",
    "vectorKnowledgeBaseConfiguration": {
      "embeddingModelArn": "arn:aws:bedrock:$REGION::foundation-model/amazon.titan-embed-text-v2:0"
    }
  },
  "storageConfiguration": {
    "type": "OPENSEARCH_SERVERLESS",
    "opensearchServerlessConfiguration": {
      "collectionArn": "$COLLECTION_ARN",
      "vectorIndexName": "$INDEX_NAME",
      "fieldMapping": {
        "vectorField": "bedrock-knowledge-base-default-vector",
        "textField": "AMAZON_BEDROCK_TEXT_CHUNK",
        "metadataField": "AMAZON_BEDROCK_METADATA"
      }
    }
  }
}
KBCONF
)

KB_ID=$(aws bedrock-agent list-knowledge-bases \
  --query "knowledgeBaseSummaries[?name=='$KB_NAME'].knowledgeBaseId" \
  --output text 2>/dev/null | grep -v None || echo "")

if [ -z "$KB_ID" ] || [ "$KB_ID" = "None" ]; then
  KB_ID=$(aws bedrock-agent create-knowledge-base \
    --cli-input-json "$KB_CONFIG" \
    --query "knowledgeBase.knowledgeBaseId" --output text)
  echo "Knowledge Base created: $KB_ID"
else
  echo "Using existing KB: $KB_ID"
fi

# ── 5. Add S3 data source ───────────────────────────────────────────────────
echo ""
echo "Step 5: Adding S3 data source..."

DS_CONFIG=$(cat <<DSCONF
{
  "name": "krishimitra-s3-docs",
  "description": "Agricultural documents from S3",
  "dataSourceConfiguration": {
    "type": "S3",
    "s3Configuration": {
      "bucketArn": "arn:aws:s3:::$BUCKET",
      "inclusionPrefixes": ["agricultural-knowledge/"]
    }
  },
  "vectorIngestionConfiguration": {
    "chunkingConfiguration": {
      "chunkingStrategy": "FIXED_SIZE",
      "fixedSizeChunkingConfiguration": {
        "maxTokens": 512,
        "overlapPercentage": 20
      }
    }
  }
}
DSCONF
)

DS_ID=$(aws bedrock-agent create-data-source \
  --knowledge-base-id "$KB_ID" \
  --cli-input-json "$DS_CONFIG" \
  --query "dataSource.dataSourceId" --output text 2>/dev/null || echo "")

if [ -n "$DS_ID" ] && [ "$DS_ID" != "None" ]; then
  echo "Data source created: $DS_ID"

  # Start ingestion
  echo ""
  echo "Step 6: Starting ingestion job..."
  INGESTION_JOB_ID=$(aws bedrock-agent start-ingestion-job \
    --knowledge-base-id "$KB_ID" \
    --data-source-id "$DS_ID" \
    --query "ingestionJob.ingestionJobId" --output text)
  echo "Ingestion job started: $INGESTION_JOB_ID"
fi

echo ""
echo "========================================"
echo "KNOWLEDGE BASE SETUP COMPLETE"
echo "  KB ID:     $KB_ID"
echo "  Update packages/backend/.env:"
echo "  BEDROCK_KB_ID=$KB_ID"
echo "========================================"
