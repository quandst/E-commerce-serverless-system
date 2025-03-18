// import { Duration, RemovalPolicy } from 'aws-cdk-lib';
// import { Construct } from 'constructs';
// import {
//   UserPool,
//   UserPoolClient,
//   UserPoolClientIdentityProvider,
//   AccountRecovery,
// } from 'aws-cdk-lib/aws-cognito';

// export class Cognito extends Construct {
//   public readonly userPool: UserPool;
//   public readonly userPoolClient: UserPoolClient;

//   constructor(scope: Construct, id: string) {
//     super(scope, id);

//     this.userPool = this.createUserPool();
//     this.userPoolClient = this.createUserPoolClient();
//   }

//   private createUserPool(): UserPool {
//     return new UserPool(this, 'UserPool', {
//       userPoolName: 'userpool',
//       removalPolicy: RemovalPolicy.DESTROY,
//       selfSignUpEnabled: true,
//       signInCaseSensitive: false,
//       signInAliases: { username: true, email: true },
//       passwordPolicy: this.getPasswordPolicy(),
//       accountRecovery: AccountRecovery.EMAIL_ONLY,
//     });
//   }

//   private getPasswordPolicy() {
//     return {
//       minLength: 6,
//       requireLowercase: true,
//       requireDigits: true,
//       requireUppercase: true,
//       requireSymbols: true,
//     };
//   }

//   private createUserPoolClient(): UserPoolClient {
//     const userPoolClient = new UserPoolClient(this, 'UserPoolClient', {
//       userPool: this.userPool,
//       accessTokenValidity: Duration.minutes(60),
//       idTokenValidity: Duration.minutes(60),
//       refreshTokenValidity: Duration.days(1),
//       authFlows: this.getAuthFlows(),
//       supportedIdentityProviders: [UserPoolClientIdentityProvider.COGNITO],
//     });

//     userPoolClient.applyRemovalPolicy(RemovalPolicy.DESTROY);
//     return userPoolClient;
//   }

//   private getAuthFlows() {
//     return {
//       adminUserPassword: true,
//       userPassword: true,
//       custom: true,
//       userSrp: true,
//     };
//   }
// }

import { Duration, RemovalPolicy } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import {
  UserPool,
  UserPoolClient,
  UserPoolClientIdentityProvider,
  AccountRecovery,
} from 'aws-cdk-lib/aws-cognito';

// Constants for configuration
const ACCESS_TOKEN_VALIDITY = Duration.minutes(15); // Shorter for better security
const ID_TOKEN_VALIDITY = Duration.minutes(15);
const REFRESH_TOKEN_VALIDITY = Duration.days(30);
const PASSWORD_MIN_LENGTH = 8; // Stronger password policy
const REMOVAL_POLICY = RemovalPolicy.DESTROY; // Use conditional logic for production

export class Cognito extends Construct {
  public readonly userPool: UserPool;
  public readonly userPoolClient: UserPoolClient;

  constructor(scope: Construct, id: string) {
    super(scope, id);

    this.userPool = this.createUserPool();
    this.userPoolClient = this.createUserPoolClient();
  }

  private createUserPool(): UserPool {
    return new UserPool(this, 'UserPool', {
      userPoolName: 'userpool',
      removalPolicy: REMOVAL_POLICY,
      selfSignUpEnabled: true,
      signInCaseSensitive: false,
      signInAliases: { username: true, email: true },
      passwordPolicy: this.getPasswordPolicy(),
      accountRecovery: AccountRecovery.EMAIL_ONLY,
    });
  }

  private getPasswordPolicy() {
    return {
      minLength: PASSWORD_MIN_LENGTH,
      requireLowercase: true,
      requireDigits: true,
      requireUppercase: true,
      requireSymbols: true,
    };
  }

  private createUserPoolClient(): UserPoolClient {
    const userPoolClient = new UserPoolClient(this, 'UserPoolClient', {
      userPool: this.userPool,
      accessTokenValidity: ACCESS_TOKEN_VALIDITY,
      idTokenValidity: ID_TOKEN_VALIDITY,
      refreshTokenValidity: REFRESH_TOKEN_VALIDITY,
      authFlows: this.getAuthFlows(),
      supportedIdentityProviders: [UserPoolClientIdentityProvider.COGNITO],
    });

    userPoolClient.applyRemovalPolicy(REMOVAL_POLICY);
    return userPoolClient;
  }

  private getAuthFlows() {
    return {
      adminUserPassword: true,
      userPassword: true,
      custom: true,
      userSrp: true,
    };
  }
}