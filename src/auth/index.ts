import { CognitoIdentityProvider } from '@aws-sdk/client-cognito-identity-provider';
import { APIGatewayProxyEventV2, APIGatewayProxyResult } from 'aws-lambda';

import {
    lambdaResponse,
    LambdaRequestContext,
    userProperties,
} from '../../lib/utils';

// Helper function to safely get environment variables
function getEnvironmentVariable(name: string): string {
    const value = process.env[name];
    if (!value) {
        throw new Error(`Missing environment variable: ${name}`);
    }
    return value;
}

export async function auth(
    event: APIGatewayProxyEventV2,
): Promise<APIGatewayProxyResult> {
    try {
        // 1. Retrieve environment variables safely
        const { region, userPoolId } = {
            region: getEnvironmentVariable('region'),
            userPoolId: getEnvironmentVariable('userPoolId'),
        };

        // 2. Type assertion for the authorizer context
        const authorizerContext = (event.requestContext as any).authorizer as LambdaRequestContext;
        const user = authorizerContext?.lambda?.user;

        if (!user?.Username) {
            console.warn('User information missing from authorizer context.');
            return lambdaResponse({ message: 'Unauthorized: User information missing' }, 401);
        }

        // 3. Initialize Cognito provider
        const provider = new CognitoIdentityProvider({ region });

        // 4. Retrieve user's groups
        const { Groups } = await provider.adminListGroupsForUser({
            UserPoolId: userPoolId,
            Username: user.Username,
        });

        // 5. Transform user properties (assuming userProperties function exists)
        const transformedUserProperties = userProperties(Groups, user);

        // 6. Return successful response
        return lambdaResponse(transformedUserProperties, 200);

    } catch (error: any) {
        console.error('Error in auth function:', error); // Log the error for debugging

        let errorMessage = 'Internal Server Error';
        let statusCode = 500;

        if (error instanceof Error) {
            errorMessage = error.message;
        }

        return lambdaResponse({ message: errorMessage }, statusCode);
    }
}
