import { ServiceUnavailableException } from "@nestjs/common";

export const PAYMENT_PROVIDER = Symbol("PAYMENT_PROVIDER");

export interface PaymentPurchaseRequest {
  readonly eventId: string;
  readonly requestedByUserId: string;
  /** Credit units the settled payment grants. Never a currency amount. */
  readonly units: number;
  /** Caller-owned idempotency reference reused for the ledger entry. */
  readonly reference: string;
}

export interface PaymentSettlement {
  readonly providerReference: string;
  readonly units: number;
  readonly settledAt: Date;
}

/**
 * Commercial pricing, currencies, and tax handling are deliberately absent:
 * they are Stage 10 business decisions. This interface only describes how a
 * settled payment becomes credit units so the ledger stays provider-neutral.
 */
export interface PaymentProvider {
  readonly activated: boolean;
  settlePurchase(request: PaymentPurchaseRequest): Promise<PaymentSettlement>;
}

/** The implementation used while `PAYMENTS_ENABLED` is off. */
export class DisabledPaymentProvider implements PaymentProvider {
  public readonly activated = false;

  public settlePurchase(): Promise<PaymentSettlement> {
    return Promise.reject(
      new ServiceUnavailableException({
        code: "PAYMENTS_NOT_ACTIVATED",
        message: "Online payments are not activated in this environment.",
      }),
    );
  }
}
