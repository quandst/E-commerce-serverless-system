import { CognitoIdentityProvider } from '@aws-sdk/client-cognito-identity-provider';
import { APIGatewayProxyEventV2, APIGatewayProxyResult } from 'aws-lambda';

import { lambdaResponse, KeyValue, constants } from '../../lib/utils';
import { poolData } from '../config';
/**
 * Fetches and aggregates user data from Cognito, including group memberships.
 * @param _event - The API Gateway proxy event.
 * @returns A promise resolving to an API Gateway proxy result containing user data.
 */
export async function users(
    _event: APIGatewayProxyEventV2,
): Promise<APIGatewayProxyResult> {
    try {
        const cognitoProvider = new CognitoIdentityProvider({
            region: poolData.region,
        });

        const userPoolId = poolData.userPoolId;
        if (!userPoolId) {
            console.error('UserPoolId is not defined in environment variables.');
            return lambdaResponse({ message: 'UserPoolId is not defined.' }, 500);
        }

        // Fetch users from different groups concurrently
        const [allUsers, adminGroup, manageProductGroup] = await Promise.all([
            cognitoProvider.listUsers({
                UserPoolId: userPoolId,
                AttributesToGet: ['gender'],
            }),
            cognitoProvider.listUsersInGroup({
                UserPoolId: userPoolId,
                GroupName: constants.groups.admin,
            }),
            cognitoProvider.listUsersInGroup({
                UserPoolId: userPoolId,
                GroupName: constants.groups.product,
            }),
        ]);

        // Map users to their groups
        const userToGroups: KeyValue = {};

        const mapUsersToGroup = (users: any[] | undefined, groupName: string) => {
            users?.forEach((user) => {
                if (user.Username) {
                    userToGroups[user.Username] = groupName;
                }
            });
        };

        mapUsersToGroup(adminGroup.Users, constants.groups.admin);
        mapUsersToGroup(manageProductGroup.Users, constants.groups.product);

        // Normalize user data
        const result: KeyValue[] = [];
        allUsers.Users?.forEach((user) => {
            if (user.Username && user.Attributes && user.UserStatus) {
                const username = user.Username;
                const genderAttribute = user.Attributes.find(
                    (attr) => attr.Name === 'gender',
                );
                const gender = genderAttribute?.Value || '';

                result.push({
                    username,
                    group: userToGroups[username] || '',
                    status: user.UserStatus,
                    gender: gender,
                });
            }
        });

        return lambdaResponse(result, 200);
    } catch (error) {
        console.error('Error fetching users:', error);
        return lambdaResponse({ error: 'Failed to fetch users' }, 500);
    }
}
