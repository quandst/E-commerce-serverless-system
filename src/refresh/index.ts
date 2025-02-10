import {
    AdminInitiateAuthCommandInput,
    CognitoIdentityProvider,
} from '@aws-sdk/client-cognito-identity-provider';
import { APIGatewayProxyEventV2, APIGatewayProxyResult } from 'aws-lambda';

import {
    lambdaResponse,
    tokensToCookies,
    getCookieValue,
    userProperties,
} from '../../lib/utils';

interface EnvironmentVariables {
    userPoolId: string;
    userPoolClientId: string;
    region: string;
}

interface RefreshResponse extends APIGatewayProxyResult {
    cookies?: string[];
}

// Helper function to safely get environment variables
function getEnvironmentVariable(name: string): string {
    const value = process.env[name];
    if (!value) {
        throw new Error(`Missing environment variable: ${name}`);
    }
    return value;
}

export async function refresh(
    event: APIGatewayProxyEventV2,
): Promise<RefreshResponse> {
    try {
        // 1. Safely retrieve environment variables
        const { userPoolId, userPoolClientId, region } = {
            userPoolId: getEnvironmentVariable('userPoolId'),
            userPoolClientId: getEnvironmentVariable('userPoolClientId'),
            region: getEnvironmentVariable('region'),
        };

        // 2. Extract and check for the refresh token
        const refreshToken = getCookieValue(event, 'RefreshToken');

        if (!refreshToken) {
            console.warn('Refresh Token is missing.');
            return lambdaResponse({ name: 'InvalidRefreshTokenException', message: 'Refresh token is missing' }, 400);
        }

        // 3. Configure authentication parameters
        const params: AdminInitiateAuthCommandInput = {
            UserPoolId: userPoolId,
            ClientId: userPoolClientId,
            AuthFlow: 'REFRESH_TOKEN_AUTH',
            AuthParameters: {
                REFRESH_TOKEN: refreshToken,
            },
        };

        // 4. Initialize Cognito provider
        const provider = new CognitoIdentityProvider({ region });

        // 5. Initiate authentication to refresh tokens
        const { AuthenticationResult: tokens } = await provider.adminInitiateAuth(
            params,
        );

        if (!tokens) {
            console.error('Token refresh failed: No tokens received from Cognito');
            return lambdaResponse({ message: 'Token refresh failed' }, 401);
        }

        // 6. Convert tokens to cookies
        const cookies = tokensToCookies(tokens);

        // 7. Get user properties using the identity from the token
        const decoded = JSON.parse(Buffer.from(tokens.IdToken.split('.')[1], 'base64').toString());
        const username = decoded['cognito:username'];

        const userGroups = await provider.adminListGroupsForUser({
            UserPoolId: userPoolId,
            Username: username,
        });

        // 8. Return successful response with refreshed tokens and user properties
        return {
            ...lambdaResponse(
                {
                    ...userProperties(userGroups.Groups, { Username: username }),
                    tokens,
                },
                200,
            ),
            cookies,
        };
    } catch (error: any) {
        console.error('Error in refresh function:', error);

        let errorMessage = 'Token refresh failed';
        let statusCode = 500;

        if (error instanceof Error) {
            errorMessage = error.message;
        } else if (error.name === 'NotAuthorizedException') {
            errorMessage = 'Invalid refresh token';
            statusCode = 401;
        } else if (error.name === 'UserNotFoundException') {
            errorMessage = 'User not found';
            statusCode = 404;
        }

        return lambdaResponse({ message: errorMessage }, statusCode);
    }
}
