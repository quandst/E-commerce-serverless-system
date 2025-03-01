import { CognitoIdentityProvider } from '@aws-sdk/client-cognito-identity-provider';
import { APIGatewayProxyEventV2, APIGatewayProxyResult } from 'aws-lambda';

import {
    lambdaResponse,
    LambdaRequestContext,
    userProperties,
} from '../../lib/utils';
import {
    poolData

} from '../config';
export async function auth(
    event: APIGatewayProxyEventV2,
): Promise<APIGatewayProxyResult> {
    try {
        const {
            lambda: { user },
        } = (event.requestContext as any).authorizer as LambdaRequestContext;

        // 👇 return user properties
        const provider = new CognitoIdentityProvider({ region: poolData.region });
        const { Groups } = await provider.adminListGroupsForUser({
            UserPoolId: poolData.userPoolId,
            Username: user?.Username,
        });

        return lambdaResponse(userProperties(Groups, user), 200);
    } catch (error) {
        return lambdaResponse(error, 500);
    }
}
