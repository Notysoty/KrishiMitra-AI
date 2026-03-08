/**
 * OTP delivery abstraction.
 *
 * MockOtpSender — used in development and tests; returns the OTP in the result
 *                 so callers can read it without an actual SMS.
 * SnsOtpSender  — production; sends a real SMS via AWS SNS Direct Publish.
 *                 Never exposes the OTP value to the caller.
 *
 * The active sender is chosen at runtime based on the `SNS_ENABLED` env var.
 */

import { SNSClient, PublishCommand } from '@aws-sdk/client-sns';

export interface OtpSendResult {
  /** Only present when using MockOtpSender (dev/test convenience). */
  devOtp?: string;
}

export interface OtpSender {
  send(phone: string, otp: string): Promise<OtpSendResult>;
}

// ── Mock (dev / test) ──────────────────────────────────────────

export class MockOtpSender implements OtpSender {
  async send(_phone: string, otp: string): Promise<OtpSendResult> {
    // Log so developers can see it without an SMS
    console.info(`[MockOtpSender] OTP for ${_phone}: ${otp}`);
    return { devOtp: otp };
  }
}

// ── AWS SNS (production) ────────────────────────────────────────

export class SnsOtpSender implements OtpSender {
  private client: SNSClient;
  private senderId: string;

  constructor() {
    this.client = new SNSClient({
      region: process.env.AWS_REGION ?? 'ap-south-1',
    });
    // Sender ID shown on the recipient's phone (max 11 alphanumeric chars).
    this.senderId = process.env.SNS_SENDER_ID ?? 'KRISHIM';
  }

  async send(phone: string, otp: string): Promise<OtpSendResult> {
    // Indian numbers: ensure E.164 format (+91XXXXXXXXXX)
    const e164 = phone.startsWith('+') ? phone : `+91${phone}`;
    const message =
      `Your KrishiMitra OTP is: ${otp}. ` +
      `Valid for 5 minutes. Do not share this code.`;

    const command = new PublishCommand({
      PhoneNumber: e164,
      Message: message,
      MessageAttributes: {
        'AWS.SNS.SMS.SenderID': {
          DataType: 'String',
          StringValue: this.senderId,
        },
        'AWS.SNS.SMS.SMSType': {
          DataType: 'String',
          StringValue: 'Transactional',
        },
      },
    });

    await this.client.send(command);
    return {}; // Never expose OTP to caller in production
  }
}

// ── Factory ────────────────────────────────────────────────────

/**
 * Returns the appropriate OtpSender based on environment config.
 * Set `SNS_ENABLED=true` in production to switch to real SMS delivery.
 */
export function createOtpSender(): OtpSender {
  if (process.env.SNS_ENABLED === 'true') {
    return new SnsOtpSender();
  }
  return new MockOtpSender();
}
