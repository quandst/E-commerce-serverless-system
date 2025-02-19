import {
    DynamoDBClient,
    GetItemCommand,
    TransactWriteItemsCommand,
    TransactWriteItemsCommandInput,
    UpdateItemCommand,
    UpdateItemCommandInput,
} from '@aws-sdk/client-dynamodb';
import { marshall, unmarshall } from '@aws-sdk/util-dynamodb';
import { APIGatewayProxyEventV2, APIGatewayProxyResult } from 'aws-lambda';
import {
    loadConfig,
    OrderTable,
    constants,
    stripe as Stripe,
    lambdaResponse,
    PaymentStatus,
} from '../../../lib/utils';

interface SellerMessage {
    outcome: {
        seller_message: string;
    };
}

interface Session {
    id: string;
    metadata: {
        user: string;
    };
    charges: {
        data: SellerMessage[];
    };
}

/**
 * Updates the payment status of an order in DynamoDB.
 * @param status - The payment status to update.
 * @param session - The Stripe session object.
 * @returns A promise resolving to a lambda response.
 */
const updatePaymentStatus = async (
    status: PaymentStatus,
    session: Session,
): Promise<APIGatewayProxyResult> => {
    const ddbClient = new DynamoDBClient({ region: process.env.region });
    const { cartIntent, orderTable } = constants;
    const { user } = session.metadata;
    const intentId = session.id;

    try {
        if (status === PaymentStatus.CREATED) {
            // Handle initial payment intent creation
            const key = marshall({ user, intent: cartIntent });
            const { Item } = await ddbClient.send(
                new GetItemCommand({
                    TableName: orderTable,
                    Key: key,
                }),
            );

            if (!Item) {
                console.warn(`No cart order found for user ${user}.`);
                return lambdaResponse({ name: 'NoOrderInCartException' }, 400);
            }

            const theItem = unmarshall(Item) as OrderTable;
            theItem.createdAt = Date.now();
            theItem.intent = intentId;
            theItem.status = `PAYMENT ${PaymentStatus[status]}`;

            // Perform transactional write to update order
            const params: TransactWriteItemsCommandInput = {
                TransactItems: [
                    {
                        Delete: {
                            TableName: orderTable,
                            Key: key,
                        },
                    },
                    {
                        Put: {
                            TableName: orderTable,
                            Item: marshall(theItem),
                        },
                    },
                ],
            };

            await ddbClient.send(new TransactWriteItemsCommand(params));
            return lambdaResponse({}, 200);
        } else {
            // Handle updates for other payment statuses
            const params: UpdateItemCommandInput = {
                TableName: orderTable,
                Key: marshall({ user, intent: intentId }),
                UpdateExpression: 'SET #key0 = :value0, #key1 = :value1',
                ExpressionAttributeNames: { '#key0': 'status', '#key1': 'logs' },
                ExpressionAttributeValues: {
                    ':value0': { S: `PAYMENT ${PaymentStatus[status]}` },
                    ':value1': {
                        S:
                            session.charges.data[0].outcome.seller_message ||
                            constants.orderLogs,
                    },
                },
            };

            await ddbClient.send(new UpdateItemCommand(params));
            return lambdaResponse({}, 200);
        }
    } catch (error) {
        console.error('Error updating payment status:', error);
        return lambdaResponse({ error: 'Failed to update payment status' }, 500);
    }
};

/**
 * Handles Stripe webhook events.
 * @param event - The API Gateway proxy event.
 * @returns A promise resolving to a lambda response.
 */
export async function paymentHook(
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

        // Extract Stripe signature from header
        const sig = event.headers['stripe-signature'];
        if (!sig) {
            console.warn('No Stripe signature received in header.');
            return lambdaResponse(
                { name: 'No Stripe signature received in header' },
                400,
            );
        }

        // Extract event body
        if (!event.body) {
            console.warn('No event body received in POST.');
            return lambdaResponse({ name: 'No event body received in POST' }, 400);
        }

        // Construct Stripe Webhook event
        const payload = event.isBase64Encoded
            ? Buffer.from(event.body, 'base64').toString()
            : event.body;
        const ev = stripe.webhooks.constructEvent(
            payload,
            sig,
            config.webhook_signing_secret,
        );

        const session = ev.data.object as unknown as Session;

        // Process event based on its type
        switch (ev.type) {
            case 'payment_intent.created':
                return await updatePaymentStatus(PaymentStatus.CREATED, session);
            case 'payment_intent.succeeded':
                return await updatePaymentStatus(PaymentStatus.SUCCEEDED, session);
            case 'payment_intent.payment_failed':
                return await updatePaymentStatus(PaymentStatus.FAILED, session);
            case 'payment_intent.canceled':
                return await updatePaymentStatus(PaymentStatus.CANCELED, session);
            default:
                console.warn(`Unhandled event type: ${ev.type}`);
                return lambdaResponse({ name: `Unhandled event type: ${ev.type}` }, 200); // Acknowledge unhandled events to prevent retries
        }
    } catch (error) {
        console.error('An error occurred during payment hook processing:', error);
        return lambdaResponse({ error: 'Payment hook processing failed.' }, 500);
    }
}
