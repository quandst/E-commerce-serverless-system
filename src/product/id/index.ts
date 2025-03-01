/* eslint-disable @typescript-eslint/require-await */
import {
    APIGatewayProxyEventV2,
    APIGatewayProxyResult,
} from 'aws-lambda/trigger/api-gateway-proxy';
import {
    DeleteItemCommand,
    DeleteItemCommandInput,
    DynamoDBClient,
    GetItemCommand,
    GetItemCommandInput,
} from '@aws-sdk/client-dynamodb';
import { marshall, unmarshall } from '@aws-sdk/util-dynamodb';
import { HttpMethod } from 'aws-cdk-lib/aws-events';
import {
    getCredentials,
    lambdaResponse,
    constants,
    ProductTable,
    propTrim,
    strLower,
    supportedCategories,
    UpdateItem,
    validFloatNumber,
} from '../../../lib/utils';
import { poolData } from '../../config';

const { productTable } = constants;

/**
 * Retrieves a product from DynamoDB by ID.
 * @param ddbClient - DynamoDB client.
 * @param id - The ID of the product to retrieve.
 * @returns A promise resolving to a lambda response containing the product or a 204 if not found.
 */
const getProduct = async (
    ddbClient: DynamoDBClient,
    id: string,
): Promise<APIGatewayProxyResult> => {
    const params: GetItemCommandInput = {
        TableName: productTable,
        Key: marshall({ id }),
    };
    try {
        const { Item } = await ddbClient.send(new GetItemCommand(params));
        if (Item) {
            return lambdaResponse(unmarshall(Item), 200);
        } else {
            console.warn(`Product with id ${id} not found.`);
            return {
                body: '',
                statusCode: 204,
            };
        }
    } catch (error) {
        console.error(`Error retrieving product with id ${id}:`, error);
        return lambdaResponse({ error: 'Failed to retrieve product' }, 500);
    }
};

/**
 * Deletes a product from DynamoDB by ID.
 * @param ddbClient - DynamoDB client.
 * @param id - The ID of the product to delete.
 * @returns A promise resolving to a lambda response.
 */
const deleteProduct = async (
    ddbClient: DynamoDBClient,
    id: string,
): Promise<APIGatewayProxyResult> => {
    const params: DeleteItemCommandInput = {
        TableName: productTable,
        Key: marshall({ id }),
    };
    try {
        await ddbClient.send(new DeleteItemCommand(params));
        return lambdaResponse({}, 200);
    } catch (error) {
        console.error(`Error deleting product with id ${id}:`, error);
        return lambdaResponse({ error: 'Failed to delete product' }, 500);
    }
};

/**
 * Updates a product in DynamoDB.
 * @param ddbClient - DynamoDB client.
 * @param requestBody - The partial product data to update.
 * @param id - The ID of the product to update.
 * @returns A promise resolving to a lambda response containing the updated product.
 */
const updateProduct = async (
    ddbClient: DynamoDBClient,
    requestBody: Partial<ProductTable>,
    id: string,
): Promise<APIGatewayProxyResult> => {
    // Get the existing item to ensure it exists and to have existing values
    const getParams: GetItemCommandInput = {
        TableName: productTable,
        Key: marshall({ id }),
    };

    try {
        const { Item } = await ddbClient.send(new GetItemCommand(getParams));

        if (!Item) {
            console.warn(`Product with id ${id} not found, cannot update.`);
            return lambdaResponse({ name: 'InvalidProductIdException' }, 400);
        }

        // Validate request body
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

        // Update product
        const productUpdate: Partial<ProductTable> = {
            price: requestBody.price,
            name: strLower(requestBody.name),
            category: requestBody.category,
        };

        await UpdateItem(ddbClient, productTable, productUpdate, { id });

        // Return updated product
        const item = unmarshall(Item) as ProductTable;
        item.name = productUpdate.name!;
        item.category = productUpdate.category!;
        item.price = productUpdate.price!;

        return lambdaResponse(item, 200);
    } catch (error) {
        console.error(`Error updating product with id ${id}:`, error);
        return lambdaResponse({ error: 'Failed to update product' }, 500);
    }
};

/**
 * Lambda function to manage products by ID.
 * @param event - API Gateway proxy event.
 * @returns A promise resolving to an API Gateway proxy result.
 */
export async function productId(
    event: APIGatewayProxyEventV2,
): Promise<APIGatewayProxyResult> {
    try {
        const productId = event.pathParameters?.id;
        if (!productId) {
            console.warn('Missing productId.');
            return lambdaResponse({ name: 'InvalidProductIdException' }, 400);
        }

        const ddbClient = new DynamoDBClient({ region: poolData.region });
        const method = event.requestContext.http.method as HttpMethod;

        // Authorize user for DELETE and PUT requests
        if (method === HttpMethod.DELETE || method === HttpMethod.PUT) {
            await getCredentials(
                process.env[`${constants.groups.product}_pool`]!,
                event,
            );
        }

        switch (method) {
            case HttpMethod.GET:
                return await getProduct(ddbClient, productId);
            case HttpMethod.DELETE:
                return await deleteProduct(ddbClient, productId);
            case HttpMethod.PUT:
                const requestBody: ProductTable = JSON.parse(event.body || '{}');
                return await updateProduct(ddbClient, requestBody, productId);
            default:
                console.warn(`Unsupported HTTP method: ${method}`);
                return lambdaResponse(
                    { name: `Unsupported route: "${method}"` },
                    400,
                );
        }
    } catch (error) {
        console.error('An unexpected error occurred:', error);
        return lambdaResponse({ error: 'An unexpected error occurred.' }, 500);
    }
}
