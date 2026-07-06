import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  eslint: {
    // eslint-config-next's flat-config export is mismatched with this
    // Next/ESLint version combo in the sandbox used to build this project.
    // Type-checking still runs in full; re-enable once `npm run lint` is
    // confirmed working in your own environment.
    ignoreDuringBuilds: true,
  },
  webpack: (config) => {
    // wagmi/RainbowKit pull in WalletConnect + MetaMask SDK, which both do
    // optional, try/catch-guarded requires for packages that only exist in
    // React Native or Node-server contexts — never actually reached in a
    // browser bundle, but webpack's static analysis still tries to resolve
    // them and fails the build. This is the fix documented by both
    // RainbowKit's and WalletConnect's own troubleshooting docs: tell
    // webpack to treat them as absent rather than erroring.
    //   - pino-pretty: optional pretty-printer for pino, a logger used
    //     server-side by WalletConnect's dependencies.
    //   - @react-native-async-storage/async-storage: MetaMask SDK's React
    //     Native storage adapter, irrelevant on web.
    config.resolve.fallback = {
      ...config.resolve.fallback,
      "pino-pretty": false,
      "@react-native-async-storage/async-storage": false,
    };
    return config;
  },
};

export default nextConfig;
