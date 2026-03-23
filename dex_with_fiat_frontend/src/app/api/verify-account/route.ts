import { NextRequest, NextResponse } from 'next/server';
import { getPayoutProvider } from '@/lib/payout/providers/registry';
import axios from 'axios';
import { telemetry } from '@/lib/telemetry';

const PAYSTACK_SECRET_KEY = process.env.PAYSTACK_SECRET_KEY;

export async function POST(request: NextRequest) {
    const traceContext = telemetry.extractTraceFromHeaders(request.headers);
    const span = telemetry.createSpan('verify-account', traceContext.spanId, traceContext.traceId);
    
    try {
        telemetry.addLog(span.spanId, 'info', 'Starting account verification', { endpoint: '/api/verify-account' });
        
        const { accountNumber, bankCode } = await request.json();
        
        telemetry.addLog(span.spanId, 'info', 'Request parsed', { 
            hasAccountNumber: !!accountNumber, 
            hasBankCode: !!bankCode,
            bankCode: bankCode
        });

        if (!accountNumber || !bankCode) {
            telemetry.addLog(span.spanId, 'warn', 'Validation failed', { 
                missingFields: { accountNumber: !accountNumber, bankCode: !bankCode } 
            });
            telemetry.finishSpan(span.spanId, { success: false, error: 'Missing required fields' });
            
            return NextResponse.json(
                { success: false, message: 'Account number and bank code are required' },
                { status: 400 }
            );
        }

        const provider = getPayoutProvider();
        const data = await provider.verifyAccount({ accountNumber, bankCode });

        return NextResponse.json({
            success: true,
            data
        });
    } catch (error: unknown) {
        console.error('Account verification error:', error);

        if (error instanceof Error) {
        if (!PAYSTACK_SECRET_KEY) {
            telemetry.addLog(span.spanId, 'warn', 'Using mock account verification (no API key)', { endpoint: '/api/verify-account' });
            
            // Mock verification when API key is missing
            const mockVerification = {
                account_number: accountNumber,
                account_name: 'John Doe', // Mock verified name
                bank_id: parseInt(bankCode)
            };

            await new Promise(resolve => setTimeout(resolve, 1000));
            
            telemetry.addLog(span.spanId, 'info', 'Mock account verification completed', { 
                accountNumber: accountNumber,
                accountName: mockVerification.account_name,
                bankCode: bankCode
            });
            telemetry.finishSpan(span.spanId, { success: true, mock: true });

            const response = NextResponse.json({
                success: true,
                data: mockVerification
            });
            
            telemetry.setTraceHeaders(response.headers, traceContext);
            return response;
        }

        // Call real Paystack API to verify account
        telemetry.addLog(span.spanId, 'info', 'Calling Paystack API', { 
            endpoint: 'https://api.paystack.co/bank/resolve',
            accountNumber: accountNumber,
            bankCode: bankCode
        });
        
        const response = await axios.get(
            `https://api.paystack.co/bank/resolve?account_number=${accountNumber}&bank_code=${bankCode}`,
            {
                headers: {
                    Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`,
                    'Content-Type': 'application/json'
                }
            }
        );

        if (response.data.status && response.data.data) {
            telemetry.addLog(span.spanId, 'info', 'Paystack account verification successful', { 
                accountNumber: response.data.data.account_number,
                accountName: response.data.data.account_name,
                bankId: parseInt(bankCode)
            });
            telemetry.finishSpan(span.spanId, { success: true });
            
            const apiResponse = NextResponse.json({
                success: true,
                data: {
                    account_number: response.data.data.account_number,
                    account_name: response.data.data.account_name,
                    bank_id: parseInt(bankCode)
                }
            });
            
            telemetry.setTraceHeaders(apiResponse.headers, traceContext);
            return apiResponse;
        } else {
            telemetry.addLog(span.spanId, 'error', 'Paystack API returned error', { 
                message: response.data.message,
                status: response.data.status 
            });
            telemetry.finishSpan(span.spanId, { success: false, error: response.data.message });
            
            return NextResponse.json(
                { success: false, message: error.message },
                { status: 400 }
            );
        }
    } catch (error: unknown) {
        telemetry.addLog(span.spanId, 'error', 'Unhandled error in account verification', { 
            error: error instanceof Error ? error.message : 'Unknown error' 
        });
        
        console.error('Account verification error:', error);

        // Check if it's a Paystack API error
        if (error && typeof error === 'object' && 'response' in error &&
            error.response && typeof error.response === 'object' && 'status' in error.response &&
            error.response.status === 422) {
            
            telemetry.finishSpan(span.spanId, { 
                success: false, 
                error: 'Invalid account number or bank code',
                errorType: 'validation_error'
            });
            
            return NextResponse.json(
                { success: false, message: 'Invalid account number or bank code' },
                { status: 400 }
            );
        }

        if (error && typeof error === 'object' && 'response' in error &&
            error.response && typeof error.response === 'object' && 'data' in error.response &&
            error.response.data && typeof error.response.data === 'object' && 'message' in error.response.data) {
            
            telemetry.finishSpan(span.spanId, { 
                success: false, 
                error: (error.response.data as { message: string }).message,
                errorType: 'paystack_api_error'
            });
            
            return NextResponse.json(
                { success: false, message: (error.response.data as { message: string }).message },
                { status: 400 }
            );
        }

        telemetry.finishSpan(span.spanId, { 
            success: false, 
            error: 'Account verification failed. Please try again.',
            errorType: 'unknown_error'
        });
        
        return NextResponse.json(
            { success: false, message: 'Account verification failed. Please try again.' },
            { status: 500 }
        );
    }
}
