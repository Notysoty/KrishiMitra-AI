import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as rds from 'aws-cdk-lib/aws-rds';
import * as elasticache from 'aws-cdk-lib/aws-elasticache';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as wafv2 from 'aws-cdk-lib/aws-wafv2';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as ecr from 'aws-cdk-lib/aws-ecr';
import * as elbv2 from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import * as cloudwatchActions from 'aws-cdk-lib/aws-cloudwatch-actions';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as xray from 'aws-cdk-lib/aws-xray';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';
import { KrishiMitraIamPolicies } from './iam-policies';

export interface KrishiMitraStackProps extends cdk.StackProps {
  primaryRegion: string;
  replicaRegion: string;
}

export class KrishiMitraStack extends cdk.Stack {
  // Exported outputs for application configuration
  public readonly vpcId: cdk.CfnOutput;
  public readonly rdsEndpoint: cdk.CfnOutput;
  public readonly redisEndpoint: cdk.CfnOutput;
  public readonly apiGatewayUrl: cdk.CfnOutput;
  public readonly cloudfrontDomain: cdk.CfnOutput;
  public readonly ecsClusterArn: cdk.CfnOutput;
  public readonly knowledgeBucketArn: cdk.CfnOutput;
  public readonly uploadsBucketArn: cdk.CfnOutput;
  public readonly backupsBucketArn: cdk.CfnOutput;

  constructor(scope: Construct, id: string, props: KrishiMitraStackProps) {
    super(scope, id, props);

    // ── 1. VPC & Networking ──────────────────────────────────────────────────
    const vpc = this.createVpc();

    // ── 2. Security Groups ───────────────────────────────────────────────────
    const securityGroups = this.createSecurityGroups(vpc);

    // ── 3. Secrets Manager ───────────────────────────────────────────────────
    const secrets = this.createSecrets();

    // ── 4. Database (RDS PostgreSQL Multi-AZ) ───────────────────────────────
    const database = this.createDatabase(vpc, securityGroups.rds, secrets.dbCredentials);

    // ── 5. Cache (ElastiCache Redis) ─────────────────────────────────────────
    const cache = this.createCache(vpc, securityGroups.redis);

    // ── 6. S3 Buckets ────────────────────────────────────────────────────────
    const buckets = this.createBuckets(props.replicaRegion);

    // ── 7. IAM Roles & Policies ──────────────────────────────────────────────
    const iamPolicies = new KrishiMitraIamPolicies(this, 'IamPolicies', {
      knowledgeBucket: buckets.knowledge,
      uploadsBucket: buckets.uploads,
      backupsBucket: buckets.backups,
      dbCredentialsSecret: secrets.dbCredentials,
      aiServiceSecret: secrets.aiService,
      authServiceSecret: secrets.authService,
      farmServiceSecret: secrets.farmService,
      etlServiceSecret: secrets.etlService,
      adminServiceSecret: secrets.adminService,
    });

    // ── 8. ECS Cluster & Services ────────────────────────────────────────────
    const compute = this.createEcsCluster(vpc, securityGroups.ecs, iamPolicies, secrets);

    // ── 9. CloudFront + S3 Frontend ──────────────────────────────────────────
    const cdn = this.createCloudFront(buckets.frontend);

    // ── 10. API Gateway + WAF ────────────────────────────────────────────────
    const api = this.createApiGateway(vpc, compute.authService);

    // ── 11. CloudWatch Logs, Alarms & Dashboard ──────────────────────────────
    this.createObservability(database.instance, cache.replicationGroup);

    // ── 12. X-Ray Tracing ────────────────────────────────────────────────────
    this.createXRayConfig();

    // ── Outputs ──────────────────────────────────────────────────────────────
    this.vpcId = new cdk.CfnOutput(this, 'VpcId', { value: vpc.vpcId });
    this.rdsEndpoint = new cdk.CfnOutput(this, 'RdsEndpoint', {
      value: database.instance.dbInstanceEndpointAddress,
      description: 'RDS PostgreSQL endpoint',
    });
    this.redisEndpoint = new cdk.CfnOutput(this, 'RedisEndpoint', {
      value: cache.replicationGroup.attrPrimaryEndPointAddress,
      description: 'ElastiCache Redis primary endpoint',
    });
    this.apiGatewayUrl = new cdk.CfnOutput(this, 'ApiGatewayUrl', {
      value: api.restApi.url,
      description: 'API Gateway invoke URL',
    });
    this.cloudfrontDomain = new cdk.CfnOutput(this, 'CloudFrontDomain', {
      value: cdn.distribution.distributionDomainName,
      description: 'CloudFront distribution domain',
    });
    this.ecsClusterArn = new cdk.CfnOutput(this, 'EcsClusterArn', {
      value: compute.cluster.clusterArn,
    });
    this.knowledgeBucketArn = new cdk.CfnOutput(this, 'KnowledgeBucketArn', {
      value: buckets.knowledge.bucketArn,
    });
    this.uploadsBucketArn = new cdk.CfnOutput(this, 'UploadsBucketArn', {
      value: buckets.uploads.bucketArn,
    });
    this.backupsBucketArn = new cdk.CfnOutput(this, 'BackupsBucketArn', {
      value: buckets.backups.bucketArn,
    });
  }

  // ── VPC & Networking ────────────────────────────────────────────────────────
  private createVpc(): ec2.IVpc {
    const existingVpcId = this.node.tryGetContext('existingVpcId');
    if (existingVpcId) {
      return ec2.Vpc.fromLookup(this, 'KrishiMitraVpcLookup', { vpcId: String(existingVpcId) });
    }

    return new ec2.Vpc(this, 'KrishiMitraVpc', {
      maxAzs: 2,
      natGateways: 1, // Single NAT gateway to stay within EIP limits
      subnetConfiguration: [
        {
          name: 'Public',
          subnetType: ec2.SubnetType.PUBLIC,
          cidrMask: 24,
        },
        {
          name: 'Private',
          subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
          cidrMask: 24,
        },
        {
          name: 'Isolated',
          subnetType: ec2.SubnetType.PRIVATE_ISOLATED,
          cidrMask: 28,
        },
      ],
      enableDnsHostnames: true,
      enableDnsSupport: true,
    });
  }

  // ── Security Groups ─────────────────────────────────────────────────────────
  private createSecurityGroups(vpc: ec2.IVpc) {
    const rds = new ec2.SecurityGroup(this, 'RdsSg', {
      vpc,
      description: 'RDS PostgreSQL - allow inbound from ECS tasks only',
      allowAllOutbound: false,
    });

    const redis = new ec2.SecurityGroup(this, 'RedisSg', {
      vpc,
      description: 'ElastiCache Redis - allow inbound from ECS tasks only',
      allowAllOutbound: false,
    });

    const ecs = new ec2.SecurityGroup(this, 'EcsSg', {
      vpc,
      description: 'ECS Fargate tasks - allow outbound to RDS, Redis, and internet',
      allowAllOutbound: true,
    });

    const alb = new ec2.SecurityGroup(this, 'AlbSg', {
      vpc,
      description: 'ALB - allow inbound HTTPS from internet',
      allowAllOutbound: true,
    });
    alb.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(443), 'HTTPS from internet');
    alb.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(80), 'HTTP redirect');

    // Allow ECS tasks to reach RDS on port 5432
    rds.addIngressRule(ecs, ec2.Port.tcp(5432), 'PostgreSQL from ECS');
    // Allow ECS tasks to reach Redis on port 6379
    redis.addIngressRule(ecs, ec2.Port.tcp(6379), 'Redis from ECS');
    // Allow NLB health checks and traffic to reach ECS tasks on port 3000
    // NLB has no SG — traffic comes from VPC CIDR
    ecs.addIngressRule(ec2.Peer.ipv4(vpc.vpcCidrBlock), ec2.Port.tcp(3000), 'NLB to ECS port 3000');

    return { rds, redis, ecs, alb };
  }

  // ── Secrets Manager ─────────────────────────────────────────────────────────
  // Import existing secrets that were created during previous deploy attempts
  // and survived rollback due to RETAIN removal policy.
  private createSecrets() {
    const dbCredentials = secretsmanager.Secret.fromSecretNameV2(
      this, 'DbCredentials', 'krishimitra/db-credentials/primary'
    );

    const aiService = secretsmanager.Secret.fromSecretNameV2(
      this, 'AiServiceSecrets', 'krishimitra/ai-service/api-keys'
    );

    const authService = secretsmanager.Secret.fromSecretNameV2(
      this, 'AuthServiceSecrets', 'krishimitra/auth-service/otp-provider'
    );

    const farmService = secretsmanager.Secret.fromSecretNameV2(
      this, 'FarmServiceSecrets', 'krishimitra/farm-service/config'
    );

    const etlService = secretsmanager.Secret.fromSecretNameV2(
      this, 'EtlServiceSecrets', 'krishimitra/etl-service/api-keys'
    );

    const adminService = secretsmanager.Secret.fromSecretNameV2(
      this, 'AdminServiceSecrets', 'krishimitra/admin-service/config'
    );

    return { dbCredentials, aiService, authService, farmService, etlService, adminService };
  }

  // ── RDS PostgreSQL (Multi-AZ + pgvector) ────────────────────────────────────
  private createDatabase(
    vpc: ec2.IVpc,
    sg: ec2.SecurityGroup,
    credentials: secretsmanager.ISecret
  ) {
    // Parameter group enabling pgvector extension
    const parameterGroup = new rds.ParameterGroup(this, 'RdsParamGroup', {
      engine: rds.DatabaseInstanceEngine.postgres({
        version: rds.PostgresEngineVersion.VER_15_13,
      }),
      description: 'KrishiMitra RDS parameter group - enables pgvector',
      parameters: {
        'shared_preload_libraries': 'pg_stat_statements',
        'log_min_duration_statement': '2000', // Log queries > 2s
        'log_connections': '1',
        'log_disconnections': '1',
        'rds.force_ssl': '1',
      },
    });

    const instance = new rds.DatabaseInstance(this, 'KrishiMitraRds', {
      engine: rds.DatabaseInstanceEngine.postgres({
        version: rds.PostgresEngineVersion.VER_15_13,
      }),
      instanceType: ec2.InstanceType.of(ec2.InstanceClass.T3, ec2.InstanceSize.MEDIUM),
      vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_ISOLATED },
      securityGroups: [sg],
      credentials: rds.Credentials.fromSecret(credentials),
      databaseName: 'krishimitra',
      multiAz: true,
      storageEncrypted: true,
      storageType: rds.StorageType.GP3,
      allocatedStorage: 100,
      maxAllocatedStorage: 500,
      parameterGroup,
      backupRetention: cdk.Duration.days(30),
      preferredBackupWindow: '02:00-03:00',
      preferredMaintenanceWindow: 'sun:04:00-sun:05:00',
      deletionProtection: true,
      enablePerformanceInsights: true,
      performanceInsightRetention: rds.PerformanceInsightRetention.DEFAULT,
      cloudwatchLogsExports: ['postgresql', 'upgrade'],
      cloudwatchLogsRetention: logs.RetentionDays.ONE_MONTH,
      autoMinorVersionUpgrade: true,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    // Tag for pgvector — the extension is enabled via migration SQL (CREATE EXTENSION vector)
    cdk.Tags.of(instance).add('pgvector', 'enabled');

    return { instance };
  }

  // ── ElastiCache Redis ────────────────────────────────────────────────────────
  private createCache(vpc: ec2.IVpc, sg: ec2.SecurityGroup) {
    const subnetGroup = new elasticache.CfnSubnetGroup(this, 'RedisSubnetGroup', {
      description: 'KrishiMitra Redis subnet group',
      subnetIds: vpc.selectSubnets({ subnetType: ec2.SubnetType.PRIVATE_ISOLATED }).subnetIds,
    });

    const replicationGroup = new elasticache.CfnReplicationGroup(this, 'KrishiMitraRedis', {
      replicationGroupDescription: 'KrishiMitra ElastiCache Redis cluster',
      numCacheClusters: 2, // Primary + 1 replica for HA
      cacheNodeType: 'cache.t3.medium',
      engine: 'redis',
      engineVersion: '7.1',
      cacheSubnetGroupName: subnetGroup.ref,
      securityGroupIds: [sg.securityGroupId],
      atRestEncryptionEnabled: true,
      transitEncryptionEnabled: true,
      automaticFailoverEnabled: true,
      multiAzEnabled: true,
      snapshotRetentionLimit: 7,
      snapshotWindow: '03:00-04:00',
      preferredMaintenanceWindow: 'sun:05:00-sun:06:00',
      autoMinorVersionUpgrade: true,
    });

    replicationGroup.addDependency(subnetGroup);

    return { replicationGroup };
  }

  // ── S3 Buckets ───────────────────────────────────────────────────────────────
  // All buckets are imported (already exist from previous deploy attempts or manual creation)
  private createBuckets(_replicaRegion: string) {
    // Knowledge base bucket — import existing bucket (already created manually)
    const knowledge = s3.Bucket.fromBucketName(
      this, 'KnowledgeBaseBucket',
      `krishimitra-knowledge-base-${this.account}`,
    );

    // User uploads bucket — import existing (already created during first deploy attempt)
    const uploads = s3.Bucket.fromBucketName(
      this, 'UserUploadsBucket',
      `krishimitra-user-uploads-${this.account}`,
    );

    // Backups bucket — import existing (already created during first deploy attempt)
    const backups = s3.Bucket.fromBucketName(
      this, 'BackupsBucket',
      `krishimitra-backups-${this.account}`,
    );

    // Frontend PWA static assets bucket — import existing bucket (already created)
    const frontend = s3.Bucket.fromBucketName(
      this, 'FrontendBucket',
      `krishimitra-frontend-${this.account}`,
    );

    return { knowledge, uploads, backups, frontend };
  }

  // ── CloudFront Distribution ──────────────────────────────────────────────────
  private createCloudFront(frontendBucket: s3.IBucket) {
    const oac = new cloudfront.S3OriginAccessControl(this, 'FrontendOac', {
      description: 'OAC for KrishiMitra frontend bucket',
    });

    const distribution = new cloudfront.Distribution(this, 'KrishiMitraCdn', {
      comment: 'KrishiMitra-AI frontend PWA and static assets',
      defaultRootObject: 'index.html',
      defaultBehavior: {
        origin: origins.S3BucketOrigin.withOriginAccessControl(frontendBucket, {
          originAccessControl: oac,
        }),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
        compress: true,
        allowedMethods: cloudfront.AllowedMethods.ALLOW_GET_HEAD_OPTIONS,
      },
      additionalBehaviors: {
        // Service worker must not be cached aggressively
        '/sw.js': {
          origin: origins.S3BucketOrigin.withOriginAccessControl(frontendBucket, {
            originAccessControl: oac,
          }),
          viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
          cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
        },
      },
      errorResponses: [
        // SPA routing — return index.html for 403/404
        { httpStatus: 403, responseHttpStatus: 200, responsePagePath: '/index.html' },
        { httpStatus: 404, responseHttpStatus: 200, responsePagePath: '/index.html' },
      ],
      priceClass: cloudfront.PriceClass.PRICE_CLASS_200, // US, EU, Asia
      minimumProtocolVersion: cloudfront.SecurityPolicyProtocol.TLS_V1_2_2021,
      enableLogging: true,
      logIncludesCookies: false,
    });

    // Allow CloudFront to read from the frontend bucket
    frontendBucket.addToResourcePolicy(
      new iam.PolicyStatement({
        actions: ['s3:GetObject'],
        resources: [frontendBucket.arnForObjects('*')],
        principals: [new iam.ServicePrincipal('cloudfront.amazonaws.com')],
        conditions: {
          StringEquals: {
            'AWS:SourceArn': `arn:aws:cloudfront::${this.account}:distribution/${distribution.distributionId}`,
          },
        },
      })
    );

    return { distribution };
  }

  // ── ECS Cluster & Fargate Services ──────────────────────────────────────────
  private createEcsCluster(
    vpc: ec2.IVpc,
    sg: ec2.SecurityGroup,
    iamPolicies: KrishiMitraIamPolicies,
    secrets: ReturnType<KrishiMitraStack['createSecrets']>
  ) {
    const desiredCountContext = this.node.tryGetContext('serviceDesiredCount');
    const parsedDesiredCount = Number(desiredCountContext);
    const serviceDesiredCount =
      Number.isInteger(parsedDesiredCount) && parsedDesiredCount >= 0 ? parsedDesiredCount : 0;

    const cluster = new ecs.Cluster(this, 'KrishiMitraCluster', {
      vpc,
      containerInsights: true,
      enableFargateCapacityProviders: true,
    });

    // Shared execution role (ECR pull + CloudWatch logs)
    const executionRole = iamPolicies.ecsExecutionRole;

    let hasPrivateWithEgress = false;
    try {
      hasPrivateWithEgress =
        vpc.selectSubnets({ subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS }).subnets.length > 0;
    } catch {
      hasPrivateWithEgress = false;
    }

    const serviceSubnetType = hasPrivateWithEgress
      ? ec2.SubnetType.PRIVATE_WITH_EGRESS
      : ec2.SubnetType.PRIVATE_ISOLATED;

    // Define services: auth, farm, ai, market, etl, admin
    const services = [
      { name: 'auth', taskRole: iamPolicies.authTaskRole, cpu: 512, memory: 1024 },
      { name: 'farm', taskRole: iamPolicies.farmTaskRole, cpu: 512, memory: 1024 },
      { name: 'ai', taskRole: iamPolicies.aiTaskRole, cpu: 1024, memory: 2048 },
      { name: 'market', taskRole: iamPolicies.farmTaskRole, cpu: 512, memory: 1024 },
      { name: 'etl', taskRole: iamPolicies.etlTaskRole, cpu: 1024, memory: 2048 },
      { name: 'admin', taskRole: iamPolicies.adminTaskRole, cpu: 512, memory: 1024 },
    ] as const;

    let authService!: ecs.FargateService;

    for (const svc of services) {
      // Import existing log group (already created during first deploy attempt)
      const logGroup = logs.LogGroup.fromLogGroupName(
        this, `${svc.name}LogGroup`, `/krishimitra/${svc.name}-service`
      );

      const taskDef = new ecs.FargateTaskDefinition(this, `${svc.name}TaskDef`, {
        cpu: svc.cpu,
        memoryLimitMiB: svc.memory,
        executionRole,
        taskRole: svc.taskRole,
        runtimePlatform: {
          operatingSystemFamily: ecs.OperatingSystemFamily.LINUX,
          cpuArchitecture: ecs.CpuArchitecture.X86_64,
        },
      });

      // Placeholder container — replace image with actual ECR repo URI in CI/CD
      const repo = ecr.Repository.fromRepositoryName(
        this,
        `${svc.name}Repo`,
        `krishimitra-${svc.name}-service`
      );

      taskDef.addContainer(`${svc.name}Container`, {
        image: ecs.ContainerImage.fromEcrRepository(repo, 'latest'),
        logging: ecs.LogDrivers.awsLogs({
          logGroup,
          streamPrefix: svc.name,
        }),
        environment: {
          NODE_ENV: 'production',
          SERVICE_NAME: `${svc.name}-service`,
          AWS_REGION: this.region,
          DB_SECRET_NAME: secrets.dbCredentials.secretName,
          SNS_ENABLED: 'true',
          SPEECH_ENABLED: 'true',
          BEDROCK_ENABLED: 'true',
        },
        secrets: {
          DB_PASSWORD: ecs.Secret.fromSecretsManager(secrets.dbCredentials, 'password'),
          DB_USERNAME: ecs.Secret.fromSecretsManager(secrets.dbCredentials, 'username'),
        },
        portMappings: [{ containerPort: 3000 }],
        healthCheck: {
          // node:alpine has no curl — use Node.js built-in http module instead
          command: ['CMD-SHELL', 'node -e "require(\'http\').get(\'http://localhost:3000/health\',r=>process.exit(r.statusCode===200?0:1)).on(\'error\',()=>process.exit(1))"'],
          interval: cdk.Duration.seconds(30),
          timeout: cdk.Duration.seconds(10),
          retries: 3,
          startPeriod: cdk.Duration.seconds(90),
        },
      });

      const fargateService = new ecs.FargateService(this, `${svc.name}Service`, {
        cluster,
        taskDefinition: taskDef,
        desiredCount: serviceDesiredCount,
        securityGroups: [sg],
        vpcSubnets: { subnetType: serviceSubnetType },
        enableExecuteCommand: false,
        circuitBreaker: { rollback: true },
        deploymentController: { type: ecs.DeploymentControllerType.ECS },
        capacityProviderStrategies: [
          { capacityProvider: 'FARGATE', weight: 1 },
          { capacityProvider: 'FARGATE_SPOT', weight: 2 }, // Cost optimisation
        ],
      });

      if (svc.name === 'auth') {
        authService = fargateService;
      }
    }

    return { cluster, authService };
  }

  // ── API Gateway + WAF ────────────────────────────────────────────────────────
  private createApiGateway(vpc: ec2.IVpc, authService: ecs.FargateService) {
    // WAF Web ACL — rate limiting + common rule sets
    const webAcl = new wafv2.CfnWebACL(this, 'KrishiMitraWaf', {
      name: 'krishimitra-api-waf',
      scope: 'REGIONAL',
      defaultAction: { allow: {} },
      visibilityConfig: {
        cloudWatchMetricsEnabled: true,
        metricName: 'KrishiMitraWaf',
        sampledRequestsEnabled: true,
      },
      rules: [
        {
          name: 'AWSManagedRulesCommonRuleSet',
          priority: 1,
          overrideAction: { none: {} },
          statement: {
            managedRuleGroupStatement: {
              vendorName: 'AWS',
              name: 'AWSManagedRulesCommonRuleSet',
            },
          },
          visibilityConfig: {
            cloudWatchMetricsEnabled: true,
            metricName: 'CommonRuleSet',
            sampledRequestsEnabled: true,
          },
        },
        {
          name: 'AWSManagedRulesKnownBadInputsRuleSet',
          priority: 2,
          overrideAction: { none: {} },
          statement: {
            managedRuleGroupStatement: {
              vendorName: 'AWS',
              name: 'AWSManagedRulesKnownBadInputsRuleSet',
            },
          },
          visibilityConfig: {
            cloudWatchMetricsEnabled: true,
            metricName: 'KnownBadInputs',
            sampledRequestsEnabled: true,
          },
        },
        {
          name: 'RateLimitRule',
          priority: 3,
          action: { block: {} },
          statement: {
            rateBasedStatement: {
              limit: 2000, // requests per 5-minute window per IP
              aggregateKeyType: 'IP',
            },
          },
          visibilityConfig: {
            cloudWatchMetricsEnabled: true,
            metricName: 'RateLimit',
            sampledRequestsEnabled: true,
          },
        },
      ],
    });

    // REST API Gateway
    const restApi = new apigateway.RestApi(this, 'KrishiMitraApi', {
      restApiName: 'krishimitra-api',
      description: 'KrishiMitra-AI backend API',
      deployOptions: {
        stageName: 'v1',
        tracingEnabled: true, // X-Ray tracing
        loggingLevel: apigateway.MethodLoggingLevel.INFO,
        dataTraceEnabled: false,
        metricsEnabled: true,
        throttlingBurstLimit: 500,
        throttlingRateLimit: 1000,
      },
      defaultCorsPreflightOptions: {
        allowOrigins: apigateway.Cors.ALL_ORIGINS,
        allowMethods: apigateway.Cors.ALL_METHODS,
        allowHeaders: ['Content-Type', 'Authorization', 'X-Tenant-ID'],
      },
      endpointTypes: [apigateway.EndpointType.REGIONAL],
    });

    // Associate WAF with API Gateway stage — must wait for stage to exist
    const wafAssociation = new wafv2.CfnWebACLAssociation(this, 'ApiWafAssociation', {
      resourceArn: `arn:aws:apigateway:${this.region}::/restapis/${restApi.restApiId}/stages/v1`,
      webAclArn: webAcl.attrArn,
    });
    wafAssociation.node.addDependency(restApi.deploymentStage);

    // ── NLB + VPC Link to route API Gateway → ECS ────────────────────────────
    // All services run the same monorepo backend; route everything via auth service.
    // NLB in the /24 private subnets (sufficient IP space).
    const backendTargetGroup = new elbv2.NetworkTargetGroup(this, 'BackendTargetGroup', {
      vpc,
      port: 3000,
      protocol: elbv2.Protocol.TCP,
      targetType: elbv2.TargetType.IP,
      healthCheck: {
        protocol: elbv2.Protocol.HTTP,
        path: '/health',
        port: '3000',
        healthyHttpCodes: '200',
        interval: cdk.Duration.seconds(30),
        healthyThresholdCount: 2,
        unhealthyThresholdCount: 3,
      },
    });
    authService.attachToNetworkTargetGroup(backendTargetGroup);

    const nlb = new elbv2.NetworkLoadBalancer(this, 'KrishiMitraNlb', {
      vpc,
      internetFacing: false,
      vpcSubnets: {
        subnets: [
          ec2.Subnet.fromSubnetId(this, 'NlbSubnet1', 'subnet-0f6a9113df5495b94'),
          ec2.Subnet.fromSubnetId(this, 'NlbSubnet2', 'subnet-0809ece0148744847'),
        ],
      },
    });
    nlb.addListener('BackendListener', {
      port: 80,
      defaultTargetGroups: [backendTargetGroup],
    });

    const vpcLink = new apigateway.VpcLink(this, 'KrishiMitraVpcLink', {
      targets: [nlb],
      vpcLinkName: 'krishimitra-vpc-link',
    });

    // Route groups — proxy to ECS via NLB + VPC Link
    // Frontend calls /auth/*, /ai/*, etc. (no /api/v1 prefix).
    // Backend Express listens at /api/v1/*. The integration URI adds the prefix.
    const apiRoutes = [
      'auth', 'farms', 'ai', 'markets', 'alerts',
      'sustainability', 'admin', 'disease', 'health',
    ];

    for (const routePath of apiRoutes) {
      const resource = restApi.root.addResource(routePath);

      // Direct method for the resource itself (e.g. GET /health)
      resource.addMethod('ANY', new apigateway.HttpIntegration(
        `http://${nlb.loadBalancerDnsName}/api/v1/${routePath}`,
        {
          httpMethod: 'ANY',
          proxy: true,
          options: {
            connectionType: apigateway.ConnectionType.VPC_LINK,
            vpcLink,
          },
        }
      ));

      // Proxy sub-resource for all child paths (e.g. /auth/send-otp)
      resource.addProxy({
        anyMethod: true,
        defaultIntegration: new apigateway.HttpIntegration(
          `http://${nlb.loadBalancerDnsName}/api/v1/${routePath}/{proxy}`,
          {
            httpMethod: 'ANY',
            proxy: true,
            options: {
              connectionType: apigateway.ConnectionType.VPC_LINK,
              vpcLink,
              requestParameters: {
                'integration.request.path.proxy': 'method.request.path.proxy',
              },
            },
          }
        ),
        defaultMethodOptions: {
          requestParameters: { 'method.request.path.proxy': true },
        },
      });
    }

    return { restApi, webAcl };
  }

  // ── CloudWatch Observability ─────────────────────────────────────────────────
  private createObservability(
    rdsInstance: rds.DatabaseInstance,
    _redisGroup: elasticache.CfnReplicationGroup
  ) {
    const alarmTopic = new sns.Topic(this, 'AlarmTopic', {
      topicName: 'krishimitra-alarms',
      displayName: 'KrishiMitra Infrastructure Alarms',
    });

    // RDS CPU alarm
    new cloudwatch.Alarm(this, 'RdsCpuAlarm', {
      alarmName: 'krishimitra-rds-high-cpu',
      metric: rdsInstance.metricCPUUtilization({ period: cdk.Duration.minutes(5) }),
      threshold: 80,
      evaluationPeriods: 3,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    }).addAlarmAction(new cloudwatchActions.SnsAction(alarmTopic));

    // RDS free storage alarm
    new cloudwatch.Alarm(this, 'RdsFreeStorageAlarm', {
      alarmName: 'krishimitra-rds-low-storage',
      metric: rdsInstance.metricFreeStorageSpace({ period: cdk.Duration.minutes(5) }),
      threshold: 10 * 1024 * 1024 * 1024, // 10 GB
      evaluationPeriods: 2,
      comparisonOperator: cloudwatch.ComparisonOperator.LESS_THAN_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    }).addAlarmAction(new cloudwatchActions.SnsAction(alarmTopic));

    // Application error rate alarm (custom metric from services)
    const errorRateMetric = new cloudwatch.Metric({
      namespace: 'KrishiMitra/Application',
      metricName: 'ErrorRate',
      statistic: 'Average',
      period: cdk.Duration.minutes(5),
    });

    new cloudwatch.Alarm(this, 'AppErrorRateAlarm', {
      alarmName: 'krishimitra-high-error-rate',
      metric: errorRateMetric,
      threshold: 1, // 1% error rate
      evaluationPeriods: 1,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    }).addAlarmAction(new cloudwatchActions.SnsAction(alarmTopic));

    // AI response latency alarm
    const aiLatencyMetric = new cloudwatch.Metric({
      namespace: 'KrishiMitra/AI',
      metricName: 'ResponseLatency',
      statistic: 'p90',
      period: cdk.Duration.minutes(5),
    });

    new cloudwatch.Alarm(this, 'AiLatencyAlarm', {
      alarmName: 'krishimitra-ai-high-latency',
      metric: aiLatencyMetric,
      threshold: 5000, // 5 seconds
      evaluationPeriods: 3,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    }).addAlarmAction(new cloudwatchActions.SnsAction(alarmTopic));

    // CloudWatch Dashboard
    new cloudwatch.Dashboard(this, 'KrishiMitraDashboard', {
      dashboardName: 'KrishiMitra-Overview',
      widgets: [
        [
          new cloudwatch.GraphWidget({
            title: 'RDS CPU Utilization',
            left: [rdsInstance.metricCPUUtilization()],
            width: 12,
          }),
          new cloudwatch.GraphWidget({
            title: 'RDS Free Storage',
            left: [rdsInstance.metricFreeStorageSpace()],
            width: 12,
          }),
        ],
        [
          new cloudwatch.GraphWidget({
            title: 'Application Error Rate',
            left: [errorRateMetric],
            width: 12,
          }),
          new cloudwatch.GraphWidget({
            title: 'AI Response Latency (p90)',
            left: [aiLatencyMetric],
            width: 12,
          }),
        ],
      ],
    });

    // Import existing /app log groups (already created during first deploy attempt)
    const serviceNames = ['auth', 'farm', 'ai', 'market', 'etl', 'admin', 'disease'];
    for (const svc of serviceNames) {
      logs.LogGroup.fromLogGroupName(this, `${svc}AppLogGroup`, `/krishimitra/${svc}-service/app`);
    }
  }

  // ── X-Ray Tracing ────────────────────────────────────────────────────────────
  private createXRayConfig() {
    // X-Ray sampling rule — sample 5% of requests, 100% of errors
    new xray.CfnSamplingRule(this, 'XRaySamplingRule', {
      samplingRule: {
        ruleName: 'KrishiMitraDefaultSampling',
        priority: 1000,
        reservoirSize: 5,
        fixedRate: 0.05,
        urlPath: '*',
        host: '*',
        httpMethod: '*',
        serviceName: 'krishimitra-*',
        serviceType: '*',
        resourceArn: '*',
        version: 1,
      },
    });

    // High-priority rule: always sample AI service calls
    new xray.CfnSamplingRule(this, 'XRayAiSamplingRule', {
      samplingRule: {
        ruleName: 'KrishiMitraAiFullSampling',
        priority: 100,
        reservoirSize: 50,
        fixedRate: 0.5, // 50% of AI requests
        urlPath: '/v1/ai/*',
        host: '*',
        httpMethod: '*',
        serviceName: 'krishimitra-ai-service',
        serviceType: '*',
        resourceArn: '*',
        version: 1,
      },
    });
  }
}





