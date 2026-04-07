import '@fastify/jwt';

declare module 'fastify' {
  interface FastifyInstance {
    authenticate: any;
  }
}

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: { id: string; role: string; name: string };
    user: { id: string; role: string; name: string };
  }
}
