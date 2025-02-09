import {
    Bucket,
    BucketEncryption,
    HttpMethods,
    StorageClass,
  } from 'aws-cdk-lib/aws-s3';
  import { RemovalPolicy, Duration } from 'aws-cdk-lib';
  import { Construct } from 'constructs';
  import { origins, S3Constants } from './utils';
  
  export class S3 extends Construct {
    public readonly productBucket: Bucket;
  
    constructor(scope: Construct, id: string) {
      super(scope, id);
      
      this.productBucket = this.createProductBucket();
    }
  
    private createProductBucket(): Bucket {
      const { productImages } = S3Constants;
  
      return new Bucket(this, productImages, {
        bucketName: productImages,
        removalPolicy: RemovalPolicy.DESTROY,
        autoDeleteObjects: true,
        versioned: false,
        publicReadAccess: false,
        encryption: BucketEncryption.S3_MANAGED,
        cors: this.getCorsConfiguration(),
        lifecycleRules: this.getLifecycleRules(),
      });
    }
  
    private getCorsConfiguration() {
      return [
        {
          allowedMethods: [HttpMethods.GET, HttpMethods.POST, HttpMethods.PUT],
          allowedOrigins: origins,
          allowedHeaders: ['*'],
        },
      ];
    }
  
    private getLifecycleRules() {
      return [
        {
          abortIncompleteMultipartUploadAfter: Duration.days(90),
          transitions: [
            {
              storageClass: StorageClass.INFREQUENT_ACCESS,
              transitionAfter: Duration.days(30),
            },
          ],
        },
      ];
    }
  }
  