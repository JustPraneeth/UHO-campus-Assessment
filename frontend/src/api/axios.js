import axios from "axios";

let tokenProvider = async () => null;

export function setTokenProvider(provider) {
  tokenProvider = provider;
}

const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || "/api",
});

api.interceptors.request.use(async (config) => {
  if (config._clerkAuthRetried && config._clerkAuthRetryToken) {
    config.headers.Authorization = config._clerkAuthRetryToken;
    return config;
  }
  if (!config.headers.Authorization) {
    const token = await tokenProvider();
    if (token) config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const config = error.config;
    const isMissingClerkSession =
      error.response?.status === 401 &&
      error.response?.data?.message === "Sign in with your Clerk account to continue";

    if (!config || config._clerkAuthRetried || !isMissingClerkSession) {
      return Promise.reject(error);
    }

    config._clerkAuthRetried = true;
    const token = await tokenProvider({ skipCache: true });
    if (!token) return Promise.reject(error);

    config._clerkAuthRetryToken = `Bearer ${token}`;
    return api.request(config);
  },
);

// Central place to unwrap error messages coming from the backend
export function getErrorMessage(err) {
  const clerkError = err?.errors?.[0] || err?.response?.data?.errors?.[0];
  const message = err?.response?.data?.message
    || clerkError?.longMessage
    || clerkError?.message
    || err?.longMessage
    || err?.message;
  return message || "Something went wrong";
}

export default api;
