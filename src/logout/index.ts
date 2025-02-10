import { APIGatewayProxyEventV2, APIGatewayProxyResult } from 'aws-lambda';
import {
    RevokeTokenCommandInput,
    CognitoIdentityProvider,
} from '@aws-sdk/client-cognito-identity-provider';
import { getCookieValue, tokensToCookies } from '../../lib/utils';

interface EnvironmentVariables {
    userPoolClientId: string;
    region: string;
}

interface LogoutResponse extends APIGatewayProxyResult {
    cookies: string[];
}

// Helper function to safely get environment variables
function getEnvironmentVariable(name: string): string {
    const value = process.env[name];
    if (!value) {
        throw new Error(`Missing environment variable: ${name}`);
    }
    return value;
}

export async function logout(
    event: APIGatewayProxyEventV2,
): Promise<LogoutResponse> {
    // 1. Safely retrieve the refresh token from the cookies
    const refreshToken = getCookieValue(event, 'RefreshToken');

    // 2. Clear cookies (this should always happen)
    const cookies = tokensToCookies(); // Clear all cookies
    const response: LogoutResponse = {
        cookies
    };

    // 3. Revoke refresh token if it exists
    if (refreshToken) {
        try {
            // Safely retrieve environment variables
            const { userPoolClientId, region } = {
                userPoolClientId: getEnvironmentVariable('userPoolClientId'),
                region: getEnvironmentVariable('region'),
            };

            const provider = new CognitoIdentityProvider({ region });

            const params: RevokeTokenCommandInput = {
                ClientId: userPoolClientId,
                Token: refreshToken,
            };

            await provider.revokeToken(params);
            console.log('Refresh token revoked successfully.'); // Log successful revocation
        } catch (error: any) {
            // Log the error - important for debugging
            console.error('Error revoking refresh token:', error);
            // Consider whether to return an error status code or proceed with clearing cookies anyway
            // In most cases, proceeding with clearing cookies is the right approach, as the user is still effectively logged out
        }
    }

    return response;
}
