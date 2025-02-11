import {
    AdminAddUserToGroupRequest,
    CognitoIdentityProvider,
} from '@aws-sdk/client-cognito-identity-provider';
import { HttpMethod } from 'aws-cdk-lib/aws-events';
import { APIGatewayProxyResult, APIGatewayProxyEventV2 } from 'aws-lambda';
import { isAdmin, lambdaResponse, constants } from '../../lib/utils';

/**
 * Manages user group assignments in Cognito.
 * @param event - The API Gateway proxy event.
 * @returns A promise resolving to an API Gateway proxy result.
 */
export async function userGroup(
    event: APIGatewayProxyEventV2,
): Promise<APIGatewayProxyResult> {
    try {
        // Extract username and groupname from the event
        const username = event.queryStringParameters?.username;
        const groupname = event.pathParameters?.groupname;

        // Validate input parameters
        if (!groupname) {
            console.warn('Missing groupname parameter.');
            return lambdaResponse({ name: 'EmptyGroupException' }, 400);
        }
        if (!username) {
            console.warn('Missing username parameter.');
            return lambdaResponse({ name: 'EmptyUsernameException' }, 400);
        }

        // Check if the user is authorized to perform this action
        if (!isAdmin(event)) {
            console.warn('User is not authorized.');
            return lambdaResponse({ name: 'NotAuthorizedException' }, 403); // Use 403 for unauthorized requests
        }

        const userPoolId = process.env.userPoolId;
        if (!userPoolId) {
            console.error('UserPoolId is not defined in environment variables.');
            return lambdaResponse({ message: 'UserPoolId is not defined.' }, 500);
        }

        // Initialize Cognito provider
        const cognitoProvider = new CognitoIdentityProvider({
            region: process.env.region,
        });

        // Common parameters for Cognito API calls
        const params: AdminAddUserToGroupRequest = {
            GroupName: groupname,
            UserPoolId: userPoolId,
            Username: username,
        };

        let result = { username, group: groupname };

        // Process based on the HTTP method
        switch (event.requestContext.http.method) {
            case HttpMethod.POST:
                // Add user to group and remove from the other group
                const { admin, product } = constants.groups;

                // Remove the user from the opposite group
                const oppositeGroup = groupname === admin ? product : admin;
                await removeUserFromGroup(cognitoProvider, {
                    ...params,
                    GroupName: oppositeGroup,
                });

                // Add the user to the specified group
                await cognitoProvider.adminAddUserToGroup(params);
                break;

            case HttpMethod.DELETE:
                // Remove user from the specified group
                await cognitoProvider.adminRemoveUserFromGroup(params);
                result = { ...result, group: '' }; // Update group to empty string
                break;

            default:
                // Unsupported HTTP method
                console.warn(`Unsupported HTTP method: ${event.requestContext.http.method}`);
                return lambdaResponse(
                    { name: `Unsupported route: "${event.requestContext.http.method}"` },
                    400,
                );
        }

        return lambdaResponse(result, 200);
    } catch (error) {
        console.error('An error occurred:', error);
        return lambdaResponse({ error: 'An unexpected error occurred.' }, 500); // Return a generic error message
    }
}

/**
 * Removes a user from a Cognito User Pool group.
 * @param cognitoProvider - The CognitoIdentityProvider instance.
 * @param params - Parameters for removing the user from the group.
 */
async function removeUserFromGroup(
    cognitoProvider: CognitoIdentityProvider,
    params: AdminAddUserToGroupRequest,
): Promise<void> {
    try {
        await cognitoProvider.adminRemoveUserFromGroup(params);
    } catch (error) {
        // Log the error but do not re-throw, as removal from the group is not critical
        console.error(`Error removing user from group ${params.GroupName}:`, error);
    }
}
