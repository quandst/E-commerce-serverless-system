import { Construct } from 'constructs';
import { CfnElement, RemovalPolicy } from 'aws-cdk-lib';
import { Role, ServicePrincipal, ManagedPolicy } from 'aws-cdk-lib/aws-iam';

export class IdentityManagement extends Construct {
  public readonly AWSLambdaBasicExecutionRole: (id?: string) => Role;
  public readonly AmazonCognitoPowerUser: (id?: string) => Role;
  public readonly AmazonS3FullAccess: (id?: string) => Role;
  public readonly AmazonDynamoDBFullAccess: (id?: string) => Role;
  public readonly AmazonDynamoDBFullAccessWithSSMFullAccess: (id?: string) => Role;

  constructor(scope: Construct, id: string) {
    super(scope, id);

    this.AmazonCognitoPowerUser = this.createRole('AmazonCognitoPowerUser', [
      'service-role/AWSLambdaBasicExecutionRole',
      'AmazonCognitoPowerUser'
    ]);

    this.AWSLambdaBasicExecutionRole = this.createRole('AWSLambdaBasicExecutionRole', [
      'service-role/AWSLambdaBasicExecutionRole'
    ]);

    this.AmazonDynamoDBFullAccess = this.createRole('AmazonDynamoDBFullAccess', [
      'service-role/AWSLambdaBasicExecutionRole',
      'AmazonDynamoDBFullAccess'
    ]);

    this.AmazonDynamoDBFullAccessWithSSMFullAccess = this.createRole('AmazonDynamoDBFullAccessWithSSMFullAccess', [
      'service-role/AWSLambdaBasicExecutionRole',
      'AmazonDynamoDBFullAccess',
      'AmazonSSMFullAccess'
    ]);

    this.AmazonS3FullAccess = this.createRole('AmazonS3FullAccess', [
      'service-role/AWSLambdaBasicExecutionRole',
      'AmazonDynamoDBFullAccess',
      'AmazonSSMFullAccess',
      'AmazonS3FullAccess'
    ]);
  }

  private createRole(roleName: string, managedPolicies: string[]): (id?: string) => Role {
    return (id = roleName) => {
      const role = new Role(this, id, {
        assumedBy: new ServicePrincipal('lambda.amazonaws.com'),
        managedPolicies: managedPolicies.map(policy => ManagedPolicy.fromAwsManagedPolicyName(policy)),
      });

      (role.node.defaultChild as CfnElement).overrideLogicalId(id);
      role.applyRemovalPolicy(RemovalPolicy.DESTROY);
      return role;
    };
  }
}
