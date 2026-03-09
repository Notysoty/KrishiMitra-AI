#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { KrishiMitraStack } from '../lib/krishimitra-stack';

const app = new cdk.App();

const primaryRegion = process.env.CDK_PRIMARY_REGION ?? process.env.CDK_DEFAULT_REGION ?? 'us-east-1';
const replicaRegion = process.env.CDK_REPLICA_REGION ?? 'us-west-2';
const stackName = app.node.tryGetContext('stackName') ?? process.env.CDK_STACK_NAME ?? 'KrishiMitraStack';

new KrishiMitraStack(app, stackName, {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT ?? '730335204711',
    region: primaryRegion,
  },
  primaryRegion,
  replicaRegion,
  description: 'KrishiMitra-AI SaaS Platform - primary infrastructure stack',
});

app.synth();

