/* eslint-disable @typescript-eslint/require-await */
import {
    APIGatewayProxyEventV2,
    APIGatewayProxyResult,
} from 'aws-lambda/trigger/api-gateway-proxy';
import S3, { PresignedPost } from 'aws-sdk/clients/s3';
import { DynamoDBClient, GetItemCommand } from '@aws-sdk/client-dynamodb';
import { marshall } from '@aws-sdk/util-dynamodb';
import { HttpMethod } from 'aws-cdk-lib/aws-events';
import {
    getCredentials,
    lambdaResponse,
    constants,
    ProductTable,
    S3Constants,
    UpdateItem,
} from '../../../../lib/utils';
import { poolData } from '../../../config';

const { productImages } = S3Constants;

//  Get the form fields and target URL for direct POST uploading.
export function createPresignedPost(
    filePath: string,
    fileType: string,
): Promise<PresignedPost> {
    const params: PresignedPost.Params = {
        Bucket: productImages,
        Fields: {
            key: filePath,
            acl: 'public-read',
            'Content-Type': fileType,
        },
        Conditions: [
            //  content length restrictions: 0-1MB]
            ['content-length-range', 0, 1000000],
            // specify content-type to be more generic- images only
            // ["starts-with", "$Content-Type", "image/"],
        ],
        //  number of seconds for which the presigned policy should be valid
        Expires: 300, // 5mins
    };

    const s3 = new S3();
    return s3.createPresignedPost(params) as unknown as Promise<PresignedPost>;
}

export async function productImage(
    event: APIGatewayProxyEventV2,
): Promise<APIGatewayProxyResult> {
    try {
        //  check if user is authorized to delete or update product
        await getCredentials(
            process.env[`${constants.groups.product}_pool`]!,
            event,
        );

        const requestBody = JSON.parse(event.body || '{}');
        const productId = event.pathParameters?.id;
        //  check if productId is valid
        if (!productId)
            return lambdaResponse({ name: 'InvalidProductIdException' }, 400);

        //  check if image slot is valid
        const slot = parseInt(event.queryStringParameters?.slot || '');
        if (slot !== 1 && slot !== 2 && slot !== 3)
            return lambdaResponse({ name: 'InvalidSlotException' }, 400);

        const { productTable } = constants;
        const ddbClient = new DynamoDBClient({ region: poolData.region });
        const { Item } = await ddbClient.send(
            new GetItemCommand({
                TableName: productTable,
                Key: marshall({ id: productId }),
            }),
        );
        //  check if product exist
        if (!Item) return lambdaResponse({ name: 'NoProductWithIdException' }, 400);

        const filePath = `${productId}/${slot}`; // + "." + fileType.substring(6);

        const method = event.requestContext.http.method as HttpMethod;
        switch (method) {
            case HttpMethod.POST:
                //  check if image fileType is an image file
                const fileType = (requestBody.fileType || '') as string;
                if (
                    !fileType ||
                    !fileType.startsWith('image/') ||
                    fileType.length === 6
                )
                    return lambdaResponse({ name: 'InvalidFileTypeException' }, 400);

                const presignedPost = await createPresignedPost(filePath, fileType);
                return lambdaResponse(presignedPost, 200);
            case HttpMethod.DELETE:
                //  set image to invalid
                const productUpdate: Partial<ProductTable> = {
                    [`image_${slot}`]: false,
                };
                //  update product image
                const updateResult = await UpdateItem(
                    ddbClient,
                    productTable,
                    productUpdate,
                    { id: productId },
                );
                //  delete image from  s3 bucket
                const s3 = new S3();
                const deleteResult = await s3
                    .deleteObject({
                        Bucket: productImages,
                        Key: filePath,
                    })
                    .promise();

                return lambdaResponse({ updateResult, deleteResult }, 200);

            default:
                return lambdaResponse({ name: `Unsupported route: "${method}"` }, 400);
        }
    } catch (error) {
        return lambdaResponse(error, 500);
    }
}
