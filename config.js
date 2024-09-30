export const config = {
  domainSource: "https://your-dev-domain.weweb-preview.io", // Your WeWeb app preview link
  patterns: [
    // Pattern for production URLs
    {
      pattern: "^/product/[^/]+/?$",
      metaDataEndpoint: "https://your-supabase-url.supabase.co/rest/v1/rpc/get_product_meta"
    },
    // Pattern for dev URLs
    {
      pattern: "^/ww/cms_data_sets/[^/]+/fetch/?$",
      metaDataEndpoint: "https://your-supabase-url.supabase.co/rest/v1/rpc/get_product_meta"
    }
  ]
};
