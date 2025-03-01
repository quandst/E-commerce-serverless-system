/* eslint-disable @typescript-eslint/require-await */
import {
    APIGatewayProxyEventV2,
    APIGatewayProxyResult,
} from 'aws-lambda/trigger/api-gateway-proxy';
import {
    AttributeValue,
    DynamoDBClient,
    QueryCommandInput,
} from '@aws-sdk/client-dynamodb';
import {
    constants,
    lambdaResponse,
    LambdaRequestContext,
    KeyValue,
    validIntNumber,
    PaymentStatus,
    queryItems,
} from '../../lib/utils';
import { poolData } from '../config';

const { orderTable, readsPerQuery } = constants;

/**
 * Retrieves orders from DynamoDB, optionally filtered by payment status.
 * @param ddbClient - DynamoDB client.
 * @param user - The user ID.
 * @param startKey - Optional key to start the query from.
 * @param limit - Maximum number of items to return.
 * @param category - Optional category to filter orders by (e.g., 'succeeded', 'requested', 'canceled').
 * @returns A promise resolving to a lambda response containing the orders.
 */
const getOrders = async (
    ddbClient: DynamoDBClient,
    user: string,
    startKey: KeyValue<AttributeValue> | undefined,
    limit: number,
    category?: string,
): Promise<APIGatewayProxyResult> => {
    let filterExpression: string | undefined;
    let expressionAttributeValues: Record<string, AttributeValue> = {
        ':user': { S: user },
        ':intent': { S: 'pi_' },
    };
    let expressionAttributeNames: Record<string, string> = {
        '#user': 'user',
        '#intent': 'intent',
    };

    if (category) {
        switch (category) {
            case 'succeeded':
                filterExpression = '#status = :status1';
                expressionAttributeValues[':status1'] = {
                    S: `PAYMENT ${PaymentStatus[PaymentStatus.SUCCEEDED]}`,
                };
                expressionAttributeNames['#status'] = 'status';
                break;
            case 'requested':
                filterExpression = '#status = :status1';
                expressionAttributeValues[':status1'] = {
                    S: `PAYMENT ${PaymentStatus[PaymentStatus.CREATED]}`,
                };
                expressionAttributeNames['#status'] = 'status';
                break;
            case 'canceled':
                filterExpression = '#status = :status1 OR #status = :status2';
                expressionAttributeValues[':status1'] = {
                    S: `PAYMENT ${PaymentStatus[PaymentStatus.FAILED]}`,
                };
                expressionAttributeValues[':status2'] = {
                    S: `PAYMENT ${PaymentStatus[PaymentStatus.CANCELED]}`,
                };
                expressionAttributeNames['#status'] = 'status';
                break;
            default:
                console.warn(`Invalid category: ${category}`);
        }
    }

    const params: QueryCommandInput = {
        TableName: orderTable,
        KeyConditionExpression: '#user = :user AND begins_with(#intent, :intent)',
        ExpressionAttributeNames: expressionAttributeNames,
        ExpressionAttributeValues: expressionAttributeValues,
        FilterExpression: filterExpression,
        Limit: readsPerQuery,
        ExclusiveStartKey: startKey,
        ScanIndexForward: false,
    };

    try {
        const items = await queryItems(ddbClient, params, limit);
        return lambdaResponse(items, 200);
    } catch (error) {
        console.error('Error retrieving orders:', error);
        return lambdaResponse({ error: 'Failed to retrieve orders' }, 500);
    }
};

/**
 * Lambda function to retrieve orders.
 * @param event - API Gateway proxy event.
 * @returns A promise resolving to an API Gateway proxy result containing the orders.
 */
export async function order(
    event: APIGatewayProxyEventV2,
): Promise<APIGatewayProxyResult> {
    try {
        // Extract user information from authorizer
        const claims = (event.requestContext as any).authorizer as LambdaRequestContext;
        const user = claims.lambda.accessPayload.username!;
        const ddbClient = new DynamoDBClient({ region: poolData.region });

        // Parse request body
        let requestBody: KeyValue<AttributeValue> | undefined;
        try {
            requestBody = event.body
                ? (JSON.parse(event.body) as KeyValue<AttributeValue>)
                : undefined;
        } catch (error) {
            console.warn('Invalid request body:', error);
        }

        const params = event.queryStringParameters;

        // Validate and parse limit parameter
        const _limit = params?.limit;
        if (_limit && (!validIntNumber(_limit) || Number(_limit) === 0)) {
            console.warn(`Invalid limit parameter: ${_limit}`);
            return lambdaResponse({ name: 'InvalidLimitException' }, 400);
        }
        const limit = _limit ? Number(_limit) : readsPerQuery;

        // Extract category parameter
        const category = params?.category;

        return await getOrders(ddbClient, user, requestBody, limit, category);
    } catch (error) {
        console.error('An unexpected error occurred:', error);
        return lambdaResponse({ error: 'An unexpected error occurred.' }, 500);
    }
}
