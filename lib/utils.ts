import {
    APIGatewayProxyEventV2,
    APIGatewayProxyResult,
} from 'aws-lambda/trigger/api-gateway-proxy';
import {
    AuthenticationResultType,
    GetUserCommandOutput,
    GroupType,
} from '@aws-sdk/client-cognito-identity-provider';
import { CognitoIdentityCredentials } from 'aws-sdk';
import {
    AttributeValue,
    DynamoDBClient,
    QueryCommandInput,
    QueryCommand,
    ScanCommand,
    UpdateItemCommandInput,
    UpdateItemCommand,
    BatchGetItemCommandInput,
    BatchGetItemCommand,
} from '@aws-sdk/client-dynamodb';
import { marshall, unmarshall } from '@aws-sdk/util-dynamodb';

import * as cookie from 'cookie';
import SSM from 'aws-sdk/clients/ssm';
import Stripe from 'stripe';
import { v4 as uuidv4 } from 'uuid';
import { poolData } from '../src/config';
/*
Types
*/
export interface KeyValue<T = string> {
    [key: string]: T;
}
export interface LambdaRequestContext {
    lambda: {
        accessPayload: {
            'cognito:groups'?: string[];
            username?: string;
        };
        user?: GetUserCommandOutput;
    };
}
export type ImageSlot = {
    [key in 'image_1' | 'image_2' | 'image_3']?: boolean;
};
export type ProductTable = ImageSlot & {
    id: string;
    name: string;
    category: string;
    price: number;
    createdAt: number;
};
interface OrderTableOrders {
    productId: string;
    name: string;
    category: string;
    price: number;
    count: number;
    slot: number;
}
interface OrderLocation {
    country: string;
    // city: string,
    address: string;
}
export interface Orders {
    productId: string;
    count: number;
}
export interface OrderTable {
    user: string;
    orders: OrderTableOrders[];
    amount: number;
    status: string;
    logs: string;
    intent: string;
    createdAt: number;
    location?: OrderLocation;
}
export type OrderTableKeys = keyof OrderTable;
interface Country {
    code: string;
    name: string;
    emoji: string;
    unicode: string;
    image: string;
}
export type DeepPartial<T> = T extends object
    ? {
        [P in keyof T]?: DeepPartial<T[P]>;
    }
    : T;
/*
Method
*/
export const getCookieValue = (
    event: APIGatewayProxyEventV2,
    key: typeof tokenParams[number],
) => {
    if (!event.cookies) return '';
    const { cookies } = event;
    const search = `${key.toLowerCase()}=`;
    for (const cookie of cookies) {
        if (cookie.toLowerCase().startsWith(search)) {
            return cookie.substring(search.length);
        }
    }
    return '';
};

export const lambdaResponse = (
    value: any,
    statusCode: number,
    contentType: KeyValue = { 'Content-Type': 'application/json' },
): APIGatewayProxyResult => {
    return {
        headers: contentType,
        body: JSON.stringify(value),
        statusCode,
    } as APIGatewayProxyResult;
};
export const tokensToCookies = (tokens?: AuthenticationResultType) => {
    const cookies: string[] = [];
    const options: cookie.SerializeOptions = {
        httpOnly: true,
        secure: true,
        sameSite: 'none',
        path: '/',
        domain: tokenDomain,
    };
    try {
        // Xử lý trường hợp không có tokens (xóa cookie)
        if (!tokens) {
            tokenParams.forEach((tokenName) => {
                cookies.push(
                    cookie.serialize(tokenName, "", {
                        ...options,
                        maxAge: 0, // Xóa cookie ngay lập tức
                    })
                );
            });
            return cookies;
        }

        // Tạo cookie từ tokens
        tokenParams.forEach((tokenName) => {
            const tokenValue = tokens[tokenName as keyof AuthenticationResultType] as string | undefined;
            if (!tokenValue) {
                console.error(`Token ${tokenName} không tồn tại trong phản hồi xác thực`);
                return;
            }
            cookies.push(
                cookie.serialize(tokenName, tokenValue, options)
            );
        });

        return cookies;
    } catch (error) {
        console.error("Lỗi khi tạo cookies:", error);
        return []; // Trả về mảng rỗng để tránh crash
    }
    return cookies;
};

export const userProperties = (
    groups?: GroupType[],
    user?: GetUserCommandOutput,
) => {
    const admin =
        groups?.some(({ GroupName }) => GroupName === constants.groups.admin) ===
        true;
    const manageProducts =
        groups?.some(({ GroupName }) => GroupName === constants.groups.product) ===
        true;
    const emailVerified =
        user?.UserAttributes?.find(
            ({ Name, Value }) => Name === 'email_verified' && Value === 'true',
        )?.Value === 'true';

    return {
        admin,
        manageProducts,
        emailVerified,
        username: user?.Username,
    };
};
export const isAdmin = (event: APIGatewayProxyEventV2): boolean => {
    console.log('Authorizer Context:', JSON.stringify((event.requestContext as any).authorizer, null, 2));
    const authorizerContext = (event.requestContext as any).authorizer?.lambda;
    const groups = authorizerContext?.idPayload?.['cognito:groups'] || [];
    console.log('User Groups from Authorizer:', groups); // 👈 Log groups
    return groups.includes(constants.groups.admin);

};

export const strLower = (str: string, capitalize = true) => {
    str = str.replace(/\s\s+/g, ' ').trim();
    if (capitalize) {
        let upper = true;
        let newStr = '';
        for (let i = 0, l = str.length; i < l; i++) {
            if (str[i] === ' ') {
                upper = true;
                newStr += ' ';
                continue;
            } else if (str[i] === '-') {
                upper = true;
                newStr += '-';
                continue;
            }
            newStr += upper ? str[i].toUpperCase() : str[i].toLowerCase();
            upper = false;
        }
        return newStr;
    }
    return str.toLowerCase();
};
export const validIntNumber = (number: string) => /^[0-9]+$/.test(number);
export const validFloatNumber = (price: string) => {
    const validFloatNumber =
        /[0-9]/.test(price) && /^[+-]?(\d*)[.]?(\d*)$/.test(price);
    return validFloatNumber;
};
export const UpdateItem = async (
    ddbClient: DynamoDBClient,
    tableName: string,
    item: any,
    indexKeys: any,
) => {
    const keys = Object.keys(item);
    const params: UpdateItemCommandInput = {
        TableName: tableName,
        Key: marshall(indexKeys),
        UpdateExpression: `SET ${keys
            .map((_, index) => `#key${index} = :value${index}`)
            .join(', ')}`,
        ExpressionAttributeNames: keys.reduce(
            (acc, key, index) => ({
                ...acc,
                [`#key${index}`]: key,
            }),
            {},
        ),
        ExpressionAttributeValues: marshall(
            keys.reduce(
                (acc, key, index) => ({
                    ...acc,
                    [`:value${index}`]: item[key],
                }),
                {},
            ),
        ),
    };
    const updateResult = await ddbClient.send(new UpdateItemCommand(params));
    return updateResult;
};
export const addItems = (
    items: KeyValue<AttributeValue>[],
    queryResult: KeyValue<any>[],
    limit: number,
) => {
    items.some(item => {
        if (queryResult.length < limit) {
            queryResult.push(unmarshall(item));
            return false;
        }
        return true;
    });
};
export const queryItems = async (
    ddbClient: DynamoDBClient,
    params: QueryCommandInput,
    limit: number,
    query = true,
) => {
    const queryResult: KeyValue<any>[] = [];
    do {
        const { Items, LastEvaluatedKey } = await ddbClient.send(
            query ? new QueryCommand(params) : new ScanCommand(params),
        );
        if (Items) {
            addItems(Items, queryResult, limit);
            params.ExclusiveStartKey = LastEvaluatedKey;
        }
    } while (params.ExclusiveStartKey && queryResult.length < limit);

    return lambdaResponse(
        {
            lastKey: params.ExclusiveStartKey,
            queryResult,
        },
        200,
    );
};
export const getCredentials = async (
    identityPoolId: string,
    event: APIGatewayProxyEventV2,
) => {
    if (isAdmin(event)) {
        return 'Admin Rights';
    }
    const key = `cognito-idp.${poolData.region}.amazonaws.com/${poolData.userPoolId}`;
    const value = getCookieValue(event, 'IdToken'); // event.headers.authorization!;
    if (!value) {
        throw new Error('IdToken is missing');
    }
    const credentials = new CognitoIdentityCredentials({
        IdentityPoolId: identityPoolId,
        Logins: {
            [key]: value,
        },
    });

    await credentials.getPromise();
    return credentials;
};
export const propTrim = (obj: any) => {
    for (const key in obj) {
        if (typeof obj[key] === 'string') {
            obj[key] = obj[key].trim();
        }
    }
};
export const imageToSlot = (obj: ImageSlot) => {
    const slot = obj.image_1 ? 1 : obj.image_2 ? 2 : obj.image_3 ? 3 : 0;
    return slot;
};
export const getProductsById = async (
    id: string[],
    ddbClient: DynamoDBClient,
) => {
    const { productTable } = constants;
    const products: KeyValue<ProductTable> = {};
    const size = 100; // GetItem in Batches of 100
    for (let i = 0; i < id.length; i += size) {
        const ids = id.slice(i, i + size).map(productId => {
            return { id: { S: productId } };
        });
        const params: BatchGetItemCommandInput = {
            RequestItems: {
                [productTable]: {
                    Keys: ids,
                    ProjectionExpression:
                        'id, #name, category, price, image_1, image_2, image_3',
                    ExpressionAttributeNames: {
                        '#name': 'name',
                    },
                },
            },
        };
        const createResult = await ddbClient.send(new BatchGetItemCommand(params));
        // console.log({createResult});
        const response = createResult.Responses;
        // console.log({response});

        response &&
            response[productTable].forEach(currentItem => {
                const item = unmarshall(currentItem) as ProductTable;
                products[item.id] = item;
            });
    }
    return products;
};
export const stripe = (apiKey: string) => {
    const stripe = new Stripe(apiKey, {
        apiVersion: '2025-01-27.acacia',
        typescript: true,
    });
    return stripe;
};
export const loadConfig = async function (parameterName: string) {
    const ssm = new SSM();
    const { Parameter } = await ssm
        .getParameter({ Name: parameterName, WithDecryption: true })
        .promise();
    const value = Parameter?.Value;
    if (!value) return '';
    return JSON.parse(value);
};
/*
Constants
*/
export const origins = [
    'https://api.e-store.store/v1',
];
export const constants = {
    readsPerQuery: 10,
    orderTable: 'orderTable',
    productTable: 'productTable',
    cartIntent: 'cart',
    cartStatus: 'IN CART',
    orderLogs: '-',
    categoryIndex: 'category-index',
    groups: {
        admin: 'admin_group',
        product: 'manage_product_group',
    },
};
export const S3Constants = {
    productImages: `bucket-product-images-${uuidv4().replace(/-/g, '')}`,
};
const tokenDomain = '.e-store.store';
const tokenParams = [
    'AccessToken',
    'IdToken',
    'RefreshToken',
] as const;
export const supportedCategories = [
    'Dragonball',
    'Naruto',
    'One Piece'
];
export enum PaymentStatus {
    CREATED,
    CANCELED,
    SUCCEEDED,
    FAILED,
}
export const supportedCountries: Country[] = [
    {
        code: 'US',
        name: 'United States',
        emoji: '🇺🇸',
        unicode: 'U+1F1FA U+1F1F8',
        image:
            'https://cdn.jsdelivr.net/npm/country-flag-emoji-json@2.0.0/dist/images/US.svg',
    },
    {
        code: 'CN',
        name: 'China',
        emoji: '🇨🇳',
        unicode: 'U+1F1E8 U+1F1F3',
        image:
            'https://cdn.jsdelivr.net/npm/country-flag-emoji-json@2.0.0/dist/images/CN.svg',
    },
    {
        code: 'VN',
        name: 'Vietnam',
        emoji: '🇻🇳',
        unicode: 'U+1F1FB U+1F1F3',
        image: 'https://cdn.jsdelivr.net/npm/country-flag-emoji-json@2.0.0/dist/images/VN.svg'
    },
];
