import * as apiGatewayIntegrations from '@aws-cdk/aws-apigatewayv2-integrations-alpha';
import { Runtime } from 'aws-cdk-lib/aws-lambda';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import { Role } from 'aws-cdk-lib/aws-iam';
import { join } from 'path';
import {
    AddRoutesOptions,
    HttpApi,
    HttpMethod,
    IHttpRouteAuthorizer,
} from '@aws-cdk/aws-apigatewayv2-alpha';
import { Construct } from 'constructs';
import { CfnElement, Duration } from 'aws-cdk-lib';
import { Bucket, EventType } from 'aws-cdk-lib/aws-s3';
import { LambdaDestination } from 'aws-cdk-lib/aws-s3-notifications';
import {
    HttpLambdaAuthorizer,
    HttpLambdaResponseType,
} from '@aws-cdk/aws-apigatewayv2-authorizers-alpha';
import { KeyValue } from './utils';

interface MicroserviceProps {
    httpApi: HttpApi;
    environment: KeyValue;
    amazonCognitoPowerUser: Role;
    productBucket: Bucket;
    awsLambdaBasicExecutionRole: Role;
    amazonDynamoDBFullAccess: Role;
    amazonDynamoDBFullAccessWithSSMFullAccess: Role;
    amazonS3FullAccess: Role;
}

export class Microservice extends Construct {
    private readonly apiVersion = 'v1';

    constructor(scope: Construct, id: string, props: MicroserviceProps) {
        super(scope, id);

        const {
            httpApi,
            environment,
            amazonCognitoPowerUser,
            awsLambdaBasicExecutionRole,
            amazonDynamoDBFullAccess,
            amazonDynamoDBFullAccessWithSSMFullAccess,
            amazonS3FullAccess,
            productBucket,
        } = props;

        const authorizer = this.createAuthorizer(amazonCognitoPowerUser);

        this.addRoutes(httpApi, environment, authorizer, {
            amazonCognitoPowerUser,
            awsLambdaBasicExecutionRole,
            amazonDynamoDBFullAccess,
            amazonDynamoDBFullAccessWithSSMFullAccess,
            amazonS3FullAccess,
        });

        this.setupS3EventNotifications(productBucket, amazonDynamoDBFullAccess);
    }

    private createFunction(
        handler: string,
        entry: string,
        role: Role
    ): NodejsFunction {
        const nodejsFunction = new NodejsFunction(this, handler, {
            runtime: Runtime.NODEJS_18_X,
            handler,
            role,
            entry: join(__dirname, `/../src/${entry}/index.ts`),
            bundling: {
                externalModules: ['aws-sdk'],
            },
            environment: this.node.tryGetContext('environment'),
        });

        (nodejsFunction.node.defaultChild as CfnElement).overrideLogicalId(handler);
        return nodejsFunction;
    }

    private createRoute(
        handler: string,
        entry: string,
        routePath: string,
        methods: HttpMethod[],
        role: Role = this.node.tryGetContext('defaultRole'),
        authorizer?: IHttpRouteAuthorizer
    ): AddRoutesOptions {
        const nodejsFunction = this.createFunction(handler, entry, role);

        return {
            integration: new apiGatewayIntegrations.HttpLambdaIntegration(handler, nodejsFunction),
            path: `/${this.apiVersion}${routePath}`,
            methods,
            authorizer,
        };
    }

    private createAuthorizer(role: Role): HttpLambdaAuthorizer {
        return new HttpLambdaAuthorizer('lambdaAuthorizer', this.createFunction('authorizer', 'authorizer', role), {
            responseTypes: [HttpLambdaResponseType.SIMPLE],
            authorizerName: 'lambdaAuthorizer',
            identitySource: [],
            resultsCacheTtl: Duration.seconds(0),
        });
    }

    private addRoutes(
        httpApi: HttpApi,
        environment: KeyValue,
        authorizer?: IHttpRouteAuthorizer,
        roles?: Record<string, Role>
    ) {
        const routes = [
            { handler: 'register', entry: 'register', path: '/register', methods: [HttpMethod.POST], role: roles?.amazonCognitoPowerUser },
            { handler: 'login', entry: 'login', path: '/login', methods: [HttpMethod.POST], role: roles?.amazonCognitoPowerUser },
            { handler: 'logout', entry: 'logout', path: '/logout', methods: [HttpMethod.POST], role: roles?.amazonCognitoPowerUser },
            { handler: 'refresh', entry: 'refresh', path: '/refresh', methods: [HttpMethod.POST], role: roles?.amazonCognitoPowerUser },
            { handler: 'verify', entry: 'verify', path: '/verify', methods: [HttpMethod.POST], authorizer },
            { handler: 'userGroup', entry: 'userGroup', path: '/user-group/{groupname}', methods: [HttpMethod.POST, HttpMethod.DELETE], role: roles?.amazonCognitoPowerUser, authorizer },
            { handler: 'paymentHook', entry: 'payment/hook', path: '/payment/hook', methods: [HttpMethod.POST], role: roles?.amazonS3FullAccess },
            { handler: 'paymentCheckout', entry: 'payment/checkout', path: '/payment/checkout', methods: [HttpMethod.POST], role: roles?.amazonDynamoDBFullAccessWithSSMFullAccess, authorizer },
            // Add more routes here as needed...
        ];

        routes.forEach(route => {
            httpApi.addRoutes(this.createRoute(route.handler, route.entry, route.path, route.methods, route.role, route.authorizer));
        });

        // Special case for productId with GET and PUT/DELETE
        const productIdOptions = this.createRoute('productId', 'product/id', '/product/{id}', [HttpMethod.GET], roles?.amazonDynamoDBFullAccess);

        httpApi.addRoutes({ ...productIdOptions, methods: [HttpMethod.GET] });

        httpApi.addRoutes({ ...productIdOptions, methods: [HttpMethod.PUT, HttpMethod.DELETE], authorizer });

        // Additional static routes
        const staticRoutes = [
            { handler: 'auth', entry: 'auth', path: '/auth', method: [HttpMethod.GET], role: roles?.amazonCognitoPowerUser, authorizer },
            { handler: 'users', entry: 'users', path: '/users', method: [HttpMethod.GET], role: roles?.amazonCognitoPowerUser, authorizer }
            // Add more static routes here as needed...
        ];

        staticRoutes.forEach(route => {
            httpApi.addRoutes(this.createRoute(route.handler, route.entry, route.path, route.method, route.role, route.authorizer))
        })
    }

    private setupS3EventNotifications(productBucket: Bucket, role?: Role) {
        const s3EventFunction = this.createFunction('s3Event', 's3Event', role);
        productBucket.addEventNotification(EventType.OBJECT_CREATED, new LambdaDestination(s3EventFunction));
    }
}
