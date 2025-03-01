import { APIGatewayProxyEventV2, APIGatewayProxyResult } from 'aws-lambda';
import {
    RevokeTokenCommandInput,
    CognitoIdentityProvider,
} from '@aws-sdk/client-cognito-identity-provider';
import { getCookieValue, tokensToCookies } from '../../lib/utils';
import { poolData } from '../config';

export async function logout(
    event: APIGatewayProxyEventV2,
): Promise<APIGatewayProxyResult & { cookies: string[] }> {
    const refreshToken = getCookieValue(event, 'RefreshToken');

    // 👇 revoke refresh token if it exists
    if (refreshToken) {
        try {
            const provider = new CognitoIdentityProvider({
                region: poolData.region,
            });

            const params: RevokeTokenCommandInput = {
                ClientId: poolData.userPoolClientId,
                Token: refreshToken,
            };

            await provider.revokeToken(params);
        } finally {
        }
    }

    // 👇 clear cookies on return
    const cookies = tokensToCookies();
    return {
        body: '',
        statusCode: 204,
        cookies,
    };
}
