/* eslint-disable @typescript-eslint/require-await */
import {
    APIGatewayProxyEventV2,
    APIGatewayProxyResult,
} from 'aws-lambda/trigger/api-gateway-proxy';
import {
    AttributeValue,
    DynamoDBClient,
    QueryCommandInput,
    ScanCommandInput,
} from '@aws-sdk/client-dynamodb';
import {
    lambdaResponse,
    constants,
    strLower,
    KeyValue,
    validIntNumber,
    queryItems,
} from '../../lib/utils';

const { productTable, categoryIndex, readsPerQuery } = constants;

/**
 * Retrieves all products from DynamoDB, optionally filtered by search term.
 * @param ddbClient - DynamoDB client.
 * @param search - Optional search term to filter products by name.
 * @param limit - Maximum number of items to return.
 * @param startKey - Optional key to start the scan from.
 * @returns A promise resolving to a lambda response containing the products.
 */
const getAllProducts = async (
    ddbClient: DynamoDBClient,
    search: string,
    limit: number,
    startKey?: KeyValue<AttributeValue>,
): Promise<APIGatewayProxyResult> => {
    const params: ScanCommandInput = {
        TableName: productTable,
        Limit: readsPerQuery,
        ExclusiveStartKey: startKey,
        ...(search
            ? {
                FilterExpression:
                    'begins_with(#name, :name1) OR contains(#name, :name2)',
                ExpressionAttributeValues: {
                    ':name1': { S: search },
                    ':name2': { S: ` ${search} ` },
                },
                ExpressionAttributeNames: {
                    '#name': 'name',
                },
            }
            : undefined),
    };

    try {
        const items = await queryItems(ddbClient, params, limit, false);
        return lambdaResponse(items, 200);
    } catch (error) {
        console.error('Error retrieving all products:', error);
        return lambdaResponse({ error: 'Failed to retrieve products' }, 500);
    }
};

/**
 * Retrieves products by category from DynamoDB, optionally filtered by search term and sorted.
 * @param ddbClient - DynamoDB client.
 * @param category - Category to filter products by.
 * @param search - Optional search term to filter products by name.
 * @param limit - Maximum number of items to return.
 * @param sort - Optional sort order ('low' for ascending price).
 * @param startKey - Optional key to start the query from.
 * @returns A promise resolving to a lambda response containing the products.
 */
const getProductsByCategory = async (
    ddbClient: DynamoDBClient,
    category: string,
    search: string,
    limit: number,
    sort?: string,
    startKey?: KeyValue<AttributeValue>,
): Promise<APIGatewayProxyResult> => {
    const params: QueryCommandInput = {
        TableName: productTable,
        IndexName: categoryIndex,
        KeyConditionExpression: 'category = :productCategory',
        Limit: readsPerQuery,
        ExclusiveStartKey: startKey,
        ScanIndexForward: sort === 'low',
        ...(search
            ? {
                FilterExpression:
                    'begins_with(#name, :name1) OR contains(#name, :name2)',
                ExpressionAttributeValues: {
                    ':name1': { S: search },
                    ':name2': { S: ` ${search} ` },
                    ':productCategory': { S: category },
                },
                ExpressionAttributeNames: {
                    '#name': 'name',
                },
            }
            : {
                ExpressionAttributeValues: {
                    ':productCategory': { S: category },
                },
            }),
    };

    try {
        const items = await queryItems(ddbClient, params, limit);
        return lambdaResponse(items, 200);
    } catch (error) {
        console.error(`Error retrieving products by category ${category}:`, error);
        return lambdaResponse({ error: 'Failed to retrieve products' }, 500);
    }
};

/**
 * Lambda function to retrieve products, either all or by category, from DynamoDB.
 * @param event - API Gateway proxy event.
 * @returns A promise resolving to an API Gateway proxy result containing the products.
 */
export async function products(
    event: APIGatewayProxyEventV2,
): Promise<APIGatewayProxyResult> {
    try {
        const ddbClient = new DynamoDBClient({ region: process.env.region });
        const params = event.queryStringParameters;

        // Validate and parse limit parameter
        const _limit = params?.limit;
        if (_limit && (!validIntNumber(_limit) || Number(_limit) === 0)) {
            console.warn(`Invalid limit parameter: ${_limit}`);
            return lambdaResponse({ name: 'InvalidLimitException' }, 400);
        }
        const limit = _limit ? Number(_limit) : readsPerQuery;

        // Parse start key from request body
        let startKey: KeyValue<AttributeValue> | undefined;
        try {
            startKey = event.body ? (JSON.parse(event.body) as KeyValue<AttributeValue>) : undefined;
        } catch (error) {
            console.warn('Invalid request body (startKey):', error);
            return lambdaResponse({ name: 'InvalidRequestBodyException' }, 400);
        }

        // Extract category and search parameters
        const category = strLower(params?.category || '');
        const search = strLower(params?.search || '');

        // Dispatch to appropriate handler based on category
        if (category) {
            const sort = params?.sort;
            return await getProductsByCategory(
                ddbClient,
                category,
                search,
                limit,
                sort,
                startKey,
            );
        } else {
            return await getAllProducts(ddbClient, search, limit, startKey);
        }
    } catch (error) {
        console.error('An unexpected error occurred:', error);
        return lambdaResponse({ error: 'An unexpected error occurred.' }, 500);
    }
}
