export interface Env {
  // Add any environment variables here
}

export default class Service {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    return new Response("Hello from Worker 1!", {
      headers: { "content-type": "text/plain" },
    });
  }
};
