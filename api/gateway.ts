import { proxyApi } from '../server/gateway.js';
export default {
  fetch(request: Request) {
    return proxyApi(request, { backendOrigin: process.env.COGNEXUS_BACKEND_ORIGIN });
  },
};
