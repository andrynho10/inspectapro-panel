import type { NextConfig } from "next";

// Derivamos el hostname de Supabase desde la variable de entorno para que las
// imágenes de Storage sigan funcionando aunque se migre de proyecto Supabase.
const supabaseHost = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!).hostname;

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: supabaseHost,
        port: '',
        pathname: '/storage/v1/object/public/**',
      },
    ],
  },
};

export default nextConfig;
