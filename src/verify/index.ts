import { APIGatewayProxyEventV2, APIGatewayProxyResult } from 'aws-lambda';
import {
    CognitoIdentityProvider,
    ExpiredCodeException
} from '@aws-sdk/client-cognito-identity-provider';
import { getCookieValue, lambdaResponse } from '../../lib/utils';
import { poolData } from '../config';

export async function verify(
    event: APIGatewayProxyEventV2,
): Promise<APIGatewayProxyResult> {
    try {
        const provider = new CognitoIdentityProvider({ region: poolData.region });
        const args = {
            AccessToken: getCookieValue(event, 'AccessToken'), // event.headers.authorization,
            AttributeName: 'email',
        };

        // 👇 send or verify code based on query params
        const code = event.queryStringParameters?.code;
        if (code) {
            await provider.verifyUserAttribute({
                ...args,
                Code: code,
            });
            return { statusCode: 204, body: '' };
        } else {
            await provider.getUserAttributeVerificationCode(args);
            return {
                statusCode: 200,
                body: JSON.stringify({ message: 'New verification code sent' }),
            };
        }
    } catch (error) {
        if (error instanceof ExpiredCodeException) {
            return {
                statusCode: 410, // HTTP Gone
                body: JSON.stringify({
                    error: 'EXPIRED_CODE',
                    message: 'Code expired. Please request a new one',
                    resendEndpoint: '/verify' // Guide client to resend
                }),
            };
        }
        return lambdaResponse(error, 500);
    }
}