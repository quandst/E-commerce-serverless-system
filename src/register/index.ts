import {
    APIGatewayProxyEventV2,
    APIGatewayProxyResult,
} from 'aws-lambda';
import {
    CognitoIdentityProvider,
    SignUpCommandInput,
} from '@aws-sdk/client-cognito-identity-provider';
import { validate } from 'email-validator';
import { lambdaResponse, tokensToCookies, userProperties } from '../../lib/utils';


interface RegistrationBody {
    username?: string;
    email?: string;
    password?: string;
    gender?: string;
}

interface RegistrationResponse extends APIGatewayProxyResult {
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

// Function to validate the registration body
function validateRegistrationBody(body: RegistrationBody): { valid: boolean; error?: { name: string } } {
    if (!body.username) {
        return { valid: false, error: { name: 'UsernameInvalidException' } };
    }
    const username = (body.username as string).trim().toLowerCase();
    if (username.length < 3 || username.includes(' ')) {
        return { valid: false, error: { name: 'UsernameInvalidException' } };
    }
    if (validate(username)) {
        return { valid: false, error: { name: 'UsernameIsEmailException' } };
    }
    if (!body.email || !validate(body.email)) {
        return { valid: false, error: { name: 'EmailInvalidException' } };
    }
    if (
        !body.gender ||
        (!(body.gender as string).match(/^male$/i) &&
            !(body.gender as string).match(/^female$/i))
    ) {
        return { valid: false, error: { name: 'GenderInvalidException' } };
    }
    if (!body.password || body.password.length < 8) {
        return { valid: false, error: { name: 'PasswordInvalidException' } }; // Example password validation
    }
    return { valid: true };
}

export async function register(
    event: APIGatewayProxyEventV2,
): Promise<RegistrationResponse> {
    try {
        // 1. Retrieve environment variables safely
        const { userPoolId, userPoolClientId, region } = {
            userPoolId: getEnvironmentVariable('userPoolId'),
            userPoolClientId: getEnvironmentVariable('userPoolClientId'),
            region: getEnvironmentVariable('region'),
        };

        // 2. Parse and validate the request body
        let body: RegistrationBody;
        try {
            body = JSON.parse(event.body || '{}');
        } catch (parseError) {
            console.error('Error parsing request body:', parseError);
            return lambdaResponse({ message: 'Invalid request body' }, 400);
        }

        const validationResult = validateRegistrationBody(body);
        if (!validationResult.valid) {
            return lambdaResponse(validationResult.error, 400);
        }

        const { username, email, password, gender } = body;
        const lowerCaseUsername = username!.trim().toLowerCase(); // Use non-null assertion since validated
        const lowerCaseGender = gender!.trim().toLowerCase(); // Use non-null assertion since validated

        // 3. Initialize Cognito provider
        const provider = new CognitoIdentityProvider({ region });

        // 4. Check if email already exists
        const users = await provider.listUsers({
            UserPoolId: userPoolId,
            AttributesToGet: ['email'],
            Filter: `email="${email}"`,
        });

        if (users.Users && users.Users.length > 0) {
            return lambdaResponse({ name: 'EmailExistsException' }, 400);
        }

        // 5. Sign up the user
        const signUpParams: SignUpCommandInput = {
            ClientId: userPoolClientId,
            Username: lowerCaseUsername,
            Password: password!, // Use non-null assertion since validated
            UserAttributes: [
                {
                    Name: 'email',
                    Value: email!, // Use non-null assertion since validated
                },
                {
                    Name: 'gender',
                    Value: lowerCaseGender,
                },
            ],
        };

        await provider.signUp(signUpParams);

        // 6. Auto-confirm the user
        const confirmParams = {
            UserPoolId: userPoolId,
            Username: lowerCaseUsername,
        };
        await provider.adminConfirmSignUp(confirmParams);

        // 7. Authenticate the user to get tokens
        const { AuthenticationResult: tokens } = await provider.adminInitiateAuth({
            ClientId: userPoolClientId,
            UserPoolId: userPoolId,
            AuthFlow: 'ADMIN_NO_SRP_AUTH',
            AuthParameters: {
                USERNAME: lowerCaseUsername,
                PASSWORD: password!, // Use non-null assertion since validated
            },
        });

        // 8. Convert tokens to cookies
        const cookies = tokensToCookies(tokens);

        // 9. Return successful response with tokens and cookies
        return {
            ...lambdaResponse(
                {
                    ...userProperties(), // Assuming this function exists
                    tokens,
                    username: lowerCaseUsername,
                },
                200,
            ),
            cookies,
        };

    } catch (error: any) {
        console.error('Error in register function:', error);

        let errorMessage = 'Registration failed';
        let statusCode = 500;

        if (error instanceof Error) {
            errorMessage = error.message;
        } else if (error.name === 'UsernameExistsException') {
            errorMessage = 'Username already exists';
            statusCode = 400;
        } else if (error.name === 'InvalidPasswordException') {
            errorMessage = 'Invalid password';
            statusCode = 400;
        }

        return lambdaResponse({ message: errorMessage }, statusCode);
    }
}
