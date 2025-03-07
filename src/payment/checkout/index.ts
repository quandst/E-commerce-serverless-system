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
import {
    poolData

} from '../../config';
export async function paymentCheckout(
    event: APIGatewayProxyEventV2,
): Promise<APIGatewayProxyResult> {
    // 👇 load stripe secret key
    const config = await loadConfig('stripe-secret');
    const stripe = Stripe(config.stripe_api_secret_key);
    try {

        const claims = event.requestContext as unknown as { authorizer: LambdaRequestContext };
        const user = claims.authorizer.lambda.accessPayload.username!;
        const ddbClient = new DynamoDBClient({ region: poolData.region });
        const { orderTable, cartIntent } = constants;
        const { Item } = await ddbClient.send(
            new GetItemCommand({
                TableName: orderTable,
                Key: marshall({ user, intent: cartIntent }),
            }),
        );
        // 👇 check if order is exists
        if (!Item) {
            return lambdaResponse({ name: 'NoOrderInCartException' }, 400);
        }
        const item = unmarshall(Item) as OrderTable;
        if (!item.orders.length) {
            return lambdaResponse({ name: 'NoOrderException' }, 400);
        }
        // 👇 check if delivery location is valid
        const requestBody = JSON.parse(event.body || '{}') as Partial<OrderTable>;
        if (
            !requestBody.location ||
            !requestBody.location.address ||
            !requestBody.location.country
        ) {
            return lambdaResponse({ name: 'InvalidLocationException' }, 400);
        }
        // 👇 update order delivery details
        item.location = requestBody.location;
        delete (item as Partial<OrderTable>).user;
        delete (item as Partial<OrderTable>).intent;
        try {
            await UpdateItem(ddbClient, orderTable, item, { user, intent: cartIntent });
        } catch (updateError) {
            console.error("DynamoDB Update Failed:", updateError);
            return lambdaResponse({
                name: "DatabaseUpdateException",
                message: "Failed to update order details"
            }, 500);
        }

        if (typeof item.amount !== "number" || isNaN(item.amount)) {
            return lambdaResponse({
                name: "InvalidAmountException",
                message: "Order amount is not a valid number"
            }, 400);
        }
        const amount = Math.round(item.amount * 100); // Avoid floating-point issues
        const date = new Date(item.createdAt).toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
        });
        // 👇 Create a PaymentIntent with the order amount and currency
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
        console.error("Full Error Details:", error); // Log the full error
        if (error instanceof TypeError) {
        }
        const errorMessage = (error as Error).message || "Unknown error";
        return lambdaResponse(
            { message: "Payment failed", details: errorMessage }, // Include error message
            500
        );
    }
}

