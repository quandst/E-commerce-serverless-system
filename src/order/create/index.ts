/* eslint-disable @typescript-eslint/require-await */
import {
    APIGatewayProxyEventV2,
    APIGatewayProxyResult,
} from 'aws-lambda/trigger/api-gateway-proxy';
import {
    DynamoDBClient,
    PutItemCommand,
    GetItemCommand,
} from '@aws-sdk/client-dynamodb';
import { marshall } from '@aws-sdk/util-dynamodb';
import {
    UpdateItem,
    OrderTable,
    constants,
    lambdaResponse,
    LambdaRequestContext,
    validIntNumber,
    Orders,
    imageToSlot,
    getProductsById,
    OrderTableKeys,
    KeyValue,
} from '../../../lib/utils';

const { orderTable, cartIntent, orderLogs, cartStatus } = constants;

/**
 * Creates or updates an order in DynamoDB.
 * @param ddbClient - DynamoDB client.
 * @param orders - Array of order items.
 * @param user - The user ID.
 * @returns A promise resolving to a lambda response containing the created or updated order.
 */
const createOrder = async (
    ddbClient: DynamoDBClient,
    orders: Orders[],
    user: string,
): Promise<APIGatewayProxyResult> => {
    try {
        // Validate order input
        if (!Array.isArray(orders)) {
            console.warn('Invalid order format.');
            return lambdaResponse({ name: 'InvalidOrderException' }, 400);
        }

        const createUpdate: Partial<OrderTable> = {
            createdAt: Date.now(),
            status: cartStatus,
            logs: orderLogs,
            orders: [],
            amount: 0,
        };

        // Filter and validate product IDs from orders
        const validProductIds: KeyValue<boolean> = {};
        orders.forEach(({ productId, count }) => {
            if (
                productId &&
                count &&
                validIntNumber(count.toString()) &&
                count > 0
            ) {
                validProductIds[productId] = true;
            }
        });

        // Fetch valid products by IDs
        const products = await getProductsById(
            Object.keys(validProductIds),
            ddbClient,
        );

        // Build order and calculate amount
        orders.forEach(({ productId, count }) => {
            const product = products[productId];
            if (product) {
                createUpdate.orders!.push({
                    slot: imageToSlot(product),
                    productId: product.id,
                    name: product.name,
                    category: product.category,
                    price: product.price,
                    count,
                });
                createUpdate.amount! += count * product.price;
            }
        });

        // Round amount to 2 decimal places
        createUpdate.amount =
            Math.round((createUpdate.amount! + Number.EPSILON) * 100) / 100;

        // Check if cart intent exists
        const { Item } = await ddbClient.send(
            new GetItemCommand({
                TableName: orderTable,
                Key: marshall({ user, intent: cartIntent }),
                AttributesToGet: ['intent'] as OrderTableKeys[],
            }),
        );

        // Create or update order in DynamoDB
        if (!Item) {
            createUpdate.user = user;
            createUpdate.intent = cartIntent;
            await ddbClient.send(
                new PutItemCommand({
                    TableName: orderTable,
                    Item: marshall(createUpdate),
                }),
            );
        } else {
            await UpdateItem(ddbClient, orderTable, createUpdate, {
                user,
                intent: cartIntent,
            });
            createUpdate.user = user;
            createUpdate.intent = cartIntent;
        }

        return lambdaResponse(createUpdate, 200);
    } catch (error) {
        console.error('Error creating or updating order:', error);
        return lambdaResponse({ error: 'Failed to create or update order' }, 500);
    }
};

/**
 * Lambda function to create an order.
 * @param event - API Gateway proxy event.
 * @returns A promise resolving to an API Gateway proxy result.
 */
export async function orderCreate(
    event: APIGatewayProxyEventV2,
): Promise<APIGatewayProxyResult> {
    try {
        // Extract user information from authorizer
        const claims = (event.requestContext as any).authorizer?.lambda as LambdaRequestContext;
        const user = claims.lambda.accessPayload.username!;

        // Parse request body
        let requestBody: Orders[];
        try {
            requestBody = JSON.parse(event.body || '[]');
        } catch (error) {
            console.warn('Invalid request body:', error);
            return lambdaResponse({ name: 'InvalidRequestBodyException' }, 400);
        }

        const ddbClient = new DynamoDBClient({ region: process.env.region });
        return await createOrder(ddbClient, requestBody, user);
    } catch (error) {
        console.error('An unexpected error occurred:', error);
        return lambdaResponse({ error: 'An unexpected error occurred.' }, 500);
    }
}
