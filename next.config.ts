import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // העלאת קבלות (תמונה מהטלפון יכולה להיות כמה MB). ברירת המחדל היא 1MB
  experimental: { serverActions: { bodySizeLimit: '11mb' } },
  // הגופנים העבריים לקובצי PDF נקראים מהדיסק, אז צריך לכלול אותם בפריסה
  outputFileTracingIncludes: { '/**': ['./assets/fonts/**'] },
};

export default nextConfig;
