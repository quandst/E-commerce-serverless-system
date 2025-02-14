import { DynamoDBClient, GetItemCommand } from '@aws-sdk/client-dynamodb';
import { marshall, unmarshall } from '@aws-sdk/util-dynamodb';
import { APIGatewayProxyEventV2, APIGatewayProxyResult } from 'aws-lambda';
import {
    LambdaRequestContext,
    lambdaResponse,
    loadConfig,
    constants,
    OrderTable,
    stripe as Stripe,
    strLower,
    UpdateItem,
} from '../../../lib/utils';

/**
 * Processes the payment checkout for a user's order.
 * @param event - The API Gateway proxy event.
 * @returns A promise resolving to an API Gateway proxy result containing the client secret and order amount.
 */
export async function paymentCheckout(
    event: APIGatewayProxyEventV2,
): Promise<APIGatewayProxyResult> {
    try {
        // Load Stripe secret key
        const config = await loadConfig('stripe-secret');
        if (!config || !config.stripe_api_secret_key) {
            console.error('Stripe secret key not found.');
            return lambdaResponse(
                { error: 'Stripe configuration error.' },
                500,
            );
        }
        const stripe = Stripe(config.stripe_api_secret_key);

        // Extract user information from authorizer
        const claims = (event.requestContext as any).authorizer?.lambda as LambdaRequestContext;
        const user = claims.lambda.accessPayload.username!;

        const ddbClient = new DynamoDBClient({ region: process.env.region });
        const { orderTable, cartIntent } = constants;

        // Retrieve order from DynamoDB
        const { Item } = await ddbClient.send(
            new GetItemCommand({
                TableName: orderTable,
                Key: marshall({ user, intent: cartIntent }),
            }),
        );

        // Check if order exists
        if (!Item) {
            console.warn(`No order found for user ${user} with cart intent.`);
            return lambdaResponse({ name: 'NoOrderInCartException' }, 400);
        }

        const item = unmarshall(Item) as OrderTable;

        // Check if order contains items
        if (!item.orders.length) {
            console.warn(`Order for user ${user} has no items.`);
            return lambdaResponse({ name: 'NoOrderException' }, 400);
        }

        // Validate delivery location
        const requestBody = JSON.parse(event.body || '{}') as Partial<OrderTable>;
        if (
            !requestBody.location ||
            !requestBody.location.address ||
            !requestBody.location.country
        ) {
            console.warn(`Invalid location provided for user ${user}.`);
            return lambdaResponse({ name: 'InvalidLocationException' }, 400);
        }

        // Update order delivery details
        item.location = requestBody.location;

        // Remove user and intent properties (not needed for update)
        delete (item as Partial<OrderTable>).user;
        delete (item as Partial<OrderTable>).intent;

        // Update item in DynamoDB
        await UpdateItem(ddbClient, orderTable, item, {
            user,
            intent: cartIntent,
        });

        const amount = item.amount * 100;
        const date = new Date(item.createdAt).toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
        });

        // Create a PaymentIntent with the order amount and currency
        const createIntent = await stripe.paymentIntents.create({
            amount,
            currency: 'usd',
            description: `Order For ${strLower(
                user,
            )}, Amount: US$${amount}, Date Initiated: ${date}`,
            metadata: {
                user,
            },
        });

        return lambdaResponse(
            { clientSecret: createIntent.client_secret, amount: item.amount },
            200,
        );
    } catch (error) {
        console.error('An error occurred during payment checkout:', error);
        return lambdaResponse({ error: 'Payment checkout failed.' }, 500);
    }
}
