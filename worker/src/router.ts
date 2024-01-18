import { Router } from 'itty-router';
import apiConfig from './api-config.json';

const router = Router();

// Define a type for the router methods
type RouterMethod = (path: string, handler: () => Response) => void;

// Define a map of HTTP methods to router functions with an index signature
const routerMethods: { [key: string]: RouterMethod | undefined } = {
  GET: router.get.bind(router),
  POST: router.post.bind(router),
  PUT: router.put.bind(router),
  DELETE: router.delete.bind(router),
  PATCH: router.patch.bind(router),
  ANY: router.all.bind(router),
  ALL: router.all.bind(router),
};

apiConfig.forEach(({ method, path, response }) => {
  const handler = () => new Response(JSON.stringify(response));
  const routerMethod = routerMethods[method.toUpperCase()];

  if (routerMethod) {
    routerMethod(path, handler);
  } else {
    console.error(`Unsupported method: ${method}`);
  }
});




// GET collection index
router.get('/api/todos', () => new Response('Todos Index!'));

// GET item
router.get('/api/todos/:id', ({ params }) => new Response(`Todo #${params.id}`));

// POST to the collection (we'll use async here)
router.post('/api/todos', async (request) => {
	const content = await request.json();

	return new Response('Creating Todo: ' + JSON.stringify(content));
});

// 404 for everything else
router.all('*', () => new Response('Not Found.', { status: 404 }));

export default router;
