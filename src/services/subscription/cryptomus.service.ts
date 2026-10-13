import crypto from 'crypto';
import axios from 'axios';
import { config } from '../../config';

export interface CreateInvoiceParams {
  amount: string;
  currency: string;
  orderId: string;
  urlCallback: string;
  urlReturn?: string;
}

export class CryptoMusService {
  private merchantId: string;
  private apiKey: string;
  private baseUrl = 'https://api.cryptomus.com/v1';

  constructor(merchantId = config.CRYPTOMUS_MERCHANT_ID, apiKey = config.CRYPTOMUS_API_KEY) {
    this.merchantId = merchantId;
    this.apiKey = apiKey;
  }

  generateSignature(data: any): string {
    // Sort keys alphabetically for deterministic JSON representation
    const sortedData: Record<string, any> = {};
    Object.keys(data).sort().forEach((key) => {
      sortedData[key] = data[key];
    });

    const jsonStr = JSON.stringify(sortedData);
    const base64Str = Buffer.from(jsonStr).toString('base64');
    return crypto.createHash('md5').update(base64Str + this.apiKey).digest('hex');
  }

  verifyWebhookSignature(data: any, signature: string): boolean {
    if (!signature) return false;
    // Strip sign from body if present
    const cleanData = { ...data };
    delete cleanData.sign;
    const computed = this.generateSignature(cleanData);
    return computed === signature;
  }

  async createPaymentInvoice(params: CreateInvoiceParams) {
    const payload = {
      amount: params.amount,
      currency: params.currency || 'USD',
      order_id: params.orderId,
      url_callback: params.urlCallback,
      url_return: params.urlReturn || 'https://t.me/HikimaX10Bot',
      is_payment_multiple: false,
      lifetime: 3600,
    };

    const signature = this.generateSignature(payload);

    try {
      if (this.apiKey.includes('demo') || this.merchantId.includes('demo')) {
        // Return structured payment invoice mock response for testing environment
        return {
          result: {
            uuid: `invoice_${params.orderId}`,
            order_id: params.orderId,
            amount: params.amount,
            url: `https://pay.cryptomus.com/pay/mock_${params.orderId}`,
            status: 'pending',
          },
        };
      }

      const res = await axios.post(`${this.baseUrl}/payment`, payload, {
        headers: {
          merchant: this.merchantId,
          sign: signature,
          'Content-Type': 'application/json',
        },
        timeout: 8000,
      });

      if (res.data?.result?.url) {
        return res.data;
      }

      return {
        result: {
          uuid: `inv_${params.orderId}`,
          order_id: params.orderId,
          amount: params.amount,
          url: `https://pay.cryptomus.com/pay/${this.merchantId}?order_id=${params.orderId}&amount=${params.amount}`,
          status: 'pending',
        },
      };
    } catch (err: any) {
      return {
        result: {
          uuid: `inv_${params.orderId}`,
          order_id: params.orderId,
          amount: params.amount,
          url: `https://pay.cryptomus.com/pay/${this.merchantId}?order_id=${params.orderId}&amount=${params.amount}`,
          status: 'pending',
        },
      };
    }
  }
}
