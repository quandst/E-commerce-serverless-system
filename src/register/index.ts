// import {
//     APIGatewayProxyEventV2,
//     APIGatewayProxyResult,
// } from 'aws-lambda';
// import {
//     CognitoIdentityProvider,
//     SignUpCommandInput,
// } from '@aws-sdk/client-cognito-identity-provider';
// import { SES, SendEmailCommand } from '@aws-sdk/client-ses'; // Import SES and SendEmailCommand
// import { validate } from 'email-validator';
// import { lambdaResponse, tokensToCookies, userProperties } from '../../lib/utils';
// import { poolData } from '../config';

// // Initialize SES client
// const ses = new SES({ region: poolData.region });

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

//         // console.log("Calling Cognito SignUp...");
//         await provider.signUp(signUpParams);
//         // console.log("SignUp successful");

//         // console.log("Calling AdminConfirmSignUp...");
//         await provider.adminConfirmSignUp(confirmParams);
//         // console.log("User confirmed");

//         // console.log("Initiating Auth...");
//         const authResponse = await provider.adminInitiateAuth({
//             UserPoolId: poolData.userPoolId,
//             ClientId: poolData.userPoolClientId,
//             AuthFlow: 'ADMIN_NO_SRP_AUTH',
//             AuthParameters: {
//                 USERNAME: username,
//                 PASSWORD: password,
//             },
//         });
//         // console.log("Auth Response:", authResponse);

//         const tokens = authResponse.AuthenticationResult;
//         if (!tokens) {
//             throw new Error("AuthenticationResult is undefined");
//         }

//         // 👇 convert token to cookies
//         const cookies = tokensToCookies(tokens);
//         // console.log("Generated Cookies:", cookies);

//         // Send confirmation email using SES
//         const sendEmailParams = {
//             Destination: {
//                 ToAddresses: [email],
//             },
//             Message: {
//                 Body: {
//                     Text: {
//                         Data: `Xin chào ${username},\n\nBạn đã đăng ký thành công tài khoản của mình.`,
//                     },
//                 },
//                 Subject: {
//                     Data: 'Đăng ký tài khoản thành công',
//                 },
//             },
//             Source: 'naquan1309@gmail.com',
//         };

//         try {
//             console.log("Sending email using SES...");
//             await ses.send(new SendEmailCommand(sendEmailParams));
//             console.log("Email sent successfully");
//         } catch (sesError) {
//             console.error("Error sending email:", sesError);
//             // Handle SES error (e.g., log, return an error response)
//         }

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
// import { SES } from '@aws-sdk/client-ses';
import { SQSClient, SendMessageCommand } from '@aws-sdk/client-sqs';
import { validate } from 'email-validator';
import { lambdaResponse, tokensToCookies, userProperties } from '../../lib/utils';
import { poolData } from '../config';

// Initialize SES and Cognito clients
// const ses = new SES({ region: poolData.region });
const cognitoProvider = new CognitoIdentityProvider({ region: poolData.region });

// Initialize SQS client
const sqsClient = new SQSClient({ region: poolData.region });

// URL của hàng đợi SQS
const sqsQueueUrl = 'https://sqs.us-east-1.amazonaws.com/566326047989/SendEmail';

export async function register(
    event: APIGatewayProxyEventV2,
): Promise<APIGatewayProxyResult & { cookies?: string[] }> {
    try {
        const body = JSON.parse(event.body || '{}');

        // Validate input
        const { username, email, password, gender } = validateInput(body);
        if (!username || !email || !password || !gender) {
            return lambdaResponse({ name: 'InvalidInputException' }, 400);
        }

        // Check if email already exists
        const emailExists = await checkEmailExists(email);
        if (emailExists) {
            return lambdaResponse({ name: 'EmailExistsException' }, 400);
        }

        // Register user in Cognito
        await registerUser(username, email, password, gender);

        // Confirm user registration
        await confirmUserRegistration(username);

        // Authenticate user
        const tokens = await authenticateUser(username, password);
        if (!tokens) {
            throw new Error('Authentication failed');
        }

        // Convert tokens to cookies
        const cookies = tokensToCookies(tokens);

        // Send confirmation email
        await sendConfirmationEmail(email, username);

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
        console.error('Error in register function:', error);
        return lambdaResponse(error, 500);
    }
}

// Helper function to validate input
function validateInput(body: any) {
    const username = (body.username as string)?.trim().toLowerCase();
    const email = body.email;
    const password = body.password;
    const gender = (body.gender as string)?.trim().toLowerCase();

    if (!username || username.length < 3 || username.includes(' ')) {
        throw { name: 'UsernameInvalidException' };
    }
    if (validate(username)) {
        throw { name: 'UsernameIsEmailException' };
    }
    if (!validate(email)) {
        throw { name: 'EmailInvalidException' };
    }
    if (!gender || !['male', 'female'].includes(gender)) {
        throw { name: 'GenderInvalidException' };
    }

    return { username, email, password, gender };
}

// Helper function to check if email already exists
async function checkEmailExists(email: string): Promise<boolean> {
    const users = await cognitoProvider.listUsers({
        UserPoolId: poolData.userPoolId,
        AttributesToGet: ['email'],
        Filter: `email="${email}"`,
    });
    return users.Users!.length > 0;
}

// Helper function to register user in Cognito
async function registerUser(username: string, email: string, password: string, gender: string) {
    const signUpParams: SignUpCommandInput = {
        ClientId: poolData.userPoolClientId,
        Username: username,
        Password: password,
        UserAttributes: [
            { Name: 'email', Value: email },
            { Name: 'gender', Value: gender },
        ],
    };
    await cognitoProvider.signUp(signUpParams);
}

// Helper function to confirm user registration
async function confirmUserRegistration(username: string) {
    await cognitoProvider.adminConfirmSignUp({
        UserPoolId: poolData.userPoolId,
        Username: username,
    });
}

// Helper function to authenticate user
async function authenticateUser(username: string, password: string) {
    const authResponse = await cognitoProvider.adminInitiateAuth({
        UserPoolId: poolData.userPoolId,
        ClientId: poolData.userPoolClientId,
        AuthFlow: 'ADMIN_NO_SRP_AUTH',
        AuthParameters: {
            USERNAME: username,
            PASSWORD: password,
        },
    });
    return authResponse.AuthenticationResult;
}

// Helper function to send confirmation email
async function sendConfirmationEmail(email: string, username: string) {
    const messageBody = JSON.stringify({
        to: email,
        subject: 'Đăng ký tài khoản thành công',
        body: `Xin chào ${username},\n\nBạn đã đăng ký thành công tài khoản của mình.`,
        from: 'naquan1309@gmail.com', // Thay thế bằng địa chỉ email đã được xác minh của bạn
    });

    const params = {
        QueueUrl: sqsQueueUrl,
        MessageBody: messageBody,
    };

    try {
        const data = await sqsClient.send(new SendMessageCommand(params));
        console.log('Đã gửi yêu cầu email vào SQS:', data);
    } catch (err) {
        console.error('Lỗi khi gửi tin nhắn vào SQS:', err);
        throw err;
    }
}