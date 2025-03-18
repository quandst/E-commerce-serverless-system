import {
    APIGatewayProxyEventV2,
    APIGatewayProxyResult,
} from 'aws-lambda';
import {
    CognitoIdentityProvider,
    ExpiredCodeException,
} from '@aws-sdk/client-cognito-identity-provider';
import { getCookieValue, lambdaResponse } from '../../lib/utils';
import { poolData } from '../config';
import { SES, SendEmailCommand } from '@aws-sdk/client-ses';
import { DynamoDBClient, PutItemCommand, GetItemCommand } from "@aws-sdk/client-dynamodb";
import { marshall, unmarshall } from "@aws-sdk/util-dynamodb";

const ses = new SES({ region: poolData.region });
const dynamoDbClient = new DynamoDBClient({ region: poolData.region });
const tableName = "YourVerificationTable"; // Thay thế bằng tên bảng DynamoDB của bạn

function generateVerificationCode(): string {
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    return code;
}

export async function verify(
    event: APIGatewayProxyEventV2,
): Promise<APIGatewayProxyResult> {
    try {
        const provider = new CognitoIdentityProvider({ region: poolData.region });
        const accessToken = getCookieValue(event, 'AccessToken');
        const args = {
            AccessToken: accessToken,
            AttributeName: 'email',
        };

        // 👇 send or verify code based on query params
        const code = event.queryStringParameters?.code;
        if (code) {
            // Verify code
            const getItemCommand = new GetItemCommand({
                TableName: tableName,
                Key: marshall({ AccessToken: accessToken }),
            });
            const getItemResult = await dynamoDbClient.send(getItemCommand);
            if (!getItemResult.Item) {
                return lambdaResponse({ error: 'Mã xác minh không hợp lệ' }, 400);
            }
            const storedCode = unmarshall(getItemResult.Item).VerificationCode;
            const codeCreatedAt = unmarshall(getItemResult.Item).CodeCreatedAt;
            const now = Date.now();
            const expirationTime = 10 * 60 * 1000; // 10 phút

            if (now - codeCreatedAt > expirationTime) {
                return lambdaResponse({ error: 'Mã xác minh đã hết hạn' }, 410);
            }

            if (storedCode !== code) {
                return lambdaResponse({ error: 'Mã xác minh không hợp lệ' }, 400);
            }

            await provider.verifyUserAttribute({
                ...args,
                Code: code,
            });
            return { statusCode: 204, body: '' };
        } else {
            // Generate and send code
            const verificationCode = generateVerificationCode();
            const getUserResult = await provider.getUser({ AccessToken: accessToken });
            const email = getUserResult.UserAttributes?.find(attr => attr.Name === 'email')?.Value;
            if (!email) {
                return lambdaResponse({ error: 'Không tìm thấy email' }, 400);
            }

            const sendEmailParams = {
                Destination: { ToAddresses: [email] },
                Message: {
                    Body: {
                        Text: { Data: `Mã xác minh của bạn là: ${verificationCode}` },
                    },
                    Subject: { Data: 'Mã xác minh email' },
                },
                Source: 'naquan1309@gmail.com',
            };

            await ses.send(new SendEmailCommand(sendEmailParams));

            const putItemCommand = new PutItemCommand({
                TableName: tableName,
                Item: marshall({
                    AccessToken: accessToken,
                    VerificationCode: verificationCode,
                    CodeCreatedAt: Date.now(),
                }),
            });

            await dynamoDbClient.send(putItemCommand);

            return {
                statusCode: 200,
                body: JSON.stringify({ message: 'Mã xác minh mới đã được gửi' }),
            };
        }
    } catch (error) {
        if (error instanceof ExpiredCodeException) {
            return {
                statusCode: 410, // HTTP Gone
                body: JSON.stringify({
                    error: 'EXPIRED_CODE',
                    message: 'Mã đã hết hạn. Vui lòng yêu cầu mã mới',
                    resendEndpoint: '/verify', // Hướng dẫn client gửi lại
                }),
            };
        }
        return lambdaResponse(error, 500);
    }
}