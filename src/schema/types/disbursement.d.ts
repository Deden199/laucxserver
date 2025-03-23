export interface DisbursementRequest {
    amount: number;
    recipientAccount: string;
    bankCode: string;
    currency: string;
    description?: string | null;
    requestId: string;
}

export interface DisbursementResponse {
    disbursementId: string;
    status: string;
    amount: number;
    recipientAccount: string;
    bankCode: string;
    currency: string;
    description: string | null;
    requestId: string;
}

export interface DisbursementStatusResponse extends DisbursementResponse {}

export interface AccountDetailsResponse {
    accountNumber: string;
    bankCode: string;
    accountName: string;
}
