import Razorpay from "razorpay";
import crypto from "crypto";
import dotenv from "dotenv";
import path from "path";
dotenv.config({ path: path.join(".env") });
export class RazorpayService {
  private razorpay: Razorpay;

  constructor(RAZORPAY_KEY_ID: string, RAZORPAY_KEY_SECRET: string) {
    this.razorpay = new Razorpay({
      key_id: RAZORPAY_KEY_ID!,
      key_secret: RAZORPAY_KEY_SECRET!,
    });
  }

  /* =====================================================
     CREATE PAYMENT LINK
     ===================================================== */
  async createPaymentLink(params: {
    amount: number;              // in rupees
    customerName: string;
    customerPhone: string;       // 10 digit number
    description: string;
    referenceId?: string;        // optional (order id)
  }) {
    return await this.razorpay.paymentLink.create({
      amount: params.amount * 100, // convert to paise
      currency: "INR",
      description: params.description,
      reference_id: params.referenceId,
      customer: {
        name: params.customerName,
        contact: params.customerPhone,
      },
      notify: {
        sms: true,
        email: false,
      },
      reminder_enable: true,
    });
  }

  /* =====================================================
     VERIFY WEBHOOK SIGNATURE
     ===================================================== */
  verifyWebhookSignature(
    payload: any,
    razorpaySignature: string
  ): boolean {
    const expectedSignature = crypto
      .createHmac("sha256", process.env.RAZORPAY_WEBHOOK_SECRET!)
      .update(JSON.stringify(payload))
      .digest("hex");

    return expectedSignature === razorpaySignature;
  }

  /* =====================================================
     EXTRACT PAYMENT INFO (on success)
     ===================================================== */
  getPaymentInfoFromWebhook(payload: any) {
    const paymentLink = payload?.payload?.payment_link?.entity;
    const payment = payload?.payload?.payment?.entity;

    return {
      paymentLinkId: paymentLink?.id,
      paymentId: payment?.id,
      status: payment?.status,
      amount: payment?.amount
        ? payment.amount / 100
        : undefined,
      customerPhone: paymentLink?.customer?.contact,
      customerName: paymentLink?.customer?.name,
    };
  }
}
