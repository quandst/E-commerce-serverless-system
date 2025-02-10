/* eslint-disable @typescript-eslint/require-await */
import { APIGatewayProxyEventV2 } from 'aws-lambda';
import { CognitoJwtVerifier } from 'aws-jwt-verify';
import {
    CognitoJwtVerifierProperties,
    CognitoVerifyProperties,
} from 'aws-jwt-verify/cognito-verifier';
import { CognitoJwtPayload } from 'aws-jwt-verify/jwt-model';
import {
    CognitoIdentityProvider,
    GetUserCommandOutput,
} from '@aws-sdk/client-cognito-identity-provider';
import { getCookieValue } from '../../lib/utils';

interface Result {
    isAuthorized: boolean;
    context?: {
        [key: string]: CognitoJwtPayload | GetUserCommandOutput;
    };
}

/**
 * Authorizes API requests by verifying access and ID tokens from cookies.
 * @param event - The API Gateway proxy event containing cookie information.
 * @returns A promise resolving to an object indicating authorization status and context.
 */
export async function authorizer(
    event: APIGatewayProxyEventV2,
): Promise<Result> {
    const result: Result = {
        isAuthorized: false,
    };

    try {
        const userPoolId = process.env.userPoolId;
        const userPoolClientId = process.env.userPoolClientId;
        const region = process.env.region;

        if (!userPoolId || !userPoolClientId || !region) {
            console.error(
                'Missing required environment variables: userPoolId, userPoolClientId, or region',
            );
            return result;
        }

        const verifyProperties: {
            userPoolId: string;
        } & Partial<CognitoVerifyProperties> &
            Partial<CognitoJwtVerifierProperties> = {
            tokenUse: 'access',
            userPoolId: userPoolId,
            clientId: userPoolClientId,
        };

        // Verify access token
        const accessToken = getCookieValue(event, 'AccessToken');
        const accessVerifier = CognitoJwtVerifier.create(verifyProperties);
        const accessPayload = await verifyToken(
            accessVerifier,
            accessToken,
            'access',
            userPoolClientId,
        );

        if (!accessPayload) {
            console.warn('Access token verification failed.');
            return result;
        }

        // Verify ID token
        verifyProperties.tokenUse = 'id';
        const idToken = getCookieValue(event, 'IdToken');
        const idVerifier = CognitoJwtVerifier.create(verifyProperties);
        const idPayload = await verifyToken(
            idVerifier,
            idToken,
            'id',
            userPoolClientId,
        );

        if (!idPayload) {
            console.warn('ID token verification failed.');
            return result;
        }

        // Validate token consistency
        if (
            accessPayload.sub !== idPayload.sub ||
            accessPayload.exp !== idPayload.exp ||
            accessPayload.origin_jti !== idPayload.origin_jti
        ) {
            console.warn('Token consistency check failed.');
            return result;
        }

        // Check access token validity via Cognito
        const cognitoProvider = new CognitoIdentityProvider({ region });
        const user = await cognitoProvider.getUser({ AccessToken: accessToken });

        result.context = {
            accessPayload,
            idPayload,
            user,
        };

        result.isAuthorized = true;
        return result;
    } catch (error) {
        console.error('Authorization error:', error);
        return result;
    }
}

/**
 * Verifies a JWT token using the provided verifier.
 * @param verifier - The CognitoJwtVerifier instance.
 * @param token - The JWT token to verify.
 * @param tokenUse - The intended use of the token ('access' or 'id').
 * @param clientId - The client ID of the Cognito User Pool.
 * @returns The decoded JWT payload if verification succeeds, otherwise null.
 */
async function verifyToken(
    verifier: CognitoJwtVerifier,
    token: string | null,
    tokenUse: string,
    clientId: string,
): Promise<CognitoJwtPayload | null> {
    if (!token) {
        console.warn(`Token is missing.`);
        return null;
    }
    try {
        return await verifier.verify(token, {
            tokenUse: tokenUse,
            clientId: clientId,
        });
    } catch (error) {
        console.error(`Token verification failed:`, error);
        return null;
    }
}
