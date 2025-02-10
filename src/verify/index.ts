import { APIGatewayProxyEventV2, APIGatewayProxyResult } from 'aws-lambda';
import {
    CognitoIdentityProvider,
    GetUserAttributeVerificationCodeCommandInput,
    VerifyUserAttributeCommandInput,
} from '@aws-sdk/client-cognito-identity-provider';
import { getCookieValue, lambdaResponse } from '../../lib/utils';

interface EnvironmentVariables {
    region: string;
}

interface VerifyEvent {
    queryStringParameters?: {
        code?: string;
    };
    headers: {
        Authorization?: string;
    };
}

// Helper function to safely get environment variables
function getEnvironmentVariable(name: string): string {
    const value = process.env[name];
    if (!value) {
        throw new Error(`Missing environment variable: ${name}`);
    }
    return value;
}

export async function verify(
    event: APIGatewayProxyEventV2 & VerifyEvent,
): Promise<APIGatewayProxyResult> {
    try {
        // 1. Retrieve environment variables safely
        const region = getEnvironmentVariable('region');

        // 2. Initialize Cognito provider
        const provider = new CognitoIdentityProvider({ region });

        // 3. Extract access token from cookies
        const accessToken = getCookieValue(event, 'AccessToken') || event.headers.Authorization;

        if (!accessToken) {
            console.warn('Access Token is missing.');
            return lambdaResponse({ message: 'Unauthorized: Access Token is required' }, 401);
        }

        const attributeName = 'email';
        const args: GetUserAttributeVerificationCodeCommandInput = {
            AccessToken: accessToken,
            AttributeName: attributeName,
        };

        // 4. Check if a verification code is provided
        const code = event.queryStringParameters?.code;

        if (code) {
            // 5. Verify the code if provided
            const verifyArgs: VerifyUserAttributeCommandInput = {
                AccessToken: accessToken,
                AttributeName: attributeName,
                Code: code,
            };

            await provider.verifyUserAttribute(verifyArgs);
            console.log('Email verification successful.');
        } else {
            // 6. Request a new verification code if not provided
            await provider.getUserAttributeVerificationCode(args);
            console.log('Verification code requested successfully.');
        }

        // 7. Return successful response
        return {
            body: '',
            statusCode: 204,
        };
    } catch (error: any) {
        console.error('Error in verify function:', error);

        let errorMessage = 'Email verification failed';
        let statusCode = 500;

        if (error instanceof Error) {
            errorMessage = error.message;
        } else if (error.name === 'CodeMismatchException') {
            errorMessage = 'Invalid verification code';
            statusCode = 400;
        } else if (error.name === 'ExpiredCodeException') {
            errorMessage = 'Verification code has expired';
            statusCode = 400;
        } else if (error.name === 'NotAuthorizedException') {
            errorMessage = 'Not authorized to verify email';
            statusCode = 403;
        }

        return lambdaResponse({ message: errorMessage }, statusCode);
    }
}
