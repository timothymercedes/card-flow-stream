import { createServerFn } from "@tanstack/react-start";

type RuntimeNativeAuthConfig = {
  googleWebClientId?: string;
  googleIosClientId?: string;
  appleServicesId?: string;
  sourceKeys: {
    googleWebClientId?: string;
    googleIosClientId?: string;
    appleServicesId?: string;
  };
};

export const getNativeAuthRuntimeConfig = createServerFn({ method: "GET" }).handler((): RuntimeNativeAuthConfig => {
  const pickEnv = (...names: string[]): { value?: string; key?: string } => {
    for (const name of names) {
      const value = process.env[name]?.trim();
      if (value) return { value, key: name };
    }
    return {};
  };

  const googleWeb = pickEnv("VITE_GOOGLE_WEB_CLIENT_ID", "GOOGLE_WEB_CLIENT_ID", "GOOGLE_CLIENT_ID");
  const googleIos = pickEnv("VITE_GOOGLE_IOS_CLIENT_ID", "GOOGLE_IOS_CLIENT_ID", "GOOGLE_CLIENT_ID_IOS");
  const apple = pickEnv("VITE_APPLE_SERVICES_ID", "APPLE_SERVICES_ID", "APPLE_CLIENT_ID", "GOOGLE_CLIENT_ID_APPLE");

  return {
    googleWebClientId: googleWeb.value,
    googleIosClientId: googleIos.value,
    appleServicesId: apple.value,
    sourceKeys: {
      googleWebClientId: googleWeb.key,
      googleIosClientId: googleIos.key,
      appleServicesId: apple.key,
    },
  };
});