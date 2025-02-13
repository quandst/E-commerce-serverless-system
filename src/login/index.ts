import { APIGatewayProxyEventV2, APIGatewayProxyResult } from 'aws-lambda';
import {
    AdminInitiateAuthCommandInput,
    CognitoIdentityProvider,
} from '@aws-sdk/client-cognito-identity-provider';
import { lambdaResponse, tokensToCookies, userProperties } from '../../lib/utils';


interface LoginBody {
    username?: string;
    password?: string;
}

interface LoginResponse extends APIGatewayProxyResult {
    cookies?: string[];
}

// Helper function to safely get environment variables
function getEnvironmentVariable(name: string): string {
    const value = process.env[name];
    if (!value) {
        throw new Error(`Missing environment variable: ${name}`);
    }
    return value;
}

// Function to validate the login body
function validateLoginBody(body: LoginBody): { valid: boolean; error?: { name: string } } {
    if (!body.username || body.username.length < 3 || body.username.includes(' ')) {
        return { valid: false, error: { name: 'UsernameOrEmailInvalidException' } };
    }
    if (!body.password || body.password.length < 6) {
        return { valid: false, error: { name: 'PasswordInvalidException' } };
    }
    return { valid: true };
}

export async function login(
    event: APIGatewayProxyEventV2,
): Promise<LoginResponse> {
    try {
        // 1. Retrieve environment variables safely
        const { userPoolId, userPoolClientId, region } = {
            userPoolId: getEnvironmentVariable('userPoolId'),
            userPoolClientId: getEnvironmentVariable('userPoolClientId'),
            region: getEnvironmentVariable('region'),
        };

        // 2. Parse and validate the request body
        let body: LoginBody;
        try {
            body = JSON.parse(event.body || '{}');
        } catch (parseError) {
            console.error('Error parsing request body:', parseError);
            return lambdaResponse({ message: 'Invalid request body' }, 400);
        }

        const validationResult = validateLoginBody(body);
        if (!validationResult.valid) {
            return lambdaResponse(validationResult.error, 400);
        }

        const { username, password } = body;
        if (!username) {
            return lambdaResponse({ message: 'Username is required' }, 400);
        }

        // 3. Initialize Cognito provider
        const provider = new CognitoIdentityProvider({ region });

        // 4. Authenticate the user
        const loginParams: AdminInitiateAuthCommandInput = {
            UserPoolId: userPoolId,
            ClientId: userPoolClientId,
            AuthFlow: 'ADMIN_NO_SRP_AUTH',
            AuthParameters: {
                USERNAME: username,
                PASSWORD: password || '',
            },
        };

        const { AuthenticationResult: tokens } = await provider.adminInitiateAuth(
            loginParams,
        );

        if (!tokens) {
            console.error('Authentication failed: No tokens received from Cognito');
            return lambdaResponse({ message: 'Authentication failed' }, 401);
        }

        // 5. Convert tokens to cookies
        const cookies = tokensToCookies(tokens);

        // 6. Get user properties and groups
        const userGroups = await provider.adminListGroupsForUser({
            UserPoolId: userPoolId,
            Username: username,
        });

        // 7. Return successful response with tokens and cookies
        return {
            ...lambdaResponse(
                {
                    ...userProperties(userGroups.Groups, { Username: username, UserAttributes: [], $metadata: {} }), // Assuming this function exists
                    tokens,
                },
                200,
            ),
            cookies,
        };

    } catch (error: any) {
        console.error('Error in login function:', error);

        let errorMessage = 'Login failed';
        let statusCode = 500;

        if (error instanceof Error) {
            errorMessage = error.message;
        } else if (error.name === 'UserNotFoundException') {
            errorMessage = 'Invalid username or password';
            statusCode = 400;
        } else if (error.name === 'NotAuthorizedException') {
            errorMessage = 'Invalid username or password';
            statusCode = 401;
        }

        return lambdaResponse({ message: errorMessage }, statusCode);
    }
}
