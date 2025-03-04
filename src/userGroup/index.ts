import {
    AdminAddUserToGroupRequest,
    CognitoIdentityProvider,
} from '@aws-sdk/client-cognito-identity-provider';
import { HttpMethod } from 'aws-cdk-lib/aws-events';
import { APIGatewayProxyResult, APIGatewayProxyEventV2 } from 'aws-lambda';
import { isAdmin, lambdaResponse, constants } from '../../lib/utils';
import { poolData } from '../config';
export async function userGroup(
    event: APIGatewayProxyEventV2,
): Promise<APIGatewayProxyResult> {
    const username = event.queryStringParameters?.username;
    const groupname = event.pathParameters?.groupname;
    try {
        // 👇 check groupname and username validity
        if (!groupname) {
            return lambdaResponse({ name: 'EmptyGroupException' }, 400);
        }
        if (!username) {
            return lambdaResponse({ name: 'EmptyUsernameException' }, 400);
        }
        console.log(groupname, username);
        if (!isAdmin(event)) {
            return lambdaResponse({ name: 'NotAuthorizedException' }, 400);
        }
        const result = { username, group: groupname };

        const params: AdminAddUserToGroupRequest = {
            GroupName: groupname,
            UserPoolId: poolData.userPoolId!,
            Username: username,
        };
        const provider = new CognitoIdentityProvider({ region: poolData.region });

        // 👇 update or delete user from group
        switch (event.requestContext.http.method) {
            case HttpMethod.POST:
                const { admin, product } = constants.groups;
                if (groupname === admin) {
                    await provider.adminRemoveUserFromGroup({
                        ...params,
                        GroupName: product,
                    });
                } else if (groupname === product) {
                    await provider.adminRemoveUserFromGroup({
                        ...params,
                        GroupName: admin,
                    });
                }
                await provider.adminAddUserToGroup(params);
                break;
            case HttpMethod.DELETE:
                await provider.adminRemoveUserFromGroup(params);
                result.group = '';
                break;
            default:
                return lambdaResponse(
                    { name: `Unsupported route: "${event.requestContext.http.method}"` },
                    400,
                );
        }
        return lambdaResponse(result, 200);
    } catch (error) {
        return lambdaResponse(error, 400);
    }
}
