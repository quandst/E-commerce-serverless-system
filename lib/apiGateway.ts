import { CorsHttpMethod, HttpApi } from 'aws-cdk-lib/aws-apigatewayv2';
import { RemovalPolicy } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { origins } from './utils';

export class ApiGateway extends Construct {
  public readonly httpApi: HttpApi;

  constructor(scope: Construct, id: string) {
    super(scope, id);

    this.httpApi = this.createHttpApi();
  }

  private createHttpApi(): HttpApi {
    const httpApi = new HttpApi(this, 'HttpApi', {
      apiName: 'e-commerce api',
      corsPreflight: this.getCorsConfiguration(),
    });

    httpApi.applyRemovalPolicy(RemovalPolicy.DESTROY);
    return httpApi;
  }

  private getCorsConfiguration() {
    return {
      allowHeaders: [
        'Content-Type',
        'X-Amz-Date',
        'Authorization',
        'X-Api-Key',
        'Cookie',
      ],
      allowMethods: [
        CorsHttpMethod.GET,
        CorsHttpMethod.POST,
        CorsHttpMethod.PUT,
        CorsHttpMethod.DELETE,
        CorsHttpMethod.OPTIONS,
      ],
      allowCredentials: true,
      allowOrigins: origins,
      exposeHeaders: [
        "Set-Cookie", // 👈 Cho phép client nhận cookie từ response
      ],
    };
  }
}
