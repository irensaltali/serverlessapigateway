<div align="center">
	<img  src="docs/hero.jpeg">
    <h1> 
        <strong>Serverless API Gateway</strong>
    </h1>
</div>


Welcome to the Serverless API Gateway, an innovative tool designed to streamline your API management tasks using the powerful capabilities of Cloudflare Workers.

## Features

- **JS Workers**: Write serverless JavaScript workers that intercept and modify your API requests and responses on the fly.
- **Routing (Path and Method)**: Simplify your API architecture with flexible path and method-based routing for directing traffic to the appropriate endpoints.
- **CORS (Basic)**: Manage cross-origin resource sharing settings with ease, ensuring your APIs can securely handle requests from different origins.
- **Auth (JWT)**: Secure your APIs by implementing JSON Web Token (JWT) based authentication to validate and manage user access efficiently.

## Motivation

APIs are pivotal in the landscape of modern applications, but they bring forth a unique set of challenges regarding security, routing, and overall management. The Serverless API Gateway emerged from the need to address these issues in a reliable, manageable, and cost-effective way. Built upon Cloudflare's serverless infrastructure, this project provides developers with a lightweight yet robust toolkit that adapts to the unpredictability of internet scale and traffic. Our mission is to empower developers to securely and efficiently manage their APIs without the overhead of managing infrastructure.

## Getting Started

To start using the Serverless API Gateway:

1. Clone the repository:
```bash
git clone https://github.com/irensaltali/serverlessapigateway.git
```

1. Install dependencies:
```bash
npm install
```

1. Configure your routes, CORS settings, and JWT secrets within the provided configuration files.

2. Deploy your workers to Cloudflare using the command:
```bash
wrangler publish
```

(For detailed setup and usage instructions, please refer to our comprehensive documentation.)

## Contributing

Your contributions are what make the Serverless API Gateway an even better API management solution! If you have suggestions for new features, notice a bug, or want to improve the code, please take the following steps:

1. Fork the repository.
2. Implement your changes on a new branch.
3. Submit a pull request with a clear description of your improvements.


## Acknowledgments

A shoutout to the contributors, community members, and the maintainers of Cloudflare Workers for their support and inspiration in making this project a reality.

The Serverless API Gateway is not just another API tool; it's created by developers, for developers, with the vision of making API management a breeze. Let's build together.
