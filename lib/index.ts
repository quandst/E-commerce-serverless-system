import { Stack, App, StackProps, CfnOutput } from 'aws-cdk-lib';
import { Database } from './dynamoDB';
import { Cognito } from './cognito';
import { Microservice } from './microservices';
import { UserGroups } from './userGroups';
import { IdentityManagement } from './identityManagement';
import { S3 } from './s3';
import { ApiGateway } from './apiGateway';

export class CdkStack extends Stack {
    constructor(scope: App, id: string, props?: StackProps) {
        super(scope, id, props);

        const identityManagement = new IdentityManagement(this, 'IdentityManagement');
        const roles = this.initializeRoles(identityManagement);

        const cognito = new Cognito(this, 'Cognito');
        const apiGateway = new ApiGateway(this, 'ApiGateway');
        const userGroups = this.createUserGroups(cognito, roles);

        const environment = this.createEnvironmentVariables(cognito, userGroups);

        new Database(this, 'Database');
        const s3Bucket = new S3(this, 'S3');

        new Microservice(this, 'Microservice', {
            httpApi: apiGateway.httpApi,
            environment,
            awsLambdaBasicExecutionRole: roles.AWSLambdaBasicExecutionRole,
            amazonCognitoPowerUser: roles.AmazonCognitoPowerUser,
            amazonDynamoDBFullAccess: roles.AmazonDynamoDBFullAccess,
            amazonDynamoDBFullAccessWithSSMFullAccess: roles.AmazonDynamoDBFullAccessWithSSMFullAccess,
            amazonS3FullAccess: roles.AmazonS3FullAccess,
            productBucket: s3Bucket.productBucket,
        });

        this.createCdkOutputs(cognito, apiGateway);
    }

    private initializeRoles(identityManagement: IdentityManagement) {
        return {
            AWSLambdaBasicExecutionRole: identityManagement.AWSLambdaBasicExecutionRole(),
            AmazonCognitoPowerUser: identityManagement.AmazonCognitoPowerUser(),
            AmazonDynamoDBFullAccess: identityManagement.AmazonDynamoDBFullAccess(),
            AmazonDynamoDBFullAccessWithSSMFullAccess: identityManagement.AmazonDynamoDBFullAccessWithSSMFullAccess(),
            AmazonS3FullAccess: identityManagement.AmazonS3FullAccess(),
        };
    }

    private createUserGroups(cognito: Cognito, roles: any) {
        return new UserGroups(this, 'UserGroups', {
            amazonCognitoPowerUser: roles.AmazonCognitoPowerUser,
            userPool: cognito.userPool,
            userPoolClient: cognito.userPoolClient,
        }).identityPools;
    }

    private createEnvironmentVariables(cognito: Cognito, userGroups: any) {
        return {
            userPoolId: cognito.userPool.userPoolId,
            userPoolClientId: cognito.userPoolClient.userPoolClientId,
            region: Stack.of(this).region,
            providerName: cognito.userPool.userPoolProviderName,
            ...userGroups,
        };
    }

    private createCdkOutputs(cognito: Cognito, apiGateway: ApiGateway) {
        new CfnOutput(this, 'accountId', { value: Stack.of(this).account });
        new CfnOutput(this, 'region', { value: Stack.of(this).region });
        new CfnOutput(this, 'availabilityZones', {
            value: Stack.of(this).availabilityZones.join(', '),
        });
        new CfnOutput(this, 'userPoolId', { value: cognito.userPool.userPoolId });
        new CfnOutput(this, 'userPoolClientId', {
            value: cognito.userPoolClient.userPoolClientId,
        });
        new CfnOutput(this, 'apiUrl', {
            value: apiGateway.httpApi.url!,
        });
    }
}
