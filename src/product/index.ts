/* eslint-disable @typescript-eslint/require-await */
import {
    APIGatewayProxyEventV2,
    APIGatewayProxyResult,
} from 'aws-lambda/trigger/api-gateway-proxy';
import { DynamoDBClient, PutItemCommand } from '@aws-sdk/client-dynamodb';
import { marshall } from '@aws-sdk/util-dynamodb';
import { v4 as uuidv4 } from 'uuid';
import {
    getCredentials,
    lambdaResponse,
    ProductTable,
    constants,
    propTrim,
    strLower,
    supportedCategories,
    validFloatNumber,
} from '../../lib/utils';
import { poolData } from '../config';
const { productTable } = constants;

/**
 * Creates a new product in DynamoDB.
 * @param ddbClient - DynamoDB client.
 * @param requestBody - The product data from the request body.
 * @returns A promise resolving to a lambda response containing the created product.
 */
const createProduct = async (
    ddbClient: DynamoDBClient,
    requestBody: Partial<ProductTable>,
): Promise<APIGatewayProxyResult> => {
    try {
        // Validate product data
        propTrim(requestBody);

        if (!requestBody.name) {
            console.warn('Invalid product name.');
            return lambdaResponse({ name: 'InvalidNameException' }, 400);
        }

        if (!validFloatNumber((requestBody.price || 0).toString())) {
            console.warn(`Invalid product price: ${requestBody.price}`);
            return lambdaResponse({ name: 'InvalidPriceException' }, 400);
        }

        if (
            !requestBody.category ||
            !supportedCategories.includes(requestBody.category)
        ) {
            console.warn(`Invalid product category: ${requestBody.category}`);
            return lambdaResponse({ name: 'InvalidCategoryException' }, 400);
        }

        // Create product object
        const productCreate: ProductTable = {
            id: uuidv4(),
            createdAt: Date.now(),
            name: strLower(requestBody.name),
            price: requestBody.price,
            category: requestBody.category,
        } as ProductTable;

        const params = {
            TableName: productTable,
            Item: marshall(productCreate),
        };

        // Save product to DynamoDB
        await ddbClient.send(new PutItemCommand(params));

        return lambdaResponse(productCreate, 200);
    } catch (error) {
        console.error('Error creating product:', error);
        return lambdaResponse({ error: 'Failed to create product' }, 500);
    }
};

/**
 * Lambda function to create a new product.
 * @param event - API Gateway proxy event.
 * @returns A promise resolving to an API Gateway proxy result.
 */
export async function product(
    event: APIGatewayProxyEventV2,
): Promise<APIGatewayProxyResult> {
    try {
        // Authorize user
        await getCredentials(
            process.env[`${constants.groups.product}_pool`]!,
            event,
        );

        // Parse request body
        let requestBody: Partial<ProductTable>;
        try {
            requestBody = JSON.parse(event.body || '{}');
        } catch (error) {
            console.warn('Invalid request body:', error);
            return lambdaResponse({ name: 'InvalidRequestBodyException' }, 400);
        }

        const ddbClient = new DynamoDBClient({ region: poolData.region });
        return await createProduct(ddbClient, requestBody);
    } catch (error) {
        console.error('An unexpected error occurred:', error);
        return lambdaResponse({ error: 'An unexpected error occurred.' }, 500);
    }
}
