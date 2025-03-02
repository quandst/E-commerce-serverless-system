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
import { poolData } from '../config';

export async function refresh(
    event: APIGatewayProxyEventV2,
): Promise<APIGatewayProxyResult & { cookies?: string[] }> {
    try {
        // 👇 check refresh token exists
        const refreshToken = getCookieValue(event, 'RefreshToken');
        console.log('Received cookies:', event.cookies);
        if (!refreshToken)
            return lambdaResponse({ name: 'InvalidRefreshTokenException' }, 400);

        const params: AdminInitiateAuthCommandInput = {
            UserPoolId: poolData.userPoolId,
            ClientId: poolData.userPoolClientId,
            AuthFlow: 'REFRESH_TOKEN_AUTH',
            AuthParameters: {
                REFRESH_TOKEN: refreshToken,
            },
        };
        const provider = new CognitoIdentityProvider({
            region: poolData.region,
        });
        const { AuthenticationResult: tokens } = await provider.adminInitiateAuth(
            params,
        );

        if (!tokens || !tokens.AccessToken) {
            return lambdaResponse({ name: "InvalidTokensException" }, 400);
        }

        // 👇 convert token to cookies
        const cookies = tokensToCookies(tokens);
        // 👇 get user properties
        const user = await provider.getUser({
            AccessToken: tokens!.AccessToken,
        });
        const { Groups } = await provider.adminListGroupsForUser({
            UserPoolId: poolData.userPoolId,
            Username: user.Username,
        });

        return {
            ...lambdaResponse(
                {
                    ...userProperties(Groups, user),
                    tokens,
                },
                200,
            ),
            headers: {
                "Content-Type": "application/json",
                "Set-Cookie": cookies.join(', '), // 👈 Quan trọng: Đặt cookies vào headers
            },
        };
    } catch (error) {
        return lambdaResponse(error, 500);
    }
}
