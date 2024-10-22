export default class Service {
  async fetch(request, env, ctx) {
    return new Response("Hello from Worker 1!", {
      headers: { "content-type": "text/plain" },
    });
  }
};
