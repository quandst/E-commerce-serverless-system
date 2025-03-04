import { APIGatewayProxyEventV2, APIGatewayProxyResult } from 'aws-lambda';
import {
    AdminInitiateAuthCommandInput,
    CognitoIdentityProvider,
} from '@aws-sdk/client-cognito-identity-provider';
import { lambdaResponse, tokensToCookies, userProperties } from '../../lib/utils';
import { poolData } from '../config';

export async function login(
    event: APIGatewayProxyEventV2,
): Promise<APIGatewayProxyResult & { cookies?: string[] }> {
    try {
        const body = JSON.parse(event.body || '{}');
        const username = body?.username;
        const password = body?.password;

        // 👇 check username/email or password validity
        if (!username || username.length < 3 || username.includes(' ')) {
            return lambdaResponse({ name: 'UsernameOrEmailInvalidException' }, 400);
        }
        if (!password || password.length < 6) {
            return lambdaResponse({ name: 'PasswordInvalidException' }, 400);
        }
        const provider = new CognitoIdentityProvider({ region: poolData.region });
        const loginParams: AdminInitiateAuthCommandInput = {
            UserPoolId: poolData.userPoolId,
            ClientId: poolData.userPoolClientId,
            AuthFlow: 'ADMIN_NO_SRP_AUTH',
            AuthParameters: {
                USERNAME: username,
                PASSWORD: password,
            },
        };
        // const { AuthenticationResult: tokens } = await provider.adminInitiateAuth(
        //     loginParams,
        // );

        const { AuthenticationResult: tokens } = await provider.adminInitiateAuth(
            loginParams,
        );


        // 👇 convert token to cookies
        const cookies = tokensToCookies(tokens);
        if (!tokens) {
            throw new Error('Authentication failed, tokens are undefined');
        }

        console.log("Generated Cookies:", cookies);

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
            cookies,
        };
    } catch (error) {
        return lambdaResponse(error, 500);
    }
}
