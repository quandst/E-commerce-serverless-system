// import {
//     APIGatewayProxyEventV2,
//     APIGatewayProxyResult,
// } from 'aws-lambda';
// import {
//     CognitoIdentityProvider,
//     SignUpCommandInput,
// } from '@aws-sdk/client-cognito-identity-provider';
// import { validate } from 'email-validator';
// import { lambdaResponse, tokensToCookies, userProperties } from '../../lib/utils';
// import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses';
// import { poolData } from '../config';

// export async function register(
//     event: APIGatewayProxyEventV2,
// ): Promise<APIGatewayProxyResult & { cookies?: string[] }> {

//     try {
//         const body = JSON.parse(event.body || '{}');

//         // 👇 check credentials validity
//         if (!body.username) {
//             return lambdaResponse({ name: 'UsernameInvalidException' }, 400);
//         }
//         const username = (body.username as string).trim().toLowerCase();
//         if (username.length < 3 || username.includes(' ')) {
//             return lambdaResponse({ name: 'UsernameInvalidException' }, 400);
//         }
//         if (validate(username)) {
//             return lambdaResponse({ name: 'UsernameIsEmailException' }, 400);
//         }
//         if (!validate(body?.email)) {
//             return lambdaResponse({ name: 'EmailInvalidException' }, 400);
//         }
//         if (
//             !body.gender ||
//             (!(body.gender as string).match(/^male$/i) &&
//                 !(body.gender as string).match(/^female$/i))
//         ) {
//             return lambdaResponse({ name: 'GenderInvalidException' }, 400);
//         }
//         const { email } = body;
//         const { password } = body;
//         const gender = (body.gender as string).trim().toLowerCase();

//         const signUpParams: SignUpCommandInput = {
//             ClientId: poolData.userPoolClientId,
//             Username: username,
//             Password: password,
//             UserAttributes: [
//                 {
//                     Name: 'email',
//                     Value: email,
//                 },
//                 {
//                     Name: 'gender',
//                     Value: gender,
//                 },
//             ],
//         };
//         const confirmParams = {
//             UserPoolId: poolData.userPoolId,
//             Username: username,
//         };
//         const provider = new CognitoIdentityProvider({ region: poolData.region });

//         // 👇 check if username already exists
//         const users = await provider.listUsers({
//             UserPoolId: poolData.userPoolId,
//             AttributesToGet: ['email'],
//             Filter: `email="${email}"`,
//         });

//         if (users.Users!.length > 0) {
//             return lambdaResponse({ name: 'EmailExistsException' }, 400);
//         }

//         console.log("Calling Cognito SignUp...");
//         await provider.signUp(signUpParams);
//         console.log("SignUp successful");

//         console.log("Calling AdminConfirmSignUp...");
//         await provider.adminConfirmSignUp(confirmParams);
//         console.log("User confirmed");

//         // 👇 Send confirmation email using SES
//         const sesClient = new SESClient({ region: poolData.region });
//         const sendEmailCommand = new SendEmailCommand({
//             Source: 'your-verified-email@example.com', // Replace with your verified SES email
//             Destination: {
//                 ToAddresses: [email],
//             },
//             Message: {
//                 Subject: {
//                     Data: 'Welcome to Our Service',
//                 },
//                 Body: {
//                     Text: {
//                         Data: `Thank you for registering, ${username}! Your account has been successfully created.`,
//                     },
//                 },
//             },
//         });

//         console.log("Sending confirmation email...");
//         await sesClient.send(sendEmailCommand);
//         console.log("Confirmation email sent");


//         console.log("Initiating Auth...");
//         const authResponse = await provider.adminInitiateAuth({
//             UserPoolId: poolData.userPoolId,
//             ClientId: poolData.userPoolClientId,
//             AuthFlow: 'ADMIN_NO_SRP_AUTH',
//             AuthParameters: {
//                 USERNAME: username,
//                 PASSWORD: password,
//             },
//         });
//         console.log("Auth Response:", authResponse);

//         const tokens = authResponse.AuthenticationResult;
//         if (!tokens) {
//             throw new Error("AuthenticationResult is undefined");
//         }

//         // 👇 convert token to cookies
//         const cookies = tokensToCookies(tokens);
//         console.log("Generated Cookies:", cookies);

//         return {
//             ...lambdaResponse(
//                 {
//                     ...userProperties(),
//                     tokens,
//                     username,
//                 },
//                 200,
//             ),
//             cookies,
//         };
//     } catch (error) {
//         return lambdaResponse(error, 500);
//     }
// }
import {
    APIGatewayProxyEventV2,
    APIGatewayProxyResult,
} from 'aws-lambda';
import {
    CognitoIdentityProvider,
    SignUpCommandInput,
} from '@aws-sdk/client-cognito-identity-provider';
import { SES, SendEmailCommand } from '@aws-sdk/client-ses'; // Import SES and SendEmailCommand
import { validate } from 'email-validator';
import { lambdaResponse, tokensToCookies, userProperties } from '../../lib/utils';
import { poolData } from '../config';

// Initialize SES client
const ses = new SES({ region: poolData.region });

export async function register(
    event: APIGatewayProxyEventV2,
    // context?: Context,
    // callback?: Callback,
): Promise<APIGatewayProxyResult & { cookies?: string[] }> {

    try {
        const body = JSON.parse(event.body || '{}');

        // 👇 check credentials validity
        if (!body.username) {
            return lambdaResponse({ name: 'UsernameInvalidException' }, 400);
        }
        const username = (body.username as string).trim().toLowerCase();
        if (username.length < 3 || username.includes(' ')) {
            return lambdaResponse({ name: 'UsernameInvalidException' }, 400);
        }
        if (validate(username)) {
            return lambdaResponse({ name: 'UsernameIsEmailException' }, 400);
        }
        if (!validate(body?.email)) {
            return lambdaResponse({ name: 'EmailInvalidException' }, 400);
        }
        if (
            !body.gender ||
            (!(body.gender as string).match(/^male$/i) &&
                !(body.gender as string).match(/^female$/i))
        ) {
            return lambdaResponse({ name: 'GenderInvalidException' }, 400);
        }
        const { email } = body;
        const { password } = body;
        const gender = (body.gender as string).trim().toLowerCase();

        const signUpParams: SignUpCommandInput = {
            ClientId: poolData.userPoolClientId,
            Username: username,
            Password: password,
            UserAttributes: [
                {
                    Name: 'email',
                    Value: email,
                },
                {
                    Name: 'gender',
                    Value: gender,
                },
            ],
        };
        const confirmParams = {
            UserPoolId: poolData.userPoolId,
            Username: username,
        };
        const provider = new CognitoIdentityProvider({ region: poolData.region });

        // 👇 check if username already exists
        const users = await provider.listUsers({
            UserPoolId: poolData.userPoolId,
            AttributesToGet: ['email'],
            Filter: `email="${email}"`,
        });

        if (users.Users!.length > 0) {
            return lambdaResponse({ name: 'EmailExistsException' }, 400);
        }

        console.log("Calling Cognito SignUp...");
        await provider.signUp(signUpParams);
        console.log("SignUp successful");

        console.log("Calling AdminConfirmSignUp...");
        await provider.adminConfirmSignUp(confirmParams);
        console.log("User confirmed");

        console.log("Initiating Auth...");
        const authResponse = await provider.adminInitiateAuth({
            UserPoolId: poolData.userPoolId,
            ClientId: poolData.userPoolClientId,
            AuthFlow: 'ADMIN_NO_SRP_AUTH',
            AuthParameters: {
                USERNAME: username,
                PASSWORD: password,
            },
        });
        console.log("Auth Response:", authResponse);

        const tokens = authResponse.AuthenticationResult;
        if (!tokens) {
            throw new Error("AuthenticationResult is undefined");
        }

        // 👇 convert token to cookies
        const cookies = tokensToCookies(tokens);
        console.log("Generated Cookies:", cookies);

        // Send confirmation email using SES
        const sendEmailParams = {
            Destination: {
                ToAddresses: [email],
            },
            Message: {
                Body: {
                    Text: {
                        Data: `Xin chào ${username},\n\nBạn đã đăng ký thành công tài khoản của mình.`,
                    },
                },
                Subject: {
                    Data: 'Đăng ký tài khoản thành công',
                },
            },
            Source: 'naquan1309@gmail.com', // Thay thế bằng email đã xác minh của bạn
        };

        try {
            console.log("Sending email using SES...");
            await ses.send(new SendEmailCommand(sendEmailParams));
            console.log("Email sent successfully");
        } catch (sesError) {
            console.error("Error sending email:", sesError);
            // Handle SES error (e.g., log, return an error response)
        }

        return {
            ...lambdaResponse(
                {
                    ...userProperties(),
                    tokens,
                    username,
                },
                200,
            ),
            cookies,
        };
    } catch (error) {
        return lambdaResponse(error, 500);
    }
}