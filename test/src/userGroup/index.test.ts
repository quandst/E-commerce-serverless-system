import { APIGatewayProxyEventV2 } from 'aws-lambda/trigger/api-gateway-proxy';
import { HttpMethod } from 'aws-cdk-lib/aws-events';
import {
  AdminInitiateAuthCommandInput,
  AdminInitiateAuthCommandOutput,
  CognitoIdentityProvider,
} from '@aws-sdk/client-cognito-identity-provider';

import { authenticationResult } from '../../mockData';
import { userGroup } from '../../../src/userGroup';
import { DeepPartial, LambdaRequestContext } from '../../../lib/utils';

interface CustomAPIGatewayProxyEventV2 extends DeepPartial<APIGatewayProxyEventV2> {
  requestContext: DeepPartial<APIGatewayProxyEventV2['requestContext']> & {
    authorizer?: DeepPartial<LambdaRequestContext>;
  };
  cookies?: string[];
}

describe('UserGroup Service', () => {
  beforeEach(() => {
    jest
      .spyOn(CognitoIdentityProvider.prototype, 'adminInitiateAuth')
      .mockImplementation((_args: AdminInitiateAuthCommandInput) => {
        const result: Partial<AdminInitiateAuthCommandOutput> = {
          AuthenticationResult: authenticationResult,
        };
        return Promise.resolve(result);
      });
    jest
      .spyOn(CognitoIdentityProvider.prototype, 'adminAddUserToGroup')
      .mockReturnValue();
    jest
      .spyOn(CognitoIdentityProvider.prototype, 'adminRemoveUserFromGroup')
      .mockImplementation();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  const expectError = async (
    event: Partial<APIGatewayProxyEventV2>,
    errorMsg: string,
  ) => {
    const actualValue = await userGroup(event as APIGatewayProxyEventV2);
    const value = JSON.parse(actualValue.body);
    expect(value.name).toEqual(errorMsg);
    expect(actualValue.statusCode).toEqual(400);
  };

  const expectTruthy = async (event: Partial<APIGatewayProxyEventV2>) => {
    const actualValue = await userGroup(event as APIGatewayProxyEventV2);
    const value = JSON.parse(actualValue.body);
    if (event.requestContext?.http?.method === HttpMethod.POST) {
      expect(value).toEqual({
        username: 'one',
        group: 'group',
      });
    } else {
      expect(value).toEqual({
        username: 'one',
        group: '',
      });
    }
    expect(actualValue.statusCode).toEqual(200);
  };

  it('should add/delete from user group', async () => {
    let mEvent: CustomAPIGatewayProxyEventV2 = {
      pathParameters: {
        groupname: 'group',
      },
      queryStringParameters: {
        username: 'one',
      },
      requestContext: {
        http: {
          method: HttpMethod.POST,
        },
        authorizer: {
          lambda: {
            accessPayload: {
              'cognito:groups': ['admin_group'],
            },
          },
        },
      },
    };
    await expectTruthy(mEvent as Partial<APIGatewayProxyEventV2>);
    mEvent.requestContext!.http!.method = HttpMethod.DELETE;
    await expectTruthy(mEvent as Partial<APIGatewayProxyEventV2>);
  });

  it('should throw error with invalid credentials', async () => {
    // Invalid GroupName
    let mEvent: Partial<APIGatewayProxyEventV2> = {
      pathParameters: {
        groupname: '',
      },
    };
    await expectError(mEvent, 'EmptyGroupException');

    // Invalid username
    mEvent = {
      pathParameters: {
        groupname: 'group',
      },
      queryStringParameters: {
        username: '',
      },
    };
    await expectError(mEvent, 'EmptyUsernameException');

    // Not Authorized Exception, No Jwt Claim
    const unauthorizedEvent: CustomAPIGatewayProxyEventV2 = {
      pathParameters: {
        groupname: 'group',
      },
      queryStringParameters: {
        username: 'one',
      },
      requestContext: {
        authorizer: {
          lambda: {
            accessPayload: {
              'cognito:groups': [],
            },
          },
        },
      },
    };
    await expectError(unauthorizedEvent, 'NotAuthorizedException');
  });
});