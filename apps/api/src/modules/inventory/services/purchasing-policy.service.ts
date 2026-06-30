import { Injectable } from '@nestjs/common';
import { PurchaseRequestType } from '@iwana/shared';

export type PurchasingApprovalLevel = 'BUYER' | 'BUYER_MANAGER' | 'DIRECTOR';

export interface PurchasingApprovalPolicyInput {
  requestType: PurchaseRequestType;
  estimatedAmount: number;
  hasQuote: boolean;
  hasException: boolean;
  exceptionReason?: string | null;
  justification?: string | null;
}

export interface PurchasingApprovalPolicyResult {
  canApprove: boolean;
  requiresException: boolean;
  blockingReason: string | null;
  approvalLevel: PurchasingApprovalLevel;
}

export interface PurchasingAwardPolicyInput {
  requestType: PurchaseRequestType;
  requestedQuantity: number;
  existingAwardedQuantity: number;
  newAwardedQuantity: number;
}

@Injectable()
export class PurchasingPolicyService {
  evaluateApproval(input: PurchasingApprovalPolicyInput): PurchasingApprovalPolicyResult {
    const approvalLevel = this.resolveApprovalLevel(input.requestType, input.estimatedAmount);
    const normalizedJustification = input.justification?.trim() ?? '';
    const normalizedExceptionReason = input.exceptionReason?.trim() ?? '';

    if (
      input.requestType === PurchaseRequestType.FREE_PURCHASE &&
      normalizedJustification.length < 30
    ) {
      return {
        canApprove: false,
        requiresException: false,
        blockingReason:
          'Las compras libres requieren una justificación más sólida antes de aprobarse.',
        approvalLevel,
      };
    }

    if (input.requestType === PurchaseRequestType.REPLENISHMENT && !input.hasQuote) {
      return {
        canApprove: false,
        requiresException: false,
        blockingReason:
          'Las solicitudes de reposición requieren al menos una cotización registrada.',
        approvalLevel,
      };
    }

    if (input.requestType === PurchaseRequestType.URGENT_OPERATION && !input.hasQuote) {
      if (!input.hasException || normalizedExceptionReason.length < 20) {
        return {
          canApprove: false,
          requiresException: true,
          blockingReason:
            'Las solicitudes urgentes sin cotización requieren una excepción justificada.',
          approvalLevel,
        };
      }
    }

    return {
      canApprove: true,
      requiresException: input.hasException,
      blockingReason: null,
      approvalLevel,
    };
  }

  validateLineAward(input: PurchasingAwardPolicyInput): string | null {
    const awardedAfterThisOperation = input.existingAwardedQuantity + input.newAwardedQuantity;

    if (awardedAfterThisOperation > input.requestedQuantity) {
      return 'La adjudicación excede la cantidad solicitada en la línea.';
    }

    if (
      input.requestType !== PurchaseRequestType.PROJECT &&
      awardedAfterThisOperation < input.requestedQuantity
    ) {
      return 'Solo las solicitudes de proyecto permiten adjudicaciones parciales por línea.';
    }

    return null;
  }

  private resolveApprovalLevel(
    requestType: PurchaseRequestType,
    estimatedAmount: number,
  ): PurchasingApprovalLevel {
    const normalizedAmount = Number.isFinite(estimatedAmount) ? estimatedAmount : 0;
    const baseLevel =
      normalizedAmount > 5_000_000
        ? 'DIRECTOR'
        : normalizedAmount > 500_000
          ? 'BUYER_MANAGER'
          : 'BUYER';

    if (requestType === PurchaseRequestType.FREE_PURCHASE && baseLevel === 'BUYER') {
      return 'BUYER_MANAGER';
    }

    return baseLevel;
  }
}
