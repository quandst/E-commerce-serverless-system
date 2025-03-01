/* eslint-disable @typescript-eslint/require-await */
import {
    APIGatewayProxyEventV2,
    APIGatewayProxyResult,
} from 'aws-lambda/trigger/api-gateway-proxy';
import {
    DynamoDBClient,
    GetItemCommand,
    PutItemCommand,
} from '@aws-sdk/client-dynamodb';
import { marshall, unmarshall } from '@aws-sdk/util-dynamodb';
import {
    getProductsById,
    imageToSlot,
    LambdaRequestContext,
    lambdaResponse,
    constants,
    Orders,
    OrderTable,
    OrderTableKeys,
    ProductTable,
    UpdateItem,
    validIntNumber,
    KeyValue,
} from '../../../lib/utils';
import { poolData } from '../../config';

const { orderTable, cartIntent, cartStatus, orderLogs } = constants;

/**
 * Updates the amount and other product details in a cart order.
 * @param cartOrder - The cart order to update.
 * @param products - A map of products by ID.
 */
const updateAmount = (
    cartOrder: OrderTable,
    products: KeyValue<ProductTable>,
): void => {
    cartOrder.amount = 0;
    cartOrder.orders.forEach((order, index) => {
        const product = products[order.productId];
        if (product) {
            cartOrder.orders[index].price = product.price;
            cartOrder.orders[index].name = product.name;
            cartOrder.orders[index].category = product.category;
            cartOrder.orders[index].slot = imageToSlot(product);
            cartOrder.amount += product.price * cartOrder.orders[index].count;
        }
    });
    // Round to 2 decimal Places
    cartOrder.amount =
        Math.round((cartOrder.amount + Number.EPSILON) * 100) / 100;
};

/**
 * Retrieves an order by intent and merges it with a local cart.
 * @param ddbClient - DynamoDB client.
 * @param user - The user ID.
 * @param intent - The order intent.
 * @param localCart - The local cart data.
 * @returns A promise resolving to a lambda response containing the merged order.
 */
const getOrderByIntent = async (
    ddbClient: DynamoDBClient,
    user: string,
    intent: string,
    localCart: Orders[],
): Promise<APIGatewayProxyResult> => {
    try {
        const { Item } = await ddbClient.send(
            new GetItemCommand({
                TableName: orderTable,
                Key: marshall({ user, intent }),
                AttributesToGet: [
                    'orders',
                    'amount',
                    'status',
                    'location',
                    'logs',
                    'createdAt',
                ] as OrderTableKeys[],
            }),
        );

        if (intent === cartIntent && Array.isArray(localCart) && localCart.length) {
            const validProductIds: KeyValue<boolean> = {};
            // Merge local cart Ids
            localCart.forEach(({ productId, count }) => {
                if (
                    productId &&
                    count &&
                    validIntNumber(count.toString()) &&
                    count > 0
                ) {
                    validProductIds[productId] = true;
                }
            });

            const existingCart = Item ? (unmarshall(Item) as OrderTable) : null;
            let cartOrder: OrderTable;

            if (!existingCart) {
                // Create empty cart
                cartOrder = {
                    createdAt: Date.now(),
                    status: cartStatus,
                    logs: orderLogs,
                    orders: [],
                    amount: 0,
                    user,
                    intent: cartIntent,
                };
            } else {
                cartOrder = existingCart;
            }

            const productIdsToFetch: KeyValue<boolean> = {};

            // Merge product Ids from local cart
            localCart.forEach(({ productId }) => {
                productIdsToFetch[productId] = true;
            });

            if (existingCart) {
                // Merge product IDs from existing cart
                existingCart.orders.forEach(({ productId }) => {
                    productIdsToFetch[productId] = true;
                });
            }

            const products = await getProductsById(
                Object.keys(productIdsToFetch),
                ddbClient,
            );

            // Remove invalid products from cart
            cartOrder.orders = cartOrder.orders.filter(({ productId }) =>
                Boolean(products[productId]),
            );

            // Add local cart to current cart
            localCart.forEach(({ productId, count }) => {
                const product = products[productId];
                if (product) {
                    // Check if order from client is already in the cart else, add it
                    const index = cartOrder.orders.findIndex(
                        item => item.productId === productId,
                    );
                    if (index >= 0) {
                        const currentCount = cartOrder.orders[index].count;
                        cartOrder.orders[index].count = Math.max(currentCount, count);
                    } else {
                        cartOrder.orders.push({
                            slot: imageToSlot(product),
                            productId: product.id,
                            name: product.name,
                            category: product.category,
                            price: product.price,
                            count,
                        });
                    }
                }
            });

            // Update cart price, name, category, image and amount
            updateAmount(cartOrder, products);

            if (!existingCart) {
                await ddbClient.send(
                    new PutItemCommand({
                        TableName: orderTable,
                        Item: marshall(cartOrder),
                    }),
                );
            } else {
                await UpdateItem(ddbClient, orderTable, cartOrder, {
                    user,
                    intent: cartIntent,
                });
            }

            const updatedCart: OrderTable = {
                ...cartOrder,
                user,
                intent,
            };
            return lambdaResponse(updatedCart, 200);
        }

        const cartOrder = (Item ? unmarshall(Item) : { orders: [] }) as OrderTable;
        const validProducts: KeyValue<boolean> = {};
        // Merge current cart Ids
        cartOrder.orders.forEach(({ productId }) => {
            validProducts[productId] = true;
        });
        const idsKeys = Object.keys(validProducts);
        if (!idsKeys.length) {
            return lambdaResponse(cartOrder, 200);
        }
        const products = await getProductsById(idsKeys, ddbClient);
        // Remove invalid products form cart
        cartOrder.orders = cartOrder.orders.filter(({ productId }) =>
            Boolean(products[productId]),
        );
        // Update cart price, name, category, image and amount
        updateAmount(cartOrder, products);
        return lambdaResponse(cartOrder, 200);
    } catch (error) {
        console.error('Error getting or merging order:', error);
        return lambdaResponse({ error: 'Failed to process order' }, 500);
    }
};

/**
 * Lambda function to get an order by intent.
 * @param event - API Gateway proxy event.
 * @returns A promise resolving to an API Gateway proxy result.
 */
export async function orderIntent(
    event: APIGatewayProxyEventV2,
): Promise<APIGatewayProxyResult> {
    try {
        // Extract user information from authorizer
        const claims = event.requestContext as unknown as { authorizer: LambdaRequestContext };
        const user = claims.authorizer.lambda.accessPayload.username!;
        const ddbClient = new DynamoDBClient({ region: poolData.region });

        // Validate intent parameter
        const intent = event.pathParameters?.intent;
        if (!intent) {
            console.warn('No intent specified.');
            return lambdaResponse({ name: `No Intent Specified` }, 400);
        }

        // Parse request body
        let requestBody: Orders[];
        try {
            requestBody = JSON.parse(event.body || '[]');
        } catch (error) {
            console.warn('Invalid request body:', error);
            return lambdaResponse({ name: 'InvalidRequestBodyException' }, 400);
        }

        return await getOrderByIntent(ddbClient, user, intent, requestBody);
    } catch (error) {
        console.error('An unexpected error occurred:', error);
        return lambdaResponse({ error: 'An unexpected error occurred.' }, 500);
    }
}
