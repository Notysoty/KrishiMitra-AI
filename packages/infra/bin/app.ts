#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { KrishiMitraStack } from '../lib/krishimitra-stack';

const app = new cdk.App();

// Primary region stack
new KrishiMitraStack(app, 'KrishiMitraStack', {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION ?? 'ap-south-1', // Mumbai — primary region for India
  },
  primaryRegion: 'ap-south-1',
  replicaRegion: 'ap-southeast-1', // Singapore — DR region
  description: 'KrishiMitra-AI SaaS Platform — primary infrastructure stack',
});

app.synth();
