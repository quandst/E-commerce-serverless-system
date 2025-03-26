// import { APIGatewayProxyEventV2, APIGatewayProxyResult } from 'aws-lambda';
// import {
//     AdminInitiateAuthCommandInput,
//     CognitoIdentityProvider,
// } from '@aws-sdk/client-cognito-identity-provider';
// import { lambdaResponse, tokensToCookies, userProperties } from '../../lib/utils';
// import { poolData } from '../config';

// export async function login(
//     event: APIGatewayProxyEventV2,
// ): Promise<APIGatewayProxyResult & { cookies?: string[] }> {
//     try {
//         const body = JSON.parse(event.body || '{}');
//         const username = body?.username;
//         const password = body?.password;

//         // 👇 check username/email or password validity
//         if (!username || username.length < 3 || username.includes(' ')) {
//             return lambdaResponse({ name: 'UsernameOrEmailInvalidException' }, 400);
//         }
//         if (!password || password.length < 6) {
//             return lambdaResponse({ name: 'PasswordInvalidException' }, 400);
//         }
//         const provider = new CognitoIdentityProvider({ region: poolData.region });
//         const loginParams: AdminInitiateAuthCommandInput = {
//             UserPoolId: poolData.userPoolId,
//             ClientId: poolData.userPoolClientId,
//             AuthFlow: 'ADMIN_NO_SRP_AUTH',
//             AuthParameters: {
//                 USERNAME: username,
//                 PASSWORD: password,
//             },
//         };

//         const { AuthenticationResult: tokens } = await provider.adminInitiateAuth(
//             loginParams,
//         );
//         // 👇 convert token to cookies
//         const cookies = tokensToCookies(tokens);
//         if (!tokens) {
//             throw new Error('Authentication failed, tokens are undefined');
//         }
//         // console.log("Generated Cookies:", cookies);
//         // 👇 get user properties
//         const user = await provider.getUser({
//             AccessToken: tokens!.AccessToken,
//         });
//         const { Groups } = await provider.adminListGroupsForUser({
//             UserPoolId: poolData.userPoolId,
//             Username: user.Username,
//         });

//         return {
//             ...lambdaResponse(
//                 {
//                     ...userProperties(Groups, user),
//                     tokens,
//                 },
//                 200,
//             ),
//             cookies,
//         };
//     } catch (error) {
//         return lambdaResponse(error, 500);
//     }
// }

import { APIGatewayProxyEventV2, APIGatewayProxyResult } from 'aws-lambda';
import {
    AdminInitiateAuthCommandInput,
    CognitoIdentityProvider,
} from '@aws-sdk/client-cognito-identity-provider';
import { lambdaResponse, tokensToCookies, userProperties } from '../../lib/utils';
import { poolData } from '../config';
import Joi from 'joi';

// Initialize Cognito client
const provider = new CognitoIdentityProvider({ region: poolData.region });

export async function login(
    event: APIGatewayProxyEventV2,
): Promise<APIGatewayProxyResult & { cookies?: string[] }> {
    try {
        const body = JSON.parse(event.body || '{}');

        // Input validation using Joi
        const { error, value } = validateLoginInput(body);
        if (error) {
            return lambdaResponse({ name: 'ValidationError', message: error.details[0].message }, 400);
        }

        const { username, password } = value;

        // Authenticate user with Cognito
        const tokens = await authenticateUser(username, password);
        if (!tokens) {
            throw new Error('Authentication failed: Tokens are incomplete');
        }

        // Convert tokens to cookies
        const cookies = tokensToCookies(tokens);

        // Fetch user and group data concurrently
        const [user, groups] = await Promise.all([
            fetchUserDetails(tokens.AccessToken!),
            fetchUserGroups(username),
        ]);

        // Include tokens in the response body
        const responseBody = {
            ...userProperties(groups.Groups, user),
            tokens, // Add the tokens object here
        };

        // Return success response with tokens in the body and cookies
        return {
            ...lambdaResponse(responseBody, 200),
            cookies,
        };
    } catch (error) {
        console.error('Login error:', error);
        return handleLoginError(error);
    }
}

// Helper function to validate login input
function validateLoginInput(body: any) {
    const schema = Joi.object({
        username: Joi.string().min(3).max(50).required(),
        password: Joi.string().min(6).required(),
    });
    return schema.validate(body);
}

// Helper function to authenticate user
async function authenticateUser(username: string, password: string) {
    const loginParams: AdminInitiateAuthCommandInput = {
        UserPoolId: poolData.userPoolId,
        ClientId: poolData.userPoolClientId,
        AuthFlow: 'ADMIN_NO_SRP_AUTH',
        AuthParameters: {
            USERNAME: username,
            PASSWORD: password,
        },
    };

    const { AuthenticationResult: tokens } = await provider.adminInitiateAuth(loginParams);
    if (!tokens?.AccessToken || !tokens?.IdToken || !tokens?.RefreshToken) {
        throw new Error('Authentication failed: Tokens are incomplete');
    }
    return tokens;
}

// Helper function to fetch user details
async function fetchUserDetails(accessToken: string) {
    return provider.getUser({ AccessToken: accessToken });
}

// Helper function to fetch user groups
async function fetchUserGroups(username: string) {
    return provider.adminListGroupsForUser({
        UserPoolId: poolData.userPoolId,
        Username: username,
    });
}

// Helper function to handle login errors
function handleLoginError(error: any) {
    if (error.name === 'UserNotFoundException') {
        return lambdaResponse({ name: 'UserNotFoundException', message: 'User not found' }, 404);
    }
    if (error.name === 'NotAuthorizedException') {
        return lambdaResponse({ name: 'NotAuthorizedException', message: 'Invalid credentials' }, 401);
    }
    return lambdaResponse({ name: 'InternalServerError', message: 'Something went wrong' }, 500);
}