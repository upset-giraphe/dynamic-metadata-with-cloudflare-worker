export const config = {
  domainSource: "https://de44a60c-0fc7-4e82-bf89-8d4b1b9e0fc9.weweb-preview.io", // Your WeWeb app preview link
  patterns: [
    {
      pattern: "^/product/[^/]+/?$",
      metaDataEndpoint: "https://lfbxzrylbkxjryzvftv.supabase.co/rest/v1/rpc/get_product_meta"
    },
    // Pattern for dev URLs
    {
      pattern: "^/ww/cms_data_sets/[^/]+/fetch/?$",
      metaDataEndpoint: "https://lfbxzrylbkxjryzvftv.supabase.co/rest/v1/rpc/get_product_meta"
    }
  ]
};
