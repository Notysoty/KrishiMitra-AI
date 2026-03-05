import * as cdk from 'aws-cdk-lib';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import { Construct } from 'constructs';

export interface KrishiMitraIamPoliciesProps {
  knowledgeBucket: s3.Bucket;
  uploadsBucket: s3.Bucket;
  backupsBucket: s3.Bucket;
  dbCredentialsSecret: secretsmanager.Secret;
  aiServiceSecret: secretsmanager.Secret;
  authServiceSecret: secretsmanager.Secret;
  farmServiceSecret: secretsmanager.Secret;
  etlServiceSecret: secretsmanager.Secret;
  adminServiceSecret: secretsmanager.Secret;
}

/**
 * Defines IAM roles and least-privilege policies for each KrishiMitra service.
 * Each ECS task gets its own task role with only the permissions it needs.
 * The shared execution role handles ECR image pulls and CloudWatch log writes.
 */
export class KrishiMitraIamPolicies extends Construct {
  public readonly ecsExecutionRole: iam.Role;
  public readonly authTaskRole: iam.Role;
  public readonly farmTaskRole: iam.Role;
  public readonly aiTaskRole: iam.Role;
  public readonly etlTaskRole: iam.Role;
  public readonly adminTaskRole: iam.Role;

  constructor(scope: Construct, id: string, props: KrishiMitraIamPoliciesProps) {
    super(scope, id);

    this.ecsExecutionRole = this.createEcsExecutionRole(props.dbCredentialsSecret);
    this.authTaskRole = this.createAuthTaskRole(props.authServiceSecret, props.dbCredentialsSecret);
    this.farmTaskRole = this.createFarmTaskRole(props.uploadsBucket, props.farmServiceSecret, props.dbCredentialsSecret);
    this.aiTaskRole = this.createAiTaskRole(props.knowledgeBucket, props.aiServiceSecret);
    this.etlTaskRole = this.createEtlTaskRole(props.etlServiceSecret);
    this.adminTaskRole = this.createAdminTaskRole(
      props.knowledgeBucket,
      props.uploadsBucket,
      props.backupsBucket,
      props.adminServiceSecret,
      props.dbCredentialsSecret
    );
  }

  /**
   * Shared ECS Task Execution Role — used by ECS agent to pull images and write logs.
   * Does NOT grant application-level permissions.
   */
  private createEcsExecutionRole(dbCredentials: secretsmanager.Secret): iam.Role {
    const role = new iam.Role(this, 'EcsExecutionRole', {
      roleName: 'krishimitra-ecs-execution-role',
      assumedBy: new iam.ServicePrincipal('ecs-tasks.amazonaws.com'),
      description: 'ECS task execution role — ECR pull, CloudWatch logs, Secrets injection',
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AmazonECSTaskExecutionRolePolicy'),
      ],
    });

    // Allow ECS to inject DB credentials as environment variables
    dbCredentials.grantRead(role);

    return role;
  }

  /**
   * Auth Service Task Role — Secrets Manager for OTP tokens and JWT secret.
   * No S3 access needed.
   */
  private createAuthTaskRole(
    authSecret: secretsmanager.Secret,
    dbCredentials: secretsmanager.Secret
  ): iam.Role {
    const role = new iam.Role(this, 'AuthTaskRole', {
      roleName: 'krishimitra-auth-task-role',
      assumedBy: new iam.ServicePrincipal('ecs-tasks.amazonaws.com'),
      description: 'Auth service — Secrets Manager for OTP provider and JWT secret',
    });

    authSecret.grantRead(role);
    dbCredentials.grantRead(role);
    this.addXRayAndLogsPolicy(role, 'auth-service');

    return role;
  }

  /**
   * Farm Service Task Role — read/write to user-uploads S3 bucket (crop images).
   */
  private createFarmTaskRole(
    uploadsBucket: s3.Bucket,
    farmSecret: secretsmanager.Secret,
    dbCredentials: secretsmanager.Secret
  ): iam.Role {
    const role = new iam.Role(this, 'FarmTaskRole', {
      roleName: 'krishimitra-farm-task-role',
      assumedBy: new iam.ServicePrincipal('ecs-tasks.amazonaws.com'),
      description: 'Farm service — read/write user uploads bucket',
    });

    uploadsBucket.grantReadWrite(role);
    farmSecret.grantRead(role);
    dbCredentials.grantRead(role);
    this.addXRayAndLogsPolicy(role, 'farm-service');

    return role;
  }

  /**
   * AI Service Task Role — read-only access to knowledge-base S3 bucket.
   * No write access to any data bucket.
   */
  private createAiTaskRole(
    knowledgeBucket: s3.Bucket,
    aiSecret: secretsmanager.Secret
  ): iam.Role {
    const role = new iam.Role(this, 'AiTaskRole', {
      roleName: 'krishimitra-ai-task-role',
      assumedBy: new iam.ServicePrincipal('ecs-tasks.amazonaws.com'),
      description: 'AI service — read-only knowledge base, Secrets Manager for API keys',
    });

    knowledgeBucket.grantRead(role);
    aiSecret.grantRead(role);
    this.addXRayAndLogsPolicy(role, 'ai-service');

    return role;
  }

  /**
   * ETL Service Task Role — write access to data buckets only.
   * No access to knowledge-base or user-uploads.
   */
  private createEtlTaskRole(etlSecret: secretsmanager.Secret): iam.Role {
    const role = new iam.Role(this, 'EtlTaskRole', {
      roleName: 'krishimitra-etl-task-role',
      assumedBy: new iam.ServicePrincipal('ecs-tasks.amazonaws.com'),
      description: 'ETL service — write to market/weather data buckets',
    });

    // ETL writes to dynamically-named data buckets; grant via inline policy
    role.addToPolicy(
      new iam.PolicyStatement({
        sid: 'WriteDataBuckets',
        effect: iam.Effect.ALLOW,
        actions: ['s3:PutObject', 's3:GetObject', 's3:DeleteObject', 's3:ListBucket'],
        resources: [
          `arn:aws:s3:::krishimitra-market-data-${cdk.Stack.of(this).account}`,
          `arn:aws:s3:::krishimitra-market-data-${cdk.Stack.of(this).account}/*`,
          `arn:aws:s3:::krishimitra-weather-data-${cdk.Stack.of(this).account}`,
          `arn:aws:s3:::krishimitra-weather-data-${cdk.Stack.of(this).account}/*`,
        ],
      })
    );

    etlSecret.grantRead(role);
    this.addXRayAndLogsPolicy(role, 'etl-service');

    return role;
  }

  /**
   * Admin Service Task Role — read all buckets for export, write to backups bucket.
   */
  private createAdminTaskRole(
    knowledgeBucket: s3.Bucket,
    uploadsBucket: s3.Bucket,
    backupsBucket: s3.Bucket,
    adminSecret: secretsmanager.Secret,
    dbCredentials: secretsmanager.Secret
  ): iam.Role {
    const role = new iam.Role(this, 'AdminTaskRole', {
      roleName: 'krishimitra-admin-task-role',
      assumedBy: new iam.ServicePrincipal('ecs-tasks.amazonaws.com'),
      description: 'Admin service — read all buckets for export, write backups',
    });

    knowledgeBucket.grantRead(role);
    uploadsBucket.grantRead(role);
    backupsBucket.grantReadWrite(role);
    adminSecret.grantRead(role);
    dbCredentials.grantRead(role);
    this.addXRayAndLogsPolicy(role, 'admin-service');

    return role;
  }

  /**
   * Adds X-Ray tracing and CloudWatch Logs permissions to a role.
   * Every service needs these for observability.
   */
  private addXRayAndLogsPolicy(role: iam.Role, serviceName: string): void {
    role.addToPolicy(
      new iam.PolicyStatement({
        sid: 'XRayTracing',
        effect: iam.Effect.ALLOW,
        actions: ['xray:PutTraceSegments', 'xray:PutTelemetryRecords', 'xray:GetSamplingRules', 'xray:GetSamplingTargets'],
        resources: ['*'],
      })
    );

    role.addToPolicy(
      new iam.PolicyStatement({
        sid: 'CloudWatchLogs',
        effect: iam.Effect.ALLOW,
        actions: ['logs:CreateLogGroup', 'logs:CreateLogStream', 'logs:PutLogEvents'],
        resources: [`arn:aws:logs:*:*:log-group:/krishimitra/${serviceName}:*`],
      })
    );

    role.addToPolicy(
      new iam.PolicyStatement({
        sid: 'CloudWatchMetrics',
        effect: iam.Effect.ALLOW,
        actions: ['cloudwatch:PutMetricData'],
        resources: ['*'],
        conditions: {
          StringEquals: { 'cloudwatch:namespace': 'KrishiMitra/Application' },
        },
      })
    );
  }
}
