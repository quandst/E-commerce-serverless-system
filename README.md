

# # E-commerce-serverless-system Backend Implementation Using Event-driven Serverless Microservice Architecture



The __Serverless E-Store Backend__ is an implementation of a serverless backend for an e-commerce website. Functionalities are split across multiple micro-services that communicate through APIs.

__This project is as an inspiration on how to build event-driven serverless microservice on AWS.__ This makes lots of assumptions on the order flow suitable for most e-commerce platform.

You can explore the [Live REST API](https://petstore.swagger.io/?url=https://raw.githubusercontent.com/evanigwilo/e-store/server/resources/api-definition.yml)

## Design Notes

- There are two users with usernames `admin` and `user` with same password `123456`
  - `admin` has full privileges which includes managing products and users
  - `user` has privileges of managing only products
- REST API and CRUD endpoints using AWS Lambda, API Gateway
- User authentication/authorization and verification using AWS Cognito and Amazon Simple Email Service (SES)
- Data persistence with AWS DynamoDB and AWS S3
- Cloud stack development with Infrastructure as code (IaC) using AWS CloudFormation and AWS Cloud Development Kit (AWS CDK)
- Payment processing using Stripe APIs and Webhooks
- Test Driven Development (TDD)

---
## Architecture

### High-level architecture

This is a high-level view of how the different microservice interact with each other. 

<p align="center">
  <img src="/resources/Architecture.jpg" height="400px" alt="High-level Architecture"/>
</p>

---
### AWS Technologies used

__Communication/Messaging__:

* [Amazon API Gateway](https://aws.amazon.com/api-gateway/) for service-to-service synchronous communication (request/response).
* [Amazon Simple Email Service (SES)](https://aws.amazon.com/ses/) send immediate, trigger-based communications from your application to customers, such as account confirmations or password resets.

__Authentication/Authorization__:

* [Amazon Cognito](https://aws.amazon.com/cognito/) for managing and authenticating users, and providing JSON web tokens used by services.
* [AWS Identity and Access Management](https://aws.amazon.com/iam/) for service-to-service authorization, either between microservices (e.g. authorize to call an Amazon API Gateway REST endpoint), or within a microservice (e.g. granting a Lambda function the permission to read from a DynamoDB table).

__Compute__:

* [AWS Lambda](https://aws.amazon.com/lambda/) as serverless compute either behind APIs or to react to asynchronous events.

__Storage__:

* [Amazon DynamoDB](https://aws.amazon.com/dynamodb/) as a scalable NoSQL database for persisting informations.
* [Amazon S3](https://aws.amazon.com/s3/) store data as objects within resources called “buckets” with features that include capabilities to append metadata tags to objects, move and store data.

__CI/CD__:

* [AWS CloudFormation](https://aws.amazon.com/cloudformation/) with [AWS Serverless Application Model](https://aws.amazon.com/serverless/sam/) for defining AWS resources as code in most services.
* [AWS Cloud Development Kit (CDK)](https://aws.amazon.com/cdk/) for defining AWS resources as code.

__Networking/Routing__:

* [AWS Route 53](https://aws.amazon.com/route53/) scalable DNS and Domain Name Registration. It resolves domain names to it's equivalent IP address.
* [AWS Certificate Manager (ACM)](https://aws.amazon.com/acm/) makes it easy to provision, manage, deploy, and renew SSL/TLS certificates

__Management__:

* [AWS Systems Manager](https://aws.amazon.com/systems-manager/) with [Parameter Store](https://aws.amazon.com/systems-manager/features/#Parameter_Store/) provides a centralized store to manage your configuration data, whether plain-text data such as database strings or secrets such as passwords.

__Monitoring__:

* [Amazon CloudWatch](https://aws.amazon.com/cloudwatch/) for metrics, dashboards, log aggregation.

### Lambda services

|  Services  | Description                               |
|------------|-------------------------------------------|
| auth | Gets user attributes for the current authenticated user. |
| register | Registers and authenticates users. |
| login | Logs in and authenticates users. |
| logout | Logs out the current authenticated user. |
| verify | Sends or verifies user using code sent via email. |
| refresh | Refreshes tokens using refresh token from cookie. |
| category | Gets supported product categories. |
| country | Gets supported countries for delivery. |
| products | Query/Search for products. |
| product/{id} | Manages a product such creating, updating and deleting. |
| order | Query/Search for orders. |
| order/create | Manages an order such creating, updating and deleting. |
| order/{intent} | Gets an order by intent such as `cart` or payment intent. |
| payment/checkout | Checkouts an order. |
| payment/hook | Webhook for updating payment processing. |
| users | Gets users. |
| user-group/{groupname} | Manages user groups such as adding and removing. |

## Other Technologies Used

__Payment__:

* [Stripe | Payment Processing Platform](https://stripe.com/) with [Webhooks](https://stripe.com/docs/webhooks) notifies application using HTTPS when an event happens; used for asynchronous events such as when a customer’s bank confirms a payment, a customer disputes a charge, a recurring payment succeeds, or when collecting subscription payments.

---
## Requirements

Before getting started, make sure you have the following requirements:

- Your own [Stripe account](https://stripe.com/)
- Your own [AWS account](https://aws.amazon.com/free)
- An AWS user with Admin access and Programmatic Access
- The [AWS Command Line Interface](https://aws.amazon.com/cli) installed **and configured for your user**
- The [AWS CDK Toolkit](https://docs.aws.amazon.com/cdk/v2/guide/cli.html) which is the primary tool for interacting with your AWS CDK app
- [Node.js](https://nodejs.org) (v18 or higher)
- A [bash](https://www.gnu.org/software/bash) compatible shell

>Note: Make sure that your AWS Profile has been configured properly, run the below command to view profiles:

```bash
aws configure list-profiles
```

## References
> [Amazon Web Services | Cloud Computing Services](https://aws.amazon.com/)

> [Stripe | Payment Processing Platform](https://stripe.com/)

> [Swagger: API Documentation & Design Tools for Teams](https://swagger.io/specification/)

