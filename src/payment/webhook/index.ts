// import {
//     DynamoDBClient,
//     GetItemCommand,
//     TransactWriteItemsCommand,
//     TransactWriteItemsCommandInput,
//     UpdateItemCommand,
//     UpdateItemCommandInput,
// } from '@aws-sdk/client-dynamodb';
// import { marshall, unmarshall } from '@aws-sdk/util-dynamodb';
// import { APIGatewayProxyEventV2, APIGatewayProxyResult } from 'aws-lambda';
// import {
//     loadConfig,
//     OrderTable,
//     constants,
//     stripe as Stripe,
//     lambdaResponse,
//     PaymentStatus,
// } from '../../../lib/utils';
// import { poolData } from '../../config';


// interface SellerMessage {
//     outcome: {
//         seller_message: string;
//     };
// }
// interface Session {
//     id: string;
//     metadata: {
//         user: string;
//     };
//     charges: {
//         data: SellerMessage[];
//     };
// }

// const updatePaymentStatus = async function (
//     status: PaymentStatus,
//     session: Session,
// ) {
//     const ddbClient = new DynamoDBClient({ region: poolData.region });
//     const { cartIntent, orderTable } = constants;
//     const { user } = session.metadata;
//     const intentId = session.id;

//     //  check status of payment
//     if (status === PaymentStatus.CREATED) {
//         const key = marshall({ user, intent: cartIntent });
//         const { Item } = await ddbClient.send(
//             new GetItemCommand({
//                 TableName: orderTable,
//                 Key: key,
//             }),
//         );
//         const theItem = unmarshall(Item!) as OrderTable;
//         theItem.createdAt = Date.now();
//         theItem.intent = intentId;
//         theItem.status = `PAYMENT ${PaymentStatus[status]}`;
//         //  Delete Update Cart, because "intent" is a PK which has to be changed to the intentId
//         const params: TransactWriteItemsCommandInput = {
//             TransactItems: [
//                 {
//                     Delete: {
//                         TableName: orderTable,
//                         Key: key,
//                     },
//                 },
//                 {
//                     Put: {
//                         TableName: orderTable,
//                         Item: marshall(theItem),
//                     },
//                 },
//             ],
//         };
//         const updateResult = await ddbClient.send(
//             new TransactWriteItemsCommand(params),
//         );
//         return lambdaResponse(updateResult, 200);
//     } /* if (
//       status === PaymentStatus.SUCCEEDED ||
//       status === PaymentStatus.CANCELED ||
//       status === PaymentStatus.FAILED) */
//     const params: UpdateItemCommandInput = {
//         TableName: orderTable,
//         Key: marshall({ user, intent: intentId }),
//         UpdateExpression: 'SET #key0 = :value0, #key1 = :value1',
//         ExpressionAttributeNames: { '#key0': 'status', '#key1': 'logs' },
//         ExpressionAttributeValues: {
//             ':value0': { S: `PAYMENT ${PaymentStatus[status]}` },
//             ':value1': {
//                 S:
//                     session.charges.data[0].outcome.seller_message || constants.orderLogs,
//             },
//         },
//     };
//     const updateResult = await ddbClient.send(new UpdateItemCommand(params));
//     return lambdaResponse(updateResult, 200);
// };

// export async function paymentHook(
//     event: APIGatewayProxyEventV2,
// ): Promise<APIGatewayProxyResult | any> {
//     //  load stripe secret key
//     const config = await loadConfig('stripe-secret');
//     const stripe = Stripe(config.stripe_api_secret_key);
//     try {
//         const sig = event.headers['Stripe-Signature'];
//         //  require Stripe signature in header
//         if (!sig) {
//             return lambdaResponse(
//                 {
//                     name: 'No Stripe signature received in header',
//                 },
//                 400,
//             );
//         }
//         // require an event body
//         if (!event.body) {
//             return lambdaResponse(
//                 { name: 'No event body received in POST' },
//                 400,
//             );
//         }
//         // decode payload
//         const payload = event.isBase64Encoded
//             ? Buffer.from(event.body, 'base64').toString()
//             : event.body;

//         // construct a Stripe Webhook event
//         const ev = stripe.webhooks.constructEvent(
//             payload,
//             sig,
//             config.webhook_signing_secret,
//         );
//         const session = ev.data.object as unknown as Session;

//         switch (ev.type) {
//             //  The order is processing
//             case 'payment_intent.created':
//                 return await updatePaymentStatus(PaymentStatus.CREATED, session);
//             //  The order is paid successfully (e.g., from a card payment)
//             case 'payment_intent.succeeded':
//                 return await updatePaymentStatus(PaymentStatus.SUCCEEDED, session);
//             //   The order has failed
//             case 'payment_intent.payment_failed':
//                 return await updatePaymentStatus(PaymentStatus.FAILED, session);
//             //  The order has canceled
//             case 'payment_intent.canceled':
//                 return await updatePaymentStatus(PaymentStatus.CANCELED, session);
//         }
//     } catch (error) {
//         return lambdaResponse(error, 500);
//     }
// }

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
import { loadConfig, OrderTable, constants, stripe as Stripe, lambdaResponse, PaymentStatus } from '../../../lib/utils';
import { poolData } from '../../config';
import { EventBridgeClient, PutEventsCommand } from "@aws-sdk/client-eventbridge";

interface Session {
    id: string;
    metadata: {
        user: string;
    };
    charges: {
        data: any[]; // Hoặc định nghĩa kiểu dữ liệu cụ thể nếu cần
    };
}

const eventBridge = new EventBridgeClient({ region: poolData.region });
const ddbClient = new DynamoDBClient({ region: poolData.region }); //Khởi tạo ddbClient

const updatePaymentStatus = async function (status: PaymentStatus, session: Session) {
    const { cartIntent, orderTable } = constants;
    const { user } = session.metadata;
    const intentId = session.id;

    if (status === PaymentStatus.CREATED) {
        const key = marshall({ user, intent: cartIntent });
        const { Item } = await ddbClient.send(new GetItemCommand({ TableName: orderTable, Key: key }));
        const theItem = unmarshall(Item!) as OrderTable;
        theItem.createdAt = Date.now();
        theItem.intent = intentId;
        theItem.status = `PAYMENT ${PaymentStatus[status]}`;

        const params: TransactWriteItemsCommandInput = {
            TransactItems: [{ Delete: { TableName: orderTable, Key: key, }, }, { Put: { TableName: orderTable, Item: marshall(theItem), }, },],
        };
        await ddbClient.send(new TransactWriteItemsCommand(params));
        return lambdaResponse({ message: 'DynamoDB updated' }, 200);
    }

    const params: UpdateItemCommandInput = {
        TableName: orderTable,
        Key: marshall({ user, intent: intentId }),
        UpdateExpression: 'SET #key0 = :value0, #key1 = :value1',
        ExpressionAttributeNames: { '#key0': 'status', '#key1': 'logs' },
        ExpressionAttributeValues: {
            ':value0': { S: `PAYMENT ${PaymentStatus[status]}` },
            ':value1': { S: session.charges.data[0]?.outcome?.seller_message || constants.orderLogs }, // handle session.charges.data array being potentially empty.
        },
    };
    await ddbClient.send(new UpdateItemCommand(params));
    return lambdaResponse({ message: 'DynamoDB updated' }, 200);
};

export async function paymentHook(event: APIGatewayProxyEventV2 | any): Promise<APIGatewayProxyResult | any> {

    if (event.detail && event.detail.Detail) { //Eventbridge event
        const session = JSON.parse(event.detail.Detail).session as Session;
        const eventType = event.detail.DetailType;

        try {
            switch (eventType) {
                case 'payment_intent.created':
                    return await updatePaymentStatus(PaymentStatus.CREATED, session);
                case 'payment_intent.succeeded':
                    return await updatePaymentStatus(PaymentStatus.SUCCEEDED, session);
                case 'payment_intent.payment_failed':
                    return await updatePaymentStatus(PaymentStatus.FAILED, session);
                case 'payment_intent.canceled':
                    return await updatePaymentStatus(PaymentStatus.CANCELED, session);
                default:
                    return lambdaResponse({ message: 'Unknown event type' }, 400);
            }
        } catch (error) {
            console.error("Error Processing stripe Event: ", error);
            return lambdaResponse(error, 500);
        }

    } else { // Api Gateway event

        const config = await loadConfig('stripe-secret');
        const stripe = Stripe(config.stripe_api_secret_key);

        try {
            const sig = event.headers['stripe-signature'];
            if (!sig || !event.body) {
                return lambdaResponse({ message: 'Invalid request' }, 400);
            }
            // console.log(sig);
            // console.log(event.body);
            // const rawBody = event.body.toString();
            // console.log(rawBody);
            const payload = event.isBase64Encoded ? Buffer.from(event.body, 'base64').toString() : event.body;
            // console.log('payload:', payload);
            const ev = stripe.webhooks.constructEvent(payload, sig, config.webhook_signing_secret);
            const session = ev.data.object as unknown as Session;

            const params = {
                Entries: [
                    {
                        Source: 'stripe.payment',
                        DetailType: ev.type,
                        Detail: JSON.stringify({ session }),
                    },
                ],
            };

            await eventBridge.send(new PutEventsCommand(params));
            return lambdaResponse({ message: 'Event published to EventBridge' }, 200);

        } catch (error) {
            console.error('Error in paymentHook:', error);
            return lambdaResponse(error, 500);
        }
    }
}